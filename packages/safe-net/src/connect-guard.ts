/**
 * T049 — layer 3 of R6, and the only layer that defeats DNS rebinding.
 *
 * Layers 1 and 2 inspect what we *intend* to talk to. This one inspects what we
 * are *actually* talking to: the peer address of an established socket, read
 * after connect (or after the TLS handshake), before a single byte of the request
 * is written.
 *
 * Why it has to be here and not earlier: between the guard's DNS query and the
 * kernel's, the same name can answer differently. Pre-resolving and connecting
 * by IP would close that window but breaks TLS SNI, virtual hosting, and any
 * target behind a CDN — and it silently disagrees with what the OS would have
 * done. Checking the socket instead makes the guarantee independent of how the
 * name resolved, how many times, or to what.
 *
 * `research.md` R6 rejected off-the-shelf SSRF libraries for precisely this
 * gap: "most validate the URL and not the connection".
 */

import { Agent as UndiciAgent, buildConnector, type Agent } from 'undici';
import { classifyAddressString } from './address-rules.js';
import { SsrfRefusedError } from './errors.js';
import { DEFAULT_POLICY, type AddressPolicy } from './policy.js';
import { lookupVia, type AddressResolver } from './resolve-guard.js';

export interface ConnectGuardOptions {
  readonly policy?: AddressPolicy;
  /** When supplied, the socket resolves names through it, as the guard does. */
  readonly resolver?: AddressResolver;
  readonly connectTimeoutMs?: number;
  readonly hop?: number;
}

type Connector = ReturnType<typeof buildConnector>;

export function createSafeConnector(options: ConnectGuardOptions = {}): Connector {
  const policy = options.policy ?? DEFAULT_POLICY;
  const hop = options.hop ?? 0;

  const base = buildConnector({
    timeout: options.connectTimeoutMs ?? 10_000,
    // Nothing is reused across requests, so nothing survives its validation.
    keepAlive: false,
    ...(options.resolver === undefined ? {} : { lookup: lookupVia(options.resolver) }),
  });

  return (connectOptions, callback) =>
    base(connectOptions, (error, socket) => {
      if (error !== null || socket === null || socket === undefined) {
        callback(error ?? new Error('connect failed with no error'), null);
        return;
      }

      const remote = socket.remoteAddress;
      if (remote === undefined) {
        // No peer address means nothing to check, so nothing to trust.
        socket.destroy();
        callback(
          new SsrfRefusedError('CONNECT_ADDRESS_DISALLOWED', {
            target: connectOptions.hostname,
            addressClass: 'UNKNOWN',
            hop,
          }),
          null,
        );
        return;
      }

      const verdict = classifyAddressString(remote, policy);
      if (!verdict.allowed) {
        // Destroy first, call back second: the request must not be written to a
        // socket we have already decided against.
        socket.destroy();
        callback(
          new SsrfRefusedError('CONNECT_ADDRESS_DISALLOWED', {
            target: remote,
            addressClass: verdict.addressClass,
            hop,
          }),
          null,
        );
        return;
      }

      callback(null, socket);
    });
}

/**
 * A dispatcher for exactly one request.
 *
 * Per-request rather than shared, deliberately. A pooled keep-alive socket is
 * validated once and then reused for later requests, which reintroduces the
 * window this layer exists to close — and pooling across a redirect chain would
 * let hop 3 ride a connection approved for hop 1.
 */
export function createSafeDispatcher(options: ConnectGuardOptions = {}): Agent {
  return new UndiciAgent({
    connect: createSafeConnector(options),
    pipelining: 0,
    connections: 1,
    keepAliveTimeout: 1,
    keepAliveMaxTimeout: 1,
  });
}
