/**
 * T083 — the master report. The one prompt that sees every area at once.
 *
 * This is the prompt whose output the user reads first, and the one where the
 * product's whole claim is either kept or lost. Three constraints shape it.
 *
 * **It must not average.** The overall score is computed, not judged, and an
 * area that did not complete carries a null score that is excluded rather than
 * treated as zero (FR-053). A model asked to "give an overall impression" will
 * quietly average what it sees, including the gaps, and produce a number that
 * disagrees with the one on the page.
 *
 * **It must name what was not checked.** An area can be DEGRADED because no
 * provider was reachable (FR-035), NOT_APPLICABLE because a check needed source
 * that was not attached (FR-021), or unavailable pending verification because
 * the target's control level was too low (FR-017, US1 scenario 8). All three look
 * identical to a user who is only shown the findings that exist — and a report
 * that silently omits an area is the failure this product is supposed to be the
 * cure for.
 *
 * **It must not invent a plan.** The fixes board is built from measured findings
 * with stable fingerprints (R3), and re-verification routes by `checkId`
 * (FR-059). A recommendation with no `checkId` behind it cannot be verified,
 * cannot be marked fixed, and cannot turn green — so it has no place in the
 * sequence a user is asked to work through.
 */

import { z } from 'zod';
import { SHARED_PREAMBLE } from './shared.js';

export const masterReportSchema = z.object({
  /** The paragraph at the top of the report. Plain language, no jargon. */
  headline: z.string().min(1).max(600),
  /**
   * What to do first, and why. Ordered.
   *
   * Every entry cites the check it came from: an item with no `checkId` cannot
   * be re-verified, so it cannot be part of the red-to-green path.
   */
  nextSteps: z
    .array(
      z.object({
        checkId: z.string().min(1),
        module: z.enum(['PERFORMANCE', 'SECURITY', 'UI', 'TESTING', 'SEO']),
        action: z.string().min(1).max(500),
        reason: z.string().min(1).max(500),
      }),
    )
    .max(15),
  /** Themes that cut across areas — the thing no single module can see. */
  crossCuttingThemes: z
    .array(
      z.object({
        theme: z.string().min(1).max(200),
        modules: z.array(z.enum(['PERFORMANCE', 'SECURITY', 'UI', 'TESTING', 'SEO'])).min(2),
        explanation: z.string().min(1).max(1500),
      }),
    )
    .max(6),
  /**
   * Areas the audit could not fully cover, and why, in the user's words.
   * Required, and an empty array is a claim that everything was covered.
   */
  coverageGaps: z
    .array(
      z.object({
        module: z.enum(['PERFORMANCE', 'SECURITY', 'UI', 'TESTING', 'SEO']),
        reason: z.string().min(1).max(500),
      }),
    )
    .max(10),
});

export type MasterReport = z.infer<typeof masterReportSchema>;

export const masterReportPrompt = {
  task: 'master-report',
  responseSchema: masterReportSchema,
  estimatedTokens: 8000,
  systemPrompt: [
    SHARED_PREAMBLE,
    '',
    'You are writing the summary that appears at the top of the whole report. You',
    'are given every area: its state, its score where it has one, its measured',
    'findings, and the AI-layer insights for each.',
    '',
    'What is useful from you here:',
    '',
    '- Write the headline for someone who has thirty seconds and did not ask for a',
    '  lecture. What is the most important thing about this site right now.',
    '- Do NOT compute or estimate an overall score. It is calculated from the areas',
    '  that completed, and areas that did not complete are excluded rather than',
    '  scored zero. If you produce a number it will contradict the one on the page.',
    '- Every next step must cite the checkId it came from. A recommendation with no',
    '  check behind it cannot be verified and cannot be marked fixed, so it cannot',
    '  be part of the path from red to green. If you want to say something with no',
    '  check behind it, put it in a cross-cutting theme instead.',
    '- Order next steps by what unblocks the most, not by severity alone. Fixing',
    '  one build configuration often clears findings in three areas; say so when',
    '  it does.',
    '- coverageGaps is not optional politeness. For every area that is DEGRADED,',
    '  NOT_APPLICABLE, or blocked pending verification, say so in one plain',
    '  sentence and say what would change it — attach the source, verify control of',
    '  the domain, answer the design questions. An empty coverageGaps array asserts',
    '  that the audit covered everything, so only return one when that is true.',
    '- Do not congratulate. If the site is in good shape, say which two things are',
    '  still worth doing and stop.',
  ].join('\n'),
} as const;
