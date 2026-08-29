/**
 * T045 — FR-014: "MUST re-apply this check on every redirect encountered during
 * an audit."
 *
 * This is the layer that automatic redirect following structurally cannot
 * provide. `fetch(url, { redirect: 'follow' })` validates the URL you handed it
 * and then goes wherever the server points; by the time you see a response, the
 * request to the metadata service has already been made and answered.
 *
 * So the hops here are real HTTP servers and the assertions are about *what
 * arrived where*: a refused hop must have received nothing.
 *
 * Hops are served from loopback, which the default policy refuses — that is the
 * point of the whole package. The suite therefore drives `guardedFetch`, the
 * internal entry point, with a policy that permits loopback and nothing else.
 * `src/index.ts` exposes no way to construct that policy, so the relaxation
 * cannot leak out of this file. Every refusal asserted below is a class the test
 * policy still refuses.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { guardedFetch } from '../../src/safe-fetch.js';
import { SsrfRefusedError } from '../../src/errors.js';
import type { AddressPolicy } from '../../src/policy.js';
import { ok, redirectTo, startFixture, type FixtureServer } from '../helpers/http-fixture.js';

/** Loopback is permitted so the hops can exist. Nothing else is. */
const HOPS_ON_LOOPBACK: AddressPolicy = { allowLoopback: true };

const servers: FixtureServer[] = [];

async function fixture(handler: Parameters<typeof startFixture>[0]): Promise<FixtureServer> {
  const server = await startFixture(handler);
  servers.push(server);
  return server;
}

beforeEach(() => {
  servers.length = 0;
});

afterEach(async () => {
  await Promise.all(servers.map((s) => s.close()));
});

async function refusal(fn: () => Promise<unknown>): Promise<SsrfRefusedError> {
  try {
    await fn();
  } catch (error) {
    if (error instanceof SsrfRefusedError) return error;
    throw new Error(`refused, but not as an SSRF refusal: ${String(error)}`);
  }
  throw new Error('resolved. FR-014 requires refusal.');
}

describe('FR-014 - a redirect chain is validated hop by hop', () => {
  it('follows an allowed chain and records every hop it validated', async () => {
    const last = await fixture(ok('DESTINATION'));
    const middle = await fixture(redirectTo(`${last.origin}/end`));
    const first = await fixture(redirectTo(`${middle.origin}/middle`));

    const response = await guardedFetch(`${first.origin}/start`, { policy: HOPS_ON_LOOPBACK });

    expect(response.status).toBe(200);
    expect(response.text()).toBe('DESTINATION');
    expect(response.url).toBe(`${last.origin}/end`);
    expect(response.redirects).toEqual([
      `${first.origin}/start`,
      `${middle.origin}/middle`,
      `${last.origin}/end`,
    ]);
    expect(first.requests).toHaveLength(1);
    expect(middle.requests).toHaveLength(1);
    expect(last.requests).toHaveLength(1);
  });

  it('refuses when the final hop is private, having sent nothing to it', async () => {
    const second = await fixture(redirectTo('http://10.0.0.1/internal'));
    const first = await fixture(redirectTo(`${second.origin}/second`));

    const error = await refusal(() =>
      guardedFetch(`${first.origin}/start`, { policy: HOPS_ON_LOOPBACK }),
    );

    expect(error.reason).toBe('LITERAL_ADDRESS_DISALLOWED');
    expect(error.addressClass).toBe('PRIVATE');
    expect(error.target).toBe('http://10.0.0.1/internal');
    // Both allowed hops were contacted exactly once; the chain then stopped.
    expect(first.requests).toHaveLength(1);
    expect(second.requests).toHaveLength(1);
  });

  it('refuses a redirect to the cloud metadata service', async () => {
    const first = await fixture(redirectTo('http://169.254.169.254/latest/meta-data/'));

    const error = await refusal(() =>
      guardedFetch(`${first.origin}/start`, { policy: HOPS_ON_LOOPBACK }),
    );

    expect(error.reason).toBe('LITERAL_ADDRESS_DISALLOWED');
    expect(error.addressClass).toBe('METADATA');
    expect(first.requests).toHaveLength(1);
  });

  it('refuses at the offending hop, not at the end of the chain', async () => {
    // Hop two is private. Hop three exists and must never be reached.
    const never = await fixture(ok('NEVER-REACHED'));
    const first = await fixture(redirectTo('http://192.168.1.1/'));

    const error = await refusal(() =>
      guardedFetch(`${first.origin}/start`, { policy: HOPS_ON_LOOPBACK }),
    );

    expect(error.addressClass).toBe('PRIVATE');
    expect(never.requests).toHaveLength(0);
  });

  it('refuses a redirect that changes scheme away from HTTP', async () => {
    const first = await fixture(redirectTo('file:///etc/passwd'));

    const error = await refusal(() =>
      guardedFetch(`${first.origin}/start`, { policy: HOPS_ON_LOOPBACK }),
    );

    expect(error.reason).toBe('SCHEME_NOT_ALLOWED');
  });

  it('refuses a redirect that smuggles credentials into the next hop', async () => {
    const target = await fixture(ok('X'));
    const first = await fixture(redirectTo(`http://user:secret@127.0.0.1:${String(target.port)}/`));

    const error = await refusal(() =>
      guardedFetch(`${first.origin}/start`, { policy: HOPS_ON_LOOPBACK }),
    );

    expect(error.reason).toBe('CREDENTIALS_IN_URL');
    expect(target.requests).toHaveLength(0);
  });

  it('resolves a relative Location against the hop that sent it, then validates it', async () => {
    const target = await fixture((req, res) => {
      if (req.url === '/deep/page') {
        ok('RELATIVE-OK')(req, res);
        return;
      }
      redirectTo('page')(req, res);
    });

    const response = await guardedFetch(`${target.origin}/deep/start`, {
      policy: HOPS_ON_LOOPBACK,
    });

    expect(response.text()).toBe('RELATIVE-OK');
    expect(response.url).toBe(`${target.origin}/deep/page`);
  });

  it('refuses a 3xx with no Location rather than returning it as the page', async () => {
    const first = await fixture((_req, res) => {
      res.writeHead(302);
      res.end();
    });

    const error = await refusal(() =>
      guardedFetch(`${first.origin}/start`, { policy: HOPS_ON_LOOPBACK }),
    );

    expect(error.reason).toBe('REDIRECT_LOCATION_INVALID');
  });
});

describe('FR-014 - a chain cannot be made to run for ever', () => {
  it('refuses a redirect loop', async () => {
    // Declared through a holder so B can point back at A, which does not exist
    // until after B is listening.
    const chain: { a?: FixtureServer } = {};
    const b = await fixture((_req, res) => {
      res.writeHead(302, { location: `${chain.a!.origin}/a` });
      res.end();
    });
    chain.a = await fixture(redirectTo(`${b.origin}/b`));

    const error = await refusal(() =>
      guardedFetch(`${chain.a!.origin}/a`, { policy: HOPS_ON_LOOPBACK }),
    );

    expect(error.reason).toBe('TOO_MANY_REDIRECTS');
  });

  it('honours a lower redirect budget', async () => {
    const last = await fixture(ok('DEEP'));
    const mid = await fixture(redirectTo(`${last.origin}/end`));
    const first = await fixture(redirectTo(`${mid.origin}/mid`));

    await expect(
      guardedFetch(`${first.origin}/start`, { policy: HOPS_ON_LOOPBACK, maxRedirects: 2 }),
    ).resolves.toMatchObject({ status: 200 });

    const error = await refusal(() =>
      guardedFetch(`${first.origin}/start`, { policy: HOPS_ON_LOOPBACK, maxRedirects: 1 }),
    );
    expect(error.reason).toBe('TOO_MANY_REDIRECTS');
  });
});

describe('FR-014 - the default policy refuses the hops themselves', () => {
  it('refuses a loopback hop when no policy is supplied', async () => {
    const server = await fixture(ok('SHOULD-NOT-BE-READ'));

    const error = await refusal(() => guardedFetch(`${server.origin}/`));

    expect(error.reason).toBe('LITERAL_ADDRESS_DISALLOWED');
    expect(error.addressClass).toBe('LOOPBACK');
    expect(server.requests).toHaveLength(0);
  });
});
