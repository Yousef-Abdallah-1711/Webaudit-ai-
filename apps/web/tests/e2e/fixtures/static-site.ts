/**
 * T109's audit target — a tiny, fixed local HTML page, not a real public
 * site. Deterministic (assertions can check for its exact known content)
 * and repeatable (nothing is hammering someone else's server on every test
 * run) — the user's own chosen design for this suite's fixture.
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

const PAGE = `<!doctype html>
<html lang="en">
<head><title>T109 fixture</title><meta name="description" content="WebAudit AI e2e fixture page." /></head>
<body><h1>T109 fixture</h1><p>A fixed, local audit target for the first-audit end-to-end test.</p></body>
</html>`;

export interface FixtureSite {
  readonly origin: string;
  close(): Promise<void>;
}

export async function startFixtureSite(): Promise<FixtureSite> {
  const server: Server = createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(PAGE);
  });

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });

  const { port } = server.address() as AddressInfo;
  const origin = `http://127.0.0.1:${String(port)}`;

  return {
    origin,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}
