import { describe, it, expect } from 'vitest';

describe('control-gate import from @webaudit/api', () => {
  it('resolves reconfirmControl, createSafeNetProbe, and level1RateBound', async () => {
    const mod = await import('@webaudit/api/control-gate');
    expect(typeof mod.reconfirmControl).toBe('function');
    expect(typeof mod.createSafeNetProbe).toBe('function');
    expect(typeof mod.assertAttested).toBe('function');
    expect(mod.level1RateBound).toBeDefined();
    expect(typeof mod.level1RateBound.tryAcquire).toBe('function');
  });
});
