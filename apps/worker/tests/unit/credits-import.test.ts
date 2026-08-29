import { describe, it, expect } from 'vitest';

describe('credits import from @webaudit/api', () => {
  it('resolves refundPartial, refund, OverRefundError, grantLot, and debit as functions/classes', async () => {
    const mod = await import('@webaudit/api/credits');
    expect(typeof mod.refundPartial).toBe('function');
    expect(typeof mod.refund).toBe('function');
    expect(typeof mod.OverRefundError).toBe('function');
    expect(typeof mod.grantLot).toBe('function');
    expect(typeof mod.debit).toBe('function');
  });
});
