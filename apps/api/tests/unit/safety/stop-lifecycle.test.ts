import { describe, expect, it } from 'vitest';
import {
  STOP_LIFECYCLE_STATES,
  isAllowedStopTransition,
  isStopPending,
  type StopLifecycleState,
} from '../../../src/services/safety/stop-lifecycle.js';

describe('stop lifecycle', () => {
  const allowed = new Set(['REQUESTED>ACKNOWLEDGED', 'ACKNOWLEDGED>STOPPED']);

  for (const from of STOP_LIFECYCLE_STATES) {
    for (const to of STOP_LIFECYCLE_STATES) {
      const expected = allowed.has(`${from}>${to}`);
      it(`${from} -> ${to} is ${expected ? 'allowed' : 'refused'}`, () => {
        expect(isAllowedStopTransition(from, to)).toBe(expected);
      });
    }
  }

  it('never allows REQUESTED to reach STOPPED directly (an ack is always required)', () => {
    expect(isAllowedStopTransition('REQUESTED', 'STOPPED')).toBe(false);
  });

  it('treats STOPPED as terminal', () => {
    for (const to of STOP_LIFECYCLE_STATES)
      expect(isAllowedStopTransition('STOPPED', to)).toBe(false);
  });

  it('reports REQUESTED and ACKNOWLEDGED as pending, STOPPED as not', () => {
    const pending: Record<StopLifecycleState, boolean> = {
      REQUESTED: true,
      ACKNOWLEDGED: true,
      STOPPED: false,
    };
    for (const state of STOP_LIFECYCLE_STATES) expect(isStopPending(state)).toBe(pending[state]);
  });
});
