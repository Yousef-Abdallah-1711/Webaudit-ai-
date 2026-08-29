/**
 * T115 — per-issue remediation prompt generation, run during `RUNNING_DOCS`.
 *
 * **Most of this task is already done, by `module-runner/attribute.ts`
 * (T090).** FR-051 requires "a self-contained remediation prompt that can be
 * acted on without reading the rest of the report" for *every* issue,
 * including a MEASURED one in an area whose AI layer never ran — so
 * `buildFixPrompt` generates one deterministically at persist time, from the
 * finding alone, before this phase ever runs. `Issue.fixPrompt` is a
 * required, non-nullable field precisely so that guarantee cannot be
 * deferred to a later, AI-dependent step.
 *
 * **What this phase does not yet do**: enrich an already-usable prompt with
 * cross-issue context (e.g. "three of these findings share one root cause,
 * fix the shared one first") the way the master report's `nextSteps` does
 * for the top-level narrative. No test in this sub-phase exercises that, and
 * every issue already satisfies FR-051/FR-052 without it — so `RUNNING_DOCS`
 * is currently a real, visited phase in the state machine (required by
 * `PHASE_ORDER`) that runs no additional work, rather than a phase built
 * ahead of any signal that would prove an enrichment pass correct. Recorded
 * here as the honest scope of T115, not hidden.
 */

export async function enrichFixPrompts(): Promise<void> {
  // Intentionally a no-op — see the module note.
}
