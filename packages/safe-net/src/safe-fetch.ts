/**
 * T050 — layer 4 of R6: follow redirects by hand so every hop runs layers 1–3.
 *
 * Automatic redirect following cannot satisfy FR-014 ("MUST re-apply this check
 * on every redirect"). By the time `fetch(url, { redirect: 'follow' })` returns,
 * the request to `169.254.169.254` has been sent and answered — the check you
 * apply to the result is a post-mortem. So `maxRedirections` is 0 on every
 * request here and the loop is explicit.
 *
 * This module holds the internal entry point. `src/index.ts` wraps it in the
 * only signature other packages can reach, one that takes no policy and no
 * resolver.
 */

import { request } from 'undici';
import { createSafeDispatcher } from './connect-guard.js';
import { findSsrfRefusal, SsrfRefusedError } from './errors.js';
import {
  DEFAULT_MAX_REDIRECTS,
  DEFAULT_MAX_RESPONSE_BYTES,
  DEFAULT_POLICY,
  DEFAULT_TIMEOUT_MS,
  type AddressPolicy,
} from './policy.js';
import { assertResolvedAddressesAllowed, type AddressResolver } from './resolve-guard.js';
import { validateUrl } from './validate-url.js';

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

export interface SafeFetchInit {
  readonly method?: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly body?: string | Uint8Array;
  readonly signal?: AbortSignal;
  readonly maxRedirects?: number;
  readonly timeoutMs?: number;
  readonly maxResponseBytes?: number;
}

export interface SafeResponse {
  /** The URL the body actually came from, after every validated hop. */
  readonly url: string;
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;
  /** Every hop, in order, starting with the URL the caller supplied. */
  readonly redirects: readonly string[];
  bytes(): Uint8Array;
  text(): string;
}

/** Internal seam. Not reachable through the package entry point — see policy.ts. */
export interface GuardedFetchOptions extends SafeFetchInit {
  readonly policy?: AddressPolicy;
  readonly resolver?: AddressResolver;
}

function headerRecord(raw: Record<string, string | string[] | undefined>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (value === undefined) continue;
    out[key.toLowerCase()] = Array.isArray(value) ? value.join(', ') : value;
  }
  return out;
}

/**
 * A 303 becomes a GET; 307 and 308 must preserve the method and body. Getting
 * this wrong turns a guarded POST into a silently different request.
 */
function methodAfterRedirect(status: number, method: string): string {
  if (status === 303 && method !== 'GET' && method !== 'HEAD') return 'GET';
  if (status === 301 || status === 302) {
    return method === 'POST' ? 'GET' : method;
  }
  return method;
}

export async function guardedFetch(
  url: string,
  options: GuardedFetchOptions = {},
): Promise<SafeResponse> {
  const policy = options.policy ?? DEFAULT_POLICY;
  const maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
  const maxBytes = options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  // One budget for the whole chain. A per-hop timeout multiplied by the redirect
  // budget is how a "30 second" fetch takes three minutes.
  const deadline = AbortSignal.timeout(timeoutMs);
  const signal =
    options.signal === undefined ? deadline : AbortSignal.any([options.signal, deadline]);

  const redirects: string[] = [];
  let currentUrl = url;
  let method = (options.method ?? 'GET').toUpperCase();
  let body = options.body;

  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    // Layer 1, on the caller's URL at hop 0 and on a Location header after that.
    const target = validateUrl(currentUrl, policy, hop);
    redirects.push(target.url.href);

    // Layer 2. Skipped for a literal address, which layer 1 already classified —
    // there is no name to resolve and nothing new to learn.
    if (target.literal === null) {
      await assertResolvedAddressesAllowed(target.hostname, {
        ...(options.resolver === undefined ? {} : { resolver: options.resolver }),
        policy,
        hop,
      });
    }

    // Layer 3 lives in the dispatcher. One per hop: a connection approved for
    // this hop must not be reused for the next.
    const dispatcher = createSafeDispatcher({
      policy,
      hop,
      ...(options.resolver === undefined ? {} : { resolver: options.resolver }),
    });

    try {
      // No redirect interceptor is installed on the dispatcher, so undici does
      // not follow anything: a 3xx comes back as a 3xx and the loop below
      // re-validates the target before going anywhere. That is the whole point
      // of the module, and the per-hop request counts in
      // tests/adverse/ssrf.redirect.test.ts fail if it ever stops being true.
      const response = await request(target.url, {
        dispatcher,
        method,
        signal,
        ...(options.headers === undefined ? {} : { headers: { ...options.headers } }),
        ...(body === undefined || method === 'GET' || method === 'HEAD' ? {} : { body }),
      });

      const headers = headerRecord(response.headers);

      if (REDIRECT_STATUSES.has(response.statusCode)) {
        // Drain before leaving the hop, or the socket lingers holding the pool open.
        await response.body.dump();

        const location = headers.location;
        if (location === undefined || location === '') {
          throw new SsrfRefusedError('REDIRECT_LOCATION_INVALID', {
            target: target.url.href,
            hop,
          });
        }

        let next: URL;
        try {
          // Relative locations resolve against the hop that sent them, which is
          // why the base is the current URL and not the original one.
          next = new URL(location, target.url);
        } catch {
          throw new SsrfRefusedError('REDIRECT_LOCATION_INVALID', {
            target: location,
            hop,
          });
        }

        const nextMethod = methodAfterRedirect(response.statusCode, method);
        if (nextMethod !== method) body = undefined;
        method = nextMethod;
        currentUrl = next.href;
        continue;
      }

      const buffered = await readBounded(response.body, maxBytes);
      return {
        url: target.url.href,
        status: response.statusCode,
        headers,
        redirects: [...redirects],
        bytes: () => buffered,
        text: () => Buffer.from(buffered).toString('utf8'),
      };
    } catch (error) {
      // A layer-3 refusal surfaces as undici's socket error with ours as the
      // cause. Unwrapped here so callers see the refusal, not "fetch failed".
      const refusal = findSsrfRefusal(error);
      throw refusal ?? error;
    } finally {
      await dispatcher.close();
    }
  }

  throw new SsrfRefusedError('TOO_MANY_REDIRECTS', {
    target: currentUrl,
    hop: maxRedirects + 1,
  });
}

async function readBounded(body: AsyncIterable<Uint8Array>, maxBytes: number): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  let total = 0;
  for await (const chunk of body) {
    total += chunk.byteLength;
    if (total > maxBytes) {
      throw new Error(`Response exceeded ${String(maxBytes)} bytes`);
    }
    chunks.push(chunk);
  }
  return new Uint8Array(Buffer.concat(chunks));
}

/**
 * Validate a target without contacting it.
 *
 * `POST /targets` has to refuse an SSRF target (contracts/http-api.md: "422 on
 * SSRF refusal") and canonicalise what survives. It must not *fetch* it: an
 * endpoint that dials any URL a caller names is itself the amplifier this
 * package exists to prevent, and reachability is FR-013's business at scan time.
 *
 * So this runs layers 1 and 2 — form and every resolved address — and stops
 * there. Layer 3 has nothing to check without a connection, which is precisely
 * why the answer here is never treated as durable: `safeFetch` re-runs all four
 * layers when the target is actually visited.
 */
export async function guardedTargetCheck(
  url: string,
  options: Pick<GuardedFetchOptions, 'policy' | 'resolver'> = {},
): Promise<{ origin: string; href: string; hostname: string }> {
  const policy = options.policy ?? DEFAULT_POLICY;
  const target = validateUrl(url, policy);
  if (target.literal === null) {
    await assertResolvedAddressesAllowed(target.hostname, {
      ...(options.resolver === undefined ? {} : { resolver: options.resolver }),
      policy,
    });
  }
  return { origin: target.url.origin, href: target.url.href, hostname: target.hostname };
}
