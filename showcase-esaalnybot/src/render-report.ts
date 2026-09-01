/**
 * data/audit.json  ->  report.md
 *
 * The full audit report as a self-contained Markdown document, matching what
 * WebAudit AI's `GET /scans/:id/report` synthesis + master-report phase would
 * produce, with the AI-layer sections authored by Claude from the measurements.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const AUDIT = join(HERE, '..', 'data', 'audit.json');
const OUT = join(HERE, '..', 'report.md');

const SEV_RANK: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3, INFO: 4 };
const BAR = (score: number | null): string => {
  if (score === null) return '`   n/a `';
  const filled = Math.round(score / 5);
  return '`' + '█'.repeat(filled) + '·'.repeat(20 - filled) + '` ' + score;
};

interface Finding {
  module: string;
  area: string;
  checkId: string;
  fingerprint: string;
  severity: string;
  attribution: string;
  title: string;
  explanation: string;
  consequence: string;
  location: string | null;
  evidence: Record<string, unknown> | null;
  fixPrompt: string;
  fixable: boolean;
}
interface Area {
  module: string;
  label: string;
  state: string;
  score: number | null;
  degradedReason: string | null;
  skippedReason: string | null;
  capabilities: {
    id: string;
    layer: string;
    ran: boolean;
    succeeded: boolean;
    findingCount: number;
    durationMs: number;
    error: string | null;
    skippedReason: string | null;
    egressViolations: string[];
  }[];
  findings: Finding[];
}
interface Audit {
  meta: Record<string, string | number>;
  overall: { score: number | null; scoredModules: string[]; unscoredModules: string[] };
  counts: Record<string, number>;
  areas: Area[];
  pageMetrics?: {
    timings: Record<string, number>;
    transferKb: number;
    resourceCount: number;
    domNodes: number;
    textLength: number;
    headings: { h1: number; h2: number; h3: number };
    viewportOverflowPx: { desktop: number; mobile: number };
  };
  pipelineParity?: {
    ran: boolean;
    meta: Record<string, unknown>;
    overall: { standalone: number | null; pipeline: number | null; match: boolean };
    perArea: { module: string; label: string; standalone: { state: string; score: number | null }; pipeline: { state: string; score: number | null }; scoresMatch: boolean }[];
    pipelineIssueCount: number;
    notes: string[];
  };
  aiNarrative: {
    authoredBy: string;
    scopeNote: string;
    coverage?: { heading: string; body: string; passive: string[]; active: string[] };
    executiveSummary: string;
    areaNarratives: Record<string, string>;
    prioritised: { rank: number; title: string; area: string; severity: string; effort: string; why: string }[];
    designJudgments: { checkId: string; severity: string; title: string; explanation: string; consequence: string; fixPrompt: string }[];
  } | null;
}

function findingBlock(f: Finding): string {
  const lines = [
    `#### ${f.severity} · ${f.title}`,
    ``,
    `| | |`,
    `|---|---|`,
    `| Attribution | ${f.attribution} |`,
    `| Check | \`${f.checkId}\` |`,
    `| Fingerprint | \`${f.fingerprint}\` |`,
    `| Location | ${f.location ? '`' + f.location + '`' : '—'} |`,
    ``,
    f.explanation,
    ``,
    `**Why it matters.** ${f.consequence}`,
  ];
  if (f.evidence && Object.keys(f.evidence).length > 0) {
    lines.push('', '**Evidence.**', '', '```json', JSON.stringify(f.evidence, null, 2), '```');
  }
  lines.push('', '<details><summary>Paste-ready remediation prompt</summary>', '', '```', f.fixPrompt, '```', '', '</details>');
  return lines.join('\n');
}

async function main(): Promise<void> {
  const a = JSON.parse(await readFile(AUDIT, 'utf8')) as Audit;
  const n = a.aiNarrative;
  const pm = a.pageMetrics;

  const allFindings: Finding[] = [
    ...a.areas.flatMap((ar) => ar.findings),
    ...(n?.designJudgments ?? []).map((j) => ({
      module: 'UI',
      area: 'Design',
      checkId: j.checkId,
      fingerprint: j.checkId,
      severity: j.severity,
      attribution: 'AI_JUDGMENT',
      title: j.title,
      explanation: j.explanation,
      consequence: j.consequence,
      location: null,
      evidence: null,
      fixPrompt: j.fixPrompt,
      fixable: j.severity !== 'INFO',
    })),
  ].sort((x, y) => SEV_RANK[x.severity]! - SEV_RANK[y.severity]!);

  const md: string[] = [];
  md.push(`# WebAudit AI — audit report`);
  md.push('');
  md.push(`**Target** \`${a.meta['target']}\`  `);
  md.push(`**Completed** ${new Date(String(a.meta['completedAt'])).toISOString().replace('T', ' ').slice(0, 19)} UTC · ${(Number(a.meta['durationMs']) / 1000).toFixed(1)}s  `);
  md.push(`**Overall score** ${a.overall.score ?? 'n/a'} / 100 — mean of ${a.overall.scoredModules.length} scored areas (${a.overall.scoredModules.join(', ')})  `);
  md.push(`**Findings** ${allFindings.filter((f) => f.severity !== 'INFO').length} — ` +
    ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map((s) => `${a.counts[s] ?? 0} ${s.toLowerCase()}`).join(', ') +
    (n ? `, plus ${n.designJudgments.filter((j) => j.severity !== 'INFO').length} AI design observations` : ''));
  md.push('');
  md.push('| Area | State | Score |');
  md.push('|---|---|---|');
  for (const ar of a.areas) md.push(`| ${ar.label} | ${ar.state} | ${BAR(ar.score)} |`);
  md.push('');
  md.push('---');
  md.push('');

  md.push('## How this audit was produced');
  md.push('');
  md.push(String(a.meta['engine']));
  md.push('');
  md.push(`- **Browser:** ${a.meta['browser']}`);
  md.push(`- **AI layer:** ${a.meta['aiLayer']}`);
  md.push('');
  md.push('The measurement layer is the product\'s own code, run for real:');
  md.push('');
  md.push('- 13 capabilities from `packages/capabilities-vendored/*`, unmodified.');
  md.push('- `apps/worker/src/module-runner/*` for resolution, isolated concurrent execution, `globalThis.fetch` poisoning, per-area state and per-area scoring — imported, not re-implemented.');
  md.push('- `packages/safe-net` (`safeFetch`) is the only network door for `ctx.fetch`; `apps/probe-pool` (`createBrowserPool`) backs `ctx.withPage`.');
  md.push('');

  if (a.pipelineParity?.ran) {
    const pp = a.pipelineParity;
    md.push('### Engine parity — cross-checked against the full production pipeline');
    md.push('');
    md.push('The same audit was also run through the real `startApi` + `startWorker` stack (Express API, BullMQ queue, five-phase orchestrator, Postgres + Redis), creating a real `Scan` row and letting the orchestrator drive it to `COMPLETED`.');
    md.push('');
    md.push(`| Area | Standalone runner | Full pipeline | Match |`);
    md.push('|---|---|---|---|');
    for (const r of pp.perArea) {
      md.push(`| ${r.label} | ${r.standalone.state} · ${r.standalone.score ?? 'n/a'} | ${r.pipeline.state} · ${r.pipeline.score ?? 'n/a'} | ${r.scoresMatch ? '✅' : '⚠️'} |`);
    }
    md.push(`| **Overall** | **${pp.overall.standalone ?? 'n/a'}** | **${pp.overall.pipeline ?? 'n/a'}** | ${pp.overall.match ? '✅' : '⚠️'} |`);
    md.push('');
    for (const n2 of pp.notes) md.push(`- ${n2}`);
    md.push('');
  }


  if (n) {
    md.push('## Executive summary');
    md.push('');
    md.push('> Authored by the AI layer (' + n.authoredBy + ')');
    md.push('');
    md.push(n.executiveSummary);
    md.push('');
    if (n.coverage) {
      md.push(`### ${n.coverage.heading}`);
      md.push('');
      md.push(n.coverage.body);
      md.push('');
      for (const x of n.coverage.passive) md.push(`- ✅ ${x}`);
      for (const x of n.coverage.active) md.push(`- ❌ ${x}`);
      md.push('');
    }
    md.push('### Scope');
    md.push('');
    md.push(n.scopeNote);
    md.push('');
    md.push('## Fix these first');
    md.push('');
    md.push('| # | Action | Area | Severity | Effort | Why |');
    md.push('|---|---|---|---|---|---|');
    for (const p of n.prioritised) {
      md.push(`| ${p.rank} | ${p.title} | ${p.area} | ${p.severity} | ${p.effort} | ${p.why} |`);
    }
    md.push('');
  }

  if (pm) {
    md.push('## Measured page load (real headless Chromium)');
    md.push('');
    md.push('| Metric | Value |');
    md.push('|---|---|');
    md.push(`| Time to first byte | ${pm.timings['ttfbMs']} ms |`);
    md.push(`| DOM interactive | ${pm.timings['domInteractiveMs']} ms |`);
    md.push(`| First contentful paint | ${pm.timings['firstContentfulPaintMs']} ms |`);
    md.push(`| DOMContentLoaded | ${pm.timings['domContentLoadedMs']} ms |`);
    md.push(`| Load | ${pm.timings['loadMs']} ms |`);
    md.push(`| Transfer size | ${pm.transferKb} KB |`);
    md.push(`| Requests | ${pm.resourceCount} |`);
    md.push(`| DOM nodes | ${pm.domNodes} |`);
    md.push(`| Rendered body text | ${pm.textLength} chars |`);
    md.push(`| Rendered headings | h1×${pm.headings.h1}, h2×${pm.headings.h2}, h3×${pm.headings.h3} |`);
    md.push(`| Horizontal overflow | ${pm.viewportOverflowPx.desktop}px @1440 · ${pm.viewportOverflowPx.mobile}px @390 |`);
    md.push('');
    md.push('_Screenshots: `data/screenshot-desktop.png`, `data/screenshot-mobile.png`._');
    md.push('');
  }

  md.push('---');
  md.push('');
  md.push('## Areas');
  md.push('');

  for (const ar of a.areas) {
    md.push(`### ${ar.label} — ${ar.state}${ar.score !== null ? ` · score ${ar.score}/100` : ''}`);
    md.push('');
    if (n && n.areaNarratives[ar.module]) {
      md.push(n.areaNarratives[ar.module]!);
      md.push('');
    }
    md.push('**Capabilities run:**');
    md.push('');
    md.push('| Capability | Layer | Result |');
    md.push('|---|---|---|');
    for (const c of ar.capabilities) {
      const result = c.ran
        ? c.succeeded
          ? `${c.findingCount} finding(s) · ${c.durationMs} ms`
          : `error — ${c.error}`
        : c.layer === 'AI'
          ? 'AI layer — prompt contribution only (no runtime model)'
          : c.skippedReason ?? 'not run';
      md.push(`| \`${c.id}\` | ${c.layer} | ${result} |`);
    }
    md.push('');
    if (ar.degradedReason) md.push(`> Degraded: ${ar.degradedReason}\n`);
    const areaFindings = allFindings.filter((f) => f.area === ar.label);
    if (areaFindings.length === 0) {
      md.push('_No defects measured in this area._');
      md.push('');
    } else {
      for (const f of areaFindings) {
        md.push(findingBlock(f));
        md.push('');
      }
    }
    md.push('---');
    md.push('');
  }

  // Active pentest runbook summary (separate deliverable — PENTEST-RUNBOOK.md).
  try {
    const rb = JSON.parse(await readFile(join(HERE, '..', 'data', 'pentest-runbook.json'), 'utf8')) as {
      summary: { phases: number; testCases: number; bySeverityIfFound: Record<string, number> };
      phases: { id: string; name: string; goal: string; cases: unknown[] }[];
    };
    md.push('## Active penetration test — manual runbook');
    md.push('');
    md.push('The audit above is passive configuration analysis. A full **manual penetration-test runbook** for a');
    md.push('human tester is a separate deliverable — `PENTEST-RUNBOOK.md` (and the dashboard\'s "Pentest plan" tab).');
    md.push(`It covers **${rb.summary.phases} phases / ${rb.summary.testCases} test cases** across app, api and the chatbot widget:`);
    md.push('');
    md.push('| Phase | Focus | Test cases |');
    md.push('|---|---|---|');
    for (const p of rb.phases) md.push(`| ${p.id} — ${p.name} | ${p.goal} | ${p.cases.length} |`);
    md.push('');
    md.push('It includes SQL/NoSQL injection, authentication (login / register / password-reset, incl. host-header');
    md.push('poisoning and reset-token race), rate limiting and brute-force with bypasses, reaching the admin dashboard,');
    md.push('IDOR and cross-tenant isolation, SSRF, XSS, JWT/session, the widget & prompt injection, business logic, and');
    md.push('transport/headers — each with steps, payloads, tools, evidence to capture, and remediation.');
    md.push('');
    md.push('> Execute only under written authorisation and a signed scope. Nothing in it has been run.');
    md.push('');
  } catch {
    /* runbook not generated */
  }

  md.push('## All findings, by severity');
  md.push('');
  md.push('| Severity | Area | Title | Attribution | Fingerprint |');
  md.push('|---|---|---|---|---|');
  for (const f of allFindings) {
    md.push(`| ${f.severity} | ${f.area} | ${f.title} | ${f.attribution} | \`${f.fingerprint.slice(0, 16)}\` |`);
  }
  md.push('');
  md.push('---');
  md.push('');
  md.push(`_Generated by \`showcase-esaalnybot\`. Raw data: \`data/audit.json\`. Dashboard: \`pnpm --filter showcase-esaalnybot serve\`._`);
  md.push('');

  await writeFile(OUT, md.join('\n'), 'utf8');
  process.stdout.write(`  report written: ${OUT} (${md.length} lines)\n`);
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
