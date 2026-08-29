import { describe, it, expect } from 'vitest';
import { controlLevelRank } from '../src/domain.js';

describe('controlLevelRank', () => {
  it('orders NONE below ATTESTED below VERIFIED', () => {
    expect(controlLevelRank('NONE')).toBeLessThan(controlLevelRank('ATTESTED'));
    expect(controlLevelRank('ATTESTED')).toBeLessThan(controlLevelRank('VERIFIED'));
  });

  it('matches the declared CONTROL_LEVELS order exactly', () => {
    expect(controlLevelRank('NONE')).toBe(0);
    expect(controlLevelRank('ATTESTED')).toBe(1);
    expect(controlLevelRank('VERIFIED')).toBe(2);
  });
});
