/**
 * The classifier every layer shares.
 *
 * All four layers of R6 ask the same question — "may we talk to this address?" —
 * about addresses obtained three different ways: written in the URL, returned by
 * DNS, and read off an established socket. They must answer it identically. A
 * URL check that knows about `::ffff:169.254.169.254` and a connect check that
 * does not is not a guard, it is a race.
 *
 * So classification lives here, once, over raw bytes. Notation is not this
 * module's problem: the WHATWG URL parser has already turned `0x7f000001`,
 * `017700000001` and `127.1` into `127.0.0.1` by the time anything reaches here,
 * and the adverse table in `tests/adverse/ssrf.forms.test.ts` asserts that it
 * did. What this module adds is the part no parser normalises — the transition
 * formats that carry an IPv4 address inside an IPv6 one.
 */

import { BlockList, isIPv4, isIPv6 } from 'node:net';
import { DEFAULT_POLICY, type AddressPolicy } from './policy.js';

export interface ParsedAddress {
  readonly version: 4 | 6;
  /** The literal as given, minus any surrounding brackets. */
  readonly address: string;
  /** 4 bytes for IPv4, 16 for IPv6. */
  readonly bytes: Uint8Array;
}

export interface AddressVerdict {
  readonly allowed: boolean;
  /** `PUBLIC` when allowed; otherwise the class that refused it. */
  readonly addressClass: string;
}

const PUBLIC: AddressVerdict = { allowed: true, addressClass: 'PUBLIC' };

interface ClassRule {
  readonly addressClass: string;
  readonly block: BlockList;
}

function rule(addressClass: string, subnets: readonly [string, number][]): ClassRule {
  const block = new BlockList();
  for (const [address, prefix] of subnets) {
    block.addSubnet(address, prefix, isIPv6(address) ? 'ipv6' : 'ipv4');
  }
  return { addressClass, block };
}

/**
 * Ordered, and the order is load-bearing. The metadata services sit inside
 * broader ranges (169.254.169.254 in link-local, 100.100.100.200 in carrier NAT,
 * 192.0.0.192 in IETF protocol assignments); naming them first is what makes a
 * refusal say `METADATA` instead of something vaguer. Likewise the broadcast
 * address sits inside 240.0.0.0/4.
 */
const IPV4_CLASSES: readonly ClassRule[] = [
  rule('METADATA', [
    ['169.254.169.254', 32], // AWS, GCP, Azure, DigitalOcean, Hetzner
    ['100.100.100.200', 32], // Alibaba Cloud
    ['192.0.0.192', 32], // Oracle Cloud
  ]),
  rule('UNSPECIFIED', [['0.0.0.0', 8]]),
  rule('LOOPBACK', [['127.0.0.0', 8]]),
  rule('PRIVATE', [
    ['10.0.0.0', 8],
    ['172.16.0.0', 12],
    ['192.168.0.0', 16],
  ]),
  rule('SHARED', [['100.64.0.0', 10]]),
  rule('LINK_LOCAL', [['169.254.0.0', 16]]),
  rule('SIX_TO_FOUR_RELAY', [['192.88.99.0', 24]]),
  rule('PROTOCOL_ASSIGNMENT', [['192.0.0.0', 24]]),
  rule('DOCUMENTATION', [
    ['192.0.2.0', 24],
    ['198.51.100.0', 24],
    ['203.0.113.0', 24],
  ]),
  rule('BENCHMARKING', [['198.18.0.0', 15]]),
  rule('MULTICAST', [['224.0.0.0', 4]]),
  rule('BROADCAST', [['255.255.255.255', 32]]),
  rule('RESERVED', [['240.0.0.0', 4]]),
];

/**
 * Same ordering discipline: the AWS IPv6 metadata address is inside fc00::/7.
 *
 * **The IPv4 table above was complete against the IANA special-purpose registry
 * and this one was not.** Probing found four families that fell through every
 * rule, and for a literal address a gap here is not one defence among several —
 * it is the only one. `validateUrl` returns `literal !== null`, so the resolve
 * guard has nothing to resolve and is skipped, and the connect guard re-asks
 * this same function about the same bytes and necessarily agrees. Four layers,
 * one verdict.
 *
 * The additions, and why each is not merely theoretical:
 *
 *   **`fe00::/8`** — `fe80::/10` was refused and `fc00::/7` was refused, and the
 *   deprecated site-local range between them was not. `fec0:0:0:ffff::1` through
 *   `::3` were the historic Windows default IPv6 resolvers. The whole of
 *   `fe00::/8` is reserved or deprecated, so refusing it wholesale is both
 *   simpler and safer than three adjacent rules — and `LINK_LOCAL` stays ahead
 *   of it so the common case keeps its accurate name.
 *
 *   **`2001::/23`** — IETF protocol assignments: ORCHIDv2, PCP and TURN anycast,
 *   AMT, and IPv6 benchmarking, whose IPv4 twin `198.18.0.0/15` was already
 *   refused seventeen lines above. That inconsistency inside one table is what
 *   made this worth finding.
 *
 *   **`5f00::/16`** — RFC 9602 SRv6 SIDs.
 *
 *   **`2620:4f:8000::/48`** — AS112 redirection, the IPv6 twin of the
 *   already-refused `192.175.48.0/24`.
 */
const IPV6_CLASSES: readonly ClassRule[] = [
  rule('METADATA', [['fd00:ec2::254', 128]]),
  rule('DISCARD', [['100::', 64]]),
  rule('UNIQUE_LOCAL', [['fc00::', 7]]),
  rule('LINK_LOCAL', [['fe80::', 10]]),
  // After LINK_LOCAL, so fe80:: keeps the name that tells an operator what it is.
  rule('SITE_LOCAL_RESERVED', [['fe00::', 8]]),
  rule('MULTICAST', [['ff00::', 8]]),
  rule('DOCUMENTATION', [
    ['2001:db8::', 32],
    ['3fff::', 20],
  ]),
  rule('PROTOCOL_ASSIGNMENT', [
    ['2001::', 23],
    ['5f00::', 16],
    ['2620:4f:8000::', 48],
  ]),
];

function ipv4ToBytes(address: string): Uint8Array {
  const octets = address.split('.');
  const bytes = new Uint8Array(4);
  for (let i = 0; i < 4; i += 1) bytes[i] = Number(octets[i]);
  return bytes;
}

function ipv6ToBytes(address: string): Uint8Array | null {
  // A zone identifier says which interface, not which host. Drop it.
  const zone = address.indexOf('%');
  const bare = zone === -1 ? address : address.slice(0, zone);
  const halves = bare.split('::');
  if (halves.length > 2) return null;

  const parseGroups = (part: string): number[] | null => {
    if (part === '') return [];
    const groups: number[] = [];
    for (const group of part.split(':')) {
      if (group.includes('.')) {
        // A dotted tail, as in ::ffff:127.0.0.1, occupies the last two groups.
        if (!isIPv4(group)) return null;
        const quad = ipv4ToBytes(group);
        groups.push((quad[0]! << 8) | quad[1]!, (quad[2]! << 8) | quad[3]!);
        continue;
      }
      if (!/^[0-9a-fA-F]{1,4}$/.test(group)) return null;
      groups.push(Number.parseInt(group, 16));
    }
    return groups;
  };

  const head = parseGroups(halves[0] ?? '');
  if (head === null) return null;
  const tail = halves.length === 2 ? parseGroups(halves[1] ?? '') : [];
  if (tail === null) return null;

  let groups: number[];
  if (halves.length === 1) {
    if (head.length !== 8) return null;
    groups = head;
  } else {
    const fill = 8 - head.length - tail.length;
    if (fill < 1) return null;
    groups = [...head, ...(Array(fill).fill(0) as number[]), ...tail];
  }

  const bytes = new Uint8Array(16);
  for (let i = 0; i < 8; i += 1) {
    bytes[i * 2] = (groups[i]! >> 8) & 0xff;
    bytes[i * 2 + 1] = groups[i]! & 0xff;
  }
  return bytes;
}

function bytesToIpv4(bytes: Uint8Array, offset: number, mask = 0x00): string {
  return [0, 1, 2, 3].map((i) => (bytes[offset + i]! ^ mask).toString(10)).join('.');
}

function allZero(bytes: Uint8Array, from: number, to: number): boolean {
  for (let i = from; i < to; i += 1) if (bytes[i] !== 0) return false;
  return true;
}

/**
 * Parse a host that is already an address literal. Returns null for anything
 * that is a name — names go to the resolve guard, not here.
 */
export function parseIpLiteral(host: string): ParsedAddress | null {
  if (host.length === 0) return null;
  const bare = host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host;
  if (isIPv4(bare)) return { version: 4, address: bare, bytes: ipv4ToBytes(bare) };
  if (isIPv6(bare)) {
    const bytes = ipv6ToBytes(bare);
    return bytes === null ? null : { version: 6, address: bare, bytes };
  }
  return null;
}

function matchClasses(rules: readonly ClassRule[], parsed: ParsedAddress): string | null {
  const type = parsed.version === 4 ? 'ipv4' : 'ipv6';
  for (const { addressClass, block } of rules) {
    if (block.check(parsed.address, type)) return addressClass;
  }
  return null;
}

function verdict(addressClass: string | null, policy: AddressPolicy): AddressVerdict {
  if (addressClass === null) return PUBLIC;
  if (addressClass === 'LOOPBACK' && policy.allowLoopback) {
    return { allowed: true, addressClass };
  }
  return { allowed: false, addressClass };
}

/**
 * The RFC 6052 prefix lengths, longest first.
 *
 * The prefix length is **not encoded in the address**, so a NAT64 address is
 * ambiguous: the same 128 bits embed a different IPv4 address under each of the
 * six legal lengths. Every reading is therefore extracted and every one is
 * checked, and refusing if *any* of them lands on a private address is the only
 * safe resolution of that ambiguity. `/96` leads so the overwhelmingly common
 * case reports the class an operator expects.
 */
const RFC6052_PREFIX_BITS = [96, 64, 56, 48, 40, 32] as const;

/**
 * Extract the embedded IPv4 for one RFC 6052 prefix length.
 *
 * Bits 64–71 are the reserved `u` octet and carry no address, so they are
 * skipped — which is why this is a loop over bit offsets rather than a slice.
 */
function rfc6052Ipv4(bytes: Uint8Array, prefixBits: number): string {
  const octets: number[] = [];
  let bit = prefixBits;
  for (let i = 0; i < 4; i += 1) {
    if (bit === 64) bit = 72;
    octets.push(bytes[bit / 8] ?? 0);
    bit += 8;
  }
  return octets.join('.');
}

/**
 * An IPv4 address hidden inside an IPv6 one, in any of the formats that do it.
 * None of these are normalised by any URL parser, and `BlockList` unwraps only
 * the first, so the rest are extracted here.
 */
function embeddedIpv4(bytes: Uint8Array): readonly string[] | null {
  // ::ffff:0:0/96 — IPv4-mapped.
  if (allZero(bytes, 0, 10) && bytes[10] === 0xff && bytes[11] === 0xff) {
    return [bytesToIpv4(bytes, 12)];
  }
  // ::ffff:0:0:0/96 — IPv4-translated, RFC 2765. The fifth format, and the
  // docstring above used to say there were four. It fell through both of its
  // neighbours for the same reason: bytes 8–9 are `ffff`, so neither the mapped
  // test nor the IPv4-compatible fallback at the end of `classifyHostAddress`
  // matches it.
  if (allZero(bytes, 0, 8) && bytes[8] === 0xff && bytes[9] === 0xff && allZero(bytes, 10, 12)) {
    return [bytesToIpv4(bytes, 12)];
  }
  // 64:ff9b::/32 — NAT64. Covers the well-known /96 prefix and RFC 8215's
  // local-use `64:ff9b:1::/48` alike, which share these four bytes. The old
  // rule required bytes 4–11 to be zero and so recognised only the well-known
  // prefix; the local-use one is what an operator is *told* to use when the
  // well-known prefix will not do, and on a NAT64 or 464XLAT network
  // `[64:ff9b:1::a9fe:a9fe]` is the cloud metadata service. Nothing legitimate
  // is reachable anywhere in this /32.
  if (bytes[0] === 0x00 && bytes[1] === 0x64 && bytes[2] === 0xff && bytes[3] === 0x9b) {
    return RFC6052_PREFIX_BITS.map((prefixBits) => rfc6052Ipv4(bytes, prefixBits));
  }
  // 2002::/16 — 6to4. The IPv4 address is the next 32 bits.
  if (bytes[0] === 0x20 && bytes[1] === 0x02) {
    return [bytesToIpv4(bytes, 2)];
  }
  // 2001:0::/32 — Teredo. Server address plain, client address one's-complemented.
  if (bytes[0] === 0x20 && bytes[1] === 0x01 && bytes[2] === 0x00 && bytes[3] === 0x00) {
    return [bytesToIpv4(bytes, 4), bytesToIpv4(bytes, 12, 0xff)];
  }
  return null;
}

export function classifyHostAddress(
  parsed: ParsedAddress,
  policy: AddressPolicy = DEFAULT_POLICY,
): AddressVerdict {
  if (parsed.version === 4) {
    return verdict(matchClasses(IPV4_CLASSES, parsed), policy);
  }

  // Exact addresses first: :: and ::1 sit inside the deprecated ::/96 range and
  // deserve their own names.
  if (allZero(parsed.bytes, 0, 16)) return verdict('UNSPECIFIED', policy);
  if (allZero(parsed.bytes, 0, 15) && parsed.bytes[15] === 1) return verdict('LOOPBACK', policy);

  const embedded = embeddedIpv4(parsed.bytes);
  if (embedded !== null) {
    for (const address of embedded) {
      const inner = parseIpLiteral(address);
      if (inner === null) continue;
      const innerVerdict = verdict(matchClasses(IPV4_CLASSES, inner), policy);
      // Report the embedded class, not the wrapper: a refusal that says
      // METADATA is actionable, one that says "some IPv6 thing" is not.
      if (!innerVerdict.allowed) return innerVerdict;
    }
    // The tunnel carries a public address, but a tunnel is still never a real
    // audit target — and each of these formats is a documented SSRF vector.
    return { allowed: false, addressClass: 'TRANSITION_TUNNEL' };
  }

  // ::/96 with something in the low bits: IPv4-compatible, deprecated by RFC 4291.
  if (allZero(parsed.bytes, 0, 12)) return verdict('IPV4_COMPATIBLE', policy);

  return verdict(matchClasses(IPV6_CLASSES, parsed), policy);
}

/**
 * Classify an address string obtained from DNS or from a socket, where we have
 * no URL to tell us the family. Unparseable input is refused, not ignored.
 */
export function classifyAddressString(
  address: string,
  policy: AddressPolicy = DEFAULT_POLICY,
): AddressVerdict {
  const parsed = parseIpLiteral(address);
  if (parsed === null) return { allowed: false, addressClass: 'UNPARSEABLE' };
  return classifyHostAddress(parsed, policy);
}
