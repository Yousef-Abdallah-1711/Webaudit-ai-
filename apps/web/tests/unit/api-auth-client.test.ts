import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ApiError,
  getAccessToken,
  getMe,
  resendVerification,
  setAccessToken,
  subscribeToUnauthorized,
  verifyEmail,
} from '../../lib/api.js';

afterEach(() => {
  vi.unstubAllGlobals();
  setAccessToken(undefined);
});

describe('API auth client', () => {
  it('posts verification tokens and includes cookies when resending with or without an email', async () => {
    const fetchMock = vi.fn().mockImplementation(
      () =>
        new Response(JSON.stringify({ message: 'ok' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await verifyEmail('one-time-token');
    expect(fetchMock).toHaveBeenLastCalledWith(
      expect.stringContaining('/auth/verify/one-time-token'),
      expect.objectContaining({ method: 'POST', credentials: 'include' }),
    );

    await resendVerification();
    expect(fetchMock).toHaveBeenLastCalledWith(
      expect.stringContaining('/auth/verify/resend'),
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        body: '{}',
      }),
    );

    await resendVerification('fallback@example.com');
    expect(fetchMock).toHaveBeenLastCalledWith(
      expect.stringContaining('/auth/verify/resend'),
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        body: JSON.stringify({ email: 'fallback@example.com' }),
      }),
    );
  });

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
