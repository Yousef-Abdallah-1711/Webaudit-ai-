/**
 * The AI layer, authored offline, for {{TARGET_URL}}.
 *
 * WebAudit AI's design (Principle III / FR-030) is: the code layer measures,
 * the AI layer *explains and prioritises what was measured* — it never
 * invents an observation. No runtime LLM key is configured for this
 * showcase, so this file IS that AI layer: it must be rewritten by hand
 * (by Claude, reading `data/audit.json` and `data/page-metrics.json` for
 * THIS target) after the audit + capture steps have run.
 *
 * Everything below is labelled `AI_NARRATIVE` (prose) or, for observations
 * with no code-layer check behind them, `AI_JUDGMENT` — the exact
 * attribution the product's module runner stamps on an AI-layer finding.
 * NONE of it may move a score: per-area scores come only from MEASURED
 * findings, as in the real `packages/scoring`.
 *
 * THE GUARD BELOW IS INTENTIONAL. `main()` refuses to write a narrative
 * whose `authoredBy` still starts with "PLACEHOLDER" — that is what stops
 * an unauthored (or worse, a copy-pasted stale client's) narrative from
 * silently becoming a shipped report. Do not remove the guard; satisfy it
 * by actually authoring `build()` below from this target's real findings.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { Severity } from '@webaudit/types';

const HERE = dirname(fileURLToPath(import.meta.url));
const AUDIT = join(HERE, '..', 'data', 'audit.json');
const METRICS = join(HERE, '..', 'data', 'page-metrics.json');

interface Narrative {
  authoredBy: string;
  scopeNote: string;
  coverage: {
    heading: string;
    body: string;
    passive: string[];
    active: string[];
  };
  executiveSummary: string;
  areaNarratives: Record<string, string>;
  prioritised: {
    rank: number;
    title: string;
    area: string;
    severity: Severity;
    effort: 'trivial' | 'small' | 'moderate';
    why: string;
  }[];
  /** AI-layer design observations — no measured check behind them (AI_JUDGMENT). */
  designJudgments: {
    checkId: string;
    severity: Severity;
    title: string;
    explanation: string;
    consequence: string;
    fixPrompt: string;
  }[];
}

// ---------------------------------------------------------------------------
// TODO: rewrite everything in this function from data/audit.json's real
// measured findings for {{TARGET_URL}}. Do not reuse another client's prose.
//
// Steps:
//   1. Read data/audit.json (after `pnpm run audit` + `pnpm run capture`).
//   2. For each area (Security, SEO, Performance, Design, Testing), read its
//      `findings` and `score`/`state`, and write areaNarratives[MODULE] that
//      explains what was measured — cite real numbers, real header names,
//      real severities. Never state something the findings don't support.
//   3. Write executiveSummary from the overall score + the areas' findings.
//   4. Fill `prioritised` (rank by real severity/effort) and `designJudgments`
//      (AI_JUDGMENT only — screenshot-based opinions, INFO/LOW severity,
//      never move a score) from data/screenshot-{desktop,mobile}.png.
//   5. Set authoredBy to a real value (drop the "PLACEHOLDER" prefix) once
//      every field above reflects this target's actual measured findings.
// ---------------------------------------------------------------------------
function build(metrics: {
  timings: Record<string, number>;
  transferKb: number;
  resourceCount: number;
  domNodes: number;
  textLength: number;
  headings: { h1: number };
}): Narrative {
  return {
    authoredBy: 'PLACEHOLDER — not yet authored for {{TARGET_URL}}. See the TODO above build().',
    scopeNote: 'TODO: one paragraph — what page/flow was audited, and what is deliberately out of scope (e.g. anything behind sign-in).',
    coverage: {
      heading: 'TODO: e.g. "What this score does and does not mean"',
      body: 'TODO: passive-audit vs. active-pentest distinction, grounded in what was actually run.',
      passive: ['TODO: list what was measured (headers, TLS, meta/SEO, CWV, responsive layout, secret scan, …).'],
      active: ['TODO: list what the Pentest plan tab still needs a human tester for.'],
    },
    executiveSummary: 'TODO: 3-5 sentences citing the real overall score and the real worst-scoring area(s) from data/audit.json.',
    areaNarratives: {
      SECURITY: 'TODO',
      SEO: 'TODO',
      PERFORMANCE: 'TODO',
      UI: 'TODO',
      TESTING: 'TODO',
    },
    prioritised: [],
    designJudgments: [],
  };
}

async function main(): Promise<void> {
  const audit = JSON.parse(await readFile(AUDIT, 'utf8')) as Record<string, unknown>;
  const metrics = JSON.parse(await readFile(METRICS, 'utf8')) as Parameters<typeof build>[0] & {
    target: string;
  };

  const narrative = build(metrics);

  if (narrative.authoredBy.startsWith('PLACEHOLDER') && process.env['ALLOW_PLACEHOLDER_NARRATIVE'] !== '1') {
    console.error(
      '\n  ✗ ai-narrative.ts has not been authored for this target yet.\n' +
        '    build() still returns the PLACEHOLDER narrative — read data/audit.json\n' +
        '    and data/page-metrics.json and rewrite it from the real findings before\n' +
        '    rendering a client-facing report.\n' +
        '    (Set ALLOW_PLACEHOLDER_NARRATIVE=1 to bypass this for a dry-run render.)\n',
    );
    process.exit(1);
  }

  audit['aiNarrative'] = narrative;
  audit['pageMetrics'] = metrics;

  await writeFile(AUDIT, `${JSON.stringify(audit, null, 2)}\n`, 'utf8');
  process.stdout.write(
    `  AI narrative merged: ${narrative.prioritised.length} prioritised actions, ` +
      `${narrative.designJudgments.length} design judgments\n`,
  );
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
