/**
 * T044 — SC-018: private, loopback, link-local and metadata addresses are
 * refused "in 100% of cases, including ... via address forms designed to evade
 * checks".
 *
 * The table is the test. A guard that greps for `127.0.0.1` passes a hand-picked
 * example and fails here, because `2130706433`, `0x7f000001`, `017700000001`,
 * `127.1`, `[::ffff:7f00:1]`, `[64:ff9b::7f00:1]` and `[2002:7f00:1::]` are all
 * the same host wearing a different hat.
 *
 * Two entry points are exercised for every rejection case:
 *   - `validateUrl`, the form layer, so the failure names the class; and
 *   - `safeFetch`, the package's only public export, so nothing routes around it.
 *
 * A rejection only `validateUrl` makes is not a guarantee. A rejection the
 * exported fetch makes is.
 */

import { describe, expect, it } from 'vitest';
import { safeFetch, SsrfRefusedError } from '../../src/index.js';
import { validateUrl } from '../../src/validate-url.js';
import { classifyHostAddress, parseIpLiteral } from '../../src/address-rules.js';

interface Refusal {
  readonly url: string;
  /** Why it is refused — asserted, so a case cannot pass for the wrong reason. */
  readonly addressClass: string;
  readonly note?: string;
}

const LOOPBACK_NOTATIONS: readonly Refusal[] = [
  { url: 'http://127.0.0.1/', addressClass: 'LOOPBACK', note: 'dotted quad' },
  { url: 'http://127.255.255.254/', addressClass: 'LOOPBACK', note: 'far end of 127/8' },
  { url: 'http://127.1/', addressClass: 'LOOPBACK', note: 'two-part short form' },
  { url: 'http://127.0.1/', addressClass: 'LOOPBACK', note: 'three-part short form' },
  { url: 'http://2130706433/', addressClass: 'LOOPBACK', note: 'single decimal' },
  { url: 'http://0x7f000001/', addressClass: 'LOOPBACK', note: 'single hex' },
  { url: 'http://0x7f.0x0.0x0.0x1/', addressClass: 'LOOPBACK', note: 'per-octet hex' },
  { url: 'http://017700000001/', addressClass: 'LOOPBACK', note: 'single octal' },
  { url: 'http://0177.0.0.01/', addressClass: 'LOOPBACK', note: 'per-octet octal' },
  { url: 'http://0177.1/', addressClass: 'LOOPBACK', note: 'mixed octal and short form' },
  { url: 'http://127.0.0.1./', addressClass: 'LOOPBACK', note: 'trailing root dot' },
  { url: 'http://①②⑦.0.0.1/', addressClass: 'LOOPBACK', note: 'unicode digit lookalikes' },
];

const IPV6_NOTATIONS: readonly Refusal[] = [
  { url: 'http://[::1]/', addressClass: 'LOOPBACK', note: 'abbreviated' },
  { url: 'http://[0:0:0:0:0:0:0:1]/', addressClass: 'LOOPBACK', note: 'fully expanded' },
  {
    url: 'http://[0000:0000:0000:0000:0000:0000:0000:0001]/',
    addressClass: 'LOOPBACK',
    note: 'zero padded',
  },
  { url: 'http://[::]/', addressClass: 'UNSPECIFIED', note: 'all zeroes' },
  { url: 'http://[::ffff:127.0.0.1]/', addressClass: 'LOOPBACK', note: 'IPv4-mapped, dotted tail' },
  { url: 'http://[::ffff:7f00:1]/', addressClass: 'LOOPBACK', note: 'IPv4-mapped, hex tail' },
  { url: 'http://[::ffff:10.0.0.1]/', addressClass: 'PRIVATE', note: 'IPv4-mapped private' },
  {
    url: 'http://[::ffff:169.254.169.254]/',
    addressClass: 'METADATA',
    note: 'IPv4-mapped metadata',
  },
  {
    url: 'http://[::7f00:1]/',
    addressClass: 'IPV4_COMPATIBLE',
    note: 'deprecated IPv4-compatible',
  },
  { url: 'http://[64:ff9b::7f00:1]/', addressClass: 'LOOPBACK', note: 'NAT64 embedding loopback' },
  {
    url: 'http://[64:ff9b::a9fe:a9fe]/',
    addressClass: 'METADATA',
    note: 'NAT64 embedding metadata',
  },
  { url: 'http://[2002:7f00:1::]/', addressClass: 'LOOPBACK', note: '6to4 embedding loopback' },
  { url: 'http://[2002:a9fe:a9fe::]/', addressClass: 'METADATA', note: '6to4 embedding metadata' },
  { url: 'http://[fe80::1]/', addressClass: 'LINK_LOCAL', note: 'IPv6 link-local' },
  { url: 'http://[fc00::1]/', addressClass: 'UNIQUE_LOCAL' },
  { url: 'http://[fd12:3456:789a::1]/', addressClass: 'UNIQUE_LOCAL' },
  { url: 'http://[fd00:ec2::254]/', addressClass: 'METADATA', note: 'AWS IPv6 metadata service' },
  { url: 'http://[ff02::1]/', addressClass: 'MULTICAST' },
  { url: 'http://[2001:db8::1]/', addressClass: 'DOCUMENTATION' },
  { url: 'http://[100::1]/', addressClass: 'DISCARD' },
];

const IPV4_RANGES: readonly Refusal[] = [
  { url: 'http://10.0.0.1/', addressClass: 'PRIVATE' },
  { url: 'http://10.255.255.254/', addressClass: 'PRIVATE' },
  { url: 'http://172.16.0.1/', addressClass: 'PRIVATE' },
  { url: 'http://172.31.255.254/', addressClass: 'PRIVATE' },
  { url: 'http://192.168.1.1/', addressClass: 'PRIVATE' },
  { url: 'http://0.0.0.0/', addressClass: 'UNSPECIFIED' },
  { url: 'http://0/', addressClass: 'UNSPECIFIED', note: 'bare zero canonicalises to 0.0.0.0' },
  { url: 'http://100.64.0.1/', addressClass: 'SHARED', note: 'carrier NAT' },
  { url: 'http://169.254.0.1/', addressClass: 'LINK_LOCAL' },
  {
    url: 'http://169.254.169.254/',
    addressClass: 'METADATA',
    note: 'AWS, GCP, Azure, DigitalOcean',
  },
  { url: 'http://0xA9FEA9FE/', addressClass: 'METADATA', note: 'metadata in hex' },
  { url: 'http://2852039166/', addressClass: 'METADATA', note: 'metadata in decimal' },
  { url: 'http://100.100.100.200/', addressClass: 'METADATA', note: 'Alibaba Cloud' },
  { url: 'http://192.0.0.192/', addressClass: 'METADATA', note: 'Oracle Cloud' },
  { url: 'http://192.0.0.1/', addressClass: 'PROTOCOL_ASSIGNMENT' },
  { url: 'http://192.0.2.1/', addressClass: 'DOCUMENTATION' },
  { url: 'http://198.51.100.1/', addressClass: 'DOCUMENTATION' },
  { url: 'http://203.0.113.1/', addressClass: 'DOCUMENTATION' },
  { url: 'http://198.18.0.1/', addressClass: 'BENCHMARKING' },
  { url: 'http://192.88.99.1/', addressClass: 'SIX_TO_FOUR_RELAY' },
  { url: 'http://224.0.0.1/', addressClass: 'MULTICAST' },
  { url: 'http://239.255.255.250/', addressClass: 'MULTICAST', note: 'SSDP' },
  { url: 'http://240.0.0.1/', addressClass: 'RESERVED' },
  { url: 'http://255.255.255.255/', addressClass: 'BROADCAST' },
];

const ALL_ADDRESS_FORMS: readonly Refusal[] = [
  ...LOOPBACK_NOTATIONS,
  ...IPV6_NOTATIONS,
  ...IPV4_RANGES,
];

async function refusalFromFetch(url: string): Promise<SsrfRefusedError> {
  try {
    await safeFetch(url);
  } catch (error) {
    if (error instanceof SsrfRefusedError) return error;
    throw new Error(`${url}: refused, but not as an SSRF refusal: ${String(error)}`);
  }
  throw new Error(`${url}: safeFetch resolved. SC-018 requires refusal.`);
}

describe('SC-018 - literal addresses are refused in every notation', () => {
  it.each(ALL_ADDRESS_FORMS)('refuses $url as $addressClass', async ({ url, addressClass }) => {
    const formLayer = () => validateUrl(url);
    expect(formLayer).toThrow(SsrfRefusedError);
    try {
      formLayer();
    } catch (error) {
      const refusal = error as SsrfRefusedError;
      expect(refusal.reason).toBe('LITERAL_ADDRESS_DISALLOWED');
      expect(refusal.addressClass).toBe(addressClass);
    }

    // And again through the only public entry point, which is the guarantee.
    const refusal = await refusalFromFetch(url);
    expect(refusal.reason).toBe('LITERAL_ADDRESS_DISALLOWED');
    expect(refusal.addressClass).toBe(addressClass);
  });

  it('covers every notation family named in T044', () => {
    // Guards the table against being quietly trimmed back to the easy cases.
    const notes = ALL_ADDRESS_FORMS.map((c) => c.note ?? '').join(' ');
    for (const family of ['decimal', 'hex', 'octal', 'IPv4-mapped', 'abbreviated']) {
      expect(notes).toContain(family);
    }
    expect(ALL_ADDRESS_FORMS.length).toBeGreaterThanOrEqual(50);
  });
});

describe('SC-018 - names that denote internal scope are refused', () => {
  const names = [
    'http://localhost/',
    'http://LOCALHOST/',
    'http://api.localhost/',
    'http://printer.local/',
    'http://metadata.google.internal/computeMetadata/v1/',
    'http://vault.internal/',
    'http://db.home.arpa/',
    'http://box.localdomain/',
  ];

  it.each(names)('refuses %s without resolving it', async (url) => {
    const refusal = await refusalFromFetch(url);
    expect(refusal.reason).toBe('HOSTNAME_NOT_PUBLIC');
  });
});

describe('SC-018 - malformed and non-HTTP forms are refused', () => {
  const cases: readonly { url: string; reason: string }[] = [
    { url: 'file:///etc/passwd', reason: 'SCHEME_NOT_ALLOWED' },
    { url: 'gopher://example.com:6379/_INFO', reason: 'SCHEME_NOT_ALLOWED' },
    { url: 'ftp://example.com/x', reason: 'SCHEME_NOT_ALLOWED' },
    { url: 'data:text/plain,hello', reason: 'SCHEME_NOT_ALLOWED' },
    { url: 'http://user:pass@example.com/', reason: 'CREDENTIALS_IN_URL' },
    { url: 'http://example.com@127.0.0.1/', reason: 'CREDENTIALS_IN_URL' },
    { url: 'not a url at all', reason: 'URL_UNPARSEABLE' },
    { url: '//example.com/protocol-relative', reason: 'URL_UNPARSEABLE' },
    { url: 'http://', reason: 'URL_UNPARSEABLE' },
    { url: 'http://[::1', reason: 'URL_UNPARSEABLE' },
    { url: 'http://%00/', reason: 'URL_UNPARSEABLE' },
  ];

  it.each(cases)('refuses $url as $reason', async ({ url, reason }) => {
    const refusal = await refusalFromFetch(url);
    expect(refusal.reason).toBe(reason);
  });
});

describe('the classifier itself', () => {
  it('calls genuinely public addresses public', () => {
    // If this ever fails closed, the product audits nothing at all.
    for (const address of ['93.184.216.34', '8.8.8.8', '1.1.1.1', '2606:4700::1111']) {
      const parsed = parseIpLiteral(address);
      expect(parsed, address).not.toBeNull();
      expect(classifyHostAddress(parsed!).allowed, address).toBe(true);
    }
  });

  it('rejects strings that only look like addresses', () => {
    for (const candidate of ['example.com', '', '999.1.1.1', '127.0.0.1.5', 'localhost']) {
      expect(parseIpLiteral(candidate), candidate).toBeNull();
    }
  });

  it('never reports a disallowed address as allowed', () => {
    for (const { url, addressClass } of ALL_ADDRESS_FORMS) {
      const host = new URL(url).hostname.replace(/^\[|\]$/g, '');
      const parsed = parseIpLiteral(decodeURIComponent(host));
      expect(parsed, url).not.toBeNull();
      const verdict = classifyHostAddress(parsed!);
      expect(verdict.allowed, url).toBe(false);
      expect(verdict.addressClass, url).toBe(addressClass);
    }
  });
});
