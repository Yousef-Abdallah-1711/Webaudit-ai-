/**
 * T047 — layer 1 of R6: refuse by form, before any resolution or connection.
 *
 * The cheap layer, and the one that catches the evasion attempts. It runs on the
 * URL the caller supplied and again on every redirect target, because a
 * `Location` header is attacker-controlled input exactly like a submitted URL.
 *
 * Notation is delegated to the WHATWG URL parser rather than re-implemented
 * here. `new URL()` already canonicalises `2130706433`, `0x7f000001`,
 * `017700000001`, `127.1` and `①②⑦.0.0.1` to `127.0.0.1`, and IPv6 to its
 * compressed form. Re-parsing those by hand would mean maintaining a second
 * parser that has to agree with the one the runtime will actually connect with —
 * and the gap between two parsers is where these bypasses live.
 */

import { classifyHostAddress, parseIpLiteral, type ParsedAddress } from './address-rules.js';
import { SsrfRefusedError } from './errors.js';
import { DEFAULT_POLICY, type AddressPolicy } from './policy.js';

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);

/**
 * Names reserved for local or internal scope. None of them can identify a
 * public audit target, and each is a routine way to reach one — `.internal` is
 * where GCP keeps its metadata service, and a resolver configured for a private
 * zone will happily answer for the rest.
 *
 * RFC 2606's `.test`, `.example` and `.invalid` are deliberately absent: they
 * denote "not real", not "internal", and they simply fail to resolve.
 */
const INTERNAL_SUFFIXES: readonly string[] = [
  'localhost',
  'local',
  'internal',
  'intranet',
  'private',
  'corp',
  'lan',
  'home.arpa',
  'localdomain',
];

export interface ValidatedTarget {
  readonly url: URL;
  /** Hostname with IPv6 brackets stripped, ready for DNS or classification. */
  readonly hostname: string;
  /** Non-null when the host was written as an address rather than a name. */
  readonly literal: ParsedAddress | null;
}

function isInternalName(hostname: string): boolean {
  const name = hostname.endsWith('.') ? hostname.slice(0, -1) : hostname;
  return INTERNAL_SUFFIXES.some((suffix) => name === suffix || name.endsWith(`.${suffix}`));
}

/**
 * @param raw the URL to validate. A string on first submission; a resolved
 *   `URL` when re-validating a redirect hop.
 * @param hop index within a redirect chain, carried into the error for context.
 * @throws SsrfRefusedError for anything that must not be dialled.
 */
export function validateUrl(
  raw: string | URL,
  policy: AddressPolicy = DEFAULT_POLICY,
  hop = 0,
): ValidatedTarget {
  const target = typeof raw === 'string' ? raw : raw.href;

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new SsrfRefusedError('URL_UNPARSEABLE', { target, hop });
  }

  if (!ALLOWED_PROTOCOLS.has(url.protocol)) {
    throw new SsrfRefusedError('SCHEME_NOT_ALLOWED', { target, hop });
  }

  // Checked before the host, because `http://example.com@127.0.0.1/` reads as a
  // request to example.com and is a request to loopback. Credentials also have
  // no place in an audit target: they would be logged, stored, and sent.
  if (url.username !== '' || url.password !== '') {
    throw new SsrfRefusedError('CREDENTIALS_IN_URL', { target, hop });
  }

  if (url.hostname === '') {
    throw new SsrfRefusedError('URL_UNPARSEABLE', { target, hop });
  }

  const hostname = url.hostname.replace(/^\[|\]$/g, '');

  const literal = parseIpLiteral(hostname);
  if (literal !== null) {
    const verdict = classifyHostAddress(literal, policy);
    if (!verdict.allowed) {
      throw new SsrfRefusedError('LITERAL_ADDRESS_DISALLOWED', {
        target,
        addressClass: verdict.addressClass,
        hop,
      });
    }
    return { url, hostname, literal };
  }

  if (isInternalName(hostname)) {
    throw new SsrfRefusedError('HOSTNAME_NOT_PUBLIC', { target, hop });
  }

  return { url, hostname, literal: null };
}
