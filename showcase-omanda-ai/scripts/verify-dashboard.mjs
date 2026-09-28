import { chromium } from '@playwright/test';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const DATA = join(dirname(fileURLToPath(import.meta.url)), '..', 'data');
const port = process.argv[2] ?? '4173';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 1000 } });
const errs = [];
p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
p.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));
await p.goto(`http://localhost:${port}/`, { waitUntil: 'networkidle' });
await p.waitForTimeout(2500);
const rootText = await p.evaluate('document.getElementById("root").innerText.slice(0,240)');
await p.screenshot({ path: join(DATA, 'dash-report.png'), fullPage: true });
for (const v of ['Priorities', 'Fixes', 'Evidence']) {
  await p.click(`button:has-text("${v}")`).catch(() => {});
  await p.waitForTimeout(900);
  await p.screenshot({ path: join(DATA, `dash-${v.toLowerCase()}.png`), fullPage: true });
}
await b.close();
console.log('ROOT TEXT:', JSON.stringify(rootText));
console.log('ERRORS:', errs.length ? errs.join('\n---\n') : 'none');
