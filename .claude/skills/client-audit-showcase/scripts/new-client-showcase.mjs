#!/usr/bin/env node
// Scaffolds a new `showcase-<slug>` workspace for a new client's website,
// by cloning the generic/reusable parts of an existing showcase workspace
// (default: showcase-esaalnybot) and resetting the parts of it that are
// hand-authored prose specific to the OLD client.
//
// Usage:
//   node .claude/skills/client-audit-showcase/scripts/new-client-showcase.mjs \
//     --url https://example.com/ --slug example-client [--source showcase-esaalnybot] [--force]
//
// What it does:
//   1. Finds the repo root (walks up from cwd looking for pnpm-workspace.yaml).
//   2. Copies the source workspace's mechanical src/*.ts, scripts/*.mjs,
//      serve.mjs, package.json, .gitignore into showcase-<slug>/.
//   3. Rewrites package.json's name/description for the new workspace.
//   4. Replaces the old target's hostname/URL and the old workspace's
//      package name across the copied files (comments + argv fallback
//      defaults only — never load-bearing logic in these files).
//   5. Resets src/ai-narrative.ts to a guarded placeholder (this file is
//      hand-authored prose per client — see the TODO inside it) and blanks
//      src/runbook-data.ts's PASSIVE_OBSERVATIONS array (same reason),
//      leaving the ~600-line generic 47-case runbook methodology untouched.
//
// What it deliberately does NOT do: run the audit, author the narrative, or
// fill in passive pentest observations. Those are judgment calls the skill's
// SKILL.md walks through — a script that faked them would violate the same
// "AI explains, never invents" principle this whole product is built on.

import { readFile, writeFile, mkdir, readdir, copyFile as fsCopyFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const args = { source: 'showcase-esaalnybot', force: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--url') args.url = argv[++i];
    else if (a === '--slug') args.slug = argv[++i];
    else if (a === '--source') args.source = argv[++i];
    else if (a === '--force') args.force = true;
    else if (a === '--help' || a === '-h') args.help = true;
    else throw new Error(`unknown argument: ${a}`);
  }
  return args;
}

function slugify(s) {
  return s
    .toLowerCase()
    .trim()
    .replace(/^https?:\/\//, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function findRepoRoot(startDir) {
  let cur = startDir;
  for (;;) {
    if (existsSync(join(cur, 'pnpm-workspace.yaml'))) return cur;
    const parent = dirname(cur);
    if (parent === cur) {
      throw new Error(`could not find repo root (no pnpm-workspace.yaml found walking up from ${startDir})`);
    }
    cur = parent;
  }
}

async function pathExists(p) {
  return existsSync(p);
}

async function copyFileVerbatim(from, to) {
  await mkdir(dirname(to), { recursive: true });
  await fsCopyFile(from, to);
}

async function copyWithReplacements(from, to, replacements) {
  let text = await readFile(from, 'utf8');
  for (const [oldStr, newStr] of replacements) {
    text = text.split(oldStr).join(newStr);
  }
  await mkdir(dirname(to), { recursive: true });
  await writeFile(to, text, 'utf8');
}

// Splice out PASSIVE_OBSERVATIONS in a copy of build-runbook.ts, leaving the
// mechanical markdown/JSON rendering that follows untouched.
function resetPassiveObservations(text) {
  const startMarker = 'const PASSIVE_OBSERVATIONS';
  const endMarker = 'const HERE = dirname(fileURLToPath(import.meta.url));';
  const startIdx = text.indexOf(startMarker);
  const endIdx = text.indexOf(endMarker);
  if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) {
    throw new Error(
      'build-runbook.ts no longer has the expected `const PASSIVE_OBSERVATIONS ... const HERE = ...` shape — ' +
        'the source template changed; update resetPassiveObservations() in this script instead of guessing.',
    );
  }
  const replacement =
    `const PASSIVE_OBSERVATIONS: {\n` +
    `  caseId: string;\n` +
    `  status: 'fail' | 'partial' | 'observed';\n` +
    `  note: string;\n` +
    `}[] = [\n` +
    `  // TODO: pre-fill from real NON-INTRUSIVE checks against THIS target only\n` +
    `  // (curl -I headers, openssl s_client TLS/cipher check, a CORS preflight\n` +
    `  // request, the Server header, robots.txt/sitemap.xml). Do not reuse\n` +
    `  // another client's observations — every note here must be something you\n` +
    `  // actually confirmed against this target. An empty array is fine; the\n` +
    `  // dashboard's Pentest plan tab just starts with every case "Not started".\n` +
    `];\n\n`;
  return text.slice(0, startIdx) + replacement + text.slice(endIdx);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.url) {
    process.stdout.write(
      '\nUsage: new-client-showcase.mjs --url <https://target/> [--slug <client-slug>] [--source <workspace>] [--force]\n\n',
    );
    process.exit(args.help ? 0 : 1);
  }

  let targetUrl;
  try {
    targetUrl = new URL(args.url);
  } catch {
    throw new Error(`--url is not a valid absolute URL: ${args.url}`);
  }

  const slug = slugify(args.slug ?? targetUrl.hostname);
  if (!slug) throw new Error('could not derive a usable --slug from the URL; pass --slug explicitly');

  const repoRoot = await findRepoRoot(process.cwd());
  const sourceDir = join(repoRoot, args.source);
  if (!(await pathExists(sourceDir))) throw new Error(`source workspace not found: ${sourceDir}`);

  const destDir = join(repoRoot, `showcase-${slug}`);
  if ((await pathExists(destDir)) && !args.force) {
    throw new Error(`${destDir} already exists. Pass --force to overwrite, or pick a different --slug.`);
  }

  // Derive the OLD target's URL/host from the source's own runner.ts fallback,
  // rather than hardcoding it, so this script keeps working if --source ever
  // points at a different demo workspace.
  const sourceRunnerText = await readFile(join(sourceDir, 'src', 'runner.ts'), 'utf8');
  const fallbackMatch =
    sourceRunnerText.match(/const DEFAULT_TARGET = '([^']+)'/) ??
    sourceRunnerText.match(/process\.argv\[2\]\s*\?\?\s*'([^']+)'/);
  if (!fallbackMatch) {
    throw new Error(
      `could not find the default TARGET fallback in ${args.source}/src/runner.ts — ` +
        'the source template changed shape; update this script rather than guessing.',
    );
  }
  const oldUrl = fallbackMatch[1];
  const oldHost = new URL(oldUrl).hostname;
  const oldPkg = JSON.parse(await readFile(join(sourceDir, 'package.json'), 'utf8'));
  const oldPkgName = oldPkg.name;
  const newPkgName = `showcase-${slug}`;

  // The old demo's runbook mentions an `app.` + `api.` subdomain split (its
  // actual topology). We can't know the new target's real subdomains, so:
  // exact host swaps first (handles the common single-host case correctly),
  // then a bare-apex catch-all for anything left (DNS/email/subfinder-style
  // mentions). SKILL.md tells the agent to review the result for topology
  // that doesn't apply (no api. host, no widget, not multi-tenant, etc).
  const oldApex = oldHost.replace(/^app\./, '');
  const newApex = targetUrl.hostname.replace(/^app\./, '');
  const oldApiHost = oldHost.startsWith('app.') ? oldHost.replace(/^app\./, 'api.') : `api.${oldApex}`;
  const newApiHost = targetUrl.hostname.startsWith('app.')
    ? targetUrl.hostname.replace(/^app\./, 'api.')
    : targetUrl.hostname;

  // dashboard/showcase.jsx (the client-facing UI) hardcodes a localStorage
  // key and export-filename prefixes tied to the OLD client's brand name.
  // The localStorage key MUST be unique per client — two different clients'
  // dashboards opened in the same browser (even from file://, which shares
  // localStorage per-origin) would otherwise silently share one pentest
  // tracker's saved state.
  const slugKey = slug.replace(/[^a-z0-9]+/g, '_');

  // Order matters: longest/most-specific matches first, so the bare-apex
  // catch-all only mops up what the exact swaps above didn't already fix.
  const replacements = [
    [oldUrl, targetUrl.href],
    [oldHost, targetUrl.hostname],
    [oldApiHost, newApiHost],
    [oldApex, newApex],
    ['esaalny_pt_v1', `${slugKey}_pt_v1`],
    ['esaalnybot-audit', `${slug}-audit`],
    ['Esaalny pentest', 'Pentest'],
    ['Esaalny-findings-log.md', `${slug}-findings-log.md`],
    ['Esaalny-PENTEST-RUNBOOK.md', `${slug}-PENTEST-RUNBOOK.md`],
    [oldPkgName, newPkgName],
  ];

  await mkdir(join(destDir, 'src'), { recursive: true });
  await mkdir(join(destDir, 'scripts'), { recursive: true });
  await mkdir(join(destDir, 'data'), { recursive: true });

  // 1. Mechanical src files — generic, only ever mention the old target in
  //    comments or an argv fallback default. Copy with literal replacement.
  const MECHANICAL_SRC_FILES = [
    'runner.ts',
    'capabilities.ts',
    'capture.ts',
    'crawl.ts',
    'render-report.ts',
    'render-dashboard.ts',
    'pipeline-run.ts',
    'merge-pipeline.ts',
  ];
  for (const f of MECHANICAL_SRC_FILES) {
    const from = join(sourceDir, 'src', f);
    if (await pathExists(from)) {
      await copyWithReplacements(from, join(destDir, 'src', f), replacements);
    }
  }

  // 2. runbook-data.ts — the 47-case runbook. NOT purely generic: it embeds
  //    the old target's actual discovered topology (app/api subdomain split,
  //    a chatbot widget, multi-tenancy). Host/apex strings are swapped as a
  //    starting point; SKILL.md requires a review pass for topology that
  //    doesn't apply to the new target (drop widget-specific cases if there
  //    is no widget, fix tool configs, adjust IDOR cases if not multi-tenant).
  const runbookDataFrom = join(sourceDir, 'src', 'runbook-data.ts');
  if (await pathExists(runbookDataFrom)) {
    let text = await readFile(runbookDataFrom, 'utf8');
    for (const [oldStr, newStr] of replacements) text = text.split(oldStr).join(newStr);
    await writeFile(join(destDir, 'src', 'runbook-data.ts'), text, 'utf8');
  }

  // 2b. build-runbook.ts — mechanical renderer, but owns PASSIVE_OBSERVATIONS
  //     (the OLD client's confirmed passive findings). Reset it here.
  const buildRunbookFrom = join(sourceDir, 'src', 'build-runbook.ts');
  if (await pathExists(buildRunbookFrom)) {
    let text = await readFile(buildRunbookFrom, 'utf8');
    for (const [oldStr, newStr] of replacements) text = text.split(oldStr).join(newStr);
    text = resetPassiveObservations(text);
    await writeFile(join(destDir, 'src', 'build-runbook.ts'), text, 'utf8');
  }

  // 3. ai-narrative.ts — always written fresh from the guarded template
  //    (this file is 100% hand-authored prose per client; never copied).
  const narrativeTemplate = await readFile(join(HERE, '..', 'assets', 'ai-narrative.template.ts'), 'utf8');
  await writeFile(
    join(destDir, 'src', 'ai-narrative.ts'),
    narrativeTemplate.split('{{TARGET_URL}}').join(targetUrl.href),
    'utf8',
  );

  // 4. scripts/*.mjs and serve.mjs — fully generic, copy verbatim.
  const srcScriptsDir = join(sourceDir, 'scripts');
  if (await pathExists(srcScriptsDir)) {
    for (const f of await readdir(srcScriptsDir)) {
      await copyFileVerbatim(join(srcScriptsDir, f), join(destDir, 'scripts', f));
    }
  }
  if (await pathExists(join(sourceDir, 'serve.mjs'))) {
    await copyWithReplacements(join(sourceDir, 'serve.mjs'), join(destDir, 'serve.mjs'), replacements);
  }
  if (await pathExists(join(sourceDir, '.gitignore'))) {
    await copyFileVerbatim(join(sourceDir, '.gitignore'), join(destDir, '.gitignore'));
  }

  // 4b. dashboard/ — showcase.jsx is the generic client-facing UI (needs the
  //     brand/localStorage replacements above); vendor/ is the shared
  //     design-system bundle (ds-bundle.js, theme.jsx, strings.jsx,
  //     styles.css, tokens/ — never client-specific). react.js/react-dom.js/
  //     babel.min.js are gitignored upstream (fetched from a CDN once); reuse
  //     them from source if already fetched there, otherwise leave a note —
  //     render-dashboard.ts prints the exact curl commands either way.
  let fetchedVendorLibsNote = '';
  if (await pathExists(join(sourceDir, 'dashboard', 'showcase.jsx'))) {
    await copyWithReplacements(
      join(sourceDir, 'dashboard', 'showcase.jsx'),
      join(destDir, 'dashboard', 'showcase.jsx'),
      replacements,
    );
  }
  const vendorFrom = join(sourceDir, 'dashboard', 'vendor');
  if (await pathExists(vendorFrom)) {
    const CDN_LIBS = ['react.js', 'react-dom.js', 'babel.min.js'];
    for (const entry of await readdir(vendorFrom, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        await mkdir(join(destDir, 'dashboard', 'vendor', entry.name), { recursive: true });
        for (const sub of await readdir(join(vendorFrom, entry.name))) {
          await copyFileVerbatim(join(vendorFrom, entry.name, sub), join(destDir, 'dashboard', 'vendor', entry.name, sub));
        }
      } else {
        await copyFileVerbatim(join(vendorFrom, entry.name), join(destDir, 'dashboard', 'vendor', entry.name));
      }
    }
    const missingCdnLibs = [];
    for (const lib of CDN_LIBS) {
      if (!(await pathExists(join(vendorFrom, lib)))) missingCdnLibs.push(lib);
    }
    if (missingCdnLibs.length > 0) {
      fetchedVendorLibsNote =
        `\n  note: ${missingCdnLibs.join(', ')} not found in ${args.source}/dashboard/vendor/ — ` +
        `\`pnpm --filter ${newPkgName} run dashboard\` will fail with the exact curl commands to fetch them once.\n`;
    }
  }

  // 5. package.json — same deps, new identity.
  const pkg = JSON.parse(await readFile(join(sourceDir, 'package.json'), 'utf8'));
  pkg.name = newPkgName;
  pkg.description = `Client showcase: a real WebAudit AI audit of ${targetUrl.href} rendered into the design-system dashboard.`;
  await writeFile(join(destDir, 'package.json'), `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');

  process.stdout.write(
    `\n  created ${newPkgName}/ for ${targetUrl.href}\n` +
      `  (cloned from ${oldPkgName}; ai-narrative.ts reset to a guarded placeholder,\n` +
      `   build-runbook.ts's passive observations reset to an empty array)\n` +
      fetchedVendorLibsNote +
      `\n  next steps (use \`pnpm run\`, not \`pnpm audit\` — that's pnpm's own builtin command):\n` +
      `    pnpm install\n` +
      `    pnpm --filter ${newPkgName} run audit ${targetUrl.href}\n` +
      `    pnpm --filter ${newPkgName} run capture ${targetUrl.href}\n` +
      `    # then author src/ai-narrative.ts from data/audit.json (see the TODO in the file)\n` +
      `    pnpm --filter ${newPkgName} run render\n` +
      `    node ${newPkgName}/serve.mjs 4174   # pick a free port if another showcase is being served\n\n`,
  );
}

main().catch((error) => {
  console.error(`\n  ✗ ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
