import { describe, it, expect } from 'vitest';
import { refundForUndelivered } from '../src/refund.js';

describe('refundForUndelivered', () => {
  it('refunds nothing when everything requested was delivered', () => {
    expect(refundForUndelivered({ chargedCredits: 80, requestedCount: 5, deliveredCount: 5 })).toBe(
      0,
    );
  });

  it('refunds the whole charge when nothing was delivered', () => {
    expect(refundForUndelivered({ chargedCredits: 80, requestedCount: 5, deliveredCount: 0 })).toBe(
      80,
    );
  });

  it('refunds a floored proportional share for a partial delivery', () => {
    // 80 charged, 5 requested, 3 delivered -> 2 undelivered -> floor(80*2/5) = 32
    expect(refundForUndelivered({ chargedCredits: 80, requestedCount: 5, deliveredCount: 3 })).toBe(
      32,
    );
  });

  it('never refunds when nothing was charged', () => {
    expect(refundForUndelivered({ chargedCredits: 0, requestedCount: 5, deliveredCount: 0 })).toBe(
      0,
    );
  });
});
