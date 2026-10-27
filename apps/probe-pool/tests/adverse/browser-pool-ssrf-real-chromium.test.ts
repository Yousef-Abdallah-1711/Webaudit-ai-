/**
 * SPEC 003 — real-Chromium refusal matrix.
 *
 * `browser-pool-ssrf.test.ts` proves one disallowed literal (cloud metadata)
 * and one public load. This file extends the real-browser evidence to the
 * other destination classes named in the SPEC: loopback and private literals,
 * a hostname whose resolver answer is loopback (rebinding-style), and
 * proxy/process cleanup. A local HTTP listener on loopback counts hits so a
 * "refused" navigation is proven to never have reached the server, not merely
 * to have thrown. Production policy is used throughout: nothing is relaxed.
 */

import http from 'node:http';
import net from 'node:net';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createBrowserPool, type BrowserPool } from '../../src/browser/pool.js';

let pool: BrowserPool | undefined;
let server: http.Server;
let hits: string[];
let port: number;

beforeEach(async () => {
  hits = [];
  server = http.createServer((req, res) => {
    hits.push(`${req.headers.host ?? ''}${req.url ?? ''}`);
    res.end('should-never-be-served');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = (server.address() as AddressInfo).port;
});

afterEach(async () => {
  await pool?.close();
  pool = undefined;
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

async function navigate(url: string): Promise<void> {
  await pool?.withPage(async (page) => {
    await page.goto(url);
  });
}

describe('SPEC 003 — real Chromium refuses forbidden destinations without reaching them', () => {
  it('refuses a loopback literal and the listener is never contacted', async () => {
    pool = await createBrowserPool();
    await expect(navigate(`http://127.0.0.1:${String(port)}/secret`)).rejects.toThrow();
    expect(hits).toEqual([]);
  }, 30_000);

  it('refuses the hostname "localhost" and the listener is never contacted', async () => {
    pool = await createBrowserPool();
    await expect(navigate(`http://localhost:${String(port)}/secret`)).rejects.toThrow();
    expect(hits).toEqual([]);
  }, 30_000);

  it.each(['http://10.0.0.1/', 'http://192.168.1.1/', 'http://172.16.0.1/', 'http://169.254.1.1/'])(
    'refuses the private/link-local literal %s',
    async (url) => {
      pool = await createBrowserPool();
      await expect(navigate(url)).rejects.toThrow();
    },
    30_000,
  );

  it('refuses a public-looking hostname whose DNS answer is loopback (rebinding-style)', async () => {
    pool = await createBrowserPool({
      resolver: () => Promise.resolve([{ address: '127.0.0.1', family: 4 }]),
    });
    await expect(navigate(`http://rebind.example.test:${String(port)}/secret`)).rejects.toThrow();
    expect(hits).toEqual([]);
  }, 30_000);

  it('releases the proxy port when the pool closes (no leaked listener)', async () => {
    let proxyPort = 0;
    pool = await createBrowserPool({
      launch: (opts) => {
        proxyPort = Number(new URL(opts.proxy.server).port);
        return import('@playwright/test').then(({ chromium }) => chromium.launch(opts));
      },
    });
    expect(proxyPort).toBeGreaterThan(0);
    await pool.close();
    pool = undefined;
    const stillListening = await new Promise<boolean>((resolve) => {
      const socket = net.connect({ host: '127.0.0.1', port: proxyPort }, () => {
        socket.destroy();
        resolve(true);
      });
      socket.on('error', () => resolve(false));
    });
    expect(stillListening).toBe(false);
  }, 30_000);
});
