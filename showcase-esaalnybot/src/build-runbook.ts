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
    status: 'fail',
    note: 'CONFIRMED (passive header read): app.esaalnybot.tech and api.esaalnybot.tech return NONE of Content-Security-Policy, Strict-Transport-Security, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy. With no CSP, any XSS found in P4 is a full account/tenant takeover, and with no frame-ancestors the login page is framable (INFRA-03).',
  },
  {
    caseId: 'INFRA-01',
    status: 'partial',
    note: 'CONFIRMED (openssl): TLS 1.2 + 1.3 only — TLS 1.0 and 1.1 are disabled ("no protocols available"). Strong ciphers (ECDHE-ECDSA-AES256-GCM-SHA384 / TLS_AES_256_GCM_SHA384), valid ECDSA certificate (verify return code 0). GAP: no HSTS header, so a first visit over http:// or to the bare domain has a downgrade window. Run testssl.sh --full for cert-chain / OCSP / full cipher detail.',
  },
  {
    caseId: 'RECON-04',
    status: 'fail',
    note: 'CONFIRMED (passive): Server: nginx/1.24.0 (Ubuntu) on both hosts (version + OS disclosed). api root leaks {"service":"Esaalny Backend","status":"running","version":"1.0.0"}. Check nginx 1.24.0 advisories and remove server_tokens.',
  },
  {
    caseId: 'MAP-04',
    status: 'partial',
    note: 'PARTIAL (passive preflight): api.esaalnybot.tech returns Access-Control-Allow-Credentials: true, but did NOT return Access-Control-Allow-Origin for Origin: https://evil.example (that origin is not granted). ACAC:true with no ACAO on these responses is a configuration smell. ACTIVE TEST REQUIRED: does ACAO reflect for an authenticated endpoint, for null, or for near-miss origins (app.esaalnybot.tech.evil.example, evil-esaalnybot.tech)? The dangerous combination (reflected origin + credentials) is NOT confirmed either way.',
  },
  {
    caseId: 'MAP-02',
    status: 'observed',
    note: 'CONFIRMED (passive): OPTIONS on api.esaalnybot.tech advertises access-control-allow-methods: DELETE, GET, HEAD, OPTIONS, PATCH, POST, PUT. OPTIONS /widget.js -> 405 allow: GET. Enumerate which methods each real endpoint actually accepts and whether authz is checked on every one (verb tampering).',
  },
  {
    caseId: 'RECON-02',
    status: 'observed',
    note: 'CONFIRMED (passive): esaalnybot.tech apex is a parked Hostinger page (not the product). Only app. and api. are live. /.well-known/security.txt returns 200 but it is the parking catch-all, not a real security.txt. app.esaalnybot.tech serves its SPA index.html for unknown paths — robots.txt and sitemap.xml are the SPA, not real files.',
  },
  {
    caseId: 'INFRA-04',
    status: 'partial',
    note: 'PARTIAL (passive): a malformed CORS preflight returned HTTP 400 (some request validation exists at the edge). Full error-handling / stack-trace / verbose-error testing is an active task.',
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
  md.push('_Generated by `showcase-esaalnybot`. Structured version: `data/pentest-runbook.json`. Rendered in the dashboard\'s "Pentest plan" tab._');
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
