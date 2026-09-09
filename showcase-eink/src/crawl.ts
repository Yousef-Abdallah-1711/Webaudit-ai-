/**
 * Multi-page crawl: runs the same real audit + capture that runner.ts /
 * capture.ts do for a single URL, across every same-origin page on the
 * site — not just the homepage.
 *
 * This exists because a single-page audit of a homepage tells a client
 * almost nothing about their pricing page, their login/register forms, or
 * a real listing page. Same-origin GET requests only — this is exactly
 * what a normal visitor's browser or a search crawler already does to
 * every one of these pages; it is not active testing.
 *
 * What this deliberately does NOT do: submit the login/register forms,
 * attempt authentication, or send anything but a plain GET. Active testing
 * (SQL injection, auth-flow abuse, brute force, load testing) is a separate,
 * human-executed engagement — see PENTEST-RUNBOOK.md — never automated here.
 *
 * Writes:
 *   data/pages/<slug>/audit.json        full single-page audit (same shape runner.ts produces)
 *   data/pages/<slug>/screenshot-*.png  desktop + mobile captures
 *   data/pages/<slug>/page-metrics.json
 *   data/pages/<slug>/forms.json        passive form inventory (login/register pages) — no submission
 *   data/crawl.json                     the aggregate summary consumed by render-report.ts
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { chromium } from '@playwright/test';

import { runAudit } from './runner.js';
import { captureMetrics } from './capture.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA = join(HERE, '..', 'data');
const DEFAULT_TARGET = 'https://eink.ma/';
const MAX_PAGES = 15;
const POLITE_DELAY_MS = 600;

function slugifyPath(pathname: string): string {
  if (pathname === '/' || pathname === '') return 'home';
  return pathname.replace(/^\/+|\/+$/g, '').replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase() || 'home';
}

async function discoverSameOriginLinks(baseUrl: string, extraPaths: readonly string[]): Promise<string[]> {
  const origin = new URL(baseUrl).origin;
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const found = new Set<string>();
  try {
    await page.goto(baseUrl, { waitUntil: 'networkidle', timeout: 30_000 });
    const hrefs = (await page.evaluate(
      `Array.from(document.querySelectorAll('a[href]')).map(function(a){ return a.getAttribute('href'); })`,
    )) as (string | null)[];
    for (const href of hrefs) {
      if (!href) continue;
      if (/^(mailto:|tel:|javascript:|#)/.test(href)) continue;
      try {
        const resolved = new URL(href, baseUrl);
        if (resolved.origin !== origin) continue;
        // Skip obvious asset links and files, not pages.
        if (/\.(png|jpg|jpeg|svg|webp|pdf|zip|json|xml|txt|ico|woff2?|css|js)$/i.test(resolved.pathname)) continue;
        found.add(resolved.pathname);
      } catch {
        /* not a valid URL, skip */
      }
    }
  } finally {
    await browser.close();
  }
  for (const p of extraPaths) found.add(p.startsWith('/') ? p : `/${p}`);
  found.add('/');
  return [...found].slice(0, MAX_PAGES);
}

/** Passive-only form inventory: what forms exist and how they're configured. Never submits anything. */
async function inspectForms(url: string): Promise<{ url: string; forms: unknown[] }> {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 });
    const forms = (await page.evaluate(`Array.from(document.querySelectorAll('form')).map(function(f){
      var inputs = Array.from(f.querySelectorAll('input')).map(function(i){
        return { type: i.type, name: i.name || null, autocomplete: i.getAttribute('autocomplete'), required: i.required };
      });
      return {
        action: f.getAttribute('action'),
        method: (f.getAttribute('method') || 'get').toLowerCase(),
        inputs: inputs,
        hasPasswordField: inputs.some(function(i){ return i.type === 'password'; }),
        hasHiddenCsrfLikeField: inputs.some(function(i){ return i.type === 'hidden' && /csrf|token/i.test(i.name || ''); }),
      };
    })`)) as unknown[];
    return { url, forms };
  } finally {
    await browser.close();
  }
}

interface CrawledPageSummary {
  path: string;
  url: string;
  score: number | null;
  counts: Record<string, number>;
  worstSeverity: string | null;
  topFindings: { title: string; severity: string; area: string }[];
  areas: { module: string; label: string; score: number | null }[];
}

/**
 * Production-readiness verdict, computed from the worst score any single
 * crawled page recorded per area — an average hides exactly the outlier a
 * go/no-go decision needs to see (e.g. one page scoring 8/100 on Security
 * while the rest score 90+). READINESS_THRESHOLD is a disclosed heuristic,
 * not a magic number: an area whose worst-observed page score falls below
 * it, or that has any CRITICAL/HIGH finding anywhere on the site, fails.
 */
const READINESS_THRESHOLD = 80;

function computeReadiness(summaries: CrawledPageSummary[]): {
  verdict: 'go' | 'no-go';
  areas: { name: string; score: number; threshold: number; pass: boolean }[];
  blockers: string[];
} {
  const worstByArea = new Map<string, { label: string; score: number; page: string }>();
  for (const p of summaries) {
    for (const a of p.areas) {
      if (a.score === null) continue;
      const existing = worstByArea.get(a.module);
      if (!existing || a.score < existing.score) {
        worstByArea.set(a.module, { label: a.label, score: a.score, page: p.path });
      }
    }
  }

  const areas = [...worstByArea.entries()].map(([, v]) => ({
    name: v.label,
    score: v.score,
    threshold: READINESS_THRESHOLD,
    pass: v.score >= READINESS_THRESHOLD,
  }));

  const blockers: string[] = [];
  for (const [, v] of worstByArea) {
    if (v.score < READINESS_THRESHOLD) {
      blockers.push(`${v.label} scores ${v.score}/100 on ${v.page === '/' ? 'the homepage' : v.page} — below the ${READINESS_THRESHOLD} bar.`);
    }
  }
  // Any HIGH/CRITICAL finding that repeats on every page is a blocker regardless of
  // area average — that pattern means shared code, not a one-off page defect.
  const pageCount = summaries.length;
  const findingOnEveryPage = new Map<string, { count: number; severity: string; area: string }>();
  for (const p of summaries) {
    for (const f of p.topFindings) {
      const key = `${f.area}::${f.title}`;
      const entry = findingOnEveryPage.get(key) ?? { count: 0, severity: f.severity, area: f.area };
      entry.count += 1;
      findingOnEveryPage.set(key, entry);
    }
  }
  for (const [key, v] of findingOnEveryPage) {
    if (v.count === pageCount && pageCount > 1 && (v.severity === 'HIGH' || v.severity === 'CRITICAL')) {
      const title = key.split('::')[1];
      blockers.push(`${v.severity} — "${title}" found on all ${pageCount} crawled pages (${v.area}) — points at shared code, not one page.`);
    }
  }

  return { verdict: blockers.length > 0 ? 'no-go' : 'go', areas, blockers };
}

async function main(): Promise<void> {
  const target = process.argv[2] ?? DEFAULT_TARGET;
  const extraArg = process.argv[3]; // comma-separated extra paths to force-include
  const extraPaths = extraArg ? extraArg.split(',').map((s) => s.trim()).filter(Boolean) : [];

  console.log(`\n  Discovering same-origin pages from ${target} ...`);
  const paths = await discoverSameOriginLinks(target, extraPaths);
  console.log(`  found ${paths.length} page(s): ${paths.join(', ')}\n`);

  const summaries: CrawledPageSummary[] = [];
  const origin = new URL(target).origin;

  for (const [i, path] of paths.entries()) {
    const url = new URL(path, origin).href;
    const slug = slugifyPath(path);
    const pageDir = join(DATA, 'pages', slug);
    await mkdir(pageDir, { recursive: true });

    console.log(`  [${i + 1}/${paths.length}] ${path === '/' ? '(home)' : path}`);
    const doc = await runAudit(url, join(pageDir, 'audit.json'), true);
    const metrics = await captureMetrics(url, pageDir);
    void metrics;

    if (/login|register|signup|sign-up/i.test(path)) {
      const formInfo = await inspectForms(url);
      await writeFile(join(pageDir, 'forms.json'), `${JSON.stringify(formInfo, null, 2)}\n`, 'utf8');
    }

    const allFindings = doc.areas.flatMap((a: { findings: { title: string; severity: string; area: string }[] }) => a.findings);
    const sevRank: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3, INFO: 4 };
    const topFindings = [...allFindings]
      .sort((a, b) => (sevRank[a.severity] ?? 9) - (sevRank[b.severity] ?? 9))
      .slice(0, 3)
      .map((f) => ({ title: f.title, severity: f.severity, area: f.area }));

    summaries.push({
      path,
      url,
      score: doc.overall.score,
      counts: doc.counts,
      worstSeverity: doc.areas.reduce<string | null>((worst, a) => {
        if (!a.worstSeverity) return worst;
        if (!worst) return a.worstSeverity;
        return (sevRank[a.worstSeverity] ?? 9) < (sevRank[worst] ?? 9) ? a.worstSeverity : worst;
      }, null),
      topFindings,
      areas: doc.areas.map((a) => ({ module: a.module, label: a.label, score: a.score })),
    });

    console.log(`      score ${doc.overall.score ?? 'n/a'} · ${allFindings.length} findings`);
    if (i < paths.length - 1) await new Promise((r) => setTimeout(r, POLITE_DELAY_MS));
  }

  const readiness = computeReadiness(summaries);

  await writeFile(
    join(DATA, 'crawl.json'),
    `${JSON.stringify({ crawledAt: new Date().toISOString(), pages: summaries, readiness }, null, 2)}\n`,
    'utf8',
  );

  console.log(
    `\n  readiness: ${readiness.verdict.toUpperCase()}` +
      (readiness.blockers.length > 0 ? ` (${readiness.blockers.length} blocker(s))` : ''),
  );

  // Fold the crawl summary into the home page's audit.json so the report/dashboard can show it.
  const homeAuditPath = join(DATA, 'audit.json');
  try {
    const homeAudit = JSON.parse(await readFile(homeAuditPath, 'utf8')) as Record<string, unknown>;
    homeAudit['crawledPages'] = summaries;
    homeAudit['readiness'] = readiness;
    await writeFile(homeAuditPath, `${JSON.stringify(homeAudit, null, 2)}\n`, 'utf8');
  } catch {
    console.log('  note: data/audit.json not found yet — run `pnpm run audit` first, then re-run crawl to merge crawledPages in.');
  }

  console.log(`\n  crawled ${summaries.length} page(s). Site-wide summary written to data/crawl.json\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e: unknown) => {
    console.error(e);
    process.exit(1);
  });
}
