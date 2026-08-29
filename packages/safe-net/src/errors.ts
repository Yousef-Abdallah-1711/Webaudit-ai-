/**
 * One error type for every refusal, carrying which layer refused and why.
 *
 * Callers upstream turn this into a user-facing message and, per Principle VI,
 * decline to charge for the attempt. The `reason` is therefore part of the
 * contract, not debug detail: the adverse suites assert on it so a case cannot
 * pass by being refused for an unrelated reason.
 */

export type SsrfRefusalReason =
  /** Not a URL at all, or one with no host. */
  | 'URL_UNPARSEABLE'
  /** Anything other than http: or https:. */
  | 'SCHEME_NOT_ALLOWED'
  /** Userinfo present. `http://example.com@127.0.0.1/` is the reason this exists. */
  | 'CREDENTIALS_IN_URL'
  /** A name reserved for local or internal scope (localhost, .internal, .local). */
  | 'HOSTNAME_NOT_PUBLIC'
  /** Layer 1 — the host is a literal address in a disallowed class. */
  | 'LITERAL_ADDRESS_DISALLOWED'
  /** Layer 2 — the name resolved to nothing we could check. */
  | 'DNS_NO_ADDRESSES'
  /** Layer 2 — at least one resolved address is in a disallowed class. */
  | 'RESOLVED_ADDRESS_DISALLOWED'
  /** Layer 3 — the established socket's peer is in a disallowed class. Rebinding. */
  | 'CONNECT_ADDRESS_DISALLOWED'
  /** Layer 4 — the chain exceeded its budget, or loops. */
  | 'TOO_MANY_REDIRECTS'
  /** Layer 4 — a 3xx we cannot re-validate, so will not follow. */
  | 'REDIRECT_LOCATION_INVALID';

export interface SsrfRefusalDetail {
  /** The URL, host, or address the refusal is about. */
  readonly target: string;
  /** Which class of address, when the refusal was about an address. */
  readonly addressClass?: string;
  /** The hop index within a redirect chain; 0 is the URL the caller supplied. */
  readonly hop?: number;
}

export class SsrfRefusedError extends Error {
  override readonly name = 'SsrfRefusedError';
  readonly reason: SsrfRefusalReason;
  readonly target: string;
  readonly addressClass: string | undefined;
  readonly hop: number | undefined;

  constructor(reason: SsrfRefusalReason, detail: SsrfRefusalDetail) {
    super(buildMessage(reason, detail));
    this.reason = reason;
    this.target = detail.target;
    this.addressClass = detail.addressClass;
    this.hop = detail.hop;
  }
}

function buildMessage(reason: SsrfRefusalReason, detail: SsrfRefusalDetail): string {
  const where = detail.hop !== undefined && detail.hop > 0 ? ` at redirect hop ${detail.hop}` : '';
  const klass = detail.addressClass === undefined ? '' : ` (${detail.addressClass})`;
  return `Refused ${detail.target}${klass}${where}: ${reason}`;
}

/**
 * Pull a refusal back out of whatever wrapped it.
 *
 * The connect-time guard (layer 3) fails inside undici's connector, and undici
 * reports that as its own socket error with ours as the `cause`. Without this
 * unwrapping, the one refusal that defeats DNS rebinding would surface to
 * callers as a generic network failure — indistinguishable from the site being
 * down, which is exactly the wrong thing to tell a user.
 */
export function findSsrfRefusal(error: unknown): SsrfRefusedError | null {
  let current: unknown = error;
  for (let depth = 0; depth < 10 && current !== null && current !== undefined; depth += 1) {
    if (current instanceof SsrfRefusedError) return current;
    if (typeof current !== 'object') return null;
    current = (current as { cause?: unknown }).cause;
  }
  return null;
}
