/**
 * T083 — the rules every module prompt inherits.
 *
 * Principle III is the shape of all of them: "The code layer runs first and costs
 * zero tokens. Anything measurable gets measured; AI explains what was
 * measured." So an AI-layer prompt is never asked to *find* anything. It is
 * given findings that were measured and asked to explain, prioritise, and relate
 * them — which is the work a model is actually good at, and the work the code
 * layer cannot do.
 *
 * That constraint is not politeness. FR-032 and SC-006 require every finding to
 * carry an attribution, and the runner assigns AI_JUDGMENT to everything from
 * this layer precisely because a model cannot be trusted to say what it
 * measured. A prompt that invited new findings would produce AI_JUDGMENT rows
 * that read like measurements, and the report's central promise — that the user
 * can tell what we checked from what we think — would be gone.
 *
 * Three further rules, each earned:
 *
 *   - **Never restate a finding as a new one.** Two rows for one defect makes the
 *     fixes board lie about how much work is left.
 *   - **Say when there is nothing to add.** A model asked for insight will
 *     produce insight; an empty array has to be an acceptable answer or every
 *     clean area acquires filler.
 *   - **Placeholders are credentials.** `[[REDACTED:…]]` tokens appear where a
 *     secret was removed (R8). The model must reason about the *presence* of a
 *     credential without being asked to guess its value, and must never echo the
 *     placeholder as though it were the finding.
 */

import { z } from 'zod';
import type { ModuleType } from '@webaudit/types';

/**
 * Prepended to every module prompt.
 *
 * Deliberately short. A long preamble is the first thing that gets ignored, and
 * every sentence here is load-bearing.
 */
export const SHARED_PREAMBLE = [
  'You are reviewing an automated website audit. A code layer has already run and',
  'measured everything measurable; its findings are given to you below.',
  '',
  'Your job is to explain and prioritise what was measured. Specifically:',
  '',
  '- Do NOT report new defects. You cannot observe the site; you are reading',
  '  measurements. Anything you add is a judgement, is labelled as one, and must',
  '  be framed as one.',
  '- Do NOT restate a measured finding as your own. If you have nothing to add to',
  '  a finding, say nothing about it.',
  '- An empty response is a valid and often correct answer. Do not manufacture',
  '  observations to fill space.',
  '- Where you see a token of the form [[REDACTED:KIND:n]], a credential of that',
  '  kind was found in the source and removed before you saw it. Reason about the',
  '  fact that a credential is present at that location. Never speculate about its',
  '  value, and never quote the token as if it were the problem.',
  '- Write for the person who owns this site, not for an auditor. Say what breaks,',
  '  for whom, and what to do — in that order.',
  '- Never claim something was tested that is not in the measurements below.',
].join('\n');

/**
 * What every module's AI layer returns.
 *
 * `insights` rather than `findings`, and the name is the point: these are
 * judgements, and the runner stamps them AI_JUDGMENT. A field called `findings`
 * would invite exactly the confusion FR-032 exists to prevent.
 */
export const moduleInsightSchema = z.object({
  /** Two or three sentences a non-specialist can act on. */
  summary: z.string().min(1).max(2000),
  insights: z
    .array(
      z.object({
        /** Ties the judgement to a measured finding. Empty for a cross-cutting note. */
        relatesToCheckIds: z.array(z.string()).max(20),
        title: z.string().min(1).max(200),
        explanation: z.string().min(1).max(2000),
        /** What happens if this is left alone. The 'so what'. */
        consequence: z.string().min(1).max(1000),
        severity: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO']),
      }),
    )
    .max(25),
  /**
   * Ordered check ids, worst first. The model is better at relative ordering
   * than at absolute severity, so this is asked for separately and used to sort
   * rather than to re-score.
   */
  priorityOrder: z.array(z.string()).max(100),
});

export type ModuleInsight = z.infer<typeof moduleInsightSchema>;

export interface ModulePrompt {
  readonly module: ModuleType;
  readonly task: string;
  readonly systemPrompt: string;
  readonly responseSchema: typeof moduleInsightSchema;
  /** Declared so FR-082 can compare it against reality. */
  readonly estimatedTokens: number;
}

/** Assemble a module prompt from the shared rules plus an area-specific body. */
export function modulePromptFor(
  module: ModuleType,
  body: readonly string[],
  estimatedTokens: number,
): ModulePrompt {
  return {
    module,
    task: `module:${module.toLowerCase()}`,
    systemPrompt: [SHARED_PREAMBLE, '', `Area: ${module}.`, '', ...body].join('\n'),
    responseSchema: moduleInsightSchema,
    estimatedTokens,
  };
}
