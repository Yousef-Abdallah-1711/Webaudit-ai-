/**
 * SC-018, the IPv6 half.
 *
 * The IPv4 table in `address-rules.ts` is complete against the IANA
 * special-purpose registry — probing it found nothing, including every notation
 * evasion (`127.1`, `2130706433`, `0x7f000001`, `017700000001`, `①②⑦.0.0.1`).
 * The IPv6 table had six rules, and the four families below fell through all of
 * them.
 *
 * **Why a gap here defeats all four R6 layers at once.** For a literal address
 * `validateUrl` returns a target with `literal !== null`, so the resolve guard is
 * skipped — there is nothing to resolve — and the connect guard re-asks the same
 * classifier about the same bytes and gets the same answer. Four layers, one
 * verdict. That is correct design and it means the classifier is not one defence
 * among several; for a literal it is the only one. Each address here was
 * confirmed to reach a real socket, stopped only by the probing machine having
 * no IPv6 route.
 *
 * The four families:
 *
 *   1. **NAT64 at a prefix other than the well-known one.** `64:ff9b::/96` was
 *      refused; RFC 8215's local-use `64:ff9b:1::/48` — the prefix operators are
 *      told to use when the well-known one will not do — was not. On a worker in
 *      a NAT64 or 464XLAT network, `[64:ff9b:1::a9fe:a9fe]` is the cloud
 *      metadata service. The sibling being refused is what makes this a gap
 *      rather than a scope decision.
 *
 *   2. **Site-local `fec0::/10`.** Deprecated, not absent: `fec0:0:0:ffff::1`
 *      through `::3` were the historic Windows default IPv6 resolvers.
 *      `fe80::/10` was refused and `fc00::/7` was refused, and the range between
 *      them was not.
 *
 *   3. **IPv4-translated `::ffff:0:0:0/96`.** RFC 2765, and the fifth of the
 *      "four formats" the extractor's own docstring claims to cover. It misses
 *      both branches: the mapped test fails because bytes 8–9 are `ffff`, and
 *      the IPv4-compatible fallback fails for the same reason.
 *
 *   4. **Most of `2001::/23` and `5f00::/16`.** Only Teredo and the
 *      documentation range were caught. Note `2001:2::/48` is IPv6 benchmarking
 *      whose IPv4 twin `198.18.0.0/15` *is* refused — a direct inconsistency
 *      inside one table.
 *
 * Every one of these is refused by name rather than by a catch-all, because a
 * refusal that says METADATA is actionable and one that says "some IPv6 thing"
 * is not.
 */

import { describe, expect, it } from 'vitest';
import { assertPublicTarget, SsrfRefusedError } from '../../src/index.js';

async function refusal(url: string): Promise<SsrfRefusedError> {
  try {
    await assertPublicTarget(url);
  } catch (error) {
    if (error instanceof SsrfRefusedError) return error;
    throw error;
  }
  throw new Error(`${url} was ACCEPTED. It must be refused.`);
}

describe('NAT64 is refused at every prefix, not only the well-known one', () => {
  it.each([
    // RFC 8215 local-use prefix, carrying the cloud metadata address.
    'http://[64:ff9b:1::a9fe:a9fe]/latest/meta-data/iam/security-credentials/',
    'http://[64:ff9b:1::7f00:1]/',
    'http://[64:ff9b:1::a00:1]/',
    // The well-known prefix, which already worked. Kept so a fix cannot trade
    // one for the other.
    'http://[64:ff9b::a9fe:a9fe]/',
    'http://[64:ff9b::7f00:1]/',
  ])('refuses %s', async (url) => {
    await expect(refusal(url)).resolves.toBeInstanceOf(SsrfRefusedError);
  });

  it('names the embedded address rather than the tunnel', async () => {
    const error = await refusal('http://[64:ff9b:1::a9fe:a9fe]/');
    // An operator reading this needs to know it was the metadata service.
    expect(String(error.message)).toMatch(/METADATA|LINK_LOCAL/);
  });
});

describe('the deprecated site-local range is refused', () => {
  it.each([
    'http://[fec0::1]/',
    // The historic Windows default IPv6 DNS servers.
    'http://[fec0:0:0:ffff::1]/',
    'http://[fec0:0:0:ffff::2]/',
    'http://[fec0:0:0:ffff::3]/',
    // The unassigned span below fe80::, which was equally open.
    'http://[fe00::1]/',
    'http://[fe7f::1]/',
  ])('refuses %s', async (url) => {
    await expect(refusal(url)).resolves.toBeInstanceOf(SsrfRefusedError);
  });

  it('still refuses link-local by its own name', async () => {
    // The broader rule must not swallow the specific one: `fe80::1` should
    // still report LINK_LOCAL, not a vaguer reserved class.
    const error = await refusal('http://[fe80::1]/');
    expect(error.message).toContain('LINK_LOCAL');
  });
});

describe('IPv4-translated addresses are unwrapped like the other four formats', () => {
  it.each([
    'http://[::ffff:0:169.254.169.254]/latest/meta-data/',
    'http://[::ffff:0:7f00:1]/',
    'http://[::ffff:0:a00:1]/',
    'http://[::ffff:0:c0a8:1]/',
  ])('refuses %s', async (url) => {
    await expect(refusal(url)).resolves.toBeInstanceOf(SsrfRefusedError);
  });

  it('still refuses the IPv4-mapped form it always handled', async () => {
    const error = await refusal('http://[::ffff:127.0.0.1]/');
    expect(error.message).toContain('LOOPBACK');
  });
});

describe('special-purpose IPv6 assignments are refused', () => {
  it.each([
    'http://[2001:20::1]/', // ORCHIDv2
    'http://[2001:10::1]/', // deprecated ORCHID
    'http://[2001:2::1]/', // benchmarking — IPv4 twin 198.18/15 is refused
    'http://[2001:1::1]/', // PCP anycast
    'http://[2001:1::2]/', // TURN anycast
    'http://[2001:3::1]/', // AMT
    'http://[2001:4:112::1]/', // AS112
    'http://[5f00::1]/', // RFC 9602 SRv6 SIDs
  ])('refuses %s', async (url) => {
    await expect(refusal(url)).resolves.toBeInstanceOf(SsrfRefusedError);
  });
});

describe('the fix does not refuse the public internet', () => {
  it.each([
    'http://[2606:4700:4700::1111]/', // Cloudflare DNS
    'http://[2001:4860:4860::8888]/', // Google DNS
    'http://[2a00:1450:4001:800::200e]/', // Google, Europe
    'http://[2400:cb00::1]/',
    // Just outside each newly-refused range, so an off-by-one prefix shows up.
    'http://[2002::1]/'.replace('2002', '2003'),
    'http://[2001:200::1]/', // immediately above 2001::/23
    'http://[6000::1]/', // immediately above 5f00::/16
    'http://[fd00::1]/'.replace('fd00', '2610'),
  ])('still accepts %s', async (url) => {
    await expect(assertPublicTarget(url)).resolves.toBeDefined();
  });
});
