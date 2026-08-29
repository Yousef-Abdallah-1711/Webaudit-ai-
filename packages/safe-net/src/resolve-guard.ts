/**
 * T048 — layer 2 of R6: resolve the name and check *every* answer.
 *
 * "Every" is the whole requirement. A name that answers
 * `[93.184.216.34, 10.0.0.1]` is not half-safe: the connect will pick whichever
 * address it likes, and on a machine with `autoSelectFamily` enabled it may try
 * several. Checking `addresses[0]` is the most common way an SSRF guard is
 * wrong while looking right.
 *
 * This layer cannot stand alone — the address it approves is not necessarily the
 * address the socket gets, which is what `connect-guard.ts` is for. What it does
 * provide is refusal *before* a connection attempt, so a target that is plainly
 * internal is never dialled at all.
 */

import { lookup } from 'node:dns/promises';
import type { LookupFunction } from 'node:net';
import { classifyAddressString } from './address-rules.js';
import { SsrfRefusedError } from './errors.js';
import { DEFAULT_POLICY, type AddressPolicy } from './policy.js';

export interface ResolvedAddress {
  readonly address: string;
  readonly family: 4 | 6;
}

/**
 * Injectable so the rebinding suite can point a real resolver at a server that
 * changes its answers. Production uses `systemResolver`.
 */
export type AddressResolver = (hostname: string) => Promise<ResolvedAddress[]>;

export const systemResolver: AddressResolver = async (hostname) => {
  const results = await lookup(hostname, { all: true, verbatim: true });
  return results.map((entry) => ({
    address: entry.address,
    family: entry.family === 6 ? 6 : 4,
  }));
};

export interface ResolveGuardOptions {
  readonly resolver?: AddressResolver;
  readonly policy?: AddressPolicy;
  readonly hop?: number;
}

/**
 * @returns every resolved address, all of them allowed.
 * @throws SsrfRefusedError if the name resolves to nothing, or if any single
 *   answer is in a disallowed class.
 */
export async function assertResolvedAddressesAllowed(
  hostname: string,
  options: ResolveGuardOptions = {},
): Promise<ResolvedAddress[]> {
  const resolver = options.resolver ?? systemResolver;
  const policy = options.policy ?? DEFAULT_POLICY;
  const hop = options.hop ?? 0;

  let addresses: ResolvedAddress[];
  try {
    addresses = await resolver(hostname);
  } catch (error) {
    const code = (error as { code?: string }).code;
    // A name that does not exist is refused here rather than left for the
    // connect to discover, so the caller gets a refusal and not a timeout.
    if (code === 'ENOTFOUND' || code === 'ENODATA' || code === 'EAI_AGAIN') {
      throw new SsrfRefusedError('DNS_NO_ADDRESSES', { target: hostname, hop });
    }
    throw error;
  }

  if (addresses.length === 0) {
    throw new SsrfRefusedError('DNS_NO_ADDRESSES', { target: hostname, hop });
  }

  for (const { address } of addresses) {
    const verdict = classifyAddressString(address, policy);
    if (!verdict.allowed) {
      throw new SsrfRefusedError('RESOLVED_ADDRESS_DISALLOWED', {
        target: address,
        addressClass: verdict.addressClass,
        hop,
      });
    }
  }

  return addresses;
}

/**
 * Adapt an `AddressResolver` to the callback shape `net.connect` expects, so the
 * socket resolves the name the same way the guard did.
 *
 * Note what this deliberately does *not* do: it does not hand the connect the
 * addresses the guard already approved. Doing so would make the rebinding test
 * pass while leaving the hole open in production, where the kernel resolves
 * independently. The connect performs its own lookup, and `connect-guard.ts`
 * checks whatever it actually reached.
 */
export function lookupVia(resolver: AddressResolver): LookupFunction {
  return (hostname, options, callback) => {
    resolver(hostname).then(
      (addresses) => {
        const first = addresses[0];
        if (first === undefined) {
          const error = new Error(`getaddrinfo ENOTFOUND ${hostname}`) as Error & { code: string };
          error.code = 'ENOTFOUND';
          callback(error, '', 4);
          return;
        }
        if (options.all === true) {
          const all = addresses.map((entry) => ({ address: entry.address, family: entry.family }));
          (callback as unknown as (err: null, addresses: typeof all) => void)(null, all);
          return;
        }
        callback(null, first.address, first.family);
      },
      (error: unknown) => {
        callback(error as NodeJS.ErrnoException, '', 4);
      },
    );
  };
}
