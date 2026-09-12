import { describe, expect, it } from 'vitest';
import { withPoolSettings } from '../../src/db/client.js';

describe('database connection timeout settings', () => {
  it('bounds connection establishment without overwriting explicit pool settings', () => {
    const result = new URL(withPoolSettings('postgresql://user:pass@localhost:5432/webaudit'));

    expect(result.searchParams.get('connection_limit')).toBe('10');
    expect(result.searchParams.get('pool_timeout')).toBe('20');
    expect(result.searchParams.get('connect_timeout')).toBe('10');
  });

  it('preserves operator-supplied connection settings', () => {
    const result = new URL(
      withPoolSettings(
        'postgresql://localhost/webaudit?connection_limit=1&pool_timeout=45&connect_timeout=30',
      ),
    );

    expect(result.searchParams.get('connection_limit')).toBe('1');
    expect(result.searchParams.get('pool_timeout')).toBe('45');
    expect(result.searchParams.get('connect_timeout')).toBe('30');
  });
});
