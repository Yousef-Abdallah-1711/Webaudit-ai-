/**
 * T114 — the master AI synthesis layer: `Scan.overallScore` and the
 * executive summary, written once during `RUNNING_MASTER`.
 *
 * The score is computed, never asked for — `packages/scoring`'s
 * `overallScore()` is the only thing that writes `Scan.overallScore`, and the
 * prompt (`masterReportPrompt`, T083) explicitly tells the model not to
 * produce one, for the FR-053 reason its own module note gives: a model
 * asked for "an overall impression" will quietly average the gaps back in.
 *
 * **Degrades rather than fails.** `packages/capabilities-vendored/` is empty
 * in this sub-phase, so `overallScore` sees only `NOT_APPLICABLE` areas and
 * returns `{score: null, ...}` — a scan with nothing measured, honestly. The
 * AI call still runs (it has something to say even about an audit that
 * measured nothing: which areas need what), and if the chain is exhausted
 * (`ok: false`), the summary falls back to a deterministic sentence rather
 * than leaving `Scan.summary` unset — FR-035's degrade-not-fail rule applies
 * here exactly as it does inside a single module.
 */

import { assemblePrompt } from '@webaudit/redaction';
import type { AiExecutor } from '@webaudit/ai-executor';
import { masterReportPrompt } from '../prompts/index.js';
import { overallScore, type AreaScore } from '@webaudit/scoring';
import type { PrismaClient } from '@webaudit/api/prisma-client';

export interface MasterSynthesisResult {
  readonly overallScore: number | null;
  readonly summary: string;
}

function fallbackSummary(areas: readonly AreaScore[]): string {
  const scored = areas.filter((a) => a.score !== null);
  if (scored.length === 0) {
    return 'No area of this audit produced a measurement to summarise.';
  }
  const parts = scored.map((a) => `${a.module} scored ${String(a.score)}`);
  return `Summary (AI interpretation unavailable): ${parts.join(', ')}.`;
}

export async function runMasterSynthesis(
  db: PrismaClient,
  executor: AiExecutor,
  scanId: string,
): Promise<MasterSynthesisResult> {
  const results = await db.moduleResult.findMany({
    where: { scanId },
    select: { module: true, state: true, score: true, summary: true, skippedReason: true },
  });

  const areas: AreaScore[] = results.map((r: (typeof results)[number]) => ({
    module: r.module,
    state: r.state,
    score: r.score,
  }));
  const overall = overallScore(areas);

  const rendered = results
    .map(
      (r: (typeof results)[number]) =>
        `${r.module}: state=${r.state}, score=${r.score === null ? 'null' : String(r.score)}` +
        (r.summary ? `, summary=${r.summary}` : '') +
        (r.skippedReason ? `, reason=${r.skippedReason}` : ''),
    )
    .join('\n');

  const assembled = assemblePrompt({
    instructions: masterReportPrompt.systemPrompt,
    segments: [{ label: 'area-results', path: 'master/areas.txt', content: rendered || 'No areas were run.' }],
  });

  const result = await executor.run({
    task: masterReportPrompt.task,
    prompt: assembled.prompt,
    schema: masterReportPrompt.responseSchema,
    scanId,
  });

  const summary = result.ok ? result.value.headline : fallbackSummary(areas);

  await db.scan.update({
    where: { id: scanId },
    data: { overallScore: overall.score, summary },
  });

  return { overallScore: overall.score, summary };
}
