// Tiny static file server for the showcase dashboard. No dependencies.
//   node serve.mjs [port]   ->  http://localhost:<port>/
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), 'dashboard');
const PORT = Number(process.argv[2] ?? process.env.PORT ?? 4173);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.jsx': 'text/babel; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.md': 'text/markdown; charset=utf-8',
  '.woff2': 'font/woff2',
};

const server = createServer(async (req, res) => {
  try {
    let rel = decodeURIComponent((req.url ?? '/').split('?')[0]);
    if (rel === '/' || rel.endsWith('/')) rel += 'index.html';
    const path = normalize(join(ROOT, rel));
    if (!path.startsWith(ROOT)) {
      res.writeHead(403).end('forbidden');
      return;
    }
    await stat(path);
    const body = await readFile(path);
    res.writeHead(200, { 'content-type': TYPES[extname(path)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(body);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
  }
});

server.listen(PORT, () => {
  process.stdout.write(`\n  WebAudit AI showcase — http://localhost:${PORT}/\n  serving ${ROOT}\n  Ctrl+C to stop\n\n`);
});
