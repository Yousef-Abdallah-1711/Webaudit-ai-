/**
 * A single fixture page, deliberately missing everything the six conformance
 * capabilities check for — no security headers, no cookie flags, no title,
 * no meta description, no viewport, no canonical, no H1, no lang attribute,
 * an image with no alt text. One page is enough to give every capability a
 * real finding to compute a fingerprint from (`fingerprint-stable` needs at
 * least one finding to actually exercise, not skip). The one exception is
 * `data-leak-scanner`, which legitimately finds nothing here — no secret-
 * shaped text is embedded on purpose, since inventing one would need
 * suppressing it from ever being a real secret, and "no findings" is itself
 * a documented, legal `fingerprint-stable` outcome (skipped, not failed).
 */

import { createServer, type Server } from 'node:http';

const PAGE = `<html><body><img src="x.png"><p>short</p></body></html>`;

export interface FixtureSite {
  readonly origin: string;
  close(): Promise<void>;
}

export async function startDeficientSite(): Promise<FixtureSite> {
  const server: Server = createServer((_req, res) => {
    res.writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
      'set-cookie': 'session=abc123',
    });
    res.end(PAGE);
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('fixture server did not bind to a port');
  }

  return {
    origin: `http://127.0.0.1:${String(address.port)}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}
