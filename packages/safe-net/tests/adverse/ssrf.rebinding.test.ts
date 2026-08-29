/**
 * T046 — the case research.md R6 layer 3 exists for.
 *
 * DNS rebinding: a name answers with a public address when the guard asks, and a
 * private one microseconds later when the kernel asks. Every check that inspects
 * the *URL* or the *resolution* passes. The request still lands on 127.0.0.1.
 *
 * There is no way to demonstrate that with a stubbed resolver, because the bug
 * is precisely that two separate DNS queries get two different answers. So this
 * suite runs a real DNS server over UDP whose script changes between queries,
 * and a real HTTP server on loopback that records whether anything arrived.
 *
 * The assertion that matters is `requests` being empty. A guard that notices the
 * private address after the request went out has already made the request.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { guardedFetch } from '../../src/safe-fetch.js';
import { SsrfRefusedError } from '../../src/errors.js';
import { assertResolvedAddressesAllowed, type AddressResolver } from '../../src/resolve-guard.js';
import { resolverFor, startFakeDns, type FakeDnsServer } from '../helpers/fake-dns.js';
import { ok, startFixture, type FixtureServer } from '../helpers/http-fixture.js';

/** A public address we classify as reachable. Never actually connected to. */
const PUBLIC = '93.184.216.34';
const HOSTNAME = 'rebind.audit-fixture';

let dns: FakeDnsServer | undefined;
let victim: FixtureServer | undefined;

function resolverFrom(server: FakeDnsServer): AddressResolver {
  const resolver = resolverFor(server);
  return async (hostname) => {
    try {
      const addresses = await resolver.resolve4(hostname);
      return addresses.map((address) => ({ address, family: 4 as const }));
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === 'ENOTFOUND' || code === 'ENODATA') return [];
      throw error;
    }
  };
}

beforeEach(() => {
  dns = undefined;
  victim = undefined;
});

afterEach(async () => {
  await victim?.close();
  await dns?.close();
});

async function refusal(fn: () => Promise<unknown>): Promise<SsrfRefusedError> {
  try {
    await fn();
  } catch (error) {
    if (error instanceof SsrfRefusedError) return error;
    throw new Error(`refused, but not as an SSRF refusal: ${String(error)}`);
  }
  throw new Error('resolved. SC-018 requires refusal.');
}

describe('SC-018 - DNS rebinding is refused at connect time', () => {
  it('refuses a name that turns private between the guard and the socket', async () => {
    victim = await startFixture(ok('LOOPBACK-SERVICE-SECRET'));
    // First query public, every later query loopback: the classic rebind.
    dns = await startFakeDns({ [HOSTNAME]: [PUBLIC, '127.0.0.1'] });
    const resolver = resolverFrom(dns);

    const error = await refusal(() =>
      guardedFetch(`http://${HOSTNAME}:${String(victim!.port)}/admin`, { resolver }),
    );

    expect(error.reason).toBe('CONNECT_ADDRESS_DISALLOWED');
    expect(error.addressClass).toBe('LOOPBACK');
    // The socket was destroyed before the request line was written.
    expect(victim.requests).toHaveLength(0);
    // Two independent queries: one by the resolve guard, one by the connect.
    expect(dns.queries.length).toBeGreaterThanOrEqual(2);
  });

  it('shows the resolve-time check alone would have let it through', async () => {
    // The negative control. Without this, a passing suite proves nothing about
    // whether layer 3 is doing the work or layer 2 is.
    dns = await startFakeDns({ [HOSTNAME]: [PUBLIC, '127.0.0.1'] });
    const resolver = resolverFrom(dns);

    const addresses = await assertResolvedAddressesAllowed(HOSTNAME, { resolver });
    expect(addresses).toEqual([{ address: PUBLIC, family: 4 }]);

    // Asked a second time, the same name is now loopback.
    const second = await resolver(HOSTNAME);
    expect(second).toEqual([{ address: '127.0.0.1', family: 4 }]);
  });

  it('refuses every attempt, so retrying is not a way through', async () => {
    victim = await startFixture(ok('LOOPBACK-SERVICE-SECRET'));
    // Alternating, so each attempt gets a fresh public-then-private pair rather
    // than settling into a private answer the resolve guard would catch first.
    const ATTEMPTS = 5;
    dns = await startFakeDns({
      [HOSTNAME]: Array.from({ length: ATTEMPTS * 2 + 2 }, (_unused, i) =>
        i % 2 === 0 ? PUBLIC : '127.0.0.1',
      ),
    });
    const resolver = resolverFrom(dns);
    const url = `http://${HOSTNAME}:${String(victim.port)}/admin`;

    for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
      const error = await refusal(() => guardedFetch(url, { resolver }));
      expect(error.reason, `attempt ${String(attempt)}`).toBe('CONNECT_ADDRESS_DISALLOWED');
    }
    // No pooled connection was ever handed back for reuse.
    expect(victim.requests).toHaveLength(0);
  });

  it('refuses a name that resolves to the cloud metadata service', async () => {
    // Refused at layer 2 rather than layer 3, deliberately: proving the
    // connect-time class for a non-loopback address would need this machine to
    // answer on 169.254.169.254, and a hostile suite that depends on the host's
    // network is a suite that reports the network instead of the guard. Layer 3
    // is proven above, on the one disallowed address a socket here can reach.
    dns = await startFakeDns({ [HOSTNAME]: ['169.254.169.254'] });
    const resolver = resolverFrom(dns);

    const error = await refusal(() =>
      guardedFetch(`http://${HOSTNAME}/latest/meta-data/`, { resolver }),
    );

    expect(error.reason).toBe('RESOLVED_ADDRESS_DISALLOWED');
    expect(error.addressClass).toBe('METADATA');
  });
});

describe('SC-018 - the resolve guard checks every answer, not the first', () => {
  it('refuses when any returned address is private', async () => {
    dns = await startFakeDns({ [HOSTNAME]: [PUBLIC] });
    // A resolver that hands back a good address followed by a bad one. Taking
    // addresses[0] and stopping is the bug this asserts against.
    const resolver: AddressResolver = () =>
      Promise.resolve([
        { address: PUBLIC, family: 4 },
        { address: '10.1.2.3', family: 4 },
      ]);

    const error = await refusal(() => guardedFetch(`http://${HOSTNAME}/`, { resolver }));

    expect(error.reason).toBe('RESOLVED_ADDRESS_DISALLOWED');
    expect(error.addressClass).toBe('PRIVATE');
  });

  it('refuses when the private address is an IPv6 answer among IPv4 ones', async () => {
    const resolver: AddressResolver = () =>
      Promise.resolve([
        { address: PUBLIC, family: 4 },
        { address: '::1', family: 6 },
      ]);

    const error = await refusal(() => guardedFetch('http://mixed.audit-fixture/', { resolver }));

    expect(error.reason).toBe('RESOLVED_ADDRESS_DISALLOWED');
    expect(error.addressClass).toBe('LOOPBACK');
  });

  it('refuses a name that resolves to nothing rather than letting connect decide', async () => {
    dns = await startFakeDns({ 'other.audit-fixture': [PUBLIC] });
    const resolver = resolverFrom(dns);

    const error = await refusal(() => guardedFetch(`http://${HOSTNAME}/`, { resolver }));

    expect(error.reason).toBe('DNS_NO_ADDRESSES');
  });

  it('refuses a name that resolves straight to a private address', async () => {
    dns = await startFakeDns({ [HOSTNAME]: ['10.0.0.7'] });
    const resolver = resolverFrom(dns);

    const error = await refusal(() => guardedFetch(`http://${HOSTNAME}/`, { resolver }));

    expect(error.reason).toBe('RESOLVED_ADDRESS_DISALLOWED');
    expect(error.addressClass).toBe('PRIVATE');
  });
});

describe('SC-018 - a name that stays public is fetched normally', () => {
  it('completes when resolve and connect agree, under a loopback-permitting policy', async () => {
    // Proves the guard is not simply refusing everything. Loopback is permitted
    // only here, where the fixture has to live; the class stays refused for the
    // rebinding tests above, which is what makes them meaningful.
    victim = await startFixture(ok('AUDIT-TARGET-BODY'));
    dns = await startFakeDns({ [HOSTNAME]: ['127.0.0.1'] });
    const resolver = resolverFrom(dns);

    const response = await guardedFetch(`http://${HOSTNAME}:${String(victim.port)}/page`, {
      resolver,
      policy: { allowLoopback: true },
    });

    expect(response.status).toBe(200);
    expect(response.text()).toBe('AUDIT-TARGET-BODY');
    expect(victim.requests).toHaveLength(1);
    expect(victim.requests[0]?.host).toBe(`${HOSTNAME}:${String(victim.port)}`);
  });
});
