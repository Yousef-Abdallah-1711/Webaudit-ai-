/**
 * T094, T095, T097, T101 — the state machine, the priority scheme,
 * persist-then-publish, and the timeout refund.
 *
 * Four small units with one thing in common: each is a place where being *almost*
 * right produces a system that works in every test and is wrong in production.
 * The transition table decides whether a cancelled scan can be resurrected; the
 * priority clamp decides whether a customer can outrank the fix loop; the emit
 * ordering decides whether a reconnecting client sees a gap; the refund rounding
 * decides which direction money leaks.
 */

import { describe, expect, it } from 'vitest';
import type { ModuleState, ModuleType, ScanState } from '@webaudit/types';
import {
  canTransition,
  isTerminal,
  nextPhase,
  progressPercentFor,
  transition,
} from '../../src/orchestrator/state-machine.js';
import { PRIORITY, priorityForPlan } from '../../src/queue/queues.js';
import { emit } from '../../src/orchestrator/emit.js';
import { isDelivered, refundForUndelivered } from '../../src/orchestrator/timeout.js';

// ─── T095 ────────────────────────────────────────────────────────────────────

describe('the scan state machine', () => {
  it('walks the happy path', () => {
    const path: ScanState[] = [
      'QUEUED',
      'RUNNING_PHASE_1',
      'RUNNING_PHASE_2',
      'RUNNING_PHASE_3',
      'RUNNING_MASTER',
      'RUNNING_DOCS',
      'COMPLETED',
    ];
    for (let i = 0; i < path.length - 1; i += 1) {
      expect(canTransition(path[i]!, path[i + 1]!), `${path[i]!} -> ${path[i + 1]!}`).toBe(true);
    }
  });

  it('lets phase 1 pause for intent and lets it skip the pause entirely', () => {
    expect(canTransition('RUNNING_PHASE_1', 'AWAITING_QUESTIONNAIRE')).toBe(true);
    // FR-043 and FR-042: no area needed intent, or the user skipped.
    expect(canTransition('RUNNING_PHASE_1', 'RUNNING_PHASE_2')).toBe(true);
  });

  it.each<ScanState>(['COMPLETED', 'FAILED', 'CANCELLED', 'TIMED_OUT'])(
    'gives %s no outgoing edges',
    (terminal) => {
      expect(isTerminal(terminal)).toBe(true);
      const everyState: ScanState[] = [
        'QUEUED',
        'RUNNING_PHASE_1',
        'AWAITING_QUESTIONNAIRE',
        'RUNNING_PHASE_2',
        'RUNNING_PHASE_3',
        'RUNNING_MASTER',
        'RUNNING_DOCS',
        'COMPLETED',
        'FAILED',
        'CANCELLED',
        'TIMED_OUT',
      ];
      for (const to of everyState) {
        expect(canTransition(terminal, to), `${terminal} -> ${to}`).toBe(false);
      }
    },
  );

  it('refuses to skip a phase', () => {
    expect(canTransition('RUNNING_PHASE_1', 'RUNNING_PHASE_3')).toBe(false);
    expect(canTransition('QUEUED', 'COMPLETED')).toBe(false);
    expect(canTransition('RUNNING_PHASE_2', 'RUNNING_DOCS')).toBe(false);
  });

  it('refuses to go backwards', () => {
    expect(canTransition('RUNNING_PHASE_2', 'RUNNING_PHASE_1')).toBe(false);
    expect(canTransition('AWAITING_QUESTIONNAIRE', 'RUNNING_PHASE_1')).toBe(false);
  });

  it('lets every running state be cancelled, failed, or timed out', () => {
    const running: ScanState[] = [
      'QUEUED',
      'RUNNING_PHASE_1',
      'AWAITING_QUESTIONNAIRE',
      'RUNNING_PHASE_2',
      'RUNNING_PHASE_3',
      'RUNNING_MASTER',
      'RUNNING_DOCS',
    ];
    for (const from of running) {
      for (const to of ['CANCELLED', 'FAILED', 'TIMED_OUT'] satisfies ScanState[]) {
        expect(canTransition(from, to), `${from} -> ${to}`).toBe(true);
      }
    }
  });

  it('reports an illegal edge as illegal, not as a lost race', () => {
    // The distinction matters: a lost race is normal, an illegal edge is a bug,
    // and reporting one as the other hides it.
    const db = {
      scan: {
        updateMany: () => Promise.reject(new Error('must not be reached')),
        findUnique: (): Promise<{ state: ScanState }> => Promise.resolve({ state: 'COMPLETED' }),
      },
    };
    return expect(
      transition(db, { scanId: 's', from: 'COMPLETED', to: 'RUNNING_PHASE_1' }),
    ).resolves.toMatchObject({ moved: false, reason: 'ILLEGAL' });
  });

  it('stamps startedAt on the first phase and completedAt on a terminal state', async () => {
    const writes: Record<string, unknown>[] = [];
    const db = {
      scan: {
        updateMany: (args: { data: Record<string, unknown> }) => {
          writes.push(args.data);
          return Promise.resolve({ count: 1 });
        },
        findUnique: () => Promise.resolve(null),
      },
    };

    await transition(db, { scanId: 's', from: 'QUEUED', to: 'RUNNING_PHASE_1' });
    expect(writes[0]?.['startedAt']).toBeInstanceOf(Date);
    expect(writes[0]?.['completedAt']).toBeUndefined();

    await transition(db, { scanId: 's', from: 'RUNNING_DOCS', to: 'COMPLETED' });
    expect(writes[1]?.['completedAt']).toBeInstanceOf(Date);
  });

  it('reports the current state when it loses a race', async () => {
    const db = {
      scan: {
        updateMany: () => Promise.resolve({ count: 0 }),
        findUnique: (): Promise<{ state: ScanState }> => Promise.resolve({ state: 'CANCELLED' }),
      },
    };
    await expect(
      transition(db, { scanId: 's', from: 'RUNNING_PHASE_1', to: 'RUNNING_PHASE_2' }),
    ).resolves.toMatchObject({ moved: false, reason: 'LOST_RACE', current: 'CANCELLED' });
  });

  it('names the next phase, and nothing after a terminal state', () => {
    expect(nextPhase('RUNNING_PHASE_1')).toBe('RUNNING_PHASE_2');
    expect(nextPhase('RUNNING_DOCS')).toBe('COMPLETED');
    expect(nextPhase('CANCELLED')).toBeNull();
    expect(nextPhase('AWAITING_QUESTIONNAIRE')).toBeNull();
  });
});

describe('progress is derived from position, not from time', () => {
  it('does not advance while waiting for the user', () => {
    // A bar that creeps while nothing happens is a lie.
    expect(progressPercentFor('AWAITING_QUESTIONNAIRE')).toBe(
      progressPercentFor('RUNNING_PHASE_1'),
    );
  });

  it('increases monotonically through the phases', () => {
    const phases: ScanState[] = [
      'QUEUED',
      'RUNNING_PHASE_1',
      'RUNNING_PHASE_2',
      'RUNNING_PHASE_3',
      'RUNNING_MASTER',
      'RUNNING_DOCS',
      'COMPLETED',
    ];
    for (let i = 0; i < phases.length - 1; i += 1) {
      expect(progressPercentFor(phases[i]!)).toBeLessThan(progressPercentFor(phases[i + 1]!));
    }
  });

  it('stays within 0-100', () => {
    const all: ScanState[] = [
      'QUEUED',
      'RUNNING_PHASE_1',
      'AWAITING_QUESTIONNAIRE',
      'RUNNING_PHASE_2',
      'RUNNING_PHASE_3',
      'RUNNING_MASTER',
      'RUNNING_DOCS',
      'COMPLETED',
      'FAILED',
      'CANCELLED',
      'TIMED_OUT',
    ];
    for (const state of all) {
      const percent = progressPercentFor(state);
      expect(percent, state).toBeGreaterThanOrEqual(0);
      expect(percent, state).toBeLessThanOrEqual(100);
    }
  });
});

// ─── T094 ────────────────────────────────────────────────────────────────────

describe('the six priority levels', () => {
  it('puts re-verification ahead of every audit', () => {
    // US2's fix loop is the product, and the user is watching.
    expect(PRIORITY.REVERIFICATION).toBeLessThan(PRIORITY.BUSINESS);
  });

  it('puts maintenance behind every audit', () => {
    expect(PRIORITY.MAINTENANCE).toBeGreaterThan(PRIORITY.FREE);
  });

  it('orders the four plan tiers, lower first', () => {
    expect(PRIORITY.BUSINESS).toBeLessThan(PRIORITY.PRO);
    expect(PRIORITY.PRO).toBeLessThan(PRIORITY.STARTER);
    expect(PRIORITY.STARTER).toBeLessThan(PRIORITY.FREE);
  });

  it('has six distinct levels', () => {
    expect(new Set(Object.values(PRIORITY)).size).toBe(6);
  });

  it.each([
    [10, 10],
    [20, 20],
    [30, 30],
    [40, 40],
  ])('passes a seeded plan priority through unchanged (%i)', (input, expected) => {
    expect(priorityForPlan(input)).toBe(expected);
  });

  it('clamps a plan that would outrank re-verification', () => {
    // `queuePriority` is operator-editable. A plan set to 1 would quietly make
    // every fix loop on the platform slower.
    expect(priorityForPlan(1)).toBe(PRIORITY.BUSINESS);
    expect(priorityForPlan(-100)).toBe(PRIORITY.BUSINESS);
  });

  it('clamps a plan that would fall behind maintenance', () => {
    // A plan set to 999 would never run.
    expect(priorityForPlan(999)).toBe(PRIORITY.FREE);
  });

  it('truncates a fractional value rather than passing a float to the queue', () => {
    expect(priorityForPlan(20.7)).toBe(20);
  });

  it.each([
    ['NaN', Number.NaN],
    ['+Infinity', Number.POSITIVE_INFINITY],
    ['-Infinity', Number.NEGATIVE_INFINITY],
  ])('falls back to a safe default rather than propagating %s', (_label, input) => {
    // `Math.min`/`Math.max` propagate NaN instead of clamping it, so this
    // reached a real BullMQ `Queue.add({ priority: NaN })` and threw at the
    // Lua-script layer: "Cannot serialise number: must not be NaN or Inf". The
    // clamp above was written to defend against a hostile `queuePriority`
    // column and did not defend against a non-finite one — the same class of
    // input the comment already calls out as the reason to clamp at all.
    const result = priorityForPlan(input);
    expect(Number.isFinite(result)).toBe(true);
    expect(Object.values(PRIORITY)).toContain(result);
  });
});

// ─── T097 ────────────────────────────────────────────────────────────────────

describe('persist-then-publish', () => {
  it('persists before it publishes', async () => {
    const order: string[] = [];
    await emit(
      { type: 'scan:state', scanId: 's', state: 'RUNNING_PHASE_1', progressPercent: 15 },
      () => {
        order.push('persist');
        return Promise.resolve();
      },
      {
        publisher: {
          publish: () => {
            order.push('publish');
            return Promise.resolve(1);
          },
        },
      },
    );
    expect(order).toEqual(['persist', 'publish']);
  });

  it('publishes nothing when the write fails', async () => {
    // A state we failed to record must not be announced: the client would fetch
    // and find nothing there.
    let published = false;
    await expect(
      emit(
        { type: 'scan:state', scanId: 's', state: 'RUNNING_PHASE_1', progressPercent: 15 },
        () => Promise.reject(new Error('database unavailable')),
        {
          publisher: {
            publish: () => {
              published = true;
              return Promise.resolve(1);
            },
          },
        },
      ),
    ).rejects.toThrow('database unavailable');
    expect(published).toBe(false);
  });

  it('does not fail the work when the publish fails', async () => {
    // Redis is transport, not a record. The state is durable, and the client
    // recovers by fetching (FR-047).
    const failures: unknown[] = [];
    const result = await emit(
      { type: 'scan:state', scanId: 's', state: 'RUNNING_PHASE_1', progressPercent: 15 },
      () => Promise.resolve(),
      {
        publisher: { publish: () => Promise.reject(new Error('redis gone')) },
        onPublishFailure: (_event, error) => failures.push(error),
      },
    );

    expect(result).toEqual({ persisted: true, published: false });
    expect(failures).toHaveLength(1);
  });

  it('stamps the envelope with an emit time the client can order on', async () => {
    const messages: string[] = [];
    await emit({ type: 'module:started', scanId: 's', module: 'SEO' }, () => Promise.resolve(), {
      publisher: {
        publish: (_channel, message) => {
          messages.push(message);
          return Promise.resolve(1);
        },
      },
      now: () => new Date('2026-08-24T12:00:00.000Z'),
    });

    const envelope = JSON.parse(messages[0]!) as { scanId: string; emittedAt: string };
    expect(envelope.scanId).toBe('s');
    expect(envelope.emittedAt).toBe('2026-08-24T12:00:00.000Z');
  });
});

// ─── T101 ────────────────────────────────────────────────────────────────────

describe('FR-038 - a timed-out scan charges only for delivered areas', () => {
  it.each<[ModuleState, boolean]>([
    ['COMPLETE', true],
    // Measured something, so the user can act on it. Charged.
    ['DEGRADED', true],
    ['FAILED', false],
    ['NOT_APPLICABLE', false],
    ['PENDING', false],
    ['RUNNING', false],
  ])('counts %s as delivered=%s', (state, expected) => {
    expect(isDelivered(state)).toBe(expected);
  });

  it('refunds nothing when everything was delivered', () => {
    expect(
      refundForUndelivered({ chargedCredits: 100, requestedCount: 5, deliveredCount: 5 }),
    ).toBe(0);
  });

  it('refunds everything when nothing was delivered', () => {
    // Principle VI: never charge for our failures.
    expect(
      refundForUndelivered({ chargedCredits: 100, requestedCount: 5, deliveredCount: 0 }),
    ).toBe(100);
  });

  it('refunds in proportion to undelivered areas', () => {
    // 2 of 5 areas delivered, so 3/5 of the charge goes back.
    expect(
      refundForUndelivered({ chargedCredits: 100, requestedCount: 5, deliveredCount: 2 }),
    ).toBe(60);
  });

  it('rounds down, so rounding never invents a credit', () => {
    // 1 of 3 delivered: 2/3 of 100 is 66.67. The remainder stays with the
    // platform, which is the only direction that cannot turn a refund into a
    // grant.
    expect(
      refundForUndelivered({ chargedCredits: 100, requestedCount: 3, deliveredCount: 1 }),
    ).toBe(66);
  });

  it('computes against what was charged, not what was quoted', () => {
    // A scan may have been charged less than quoted. Refunding against the quote
    // would hand back credits nobody paid.
    expect(refundForUndelivered({ chargedCredits: 50, requestedCount: 2, deliveredCount: 1 })).toBe(
      25,
    );
  });

  it('refunds nothing when nothing was charged', () => {
    expect(refundForUndelivered({ chargedCredits: 0, requestedCount: 5, deliveredCount: 0 })).toBe(
      0,
    );
  });

  it('never refunds more than was charged', () => {
    for (const requested of [1, 3, 5]) {
      for (let delivered = 0; delivered <= requested; delivered += 1) {
        const refund = refundForUndelivered({
          chargedCredits: 100,
          requestedCount: requested,
          deliveredCount: delivered,
        });
        expect(refund, `${String(delivered)}/${String(requested)}`).toBeLessThanOrEqual(100);
        expect(refund).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('handles a delivered count above the requested count without going negative', () => {
    // Defensive: a re-run could write more ModuleResult rows than were requested.
    const modules: readonly ModuleType[] = ['SEO'];
    expect(
      refundForUndelivered({
        chargedCredits: 100,
        requestedCount: modules.length,
        deliveredCount: 3,
      }),
    ).toBe(0);
  });
});
