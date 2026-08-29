/**
 * A local HTTP server that records what actually arrived.
 *
 * The recording matters more than the responding. An SSRF guard that refuses
 * *after* sending the request has already leaked the request; several of these
 * suites assert `requests.length === 0` to prove the refusal happened before a
 * byte went out.
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

export interface RecordedRequest {
  readonly method: string;
  readonly url: string;
  readonly host: string | undefined;
}

export interface FixtureServer {
  readonly port: number;
  readonly origin: string;
  readonly requests: readonly RecordedRequest[];
  close(): Promise<void>;
}

export type FixtureHandler = (req: IncomingMessage, res: ServerResponse) => void;

export async function startFixture(handler: FixtureHandler): Promise<FixtureServer> {
  const requests: RecordedRequest[] = [];
  const server: Server = createServer((req, res) => {
    requests.push({ method: req.method ?? '', url: req.url ?? '', host: req.headers.host });
    handler(req, res);
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const { port } = server.address() as AddressInfo;
  return {
    port,
    origin: `http://127.0.0.1:${port}`,
    requests,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.closeAllConnections();
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}

/** Responds 200 with a body distinctive enough that a leak is unmistakable. */
export function ok(body = 'FIXTURE-BODY'): FixtureHandler {
  return (_req, res) => {
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end(body);
  };
}

export function redirectTo(location: string, status = 302): FixtureHandler {
  return (_req, res) => {
    res.writeHead(status, { location });
    res.end();
  };
}
