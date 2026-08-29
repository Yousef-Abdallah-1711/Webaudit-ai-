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
 * *except* UI, phase 2 runs UI alone (after the pause, once it is wired), and
 * phase 3 currently runs nothing — every other module type is covered by
 * phase 1, and `plan.md`'s stage numbering does not add a module that needs a
 * third slot until stage 10 (Performance/UI/Testing land after this vertical
 * slice). `RUNNING_PHASE_3` still exists in the state machine and is still
 * visited — it is a documented, honest gap, not a silent one: a future stage
 * may need it, and nothing here presumes what for.
 *
 * **The questionnaire pause itself is not wired by this vertical slice.**
 * `awaitQuestionnaire`/`resumeAfterQuestionnaire` (T096) already exist and
 * are already tested, but nothing yet calls `awaitQuestionnaire` from inside
 * the orchestrator's run loop — there are no UI capabilities yet (T119-124 is
 * SECURITY/SEO only; UI capabilities are stage 10) to signal "this scan's UI
 * module actually needs design intent", and asking unconditionally whenever
 * UI is merely *selected* would be inventing a trigger with no real signal
 * behind it. Full FR-040/041/042/043 wiring belongs to US6 (T194-201).
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
