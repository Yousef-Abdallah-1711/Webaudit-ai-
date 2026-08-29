/**
 * What a control proof is allowed to accept, and how it is allowed to fail.
 *
 * SC-021 was already green: no bypass reached load generation without a
 * confirmed, still-published token, and a token pulled down demotes the target
 * inside the same call. Two things survived that battery, both about the edges
 * of `startVerification` rather than about the gate itself.
 *
 * **A repository target crashes the FILE path.** `POST /targets` accepts
 * `inputType: 'REPOSITORY'` with a canonical value of `owner/repo`, which is not
 * a URL. `hostOf` guards its `new URL(...)` and returns `''`, which is why the
 * DNS branch refuses that target cleanly with a 400 explaining that a repository
 * has no domain. `fileUrlFor` has the same call and no guard, so the FILE branch
 * throws `ERR_INVALID_URL` — and the route maps only two error types, so it
 * reaches the middleware as a 500. Worse than the status: the throw happens
 * *after* the writes, so the caller's outstanding token has already been revoked
 * and a fresh `TargetVerification` row exists whose token is never returned. The
 * user's previous verification is destroyed by a request that reported a server
 * error.
 *
 * **The file probe follows a redirect anywhere.** `safeFetch` defaults to five
 * hops and re-validates each, which is right for auditing a site. It is wrong
 * for proving control of one: if `victim.com/.well-known/webaudit-verification.txt`
 * redirects off-origin, control of `victim.com` can be demonstrated with a token
 * served from a host the prover controls. Narrow — it needs an open redirect at
 * that exact fixed path — but a proof that a redirect can satisfy is not a
 * proof, and the fix costs one option.
 */

import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as SafeNet from '@webaudit/safe-net';

/** Records what the probe asked `safeFetch` for, without making a request. */
const fetchCalls: { url: string; init: Record<string, unknown> }[] = [];

vi.mock('@webaudit/safe-net', async (importOriginal) => {
  const actual = await importOriginal<typeof SafeNet>();
  return {
    ...actual,
    safeFetch: (url: string, init: Record<string, unknown> = {}) => {
      fetchCalls.push({ url, init });
      return Promise.reject(new Error('no request is made in this suite'));
    },
  };
});
import { closeDb, resetDb, testDb } from '../helpers/db.js';
import {
  fileUrlFor,
  startVerification,
  VerificationFailedError,
} from '../../src/services/control-gate/verify.js';

beforeEach(resetDb);
afterAll(closeDb);

async function repositoryTarget(): Promise<{ userId: string; targetId: string }> {
  const user = await testDb.user.create({
    data: { email: `repo-${String(Date.now())}@example.com`, emailVerifiedAt: new Date() },
  });
  const target = await testDb.target.create({
    data: {
      userId: user.id,
      inputType: 'REPOSITORY',
      canonicalValue: 'owner/repo',
      displayName: 'owner/repo',
    },
  });
  return { userId: user.id, targetId: target.id };
}

describe('a target with no origin refuses FILE verification, it does not crash', () => {
  it('refuses rather than throwing a URL parse error', async () => {
    const { userId, targetId } = await repositoryTarget();

    // The same class the DNS branch already throws for the same target. An
    // ERR_INVALID_URL here becomes a 500 at the route, which tells the user
    // nothing and tells the operator that something is broken rather than that
    // something was asked for that does not apply.
    await expect(
      startVerification(testDb, { targetId, userId, method: 'FILE' }),
    ).rejects.toBeInstanceOf(VerificationFailedError);
  });

  it('does not destroy an outstanding verification on the way to failing', async () => {
    const { userId, targetId } = await repositoryTarget();

    await testDb.targetVerification.create({
      data: { targetId, method: 'FILE', token: 'previously-issued-token' },
    });

    await expect(
      startVerification(testDb, { targetId, userId, method: 'FILE' }),
    ).rejects.toBeInstanceOf(VerificationFailedError);

    // The refusal must come before the writes. A user whose existing token is
    // revoked by a request that then failed has lost their proof to a bug.
    const rows = await testDb.targetVerification.findMany({ where: { targetId } });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.token).toBe('previously-issued-token');
    expect(rows[0]?.revokedAt).toBeNull();
  });

  it('still builds the file URL for a real URL target, from the origin', () => {
    // The origin, not the submitted path: a token under /some/page/ proves
    // control of that directory, not of the host.
    expect(fileUrlFor('https://example.com/some/page/')).toBe(
      'https://example.com/.well-known/webaudit-verification.txt',
    );
  });
});

describe('the verification file must be served by the host being proved', () => {
  it('asks safeFetch not to follow redirects', async () => {
    // Asserted at the call rather than over a live redirect, because the
    // loopback policy makes a local redirect target unreachable by design —
    // which is the guard working. What matters is that the probe declares
    // `maxRedirects: 0`; `safe-fetch`'s own suites own the behaviour of that
    // option.
    const { createSafeNetProbe } = await import('../../src/services/control-gate/verify.js');
    await createSafeNetProbe().fetchFile('https://example.com/.well-known/x.txt');

    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0]?.init['maxRedirects']).toBe(0);
  });
});
