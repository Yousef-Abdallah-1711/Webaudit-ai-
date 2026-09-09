/**
 * runbook-data.ts  ->  data/pentest-runbook.json  +  PENTEST-RUNBOOK.md
 */

import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { RUNBOOK, type TestCase } from './runbook-data.js';

/**
 * Passive, non-intrusive observations already confirmed against the live hosts
 * (plain header / TLS / CORS-preflight reads — no active testing). These
 * pre-seed the dashboard's execution tracker so a human tester starts from
 * what is already known rather than a blank sheet.
 *
 * status: 'fail' = confirmed weak · 'partial' = observed, needs active confirm
 *         'observed' = neutral fact for the tester
 */
const PASSIVE_OBSERVATIONS: {
  caseId: string;
  status: 'fail' | 'partial' | 'observed';
  note: string;
}[] = [
  {
    caseId: 'INFRA-02',
    status: 'partial',
    note: 'Homepage headers read directly: HSTS (max-age=63072000; includeSubDomains; preload), X-Frame-Options: DENY, X-Content-Type-Options: nosniff, Referrer-Policy: strict-origin-when-cross-origin, and a Permissions-Policy restricting camera/microphone/geolocation are all present and look deliberately configured. The one confirmed gap: no Content-Security-Policy header at all, on any of the 15 pages crawled. Verify the same set holds on /admin and /checkout specifically — not yet checked per-route.',
  },
  {
    caseId: 'INFRA-03',
    status: 'observed',
    note: 'X-Frame-Options: DENY is already present on the homepage, which should already prevent the basic clickjacking PoC this case describes. Still worth confirming on /admin/login specifically (the highest-value target for a clickjacking-based credential relay) before ruling this out.',
  },
  {
    caseId: 'ATHN-04',
    status: 'partial',
    note: 'The NEXT_LOCALE cookie (a locale preference, not a session token) is confirmed missing both Secure and HttpOnly on every crawled page. The admin session cookie itself has not been observed — that requires an actual /admin/login, which was not attempted (out of scope for passive recon). Check whether the real session cookie shares the same lax configuration; if so, its impact is far more serious than NEXT_LOCALE\'s.',
  },
  {
    caseId: 'AUTHZ-01',
    status: 'observed',
    note: 'robots.txt already discloses /admin, /checkout, and /wishlist as Disallow entries — the site operator is not hiding these paths through obscurity. GET /admin returns a 307 redirect to /admin/login, a real email+password form (confirmed by GET only, no submission attempted).',
  },
  {
    caseId: 'RECON-01',
    status: 'partial',
    note: 'The passive WebAudit AI scan\'s data-leak scanner flagged 8 credential-shaped findings on every one of the 15 crawled pages (1 HIGH "value assigned to a credential-shaped name", 7 MEDIUM "high-entropy string"). This was independently re-verified: the homepage was re-fetched 16 times over several minutes using the product\'s own detector (not a re-implementation), because the page is served Cache-Control: no-store and genuinely varies request to request (a randomised related-products block). All 7 MEDIUM findings reproduced identically every time and are CONFIRMED FALSE POSITIVES — 5 are fragments of images.squarespace-cdn.com CDN image URLs (hashed asset ids) shuffled into different related-product positions, 2 are the same font/class-name attribute string repeated in the page\'s embedded Next.js RSC data. The 1 HIGH finding did NOT reproduce in any of the 16 re-fetches, so its content could not be captured or shown in this report. It is not disproven — it was measured consistently across all 15 pages in the original crawl using the same detector that correctly cleared the 7 false positives — but it most likely depends on specific page/CMS content this follow-up did not trigger. A human should reload the live site repeatedly (or search the CMS/promo content source directly) until it reappears in view-source, then identify and rotate it if live. This is the single most important unresolved item from the passive scan.',
  },
];

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');

const SEV_ORDER = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'];

function caseMd(c: TestCase): string[] {
  const md: string[] = [];
  md.push(`#### ${c.id} — ${c.title}`);
  md.push('');
  md.push(
    `**Target:** ${c.target} · **Category:** ${c.category} · **Severity if found:** ${c.severityIfFound} · **Refs:** ${c.refs.join(', ')}`,
  );
  md.push('');
  md.push(`**Objective.** ${c.objective}`);
  md.push('');
  md.push('**Steps.**');
  md.push('');
  c.steps.forEach((s, i) => md.push(`${i + 1}. ${s}`));
  md.push('');
  if (c.payloads && c.payloads.length > 0) {
    md.push('**Sample payloads.**');
    md.push('');
    md.push('```');
    c.payloads.forEach((p) => md.push(p));
    md.push('```');
    md.push('');
  }
  md.push(`**Tools.** ${c.tools.join(', ')}`);
  md.push('');
  md.push(`**Evidence to capture.** ${c.evidence}`);
  md.push('');
  md.push(`**Secure looks like.** ${c.secureLooksLike}`);
  md.push('');
  md.push(`**Remediation.** ${c.remediation}`);
  md.push('');
  return md;
}

function toMarkdown(): string {
  const r = RUNBOOK;
  const md: string[] = [];
  md.push(`# ${r.meta.title}`);
  md.push('');
  md.push(`**Version ${r.meta.version}** · generated ${r.meta.generated.slice(0, 10)}`);
  md.push('');
  md.push(`> ${r.meta.authoredBy}`);
  md.push('');
  md.push('> This is an execution methodology for an **authorised** engagement. It contains attack');
  md.push('> techniques and payloads the way the OWASP Testing Guide does. Do not run any of it');
  md.push('> without written authorisation and a signed scope.');
  md.push('');

  md.push('## Targets');
  md.push('');
  md.push('| Key | URL | Notes |');
  md.push('|---|---|---|');
  for (const t of r.meta.targets) md.push(`| ${t.key} | ${t.url} | ${t.notes} |`);
  md.push('');
  md.push('**Known facts (from passive recon so far):**');
  md.push('');
  for (const f of r.meta.knownFacts) md.push(`- ${f}`);
  md.push('');

  md.push('## Authorisation & scope');
  md.push('');
  for (const a of r.authorization) md.push(`- ${a}`);
  md.push('');
  md.push('## Rules of engagement');
  md.push('');
  for (const a of r.rulesOfEngagement) md.push(`- ${a}`);
  md.push('');
  md.push('## Prerequisites');
  md.push('');
  for (const a of r.prerequisites) md.push(`- ${a}`);
  md.push('');

  md.push('## Toolchain');
  md.push('');
  for (const t of r.toolchain) {
    md.push(`### ${t.name}`);
    md.push('');
    md.push(`*Purpose.* ${t.purpose}`);
    md.push('');
    md.push('```');
    md.push(t.config);
    md.push('```');
    md.push('');
  }

  md.push('## Passive observations already confirmed');
  md.push('');
  md.push('Non-intrusive header / TLS / CORS-preflight reads only — no active testing was performed.');
  md.push('These pre-seed the execution tracker.');
  md.push('');
  md.push('| Case | Status | Observation |');
  md.push('|---|---|---|');
  for (const o of PASSIVE_OBSERVATIONS) md.push(`| ${o.caseId} | ${o.status} | ${o.note} |`);
  md.push('');

  const total = r.phases.reduce((n, p) => n + p.cases.length, 0);
  md.push(`## Test phases (${r.phases.length} phases, ${total} test cases)`);
  md.push('');
  for (const p of r.phases) {
    md.push(`- **${p.id} — ${p.name}** (${p.cases.length}) — ${p.goal}`);
  }
  md.push('');

  for (const p of r.phases) {
    md.push('---');
    md.push('');
    md.push(`## ${p.id} — ${p.name}`);
    md.push('');
    md.push(`*Goal.* ${p.goal}`);
    md.push('');
    for (const c of p.cases) md.push(...caseMd(c));
  }

  md.push('---');
  md.push('');
  md.push('## Reporting template');
  md.push('');
  md.push('| Field | Note |');
  md.push('|---|---|');
  for (const f of r.reporting) md.push(`| ${f.field} | ${f.note} |`);
  md.push('');
  md.push('---');
  md.push('');
  md.push('_Generated by `showcase-eink`. Structured version: `data/pentest-runbook.json`. Rendered in the dashboard\'s "Pentest plan" tab._');
  md.push('');
  return md.join('\n');
}

async function main(): Promise<void> {
  const total = RUNBOOK.phases.reduce((n, p) => n + p.cases.length, 0);
  const bySev: Record<string, number> = {};
  for (const p of RUNBOOK.phases)
    for (const c of p.cases) bySev[c.severityIfFound] = (bySev[c.severityIfFound] ?? 0) + 1;

  const knownCaseIds = new Set(RUNBOOK.phases.flatMap((p) => p.cases.map((c) => c.id)));
  for (const o of PASSIVE_OBSERVATIONS) {
    if (!knownCaseIds.has(o.caseId)) throw new Error(`passive observation references unknown case ${o.caseId}`);
  }

  const json = {
    ...RUNBOOK,
    passiveObservations: PASSIVE_OBSERVATIONS,
    summary: {
      phases: RUNBOOK.phases.length,
      testCases: total,
      bySeverityIfFound: Object.fromEntries(
        SEV_ORDER.filter((s) => bySev[s]).map((s) => [s, bySev[s]]),
      ),
    },
  };

  await writeFile(
    join(ROOT, 'data', 'pentest-runbook.json'),
    `${JSON.stringify(json, null, 2)}\n`,
    'utf8',
  );
  await writeFile(join(ROOT, 'PENTEST-RUNBOOK.md'), toMarkdown(), 'utf8');
  process.stdout.write(
    `  runbook: ${RUNBOOK.phases.length} phases, ${total} test cases -> data/pentest-runbook.json + PENTEST-RUNBOOK.md\n`,
  );
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
