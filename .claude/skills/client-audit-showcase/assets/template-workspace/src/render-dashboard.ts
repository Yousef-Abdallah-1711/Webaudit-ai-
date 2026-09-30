/**
 * data/audit.json  ->  dashboard/index.html
 *
 * A SINGLE, FULLY SELF-CONTAINED, CLIENT-SIDE-ONLY HTML file. Everything is
 * inlined — the design-system token CSS, the design-system component bundle,
 * React 18, Babel standalone, the theme/strings helpers, the showcase UI, the
 * real audit data, and both screenshots as data: URIs. There is no server, no
 * build step, no network dependency at view time (bar an optional Google Fonts
 * stylesheet, which degrades to the fallback stack). Open it with a double-click.
 *
 * `serve.mjs` still exists for convenience but is not required.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const DS = join(ROOT, '..', 'design-system');
const DASH = join(ROOT, 'dashboard');
const VENDOR = join(DASH, 'vendor');

const read = (p: string) => readFile(p, 'utf8');
const readB64 = async (p: string) => (await readFile(p)).toString('base64');

async function inlineStyles(): Promise<string> {
  // styles.css is just `@import url("tokens/X.css")` lines. Inline each token
  // file. fonts.css leads (its remote Google Fonts @import must stay at the top
  // of the combined sheet, where CSS requires @import to be).
  const order = ['fonts', 'colors', 'typography', 'radius', 'elevation', 'layout', 'motion', 'dark'];
  const parts = await Promise.all(order.map((n) => read(join(DS, 'tokens', `${n}.css`))));
  return parts.join('\n');
}

async function main(): Promise<void> {
  await mkdir(VENDOR, { recursive: true });

  for (const f of ['react.js', 'react-dom.js', 'babel.min.js']) {
    await readFile(join(VENDOR, f)).catch(() => {
      throw new Error(
        `dashboard/vendor/${f} missing. Fetch the three vendored libs once:\n` +
          `  curl -sSo showcase-esaalnybot/dashboard/vendor/react.js https://unpkg.com/react@18.3.1/umd/react.production.min.js\n` +
          `  curl -sSo showcase-esaalnybot/dashboard/vendor/react-dom.js https://unpkg.com/react-dom@18.3.1/umd/react-dom.production.min.js\n` +
          `  curl -sSo showcase-esaalnybot/dashboard/vendor/babel.min.js https://unpkg.com/@babel/standalone@7.26.4/babel.min.js`,
      );
    });
  }

  const [css, dsBundle, react, reactDom, babel, theme, strings, showcase, auditRaw, reportMd] =
    await Promise.all([
      inlineStyles(),
      read(join(DS, '_ds_bundle.js')),
      read(join(VENDOR, 'react.js')),
      read(join(VENDOR, 'react-dom.js')),
      read(join(VENDOR, 'babel.min.js')),
      read(join(DS, 'ui_kits', 'theme.jsx')),
      read(join(DS, 'ui_kits', 'strings.jsx')),
      read(join(DASH, 'showcase.jsx')),
      read(join(ROOT, 'data', 'audit.json')),
      read(join(ROOT, 'report.md')).catch(() => '# report.md not generated yet\n'),
    ]);

  const runbookRaw = await read(join(ROOT, 'data', 'pentest-runbook.json')).catch(() => 'null');
  const runbookMd = await read(join(ROOT, 'PENTEST-RUNBOOK.md')).catch(() => '');

  const [shotDesktop, shotMobile] = await Promise.all([
    readB64(join(ROOT, 'data', 'screenshot-desktop.png')),
    readB64(join(ROOT, 'data', 'screenshot-mobile.png')),
  ]);

  const assets = {
    desktop: `data:image/png;base64,${shotDesktop}`,
    mobile: `data:image/png;base64,${shotMobile}`,
  };
  const downloads = {
    report: `data:text/markdown;base64,${Buffer.from(reportMd, 'utf8').toString('base64')}`,
    audit: `data:application/json;base64,${Buffer.from(auditRaw, 'utf8').toString('base64')}`,
    runbook: `data:text/markdown;base64,${Buffer.from(runbookMd, 'utf8').toString('base64')}`,
  };

  // Escape only what can break out of a <script> element.
  const safe = (s: string) => s.replace(/<\/script/gi, '<\\/script');

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>WebAudit AI — app.esaalnybot.tech</title>
  <script>(function(){try{document.documentElement.setAttribute("data-theme",localStorage.getItem("wa-theme")||"light")}catch(e){}})()</script>
  <style>
${css}
  </style>
  <style>
    html,body{margin:0}
    body{font-family:var(--font-sans);color:var(--text-primary);background:var(--surface-sunken)}
    a{color:inherit}
    #__boot{position:fixed;inset:0;display:grid;place-items:center;font:14px/1.5 var(--font-sans);color:var(--text-secondary);background:var(--surface-sunken)}
    code{font-family:var(--font-mono);font-size:.9em;background:var(--surface-raised);padding:1px 4px;border-radius:3px}
  </style>
</head>
<body>
  <div id="root"><div id="__boot">Compiling the showcase&hellip;</div></div>

  <script>
    window.__AUDIT__ = ${safe(auditRaw)};
    window.__ASSETS__ = ${safe(JSON.stringify(assets))};
    window.__DOWNLOADS__ = ${safe(JSON.stringify(downloads))};
    window.__RUNBOOK__ = ${safe(runbookRaw)};
  </script>

  <script>${safe(react)}</script>
  <script>${safe(reactDom)}</script>
  <script>${safe(babel)}</script>
  <script>${safe(dsBundle)}</script>
  <script type="text/babel">${safe(strings)}</script>
  <script type="text/babel">${safe(theme)}</script>
  <script type="text/babel">${safe(showcase)}</script>
</body>
</html>
`;

  await writeFile(join(DASH, 'index.html'), html, 'utf8');

  const kb = Math.round(Buffer.byteLength(html) / 1024);
  process.stdout.write(
    `  dashboard written: ${join(DASH, 'index.html')} (${kb} KB, fully self-contained)\n` +
      `  open it directly (file://) or run \`pnpm --filter showcase-esaalnybot serve\`\n`,
  );
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
