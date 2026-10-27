# Contract: Mutation and Cleanup (Context M, class `C2 CONTROLLED_MUTATING`)

Per FR-006, FR-007, FR-011, FR-096, FR-117, FR-118, FR-119..FR-126, FR-123, FR-131, FR-135, FR-148, FR-161, FR-162, FR-166, FR-171, plan.md D8 and the Production Safety Matrix. The only place where a check may change state on a target: confined to a customer-registered `FixtureResource` on a non-production target, individually consented, write-ahead recorded, reversible, verified, and honest about residue. Executed inside E14 or E15 units using their per-request pipeline (`active-security-execution-contract.md`, `auth-workflow-execution-contract.md`); this contract adds only the mutation-specific rules and state machine. No new state, reason code or evidence kind is introduced here; remaining unresolved items are under "Open for closure".

## Status / Ownership

- Owning spec: 012, Context M, consumed by Contexts G (authorization mutation probes, FR-096) and I (business logic, FR-114..FR-118). Durable `MutationIntent` / `CleanupRecord` rows are 012 data-model entities (Postgres, tenant-scoped); the Evidence view is kind `CLEANUP_RECORD`.
- Status: planning contract, NOT frozen. Mutating tests are a PRODUCT DECISION - PROVISIONAL (P2): supported only on non-production targets, only against registered fixtures, **default OFF**. Gated by SG1, SG3, SG4, SG5, SG6, SG7, SG8, SG9, SG10.

## Consumers

- E14 and E15 unit hosts (execution), the security check dispatcher (reads `CLEANUP_RECORD` to enforce FR-123 and to attach cleanup state to findings), `securityCoverageSummary` (cleanup outcomes), the reverify resolver (fresh consent + fixture-state check), the customer UI/report (residual manifest), and the recovery path of a crashed unit (reads durable intents).

## Inputs

- A step/probe of classification `C2` (computed mechanically, FR-007; a probe with category `FIXTURE_MUTATE` or `cleanupRequirements` is `C2` regardless of HTTP method).
- **Per-mutation declaration** (FR-119), part of the registry's `cleanupRequirements`/workflow `MutationDeclaration`; the loader and `validateWorkflow` reject a `C2` step missing any field:

```text
MutationDeclaration = {
  authorization: { actionCategory: "FIXTURE_MUTATE", mutationClass, consentFlag },   // class vocabulary: Open for closure item 1
  fixtureRef: FixtureResourceId,           // identity of the fixture; locator from the fixture registry only
  expectedMutation: { effectClass, observableMarker },      // what must change, in verifiable terms
  maxMutationCount: int (<= 3 per fixture, <= 10 per unit),
  idempotencyIdentity: (planId, checkId, version, endpointIdentity, identityRef, probeIndex),
  cleanup: { method: "FIXTURE_CLEANUP_REQUEST" | "CUSTOMER_FIXTURE_RESET", request/reset ref, verification: ReadRef + expectedRestoredMarker },
  failureHandling: "RESIDUAL_MANIFEST",    // the only legal value
  retryBehavior: "NONE",                   // the only legal value
  residualSideEffects: SideEffect[],       // lockout|email|sms|state-change, customer-declared
  sandbox?: "SANDBOX_CONFIRMED"            // required for payment/refund/purchase/inventory/messaging endpoints (FR-117)
}
```

- Grant scope listing `FIXTURE_MUTATE` and `FIXTURE_CLEANUP` (a grant with an empty category list authorizes neither), per-mutation-class consent recorded as grant-scoped consent (default OFF), the fixture record (`FixtureResource`: owner identity, locator template, reset method, `maxMutations`, environment, tenant, `SANDBOX_CONFIRMED` flag), the unit's identity lease.

## Outputs

- Durable `MutationIntent` rows (Postgres, written through the engine's fenced writer) with the state machine below; `CLEANUP_RECORD` Evidence per intent at terminal state (or at residual determination); `AUTH_STATE_TRANSITION`/`HTTP_TRANSACTION` for each request via the normal pipeline.
- A **Residual Manifest** (a `CLEANUP_RECORD` with state `RESIDUAL`, one per unresolved intent) listing: `mutationIntentId`, `fixtureResourceId`, last confirmed state class, expected manual action (closed list `CUSTOMER_RESET_REQUIRED | MANUAL_DELETE | VERIFY_STATE | SESSION_UNCONFIRMED`), reason code, expected natural expiry for sessions.

## Operations

```text
declareMutation(step) -> MutationDeclaration | LoadError                  // registry load / validateWorkflow
reserveBudget(intent) -> OK | SEC_BUDGET_LOCAL_REQUESTS | SEC_BUDGET_LOCAL_MUTATIONS
recordIntent(intent, state) -> void                                       // through fenced writer: fence, claim (sec-evidence-write), write
performMutation(step, ctx) -> MutationResult                              // E14/E15 per-request pipeline, steps 1-10
performCleanup(intent, ctx) -> CleanupResult                              // FIXTURE_CLEANUP request or customer fixture-reset, + verification read
emitResidualManifest(intent, reasonCode) -> void
reconcileIntentsOnRecovery(executionUnitId) -> void                       // recovery/sweep path
```

### State machine (plan.md D8)

```text
state:        INTENDED -> SENT -> CONFIRMED | SENT_UNCONFIRMED        INTENDED -> ABANDONED (never sent, no residue)
cleanupState: NOT_REQUIRED -> PENDING (after CONFIRMED) -> REVERTED | RESIDUAL(residualReason)
              SENT_UNCONFIRMED -> RESIDUAL(SENT_UNCONFIRMED)         RESIDUAL -> ACKNOWLEDGED (customer-only, audited, FR-184)
```

The two columns are those of data-model 4.8 and plan D8; the earlier single-column spelling (`CLEANUP_PENDING`, `REVERTED`, `RESIDUAL` as intent states) is not used anywhere.

Transitions are compare-and-swap writes on the intent row (a lost race is a no-op); no transition leaves `ABANDONED`, `REVERTED` or `ACKNOWLEDGED`, and `RESIDUAL` leaves only to `ACKNOWLEDGED`; every transition is written before its next effect.

### `performMutation` ordered steps

1. **Pre-conditions (fail closed, no request, nothing written)**: workflow/registry declared the mutation (Inputs); `securityScopeGate` confirms `FIXTURE_MUTATE` is explicitly listed in the grant scope, the identity is in scope, and the mutation-class consent is ON (`SEC_ACTION_CATEGORY_NOT_GRANTED`, `SEC_IDENTITY_NOT_IN_SCOPE`, `SEC_CONSENT_MISSING`); the target environment is non-production and classified (`SEC_PRODUCTION_PROHIBITED`, `SEC_ENVIRONMENT_UNCLASSIFIED`); the fixture exists, belongs to the tenant and environment and passes validation (`SEC_FIXTURE_MISSING` -> `NOT_TESTED`; `SEC_FIXTURE_INVALID`); payment/refund/purchase/inventory/messaging endpoints require `SANDBOX_CONFIRMED` (else `SEC_MUTATION_NOT_PERMITTED`).
2. **Counters** (L10/FR-125/MA-06: the window is the scan plan, enforced by the database): the intent is inserted with `mutationOrdinal` = max+1 for `(fixtureResourceId, scanPlanId)`; a unique-index conflict (a sibling unit, E14 and E15, took the ordinal first) retries with the next ordinal, and an ordinal above the fixture's `maxMutations` (<= 3) or a per-unit count of 10 is refused: `SEC_BUDGET_LOCAL_MUTATIONS`. A read-then-insert count is not used, so no two sibling units can both pass a count of 2. An `ABANDONED` intent (never sent) keeps its ordinal, so the cap is conservative: it bounds intents, never fewer than mutations sent.
3. **Reserve budget**: `LocalBudget` holds back **3 request units per mutation** (the mutation, its cleanup and its verification read; L9/FR-121) from the unit's remaining request allowance and from the grant-ceiling headroom known to it; if the remainder after existing reservations is < 3: `SEC_BUDGET_LOCAL_REQUESTS`, no mutation. Time reserve: remaining unit time must cover the mutation plus cleanup plus verification.
4. **Per-request pipeline** (E14 contract): scope gate -> local pre-check -> pacing -> `safetyCheckpoint(consumes{request:true, concurrency:false}, call site FIXTURE_MUTATION)`. `STOP` -> no intent exists yet (see 5), mutation not sent, check `BLOCKED` with the F07 reason verbatim. A credentialed *crafted* mutating probe (e.g. an attempt to modify another identity's fixture, FR-096) runs in an E14 unit and is dual-class checkpointed (FR-161: primary `ACTIVE_SECURITY` `consumes{request:true}`, secondary `AUTHENTICATED_WORKFLOW` `consumes{false,false}`); either `STOP` aborts before any intent is written.
5. **Write-ahead intent** (after `PROCEED`, before the socket write): `recordIntent(INTENDED)` durable, then `recordIntent(SENT)` durable immediately before the send. Both go through the fenced wrapper ("fence first, claim second, write third"); a rejected write (unit terminal, deadline passed) aborts the mutation with nothing sent. Claim scope `sec-probe-attempt` on the mutation identity precedes both (duplicate suppression, below).
6. **Send** via `SecurityHttpClient` (cross-origin redirect never followed; a same-origin hop is followed only as a planned `REDIRECT_HOP` step of a declared `READ_ONLY` operation, FR-200(e), and is a separate request re-entering at step 4; a mutation step has no redirect hop). Response -> bounded read -> redact -> fenced `HTTP_TRANSACTION`.
7. **Outcome**: response observed and expected marker evaluated -> `CONFIRMED`. Transport error, timeout, abort, kill or process loss after `SENT` with no recorded response -> `SENT_UNCONFIRMED` (a late response after abort is neither trusted nor persisted).
8. After `CONFIRMED`, `cleanupState` moves `NOT_REQUIRED` -> `PENDING` at the end of the step's scenario (cleanups run in reverse order of mutations, one attempt each) or immediately if the scenario requires restoring before continuing.

### `performCleanup`

1. Pre-conditions: no stop is pending (host reads F07 stop state via the lightweight sub-check) and the deadline has not passed; otherwise **do not attempt cleanup** (below, hard rule) and go to `emitResidualManifest`.
2. Method `FIXTURE_CLEANUP_REQUEST`: the declared inverse request is a step of the unit's parent-rendered `PlanStepTable` (FR-200; the child cannot add or alter it) built from the fixture registry; run the full pipeline with category `FIXTURE_CLEANUP` and call site `FIXTURE_CLEANUP` (own scope gate, local pre-check, checkpoint `PROCEED`, own claim); it draws from the reserved unit. Method `CUSTOMER_FIXTURE_RESET`: the customer-declared reset endpoint/mechanism registered on the `FixtureResource` is invoked through the same pipeline (it is still a request and still F01/F07-admitted); if the reset mechanism is not a Fahes-callable request (a manual customer action), the intent goes straight to `RESIDUAL` with `CUSTOMER_RESET_REQUIRED`.
3. **Verification read**: a read request (`READ`, `HTTP_REQUEST` call site) of the fixture state, compared to `expectedRestoredMarker`. Restored -> `REVERTED`. Not restored, cleanup request returned an error, or no verification possible -> `RESIDUAL`.
4. No retry of the cleanup or verification request (`retryBehavior: NONE`; a failed cleanup is reported, not repeated).
5. If the unit's reserved budget cannot cover the verification read: record `SEC_CLEANUP_UNVERIFIED`; the intent's `cleanupState` is `RESIDUAL` (`PENDING` -> `RESIDUAL`, `residualReason` `CLEANUP_UNVERIFIED`), never `REVERTED`. (L9: the reservation is 3 units, so this path occurs only when another unit exhausted the grant-wide F07 budget.)

### Hard rule: no cleanup after a stop (FR-122)

After any F07 stop state (`REQUESTED | ACKNOWLEDGED | STOPPED`) for the unit, scan, grant, target, tenant or platform, or after grant revocation, `requestAdmission` refuses (`KILL_SWITCH_PENDING` or `REVOKED`) and the platform MUST NOT attempt out-of-band cleanup: no cleanup request, no verification read, no logout, no use of any other credential, direct database access, fixture-reset side channel or alternative route. This includes user cancellation (`USER_CANCELLATION` is an F07 stop; FR-171: the UI/report MUST warn before a customer cancels a scan that has mutated fixtures that residual fixture state may remain, U30 dependency) and environment reclassification to PRODUCTION (`ENVIRONMENT_RECLASSIFIED`). Instead:

1. An intent still `INTENDED` (never sent) becomes `ABANDONED` (no residue, no manifest entry); every intent that is `CONFIRMED` with `cleanupState` `PENDING`, or `SENT_UNCONFIRMED`, is closed by `emitResidualManifest`: `cleanupState` `RESIDUAL` with the closed `residualReason` (`ADMISSION_REFUSED`, `CLEANUP_UNVERIFIED` or `SENT_UNCONFIRMED`), `CLEANUP_RECORD` written through the fenced wrapper while the unit is still non-terminal as a best-effort; **the authoritative writer is the parent-side SECURITY module-result finalizer/sweeper (FR-162, L3)**, which writes the residual manifest (and `SESSION_UNCONFIRMED`) from durable `MutationIntent` rows for any unit that was stopped, killed, cancelled or expired. That write is parent-derived evidence, not unit-produced, therefore not subject to the unit fence; it is idempotent (`sec-evidence-write` claim) and never sends a request (`reconcileIntentsOnRecovery`).
2. The affected check is `INCONCLUSIVE` with `SEC_CLEANUP_UNVERIFIED` (cleanup never attempted) or `SEC_CLEANUP_FAILED` (cleanup attempted and failed), plus FLAG `SEC_RESIDUAL_FIXTURE`; `SENT_UNCONFIRMED` adds FLAG `SEC_MUTATION_SENT_UNCONFIRMED`.
3. A deadline expiry (U-1) is not an F07 stop but is treated identically: the host terminates the child and attempts no cleanup after `now >= effectiveDeadlineAt` (liveness enforcement, not a safety trigger); cleanup is scheduled inside the unit's own time budget (reserve above) precisely so a healthy unit completes it before the deadline.

### Duplicate-mutation prevention after retry or recovery (FR-120, FR-148)

- Mutation identity = `(planId, checkId, checkVersion, endpointIdentity, identityRef, probeIndex)`; `IdempotentClaim` scope `sec-probe-attempt` plus a unique key on `MutationIntent`.
- Before any send, a recovered/redelivered unit reads the intent for the identity: `INTENDED` with no `SENT` = provably not sent (SENT is durable before the socket write), but it is still never resumed: `maxAttempts: 1` means no new attempt exists, and a redelivered job of the same attempt finds the claim held or the unit terminal (no-op); an `IdempotentClaim` with no `resultRef` older than `timeoutPolicyMs + hardStopMarginMs` is stale and re-claimable only by a conditional `UPDATE`, and stale-claim recovery never re-sends an intent that is `SENT` or later (FR-166); `SENT` or later (`SENT`, `CONFIRMED`, `SENT_UNCONFIRMED`, with any `cleanupState`) = never re-send.
- Request-level retries of a mutating request are forbidden (FR-057); the registry rejects `idempotent: true` on `C2`.
- The per-fixture cap is the unique `mutationOrdinal` and the per-unit count is read from durable intents, so retries, sibling units and recovery cannot exceed 3 per fixture (per scan plan) or 10 per unit (MA-06).

## Invariants

1. A `C2` request is sent only after: gate with `FIXTURE_MUTATE` explicitly granted, consent ON, checkpoint `PROCEED`, durable `INTENDED` and durable `SENT`.
2. At most 3 mutations per fixture per scan plan and 10 per unit; each reserves 3 request units (mutation, cleanup, verification read) before the mutation.
3. No mutation targets an identifier outside `FixtureResource.identifiers` (response-derived identifiers are never used, FR-092); no mutation targets PRODUCTION or unclassified targets.
4. Terminal states are `state` in {`CONFIRMED`, `SENT_UNCONFIRMED`, `ABANDONED`} combined with `cleanupState` in {`NOT_REQUIRED`, `REVERTED`, `RESIDUAL`, `ACKNOWLEDGED`}; `RESIDUAL` leaves only to `ACKNOWLEDGED`.
5. `REVERTED` is recorded only after a verification read confirms the expected restored marker.
6. After any F07 stop, grant revocation or deadline, zero cleanup/verification/logout requests are sent by Fahes.
7. A check with a `RESIDUAL` intent or unverified cleanup never yields `NO_ISSUE_DETECTED`; an existing `LIKELY`/`CONFIRMED` is kept with cleanup state attached.
8. Every unresolved intent yields exactly one `CLEANUP_RECORD` (`RESIDUAL`) with a closed manual-action value and closed reason.
9. No `CLEANUP_RECORD`, intent or log contains a credential, token, cookie value, target-side locator value or response body (only fixture ids, state classes, hashes/length classes).
10. A payment/refund/purchase/inventory/messaging endpoint is reachable only through a `SANDBOX_CONFIRMED` customer fixture mapping.
11. Mutation class consent defaults OFF; an absent or revoked consent blocks the step with zero requests.

## Safety & Authorization (F01 / F07 / production)

- **F01**: grant must list `ACTIVE_SECURITY` and/or `AUTHENTICATED_WORKFLOW` (non-production only; 007 FR-015a) and, in 012's scope semantics, `FIXTURE_MUTATE` (explicit) and `FIXTURE_CLEANUP`; ownership alone never authorizes a mutation (FR-005; Constitution X).
- **F07**: every mutation, cleanup and verification read passes its own `safetyCheckpoint` (call sites `FIXTURE_MUTATION`, `FIXTURE_CLEANUP`, `HTTP_REQUEST`); no `PROCEED` is reused; 5 s cadence while a step is in flight.
- **Production**: PRODUCTION is prohibited for every `C2` step at plan resolution, broker, gate and dispatch; a reclassification to PRODUCTION mid-run stops via F07 and triggers the no-cleanup rule; it is never healed (FR-014).
- **Admins**: an admin identity is a fixture owner only, never an attacker (FR-095). Fahes never creates fixtures implicitly: creation is itself a declared `FIXTURE_MUTATE` step with its own cleanup (FR-126).
- No customer code is executed; no AI participates in any mutation, cleanup or residual decision (FR-065, FR-144).

## Failure states

| Condition | Verdict | Reason code |
|---|---|---|
| Category `FIXTURE_MUTATE` not granted | `BLOCKED` | `SEC_ACTION_CATEGORY_NOT_GRANTED` |
| Mutation-class consent off | `BLOCKED` | `SEC_CONSENT_MISSING` |
| Identity not in grant scope | `BLOCKED` | `SEC_IDENTITY_NOT_IN_SCOPE` |
| Production / unclassified | `BLOCKED` | `SEC_PRODUCTION_PROHIBITED` / `SEC_ENVIRONMENT_UNCLASSIFIED` |
| No fixture registered | `NOT_TESTED` | `SEC_FIXTURE_MISSING` |
| Fixture invalid / not sandbox-confirmed endpoint | `BLOCKED` | `SEC_FIXTURE_INVALID` / `SEC_MUTATION_NOT_PERMITTED` |
| Mutation count or request reserve exhausted | `BLOCKED` | `SEC_BUDGET_LOCAL_MUTATIONS` / `SEC_BUDGET_LOCAL_REQUESTS` |
| Checkpoint `STOP` before send | `BLOCKED` | verbatim F07/F01 reason |
| Mutation sent, no response recorded (crash/kill/timeout) | `INCONCLUSIVE` + FLAG | `SEC_MUTATION_SENT_UNCONFIRMED`, `SEC_RESIDUAL_FIXTURE` |
| Cleanup request failed / fixture not restored | `INCONCLUSIVE` | `SEC_CLEANUP_FAILED` + FLAG `SEC_RESIDUAL_FIXTURE` |
| Cleanup not attempted (stop, revocation, deadline) or verification impossible | `INCONCLUSIVE` | `SEC_CLEANUP_UNVERIFIED` + FLAG `SEC_RESIDUAL_FIXTURE` |
| Cleanup refused by admission | `INCONCLUSIVE` | `SEC_CLEANUP_UNVERIFIED` (the F07 reason `KILL_SWITCH_PENDING`/`REVOKED`/`EXPIRED` recorded verbatim in the manifest) |
| Insufficient identities/fixtures for the mutation test | `INCONCLUSIVE` | `SEC_FIXTURE_LIMITATION` |
| Fenced writer rejects an intent write (unit terminal / deadline) | mutation not sent | none new (unit's own terminal status stands) |

## Idempotency & retry

`sec-probe-attempt` claim + unique `MutationIntent` per mutation identity; `sec-evidence-write` per `CLEANUP_RECORD` (key `"${scanPlanId}:${executionUnitId}:${attempt}:CLEANUP_RECORD:${mutationIntentId}:${state}"`). No retry of mutation, cleanup or verification; no whole-unit retry (`maxAttempts: 1`). A redelivered job for a terminal unit is a no-op (009 runtime boundary rule 4). Recovery never re-sends a `SENT` intent and never obtains a second lease for the same attempt.

## Evidence

`CLEANUP_RECORD { mutationIntentId, fixtureResourceId, mutationClass, state, stateHistory[(state, at)], requestsReserved, requestsUsed, verification: {performed, restoredMarkerObserved}, reasonCode?, expectedManualAction?, residualSideEffects[], sessionUnconfirmed?: {expectedNaturalExpiry}, customerAssertedFixtureSafety: boolean }`. Written through the fenced wrapper for in-unit states; parent-side reconstruction for crashed units. Redacted by the value-aware redactor (FR-127). Reports always state "customer-asserted fixture safety" for sandbox endpoints and "requests in flight may complete remotely; cancellation does not reverse issued requests" (FR-124).

## Budgets / limits

- **F07-authoritative**: request count (each mutation = mutation request + cleanup request + verification read, all ledgered), concurrency, grant expiry. Class ceilings: <= 300 requests/unit (E14), <= 150 (E15).
- **LOCAL - not F07-ledgered**: mutations <= 3 per fixture (per scan plan), <= 10 per unit; retries 0; 3 request units reserved per mutation before sending (reservation is local accounting; F07 has no reservation primitive); cleanup/verification time reserve inside `timeoutPolicyMs`; inter-request delay 500 ms (`C3`); duplicate-action/idempotency repeats <= 3, sequential (FR-118). Mutation-class consent default OFF.

## Reverify

Mutating reverify resolves a fresh minimal plan (FR-151/FR-152) and requires: **current** per-class consent (prior consent is not reused), a fresh F01/F07 admission, a fresh lease, a fixture-state read before any mutation (a fixture not in its declared baseline state -> `INCONCLUSIVE` `SEC_FIXTURE_LIMITATION`, see Open for closure item 3), mutation budgets re-applied from zero for the new plan, and the same cleanup obligations. Previous `CLEANUP_RECORD`s are preserved, never overwritten. A reverify that cannot execute yields `INCONCLUSIVE` `SEC_REVERIFY_UNVERIFIABLE`, never `PASSED`; it maps to Issue state `UNVERIFIABLE` (FR-164).

## Boundary rules (MUST NOT)

1. MUST NOT send a mutating request without durable `INTENDED` and `SENT` intents written through the fenced writer.
2. MUST NOT mutate any resource not registered as a fixture, enumerate or guess identifiers, or mutate PRODUCTION/unclassified targets.
3. MUST NOT attempt cleanup, verification, logout or any out-of-band reversal after an F07 stop, grant revocation, environment reclassification or deadline.
4. MUST NOT retry a mutation, cleanup or verification request, and MUST NOT re-send a `SENT` intent after recovery.
5. MUST NOT exceed 3 mutations per fixture or 10 per unit, or start a mutation without its 3-unit reservation.
6. MUST NOT mark a check `NO_ISSUE_DETECTED` when cleanup failed, was not attempted or is unverified; MUST NOT record `REVERTED` without a verification read.
7. MUST NOT perform real payments, refunds, purchases, inventory changes or messages to real recipients; such endpoints are reachable only via `SANDBOX_CONFIRMED` customer fixture endpoints.
8. MUST NOT treat a workflow's "test" label as authorization; each mutation independently satisfies F01 + F07 + consent.
9. MUST NOT enable any mutation class by default or infer consent from a grant that lists `FIXTURE_MUTATE`.
10. MUST NOT persist credentials, tokens, bodies or target-side locator values in intents, evidence or logs.
11. MUST NOT claim cancellation reversed an issued request.
12. MUST NOT use an admin identity as an attacker or create fixtures implicitly.

## Named limitations

- **Customer-asserted fixture safety**: Fahes cannot verify that a `SANDBOX_CONFIRMED` payment/messaging endpoint is truly a sandbox; the report says so.
- Requests in flight at kill/cancel may complete remotely (008 FR-014); a `SENT_UNCONFIRMED` mutation may or may not have changed the fixture; the manifest asks for customer verification.
- No cleanup after a stop means user cancellation and safety stops can leave residue; this is the safe direction by design.
- The 3-unit reservation is local: another unit consuming the grant-wide F07 request budget can still cause a later cleanup refusal (`BUDGET_EXHAUSTED_REQUEST` -> `RESIDUAL`).
- A cleanup that succeeds but changes unobserved state (side effects outside the verification read) is undetectable.
- Fahes verifies restoration only by the declared verification read; a customer reset performed manually is unverifiable by Fahes.
- Mutation-class vocabulary and baseline-state checks depend on customer-declared fixtures.

## FR traceability

FR-006, FR-007 (class C2 mechanical); FR-011 (`FIXTURE_MUTATE`/`FIXTURE_CLEANUP`); FR-096 (mutating authorization probes); FR-114..FR-118 (logic workflows, sandbox fixtures, bounded repeats); FR-119 (declaration fields); FR-120 (write-ahead intent, recovery); FR-121 (cleanup request, 3 units, verification read); FR-122 (no cleanup after stop, Residual Manifest); FR-123 (never `NO_ISSUE_DETECTED` after failed cleanup); FR-124 (cancellation does not reverse); FR-125 (limits, consent OFF); FR-126 (fixture records, no implicit creation); FR-131 (no values in evidence); FR-135, FR-148 (idempotent writes, probe identity); FR-151, FR-152 (reverify); FR-057 (no retry); FR-161 (dual-class checkpointing of credentialed crafted mutating probes); FR-162 (residual manifest by the parent finalizer); FR-166 (claim staleness); FR-171 (cancellation residue warning); FR-164 (reverify INCONCLUSIVE to Issue UNVERIFIABLE).

## Acceptance tests required (deterministic, fixture-based; not executed in planning)

- `T-MUT-consent-default-off`: a `C2` step with `FIXTURE_MUTATE` listed but consent OFF sends zero requests, `SEC_CONSENT_MISSING`; with the category unlisted, `SEC_ACTION_CATEGORY_NOT_GRANTED`.
- `T-MUT-write-ahead-order`: spy asserts `INTENDED` durable, then `SENT` durable, then socket write; a fenced-writer rejection yields zero sends.
- `T-MUT-duplicate-after-retry`: simulated redelivery/recovery with a `SENT` intent re-sends nothing; `SEC_MUTATION_SENT_UNCONFIRMED` + residual manifest.
- `T-MUT-crash-after-send`: process killed after `SENT` before response -> `SENT_UNCONFIRMED` -> `RESIDUAL`, check `INCONCLUSIVE`, no retry.
- `T-MUT-cleanup-verified`: fixture shop; mutation then cleanup then verification read -> `REVERTED`; verification mismatch -> `RESIDUAL`, `SEC_CLEANUP_FAILED`, never `NO_ISSUE_DETECTED`.
- `T-MUT-no-cleanup-after-stop`: kill switch, user cancel, grant revocation and `ENVIRONMENT_RECLASSIFIED` each lead to zero further requests (cleanup, read, logout) and a `RESIDUAL` `CLEANUP_RECORD` with `SEC_CLEANUP_UNVERIFIED`.
- `T-MUT-no-cleanup-after-deadline`: host expiry ends without cleanup and the manifest is reconstructed from durable intents.
- `T-MUT-limits-durable`: a 4th mutation on one fixture across two units is refused `SEC_BUDGET_LOCAL_MUTATIONS`; an 11th in a unit likewise.
- `T-MUT-reservation`: with fewer than 3 request units remaining the mutation is refused `SEC_BUDGET_LOCAL_REQUESTS`; reservation is held during the step.
- `T-MUT-fixture-only-identifiers`: a response id outside the fixture namespace is not used; a probe with a non-fixture identifier is refused at load.
- `T-MUT-payment-endpoint`: a payment endpoint without `SANDBOX_CONFIRMED` is `SEC_MUTATION_NOT_PERMITTED`; with it, the report carries "customer-asserted fixture safety".
- `T-MUT-finding-keeps-cleanup-state`: a `LIKELY` finding from a step with failed cleanup is kept with cleanup state attached.
- `T-MUT-reverify-fresh-consent`: reverify with revoked consent -> `INCONCLUSIVE` `SEC_REVERIFY_UNVERIFIABLE`; mutation budgets restart; old records preserved.
- `T-MUT-production-refusal`: PRODUCTION and unclassified targets refuse every `C2` step at plan, broker, gate and dispatch.

## Resolved additions

- Item 2 (2 vs 3 reserved units) -> L9/FR-121: 3 request units per mutation (action, cleanup, verification read), local accounting. Applied in step 3, invariants, budgets and boundary rules.
- Item 4 (who emits the manifest for a crashed/expired unit) -> L3/FR-162: the parent-side finalizer/sweeper writes residual manifests and `SESSION_UNCONFIRMED` from durable `MutationIntent`; not unit-produced, not unit-fenced, idempotent, no requests. Applied in the no-cleanup rule.
- Item 6 (mutation-count window) -> L10/FR-125: per scan plan from durable intents. Applied in step 2.
- Item 7 (user cancellation forbids cleanup) -> L29/FR-171: confirmed; UI/report warning required. Applied in the hard rule.
- L2/FR-161 (dual-class checkpoint of credentialed crafted mutating probes), L28, FR-166 applied above.

## Open for closure

No item is open. The mutation-class vocabulary, the `ABANDONED` state for an intent never sent, and `SEC_FIXTURE_LIMITATION` for a fixture not in its baseline state are decided in Consolidated repairs items 1, 2 and 5.

## Consolidated repairs (authoritative; third repair pass, 2026-10-14)

Single normative section replacing the earlier "Analyze and adversarial repairs" and "Blocker repairs B-1..B-13" addenda: superseded items were deleted, not overridden; retained items keep their original review labels. Requirements: spec FR-161..FR-201. Nothing here claims runtime feasibility; T650 and the other feasibility gates stay open.

1. **One vocabulary (F-2, F-4)**: cleanup methods `FIXTURE_CLEANUP_REQUEST | CUSTOMER_FIXTURE_RESET | MANUAL | NONE`; `state ∈ INTENDED|SENT|CONFIRMED|SENT_UNCONFIRMED|ABANDONED`; `cleanupState ∈ NOT_REQUIRED|PENDING|REVERTED|RESIDUAL|ACKNOWLEDGED`; `RESIDUAL` carries `residualReason ∈ CLEANUP_FAILED|CLEANUP_UNVERIFIED|ADMISSION_REFUSED|SENT_UNCONFIRMED|MANUAL_REQUIRED`. `INTENDED` is durable after checkpoint `PROCEED` and before sending; `SENT` is durable immediately before the socket write (resolves the D8 wording).
2. **Closed `mutationClass` vocabulary (resolves the open item)**: `CREATE_FIXTURE_RECORD`, `UPDATE_FIXTURE_RECORD`, `DELETE_FIXTURE_RECORD`, `STATE_TRANSITION_FIXTURE`, `DUPLICATE_ACTION_FIXTURE`. Consent per class is read from `SecurityConsentRecord` (FR-177).
3. **Sandbox tripwire (G-24, FR-117)**: sensitive-class workflows require per-run typed re-confirmation; any live-mode indicator in a response aborts with `SEC_MUTATION_NOT_PERMITTED`. Test `T-LOGIC-live-mode-abort`.
4. **Residual exit (G-35, FR-184)**: a customer-only audited `RESIDUAL -> ACKNOWLEDGED` transition; reverify cooldown and daily cap per issue sharing the identity's login window.
5. **Fixture not in baseline at reverify**: `SEC_FIXTURE_LIMITATION` (accepted working choice).
6. Sensitive-class (payment/refund/purchase/inventory/messaging) workflows: interactive typed re-confirmation recorded as `run.sensitive_confirmed` and checked at dispatch; non-interactive runs refuse (`SEC_CONSENT_MISSING`); the live-mode tripwire is a backstop with recall limits, not the control (FR-117).
7. **Mutation admission (FR-175, FR-190).** A mutation request frame is admitted only after the durable `SENT` acknowledgement and only while `FIXTURE_MUTATE` consent and the enablement are current; the Phase A..C order and fail-closed matrix apply to mutation and cleanup requests alike (a cleanup request after any stop is still refused); the child never holds a permit.
