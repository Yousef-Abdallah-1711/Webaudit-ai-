# Closure and Freeze Review — SPEC 011 (2026-10-10)

Outcome: **FROZEN** (planning contract). Activation of SOURCE_EXECUTION remains gated (AG1-AG10).

## Method
Mechanical checks (FR 158/158 mapped, 347 tasks, registry parity 83/83, stale-number grep); independent recomputation of the U-1 deadline formula with a 200k-trial worst-case simulation (0 violations); fixtures on real npm v3 / pnpm 9.0 / yarn classic v1 lockfiles; two independent read-only reviews by reviewers without access to earlier verdicts.

## Arithmetic (recomputed)
13 lifecycle phases = 30+30+10+120+30+1500+60+120+30+60+30+10 s = 2030 s -> timeoutPolicyMs 2 030 000 ms. unitBudgetMs = 1 x (2 030 000 + 300 000 + 60 000) = 2 390 000. dispatchThresholdMs = 2 030 000 + 300 000 = 2 330 000 (difference = queueWaitAllowanceMs 60 000, spent before step 0). Four chained units: 900 000 + 4 x 2 390 000 + 300 000 = 10 760 000 ms (2 h 59 min 20 s) < 6 h ceiling.

## Defects found and corrected
Timing sum under-declared (1 870 s vs 2 030 s); unitBudget retry formula; generic recordEvidence rejection would break post-termination coverage (fence moved to engine wrappers, fence-claim-write order); false 'two edges' claim (PLANNED->REFUSED, DISPATCHED->REFUSED); gate vs sweep CAS (atomic deadline predicate); lease released before Guest destroyed (onUnitExpired TERMINATED|PENDING); workspace selection undeterminable at resolution (executionWorkspaces fixed before detection); fail-open activation (signed expiring attestation, behavioral self-test, fake providers refused in production); registry gaps (83 codes); producer-COMPLETED PASS rule; consent and owner gates AG9/AG10; hard TTL absolute anchor; dead-man 15 s consistency; yarn/npm flags; stale counts and references.

## Independent review results
Review 1: DO NOT FREEZE (5 blockers: onUnitExpired semantics, evidence order, FR-152 task propagation, TTL anchor, T140 30 s) -> all fixed. Review 2: no blockers, 9 non-blocking wording items -> all fixed.

## Status of items
U-1: resolved and implemented as planning only (009 implementation tasks pending). U-2: interpreted against the exact 009 per-object and per-scan budgets (AG6). Provisional product decisions P1-P8 remain UNCONFIRMED by the owner; they are defaults with documented amendment paths, not blockers (AG8). Remaining gates: AG1-AG10.
