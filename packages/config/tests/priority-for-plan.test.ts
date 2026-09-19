/**
 * T029 gap found while auditing this task's manual step: `priorityForPlan`
 * clamps a plan's operator-editable `queuePriority` into the tier band and
 * guards NaN, but had no test anywhere in the repo.
 */
import { describe, it, expect } from 'vitest';
import { PRIORITY, priorityForPlan } from '../src/queues.js';

describe('priorityForPlan', () => {
  it('passes through a value already inside the plan-tier band', () => {
    expect(priorityForPlan(PRIORITY.PRO)).toBe(PRIORITY.PRO);
  });

  it('clamps a value below BUSINESS up to BUSINESS, so no plan can outrank re-verification', () => {
    expect(priorityForPlan(1)).toBe(PRIORITY.BUSINESS);
    expect(priorityForPlan(PRIORITY.REVERIFICATION)).toBe(PRIORITY.BUSINESS);
  });

  it('clamps a value above FREE down to FREE, so no plan falls behind maintenance', () => {
    expect(priorityForPlan(999)).toBe(PRIORITY.FREE);
  });

  it('truncates a non-integer value', () => {
    expect(priorityForPlan(20.9)).toBe(20);
  });

  it('treats NaN as FREE rather than propagating it to a real BullMQ Queue.add call', () => {
    expect(priorityForPlan(NaN)).toBe(PRIORITY.FREE);
  });

  it('clamps Infinity/-Infinity to the same band edges as any other out-of-range number', () => {
    expect(priorityForPlan(Infinity)).toBe(PRIORITY.FREE);
    expect(priorityForPlan(-Infinity)).toBe(PRIORITY.BUSINESS);
  });
});
