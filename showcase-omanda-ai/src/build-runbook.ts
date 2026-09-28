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
  // Confirmed 2026-09-14 with plain curl / openssl s_client against
  // omanda-ai.com only — no active testing, no auth attempted.
  {
    caseId: 'INFRA-01',
    status: 'partial',
    note:
      'TLS cert valid (Google Trust Services WE1, notBefore 2026-09-12, notAfter 2026-12-11 — not expired, ~3 months validity remaining). HSTS present: max-age=15552000 (180 days); includeSubDomains set, but no `preload` directive observed. Full cipher/protocol-downgrade assessment (testssl.sh) not run — that part of this case remains not-started.',
  },
  {
    caseId: 'INFRA-02',
    status: 'fail',
    note:
      'Confirmed via direct curl of the live response: X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy, and Strict-Transport-Security are all present and reasonably configured. Content-Security-Policy is the one header absent, on every one of the 8 crawled pages (matches the WebAudit AI passive scan\'s HIGH finding) — this is what fails the case, not an across-the-board absence.',
  },
  {
    caseId: 'INFRA-05',
    status: 'observed',
    note:
      'The WebAudit AI passive scan\'s owasp-checker capability found no Secure/HttpOnly/SameSite violations on any cookie across all 8 crawled pages. Not yet manually re-verified with a proxy, and no authenticated session exists to test cross-subdomain cookie scope against — recorded as a neutral starting fact for the tester, not a pass/fail verdict.',
  },
  {
    caseId: 'MAP-04',
    status: 'observed',
    note:
      'A real OPTIONS preflight (Origin: https://evil.example.com) against the homepage returned a plain 405 Method Not Allowed with no Access-Control-Allow-Origin or other CORS header echoed back — no permissive CORS policy observed on this endpoint. Only the homepage was checked this way; not exhaustive across all 8 pages or any (unconfirmed) API host.',
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
  md.push('_Generated by `showcase-omanda-ai`. Structured version: `data/pentest-runbook.json`. Rendered in the dashboard\'s "Pentest plan" tab._');
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
