/**
 * Per-connection protocol handling for the browser SSRF proxy
 * (`browser-proxy.ts`'s own module note has the full design). Split out from
 * that file purely to stay under this repo's ~200-line file-size convention
 * — the server bootstrap and the request-handling logic are two genuinely
 * separable concerns (lifecycle vs. per-request protocol), not an arbitrary
 * chop.
 */

import { request as httpRequest, type IncomingMessage, type ServerResponse } from 'node:http';
import { connect as netConnect } from 'node:net';
import type { Duplex } from 'node:stream';
import { assertResolvedAddressesAllowed, type AddressResolver } from './resolve-guard.js';
import { classifyAddressString } from './address-rules.js';
import type { AddressPolicy } from './policy.js';

export function splitHostPort(
  value: string,
  defaultPort: number,
): { hostname: string; port: number } {
  const bracketed = /^\[([^\]]+)\](?::(\d+))?$/.exec(value);
  if (bracketed) {
    return {
      hostname: bracketed[1]!,
      port: bracketed[2] !== undefined ? Number(bracketed[2]) : defaultPort,
    };
  }
  const lastColon = value.lastIndexOf(':');
  if (lastColon === -1) return { hostname: value, port: defaultPort };
  const maybePort = value.slice(lastColon + 1);
  if (/^\d+$/.test(maybePort)) {
    return { hostname: value.slice(0, lastColon), port: Number(maybePort) };
  }
  return { hostname: value, port: defaultPort };
}

/** Resolves and validates a hostname (or literal — `dns.lookup` handles both
 *  transparently), returning validated addresses to connect to directly. */
async function resolveAndValidate(
  hostname: string,
  resolver: AddressResolver,
  policy: AddressPolicy,
): Promise<{ readonly address: string; readonly family: 4 | 6 }[]> {
  return assertResolvedAddressesAllowed(hostname, { resolver, policy });
}

function refuse(clientSocket: Duplex): void {
  if (!clientSocket.destroyed) {
    clientSocket.write('HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\n');
    clientSocket.destroy();
  }
}

export async function handleConnect(
  req: IncomingMessage,
  clientSocket: Duplex,
  head: Buffer,
  resolver: AddressResolver,
  policy: AddressPolicy,
): Promise<void> {
  const { hostname, port } = splitHostPort(req.url ?? '', 443);

  let validated: { readonly address: string; readonly family: 4 | 6 }[];
  try {
    validated = await resolveAndValidate(hostname, resolver, policy);
  } catch {
    refuse(clientSocket);
    return;
  }
  const chosen = validated[0];
  if (chosen === undefined) {
    refuse(clientSocket);
    return;
  }

  const upstream = netConnect({ host: chosen.address, port });
  upstream.once('error', () => refuse(clientSocket));
  clientSocket.once('error', () => upstream.destroy());

  upstream.once('connect', () => {
    // Belt-and-suspenders (research.md Decision 2): re-check what the socket
    // actually reached, not only what we intended to reach.
    const remote = upstream.remoteAddress;
    const verdict =
      remote === undefined ? { allowed: false } : classifyAddressString(remote, policy);
    if (!verdict.allowed) {
      upstream.destroy();
      refuse(clientSocket);
      return;
    }
    clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
    if (head.length > 0) upstream.write(head);
    upstream.pipe(clientSocket);
    clientSocket.pipe(upstream);
  });
}

export async function handlePlainRequest(
  req: IncomingMessage,
  res: ServerResponse,
  resolver: AddressResolver,
  policy: AddressPolicy,
): Promise<void> {
  // Refused here means the connection itself is destroyed, never a normal
  // HTTP error response: a proxied client (a real browser above all) treats
  // a completed HTTP response — even a 4xx/5xx one — as a successful
  // navigation to whatever body came back, not a failed one. Only a genuine
  // connection failure surfaces to the caller as a real navigation error
  // (spec.md FR-006's "clean, visible failure"), matching what the `CONNECT`
  // path already gets for free from a failed tunnel.
  const refusePlain = (): void => {
    res.socket?.destroy();
  };

  const hostHeader = req.headers.host;
  if (hostHeader === undefined) {
    refusePlain();
    return;
  }
  const { hostname, port } = splitHostPort(hostHeader, 80);

  let validated: { readonly address: string; readonly family: 4 | 6 }[];
  try {
    validated = await resolveAndValidate(hostname, resolver, policy);
  } catch {
    refusePlain();
    return;
  }
  const chosen = validated[0];
  if (chosen === undefined) {
    refusePlain();
    return;
  }

  const proxied = httpRequest(
    { host: chosen.address, port, method: req.method, path: req.url, headers: req.headers },
    (proxyRes) => {
      const remote = proxied.socket?.remoteAddress;
      const verdict =
        remote === undefined ? { allowed: false } : classifyAddressString(remote, policy);
      if (!verdict.allowed) {
        proxyRes.destroy();
        refusePlain();
        return;
      }
      res.writeHead(proxyRes.statusCode ?? 502, proxyRes.headers);
      proxyRes.pipe(res);
    },
  );
  proxied.on('error', refusePlain);
  req.pipe(proxied);
}
