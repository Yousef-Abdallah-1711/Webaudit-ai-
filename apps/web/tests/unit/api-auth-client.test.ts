import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ApiError,
  getAccessToken,
  getMe,
  setAccessToken,
  subscribeToUnauthorized,
} from '../../lib/api.js';

afterEach(() => {
  vi.unstubAllGlobals();
  setAccessToken(undefined);
});

describe('API auth client', () => {
  it('clears a stale bearer token whenever the API responds 401', async () => {
    setAccessToken('stale-token');
    const onUnauthorized = vi.fn();
    const unsubscribe = subscribeToUnauthorized(onUnauthorized);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ error: { code: 'UNAUTHORIZED', message: 'Unauthenticated' } }),
          {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
          },
        ),
      ),
    );

    await expect(getMe()).rejects.toEqual(expect.any(ApiError));
    expect(getAccessToken()).toBeUndefined();
    expect(onUnauthorized).toHaveBeenCalledOnce();
    unsubscribe();
  });
});
