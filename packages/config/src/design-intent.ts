/**
 * FR-040/041 — the mid-audit design-intent questionnaire (US6, T194-201).
 *
 * `awaitQuestionnaire` (`apps/worker/src/orchestrator/phases.ts`, T096) already
 * knows how to pause a scan without holding a worker slot; it just needs a
 * waiting period and a question set to pause *with*. Both live here rather than
 * at the call site because they are user-facing values a later change should
 * not have to go hunting through the orchestrator to find.
 *
 * The question shape below is a plain structural type matching
 * `AwaitQuestionnaireInput['questions']` in
 * `apps/worker/src/orchestrator/phases.ts`, duplicated rather than imported:
 * `packages/config` is a dependency of `apps/worker`, not the other way
 * around, so importing from it would be a cycle. TypeScript's structural
 * typing means `DESIGN_INTENT_QUESTIONS` still satisfies that field's type at
 * the call site without either module naming the other.
 */

interface DesignIntentQuestion {
  readonly id: string;
  readonly prompt: string;
  readonly kind: 'text' | 'choice' | 'colors';
  readonly choices?: readonly string[];
}

/**
 * FR-041's published waiting period: how long `AWAITING_QUESTIONNAIRE` holds a
 * scan before the delayed job in `awaitQuestionnaire` resumes it with
 * `DEFAULTED`. **The specification does not state a number** — spec.md and
 * research.md describe "a published waiting period" and "the questionnaire
 * waits up to ten minutes for a human" without fixing the figure — so this is
 * an engineering default pending a product decision, the same status as
 * `CONTROL_GATE.level1ProbeRate` in `constants.ts`. It is placed here, not
 * inlined at the call site, because a wait hidden in code is not "published."
 *
 * Ten minutes is long enough that a user who switched tabs to think about
 * brand colours is not punished, short enough that a worker slot is never at
 * risk (`awaitQuestionnaire`'s own module note: the wait is a DB row plus a
 * delayed job, not a held slot, so this number bounds user-visible latency,
 * not queue capacity).
 */
export const DESIGN_INTENT_WAIT_MS = 600_000;

/**
 * The four questions asked while `RUNNING_PHASE_1` is paused, one per
 * `DesignIntent` field (`apps/api/prisma/schema.prisma`). The `id`s are the
 * contract a later task (T199/T200) uses to map answers back onto that model
 * — do not change them without updating that mapping.
 */
export const DESIGN_INTENT_QUESTIONS: readonly DesignIntentQuestion[] = [
  {
    id: 'audience',
    prompt: 'Who is the primary audience for this site?',
    kind: 'text',
  },
  {
    id: 'stylePreference',
    prompt: 'Which visual style best matches the brand you want?',
    kind: 'choice',
    choices: ['Minimal', 'Bold', 'Playful', 'Corporate', 'Elegant'],
  },
  {
    id: 'admiredReferences',
    prompt:
      'Are there other sites whose design you admire? List one or more, separated by commas.',
    kind: 'text',
  },
  {
    id: 'brandColors',
    prompt: 'What are your brand colours?',
    kind: 'colors',
  },
] as const;
