/**
 * Which requested modules run in which of the three module-running phases.
 *
 * Shared between `apps/api` (`create-scan.ts` enqueues `RUNNING_PHASE_1`'s
 * subset when it creates a scan) and `apps/worker` (the orchestrator computes
 * each subsequent phase's subset from the scan's full `requestedModules`), so
 * it lives where both already depend on, the same reason `queues.ts` moved
 * here.
 *
 * **The split**: `UI` is the only module FR-040 gates behind the design-intent
 * questionnaire ("prompt the user for design intent before judging design"),
 * and `phases.ts`'s own transition table pauses between `RUNNING_PHASE_1` and
 * `RUNNING_PHASE_2` for exactly that reason. So phase 1 runs everything
 * *except* UI, phase 2 runs UI alone after the pause, and phase 3 currently
 * runs nothing — every other module type is covered by phase 1, and
 * `plan.md`'s stage numbering does not add a module that needs a third slot
 * until stage 10 (Performance/UI/Testing land after this vertical slice).
 * `RUNNING_PHASE_3` still exists in the state machine and is still visited —
 * it is a documented, honest gap, not a silent one: a future stage may need
 * it, and nothing here presumes what for.
 *
 * **The whole questionnaire path is wired (Phase 8, US6).**
 * `orchestrator.ts`'s walk-forward loop calls `awaitQuestionnaire` instead of
 * enqueueing `RUNNING_PHASE_2` whenever `modulesForPhase('RUNNING_PHASE_2',
 * ...)` includes `'UI'` — i.e. whenever UI was *selected*, unconditionally.
 * That is deliberately the whole trigger: UI capabilities exist now
 * (T136-142), and "the scan will judge design" is itself the real signal
 * FR-040 asks for, not some finer-grained per-capability need. Everything
 * downstream of it now exists too: the deadline-timeout handler
 * (`questionnaire-timeout-handler.ts`), the API routes to answer or skip
 * (`apps/api`'s `questionnaire.service.ts`), the `DesignIntent` write on both
 * of those paths, and the threading of the answers into
 * `CapabilityInput.designIntent` (`buildDesignIntentInput`).
 *
 * **One consequence of the split worth knowing.** A scan that requests `UI`
 * and nothing else resolves an empty phase-1 subset here, and `phaseJobSchema`
 * refuses a phase job with no modules (a phase with no areas would cost a
 * worker slot to measure nothing) — so `create-scan.ts`'s first-phase enqueue
 * has nothing legal to write for such a scan. UI is never offered alone in
 * practice today, and the fix is a decision about what a design-only audit
 * should do rather than a weakening of that schema guard; recorded here rather
 * than left to be discovered.
 */

import type { ModuleType, ScanState } from '@webaudit/types';

export function modulesForPhase(
  phase: ScanState,
  requested: readonly ModuleType[],
): readonly ModuleType[] {
  switch (phase) {
    case 'RUNNING_PHASE_1':
      return requested.filter((m) => m !== 'UI');
    case 'RUNNING_PHASE_2':
      return requested.filter((m) => m === 'UI');
    default:
      return [];
  }
}
