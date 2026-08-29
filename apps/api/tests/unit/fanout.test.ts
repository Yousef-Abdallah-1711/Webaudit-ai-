/**
 * T098 — the fan-out, treated as a trust boundary.
 *
 * A Redis channel is not a private function call. Anything with the credential
 * can publish to it, a rolling deploy means last release's worker is still
 * publishing while this release's API is reading, and a malformed envelope that
 * reaches a socket becomes a client-side crash nobody can debug from the server.
 * So the suite is mostly about what is *dropped*.
 */

import { describe, expect, it } from 'vitest';
import { SCAN_EVENTS_CHANNEL, scanRoom } from '@webaudit/types';
import { startFanout, type RedisSubscriber } from '../../src/services/realtime/fanout.js';

/** A subscriber that hands messages over on demand rather than over a socket. */
function fakeSubscriber(): RedisSubscriber & { deliver(channel: string, raw: string): void } {
  let listener: ((channel: string, message: string) => void) | undefined;
  return {
    subscribe: () => Promise.resolve(1),
    on: (_event, fn) => {
      listener = fn;
      return undefined;
    },
    unsubscribe: () => Promise.resolve(1),
    quit: () => Promise.resolve('OK'),
    deliver: (channel, raw) => listener?.(channel, raw),
  };
}

function recorder() {
  const sent: { room: string; payload: string }[] = [];
  return { sent, broadcast: (room: string, payload: string) => sent.push({ room, payload }) };
}

async function harness() {
  const subscriber = fakeSubscriber();
  const broadcaster = recorder();
  const dropped: string[] = [];
  const fanout = await startFanout({
    subscriber,
    broadcaster,
    onDrop: (_raw, problem) => dropped.push(problem),
  });
  return { subscriber, broadcaster, fanout, dropped };
}

const VALID = JSON.stringify({
  scanId: 'scan_1',
  emittedAt: '2026-08-24T12:00:00.000Z',
  event: {
    type: 'module:complete',
    scanId: 'scan_1',
    module: 'SEO',
    state: 'COMPLETE',
    score: 90,
    issueCount: 3,
  },
});

describe('the fan-out forwards what it can validate', () => {
  it('routes a valid envelope to the scan room', async () => {
    const { subscriber, broadcaster, fanout } = await harness();
    subscriber.deliver(SCAN_EVENTS_CHANNEL, VALID);

    expect(broadcaster.sent).toHaveLength(1);
    expect(broadcaster.sent[0]?.room).toBe(scanRoom('scan_1'));
    expect(fanout.stats).toMatchObject({ received: 1, forwarded: 1, dropped: 0 });
  });

  it('forwards the envelope verbatim, so a client can order on emittedAt', async () => {
    const { subscriber, broadcaster } = await harness();
    subscriber.deliver(SCAN_EVENTS_CHANNEL, VALID);

    const forwarded = JSON.parse(broadcaster.sent[0]!.payload) as { emittedAt: string };
    expect(forwarded.emittedAt).toBe('2026-08-24T12:00:00.000Z');
  });

  it('ignores a message on another channel', async () => {
    const { subscriber, broadcaster, fanout } = await harness();
    subscriber.deliver('some:other:channel', VALID);

    expect(broadcaster.sent).toHaveLength(0);
    expect(fanout.stats.received).toBe(0);
  });

  it('routes on the envelope, not on the payload', async () => {
    // The two agree in practice. Routing on the envelope means an event type
    // added later cannot land in the wrong room by putting its id somewhere
    // unexpected.
    const { subscriber, broadcaster } = await harness();
    subscriber.deliver(
      SCAN_EVENTS_CHANNEL,
      JSON.stringify({
        scanId: 'scan_envelope',
        emittedAt: '2026-08-24T12:00:00.000Z',
        event: {
          type: 'issue:verified',
          issueId: 'i1',
          scanId: 'scan_payload',
          outcome: 'PASSED',
          state: 'RESOLVED',
        },
      }),
    );

    expect(broadcaster.sent[0]?.room).toBe(scanRoom('scan_envelope'));
  });
});

describe('the fan-out drops what it cannot validate', () => {
  it.each([
    ['not JSON at all', 'this is not json'],
    ['a JSON scalar', '42'],
    ['null', 'null'],
    ['an array', '[]'],
    [
      'no scanId',
      JSON.stringify({ emittedAt: '2026-08-24T12:00:00.000Z', event: { type: 'scan:state' } }),
    ],
    [
      'an empty scanId',
      JSON.stringify({
        scanId: '',
        emittedAt: '2026-08-24T12:00:00.000Z',
        event: { type: 'scan:state' },
      }),
    ],
    ['no emittedAt', JSON.stringify({ scanId: 's', event: { type: 'scan:state' } })],
    [
      'a non-ISO emittedAt',
      JSON.stringify({ scanId: 's', emittedAt: 'yesterday', event: { type: 'scan:state' } }),
    ],
    ['no event', JSON.stringify({ scanId: 's', emittedAt: '2026-08-24T12:00:00.000Z' })],
    [
      'an unknown event type',
      JSON.stringify({
        scanId: 's',
        emittedAt: '2026-08-24T12:00:00.000Z',
        event: { type: 'scan:exploded' },
      }),
    ],
    [
      'an event that is a string',
      JSON.stringify({ scanId: 's', emittedAt: '2026-08-24T12:00:00.000Z', event: 'scan:state' }),
    ],
  ])('drops %s rather than forwarding it', async (_label, raw) => {
    const { subscriber, broadcaster, fanout, dropped } = await harness();
    subscriber.deliver(SCAN_EVENTS_CHANNEL, raw);

    expect(broadcaster.sent).toHaveLength(0);
    expect(fanout.stats.dropped).toBe(1);
    expect(dropped).toHaveLength(1);
  });

  it('drops an absurdly long scanId rather than using it as a room name', async () => {
    const { subscriber, broadcaster } = await harness();
    subscriber.deliver(
      SCAN_EVENTS_CHANNEL,
      JSON.stringify({
        scanId: 'x'.repeat(5000),
        emittedAt: '2026-08-24T12:00:00.000Z',
        event: { type: 'scan:state' },
      }),
    );
    expect(broadcaster.sent).toHaveLength(0);
  });

  it('keeps working after a bad message', async () => {
    // One malformed publish must not deafen the fan-out.
    const { subscriber, broadcaster, fanout } = await harness();
    subscriber.deliver(SCAN_EVENTS_CHANNEL, 'garbage');
    subscriber.deliver(SCAN_EVENTS_CHANNEL, VALID);

    expect(broadcaster.sent).toHaveLength(1);
    expect(fanout.stats).toMatchObject({ received: 2, forwarded: 1, dropped: 1 });
  });

  it('accepts an event type it does not have a payload schema for', async () => {
    // Deliberate: a rolling deploy must not have the API reject events from a
    // newer worker whose payload gained a field. The type is checked; the
    // payload is passed through to a client that has its own types.
    const { subscriber, broadcaster } = await harness();
    subscriber.deliver(
      SCAN_EVENTS_CHANNEL,
      JSON.stringify({
        scanId: 's',
        emittedAt: '2026-08-24T12:00:00.000Z',
        event: {
          type: 'scan:state',
          state: 'RUNNING_PHASE_1',
          progressPercent: 15,
          futureField: true,
        },
      }),
    );
    expect(broadcaster.sent).toHaveLength(1);
  });
});
