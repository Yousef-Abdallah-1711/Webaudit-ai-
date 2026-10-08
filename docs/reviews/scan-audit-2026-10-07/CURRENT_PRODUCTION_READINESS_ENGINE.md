# Current Production Readiness Engine

Read-only audit, 2026-10-07. (Full pipeline context: see `CURRENT_SCAN_ARCHITECTURE.md` SS9; this
document isolates the readiness engine specifically, with the algorithm spelled out as
inputs/rules/outputs per the audit brief's request.)

## Creation precondition

A readiness pass is a fresh `READINESS`-kind `Scan` tied to a completed `INITIAL` baseline via
`Scan.baselineScanId`. `createReadinessScan` (`apps/api/src/services/readiness/create.ts`) refuses
to start if: the requesting user does not own the baseline scan; the user's plan does not permit
readiness; or the baseline still has outstanding CRITICAL/HIGH issues (`countOutstandingBlocking`).
This last rule means readiness is gated on the fix loop having actually resolved blocking issues
first — it is not simply "run the audit again."

## Algorithm

**INPUTS**: the fresh audit's per-module `AreaSnapshot[]` (module / `ModuleState` / score) and the
same shape read from the baseline scan; both scans' `Issue[]` (fingerprint / severity / title /
state).

**RULES**:
- Per-module thresholds are published config constants, not DB rows, not an LLM judgment:
  `READINESS_THRESHOLDS = { PERFORMANCE: 80, SECURITY: 80, UI: 70, TESTING: 75, SEO: 70 }`
  (`packages/config/src/constants.ts`).
- A module **passes** iff `score !== null && score >= threshold`.
- Three named regression kinds (`diffAgainstBaseline`, `apps/worker/src/readiness/diff.ts`):
  1. **Area regression** — score fell by >= 3 points (`AREA_REGRESSION_MIN`), or the module's
     `ModuleState` rank degraded (e.g. `COMPLETE -> DEGRADED`, meaning the readiness pass measured
     *less* than the baseline did, which is itself treated as a regression of audit confidence).
  2. **Recurrence** — a fresh issue whose fingerprint was `RESOLVED` in the baseline (a verified fix
     came back).
  3. **New blocker** — a fresh CRITICAL/HIGH issue whose fingerprint is absent from the baseline
     entirely. This is genuinely open-ended: it is a fingerprint-presence check, not a lookup against
     a fixed enum of previously-known finding categories, so a *new kind* of problem that was never
     seen in the baseline is still caught.
- Regressions are blockers even for a module that is otherwise above its own threshold — the spec
  requires threshold-pass **and** zero regressions for a "go," not either alone.

**OUTPUTS**: `isReady: boolean` (`blockers.length === 0`); `overallScore: number` (never null for a
verdict — "the audit measured nothing" becomes 0 plus an explicit blocker, never an absent number);
`moduleOutcomes[]` (module / score / threshold / pass, one entry per module always); `blockers:
string[]` (every failing threshold and every regression, named in plain language, e.g. "Security
scored 62 against an 80 threshold" or "Design regressed: score fell from 88 to 71").

## Is readiness hardcoded, config-driven, DB-driven, or rule-engine-driven?

Config-driven constants (`packages/config/src/constants.ts`) consumed by a pure, directly testable
TypeScript function (`computeVerdict`). Not a database table of rules, not an LLM decision, not a
DSL-based rule engine.

## Can future scanner domains plug into this cleanly?

The aggregation logic (`computeVerdict`, `diffAgainstBaseline`) is generic over `ModuleType` and
`AreaSnapshot` and does not need to change shape to add a module. What *does* need to change: the
`ModuleType` union itself is closed (`packages/types/src/domain.ts:16`, currently 5 members), and
`READINESS_THRESHOLDS`, `AREA_COST`, and `MODULE_LABEL` (duplicated between `verdict.ts` and
`diff.ts`) all reference every member by name. Adding a sixth domain is mechanical — touches roughly
five files — not a rewrite of the readiness engine itself. CONFIDENCE: HIGH.

## Baseline / regression model summary

Identity across audits is the R3 fingerprint, computed by each capability from its own
`fingerprintParts` — the same identity mechanism reverify depends on (see
`CURRENT_SCAN_ARCHITECTURE.md` SS10). This is what makes "a verified fix came back" detectable at
all: without a stable cross-scan identity, a reappearing problem would look like an unrelated new
finding. The readiness engine can genuinely detect new vulnerability/regression *categories* it has
never seen before (via the fingerprint-absence rule), not only regressions within a fixed set of
known checks — this is a real strength worth preserving in any future redesign.
