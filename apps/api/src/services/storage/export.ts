/**
 * T190 — self-contained report export (FR-093: "export a report so it outlives
 * their retention period").
 *
 * One HTML file, no external CSS, fonts, or scripts, everything the report
 * screen shows: the overall score, the executive summary, each area's state and
 * score, and every issue with its severity, location, consequence, evidence,
 * attribution, and — the part that makes an exported report still *useful* — its
 * copy-and-paste remediation prompt (FR-051).
 *
 * Synthesized from the database exactly like `GET /scans/:id/report`, so it is
 * available right up until the retention sweep removes the findings. After that
 * the export route returns 410 — by then the user was warned and had the file.
 */

import type { PrismaClient } from '../../../prisma/generated/client/index.js';

const MODULE_LABEL: Readonly<Record<string, string>> = {
  PERFORMANCE: 'Performance',
  SECURITY: 'Security',
  UI: 'Design',
  TESTING: 'Testing',
  SEO: 'Search visibility',
};

const SEVERITY_ORDER: Readonly<Record<string, number>> = {
  CRITICAL: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
  INFO: 4,
};

export class ReportNotExportableError extends Error {
  override readonly name = 'ReportNotExportableError';
  constructor(readonly reason: 'not-found' | 'removed' | 'not-ready') {
    super(
      reason === 'not-found'
        ? 'No such report.'
        : reason === 'removed'
          ? 'This report has passed its retention period and been removed.'
          : 'This audit has not finished yet.',
    );
  }
}

function esc(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
}

export interface ExportedReport {
  readonly html: string;
  readonly filename: string;
}

export async function exportReport(
  db: PrismaClient,
  input: { readonly scanId: string; readonly userId: string },
): Promise<ExportedReport> {
  const scan = await db.scan.findFirst({
    where: { id: input.scanId, userId: input.userId },
    select: {
      id: true,
      state: true,
      kind: true,
      overallScore: true,
      summary: true,
      completedAt: true,
      reportRemovedAt: true,
      target: { select: { displayName: true, canonicalValue: true } },
      moduleResults: {
        select: { module: true, state: true, score: true, summary: true, skippedReason: true, degradedReason: true },
      },
    },
  });
  if (scan === null) throw new ReportNotExportableError('not-found');
  if (scan.reportRemovedAt !== null) throw new ReportNotExportableError('removed');
  if (scan.state !== 'COMPLETED') throw new ReportNotExportableError('not-ready');

  const issues = await db.issue.findMany({
    where: { scanId: scan.id },
    select: {
      severity: true,
      title: true,
      explanation: true,
      consequence: true,
      location: true,
      evidence: true,
      attribution: true,
      fixPrompt: true,
      moduleResult: { select: { module: true } },
    },
  });
  issues.sort(
    (a, b) =>
      (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9) ||
      a.title.localeCompare(b.title),
  );

  const targetName = scan.target.displayName || scan.target.canonicalValue;
  const areaRows = scan.moduleResults
    .map((a) => {
      const detail = a.degradedReason ?? a.skippedReason ?? '';
      return (
        `<tr><td>${esc(MODULE_LABEL[a.module] ?? a.module)}</td>` +
        `<td>${esc(a.state.toLowerCase())}</td>` +
        `<td class="num">${a.score === null ? '—' : String(a.score)}</td>` +
        `<td>${esc(detail)}</td></tr>`
      );
    })
    .join('');

  const issueBlocks = issues
    .map((i) => {
      const evidence =
        i.evidence === null || i.evidence === undefined
          ? ''
          : `<pre class="evidence">${esc(JSON.stringify(i.evidence, null, 2))}</pre>`;
      return `<article class="issue sev-${esc(i.severity.toLowerCase())}">
  <div class="issue-head">
    <span class="sev">${esc(i.severity)}</span>
    <span class="area">${esc(MODULE_LABEL[i.moduleResult.module] ?? i.moduleResult.module)}</span>
    <span class="attr">${esc(i.attribution === 'MEASURED' ? 'measured' : 'AI judgment')}</span>
  </div>
  <h3>${esc(i.title)}</h3>
  ${i.location === null ? '' : `<div class="loc">${esc(i.location)}</div>`}
  <p>${esc(i.explanation)}</p>
  <p class="consequence"><strong>Why it matters:</strong> ${esc(i.consequence)}</p>
  ${evidence}
  <details class="fix"><summary>Remediation prompt</summary><pre>${esc(i.fixPrompt)}</pre></details>
</article>`;
    })
    .join('\n');

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>WebAudit report — ${esc(targetName)}</title>
<style>
  :root { color-scheme: light; }
  body { margin: 0; font: 15px/1.6 -apple-system, "Segoe UI", Roboto, sans-serif; color: #1f2937; background: #f9fafb; }
  main { max-width: 860px; margin: 40px auto; padding: 0 20px; }
  header { background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 24px 28px; margin-bottom: 20px; }
  h1 { margin: 0 0 4px; font-size: 24px; }
  .target { font-family: ui-monospace, Menlo, monospace; color: #374151; }
  .score { font-size: 40px; font-weight: 700; margin-top: 12px; }
  .score span { font-size: 15px; font-weight: 400; color: #6b7280; }
  section { background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px 28px; margin-bottom: 20px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { text-align: left; padding: 8px 0; border-bottom: 1px solid #f3f4f6; font-size: 14px; }
  td.num { text-align: right; font-family: ui-monospace, monospace; }
  .issue { border-left: 4px solid #9ca3af; padding: 4px 0 4px 16px; margin: 18px 0; }
  .issue.sev-critical { border-color: #b91c1c; }
  .issue.sev-high { border-color: #ea580c; }
  .issue.sev-medium { border-color: #ca8a04; }
  .issue.sev-low { border-color: #2563eb; }
  .issue-head { font-size: 12px; text-transform: uppercase; letter-spacing: 1px; color: #6b7280; display: flex; gap: 12px; }
  .issue h3 { margin: 6px 0; font-size: 17px; color: #111827; }
  .loc { font-family: ui-monospace, monospace; font-size: 13px; color: #4b5563; }
  .consequence { color: #374151; }
  pre { background: #f3f4f6; border-radius: 6px; padding: 12px; overflow-x: auto; font-size: 12px; white-space: pre-wrap; }
  details.fix summary { cursor: pointer; color: #2563eb; font-size: 14px; }
  footer { color: #9ca3af; font-size: 13px; text-align: center; margin: 24px 0; }
</style></head>
<body><main>
  <header>
    <h1>${esc(scan.kind === 'READINESS' ? 'Readiness re-audit' : 'Audit report')}</h1>
    <div class="target">${esc(targetName)}</div>
    <div class="score">${scan.overallScore === null ? '—' : String(scan.overallScore)}<span> / 100 overall health</span></div>
    <div>${scan.completedAt === null ? '' : `Completed ${esc(scan.completedAt.toISOString().slice(0, 10))}`}</div>
  </header>
  <section>
    <h2>Executive summary</h2>
    <p>${esc(scan.summary ?? 'No summary was generated for this audit.')}</p>
  </section>
  <section>
    <h2>Areas</h2>
    <table><thead><tr><th>Area</th><th>State</th><th>Score</th><th>Notes</th></tr></thead>
    <tbody>${areaRows}</tbody></table>
  </section>
  <section>
    <h2>Issues (${String(issues.length)})</h2>
    ${issueBlocks || '<p>No issues were found.</p>'}
  </section>
  <footer>Exported from WebAudit AI — this file is self-contained and needs no network to read.</footer>
</main></body></html>`;

  return { html, filename: `webaudit-report-${scan.id}.html` };
}
