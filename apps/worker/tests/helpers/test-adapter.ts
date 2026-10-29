/**
 * Deterministic, TEST-ONLY execution adapter. It is not an engine (SPEC 010-012 own those): it only lets the whole
 * queue -> worker -> host -> finalizer path run without one. Behaviour is chosen by `unit.configuration.behavior`.
 */

import { admissionRequest, type SafetyWorld } from '../../../api/tests/helpers/safety-fixtures.js';
import type { ExecutionAdapter } from '../../src/execution-runtime/adapter.js';
import type { UnitObservation } from '@webaudit/api/execution-runtime';
import { spawn, type ChildProcess } from 'node:child_process';

export type Behavior =
  | { kind: 'COMPLETE' }
  | { kind: 'EFFECTS'; count: number }
  | { kind: 'THROW' }
  | { kind: 'INFRA' }
  | { kind: 'CUSTOMER_EXIT'; code: number }
  /** Does nothing until aborted (a hung engine). */
  | { kind: 'HANG' }
  /** A real child process that ignores AbortSignal and exits only when killed by its parent. */
  | { kind: 'PROCESS_HANG' }
  /** Works for `ms`, honouring abort. */
  | { kind: 'WAIT'; ms: number };

export interface TestAdapterHandle {
  adapter: ExecutionAdapter;
  runs: string[];
  aborted: string[];
  terminated: string[];
  cleanupChildren(): Promise<void>;
}

const sleep = (ms: number, signal: AbortSignal): Promise<'DONE' | 'ABORTED'> =>
  new Promise((resolve) => {
    if (signal.aborted) return resolve('ABORTED');
    const t = setTimeout(() => resolve('DONE'), ms);
    signal.addEventListener('abort', () => (clearTimeout(t), resolve('ABORTED')), { once: true });
  });

export function createTestAdapter(
  world: SafetyWorld,
  engineId = 'engine.x',
  opts: { hardStopMarginMs?: number; lease?: 'L' | 'N'; forkProcess?: boolean } = {},
): TestAdapterHandle {
  const runs: string[] = [];
  const aborted: string[] = [];
  const terminated: string[] = [];
  const children = new Map<string, ChildProcess>();
  const cleanupChildren = async (): Promise<void> => {
    for (const child of children.values()) {
      if (child.exitCode !== null || child.signalCode !== null) continue;
      await new Promise<void>((resolve) => {
        child.once('exit', () => resolve());
        child.kill('SIGKILL');
      });
    }
  };
  const adapter: ExecutionAdapter = {
    engineId,
    executionUnitClass: 'BROWSER',
    leaseClass: opts.lease ?? 'L',
    ...(opts.hardStopMarginMs === undefined ? {} : { hardStopMarginMs: opts.hardStopMarginMs }),
    admissionRequestFor: (u) =>
      admissionRequest(world, {
        executionId: u.id,
        idempotencyKey: u.idempotencyKey,
        consumes: { request: true, concurrency: (opts.lease ?? 'L') === 'L' },
      }),
    ...(opts.forkProcess
      ? {
          async forkInertChild(u) {
            const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
              stdio: 'ignore',
              windowsHide: true,
            });
            children.set(u.id, child);
            return {
              async terminate() {
                if (child.exitCode !== null || child.signalCode !== null) return;
                await new Promise<void>((resolve) => {
                  child.once('exit', () => resolve());
                  child.kill('SIGKILL');
                });
                terminated.push(u.id);
              },
            };
          },
        }
      : {}),
    async run(ctx): Promise<UnitObservation> {
      runs.push(ctx.unit.id);
      const behavior = ((ctx.unit.configuration as { behavior?: Behavior } | null)?.behavior ?? {
        kind: 'COMPLETE',
      }) as Behavior;
      switch (behavior.kind) {
        case 'THROW':
          throw new Error('engine bug');
        case 'INFRA':
          return { source: 'INFRASTRUCTURE_ERROR' };
        case 'CUSTOMER_EXIT':
          return { source: 'CUSTOMER_CODE_EXIT', exitCode: behavior.code };
        case 'HANG':
        case 'WAIT': {
          ctx.progress({ label: 'working', completedUnits: 0, totalUnits: 2 });
          const r = await sleep(behavior.kind === 'WAIT' ? behavior.ms : 3_600_000, ctx.signal);
          if (r === 'ABORTED') {
            aborted.push(ctx.unit.id);
            return { source: 'HARD_STOP_DEADLINE' };
          }
          return { source: 'ENGINE_RESULT' };
        }
        case 'PROCESS_HANG': {
          const child = children.get(ctx.unit.id);
          if (child === undefined) throw new Error('test child was not forked before execution');
          return await new Promise<UnitObservation>((resolve) => {
            child.once('exit', () => resolve({ source: 'HARD_STOP_DEADLINE' }));
          });
        }
        case 'EFFECTS': {
          for (let i = 1; i <= behavior.count; i++) {
            const d = await ctx.authorizeEffect('REQUEST', i);
            if (d.result !== 'AUTHORIZED') {
              aborted.push(ctx.unit.id);
              return { source: 'F07_STOP' };
            }
            await ctx.confirmEffect('REQUEST', i);
          }
          return { source: 'ENGINE_RESULT' };
        }
        case 'COMPLETE': {
          ctx.progress({ label: 'start', completedUnits: 0, totalUnits: 2 });
          const d = await ctx.authorizeEffect('REQUEST', 1);
          if (d.result !== 'AUTHORIZED') return { source: 'F07_STOP' };
          await ctx.recordEvidence('HTTP_TRANSACTION', { status: 200, unit: ctx.unit.id });
          await ctx.confirmEffect('REQUEST', 1);
          ctx.progress({ label: 'done', completedUnits: 2, totalUnits: 2 });
          return { source: 'ENGINE_RESULT' };
        }
      }
    },
  };
  return { adapter, runs, aborted, terminated, cleanupChildren };
}
