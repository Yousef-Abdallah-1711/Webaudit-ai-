/**
 * T165 — FR-072: "give the user something durable and shareable on a go
 * verdict."
 *
 * A self-contained HTML page — no external CSS, fonts, or scripts — rendered
 * once when a readiness pass returns *go*, stored in object storage under the
 * readiness scan's own prefix (`storage/reports.ts`, R17: "rendered artifacts
 * … never structured findings"). The stored key goes on
 * `ReadinessVerdict.certificateKey`; `GET /scans/:id/readiness/certificate`
 * serves the bytes.
 *
 * Durable: it is a flat file, not a database view, so it outlives the report's
 * retention window (FR-093's spirit). Shareable: it names the target, the
 * score against the baseline, every area against its published threshold, and a
 * verification id, and nothing on it needs the platform to be reachable to
 * read.
 *
 * `ReportStorage` is injected (defaults to the real R2 client) so a test — and
 * the "no R2 configured" dev path — can capture the bytes without a bucket.
 */

import { objectKeyFor, type ReportStorage } from '../storage/reports.js';

const MODULE_LABEL: Readonly<Record<string, string>> = {
  PERFORMANCE: 'Performance',
  SECURITY: 'Security',
  UI: 'Design',
  TESTING: 'Testing',
  SEO: 'Search visibility',
};

export interface CertificateInput {
  readonly scanId: string;
  readonly verdictId: string;
  readonly targetName: string;
  readonly overallScore: number;
  readonly baselineScore: number;
  readonly completedAt: Date;
  readonly moduleOutcomes: readonly {
    readonly module: string;
    readonly score: number | null;
    readonly threshold: number;
    readonly pass: boolean;
  }[];
}

const CERTIFICATE_KEY = 'certificate.html';

function esc(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
}

export function renderCertificateHtml(input: CertificateInput): string {
  const delta = input.overallScore - input.baselineScore;
  const rows = input.moduleOutcomes
    .map(
      (o) =>
        `<tr><td>${esc(MODULE_LABEL[o.module] ?? o.module)}</td>` +
        `<td class="num">${o.score === null ? '—' : String(o.score)} / ${String(o.threshold)}</td>` +
        `<td class="${o.pass ? 'pass' : 'fail'}">${o.pass ? 'met' : 'not met'}</td></tr>`,
    )
    .join('');

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Production readiness — ${esc(input.targetName)}</title>
<style>
  :root { color-scheme: light; }
  body { margin: 0; font: 16px/1.5 -apple-system, "Segoe UI", Roboto, sans-serif; color: #1f2937; background: #f9fafb; }
  .card { max-width: 720px; margin: 48px auto; background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; }
  .head { padding: 28px 32px; background: #ecfdf5; border-bottom: 1px solid #e5e7eb; }
  .eyebrow { font-size: 12px; letter-spacing: 1.5px; text-transform: uppercase; color: #047857; font-weight: 700; }
  h1 { margin: 8px 0 0; font-size: 28px; color: #111827; }
  .target { font-family: ui-monospace, "SF Mono", Menlo, monospace; color: #374151; margin-top: 6px; }
  .body { padding: 24px 32px 32px; }
  .score { font-size: 15px; color: #6b7280; font-family: ui-monospace, monospace; margin-bottom: 20px; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 10px 0; border-bottom: 1px solid #f3f4f6; font-size: 15px; }
  td.num { text-align: right; font-family: ui-monospace, monospace; color: #6b7280; }
  td.pass { text-align: right; color: #047857; width: 72px; }
  td.fail { text-align: right; color: #b91c1c; width: 72px; }
  .foot { margin-top: 24px; font-size: 13px; color: #9ca3af; }
</style></head>
<body>
  <div class="card">
    <div class="head">
      <div class="eyebrow">Production readiness</div>
      <h1>Ready to ship</h1>
      <div class="target">${esc(input.targetName)}</div>
    </div>
    <div class="body">
      <div class="score">Score ${String(input.overallScore)} · baseline ${String(input.baselineScore)} · ${delta >= 0 ? '+' : ''}${String(delta)}</div>
      <table><tbody>${rows}</tbody></table>
      <div class="foot">
        Verified ${esc(input.completedAt.toISOString().slice(0, 10))} · WebAudit AI ·
        verification ${esc(input.verdictId)}
      </div>
    </div>
  </div>
</body></html>`;
}

export async function generateReadinessCertificate(
  storage: ReportStorage,
  input: CertificateInput,
): Promise<{ certificateKey: string }> {
  const html = renderCertificateHtml(input);
  await storage.putObject(
    input.scanId,
    CERTIFICATE_KEY,
    new TextEncoder().encode(html),
    'text/html; charset=utf-8',
  );
  return { certificateKey: objectKeyFor(input.scanId, CERTIFICATE_KEY) };
}

export const READINESS_CERTIFICATE_KEY = CERTIFICATE_KEY;
