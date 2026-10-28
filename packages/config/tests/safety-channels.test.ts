import { describe, it, expect } from 'vitest';
import {
  SAFETY_SCOPES,
  safetyStopChannel,
  safetyStopChannelsFor,
  safetyStopSignalSchema,
} from '../src/safety-channels.js';

describe('safetyStopChannel', () => {
  it('derives the exact documented channel per scope', () => {
    expect(safetyStopChannel('EXECUTION', 'e1')).toBe('safety:stop:execution:e1');
    expect(safetyStopChannel('SCAN', 's1')).toBe('safety:stop:scan:s1');
    expect(safetyStopChannel('GRANT', 'g1')).toBe('safety:stop:grant:g1');
    expect(safetyStopChannel('TARGET', 't1')).toBe('safety:stop:target:t1');
    expect(safetyStopChannel('TENANT', 'u1')).toBe('safety:stop:tenant:u1');
    expect(safetyStopChannel('PLATFORM')).toBe('safety:stop:platform');
  });

  it('ignores an id for PLATFORM', () => {
    expect(safetyStopChannel('PLATFORM', 'whatever')).toBe('safety:stop:platform');
  });

  it.each(['', 'a:b', 'a*b', ' a', 'a b', 'a?b', 'a[b', 'a\\b'])(
    'rejects the pattern-injectable id %j',
    (id) => {
      expect(() => safetyStopChannel('SCAN', id)).toThrow(RangeError);
    },
  );

  it('rejects a missing id for a non-platform scope', () => {
    expect(() => safetyStopChannel('GRANT')).toThrow(RangeError);
  });
});

describe('safetyStopChannelsFor', () => {
  it('returns the six channels in scope order, platform last', () => {
    const channels = safetyStopChannelsFor({
      executionId: 'e',
      scanId: 's',
      grantId: 'g',
      targetId: 't',
      userId: 'u',
    });
    expect(SAFETY_SCOPES).toHaveLength(6);
    expect(channels).toEqual([
      'safety:stop:execution:e',
      'safety:stop:scan:s',
      'safety:stop:grant:g',
      'safety:stop:target:t',
      'safety:stop:tenant:u',
      'safety:stop:platform',
    ]);
  });
});

describe('safetyStopSignalSchema', () => {
  const valid = {
    scope: 'GRANT',
    scopeId: 'g1',
    reason: 'AUTHORIZATION_REVOKED',
    at: '2026-10-28T10:00:00.000Z',
  };

  it('accepts a valid signal', () => {
    expect(safetyStopSignalSchema.safeParse(valid).success).toBe(true);
  });

  it.each([
    ['unknown scope', { ...valid, scope: 'GALAXY' }],
    ['unknown reason', { ...valid, reason: 'BECAUSE' }],
    ['bad datetime', { ...valid, at: 'yesterday' }],
    ['empty scopeId', { ...valid, scopeId: '' }],
  ])('rejects %s', (_name, value) => {
    expect(safetyStopSignalSchema.safeParse(value).success).toBe(false);
  });
});
