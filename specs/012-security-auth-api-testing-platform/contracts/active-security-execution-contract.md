# Contract: Active Security Execution (Engine E14, class `ACTIVE_SECURITY`)

Per FR-003, FR-004, FR-007, FR-012, FR-053..FR-061, FR-065..FR-085, FR-105..FR-110, FR-127..FR-135, FR-148, FR-161, FR-162, FR-166, FR-171. How E14 hosts one `ACTIVE_SECURITY` `ExecutionUnit`: dispatch, the invariant per-request pipeline, the `SecurityHttpClient`, the unit-consumption policy required by 008 FR-019, budgets, pacing, retry, timing, U-1 obligations, failure classification and cancellation. Composes 009 `execution-runtime-contract.md`, 008 `safety-checkpoint-contract.md`, 009 `scan-deadline-contract.md` (U-1, uncommitted working-tree text) and `runtime-finalization-contract.md`; introduces no scheduler, budget ledger, kill switch, authorization service or evidence store.

## Status / Ownership

- Owning spec: 012, Context E (E14, `engineId` family `security.active.*`). Code: `apps/worker/src/security/` (unit host), `packages/security-engine/` (`SecurityHttpClient` wrapper, `LocalBudget`, scope gate, fenced writer), `packages/safe-net/` (client door). Nothing is created by this planning pass.
- Status: planning contract, NOT frozen. Activation gated by SG1, SG4, SG5, SG6, SG7, SG10 and flag `FAHES_SECURITY_ACTIVE` (default off) plus tenant allowlist.
- Class contract fill: plan.md "Execution Class: ACTIVE_SECURITY" (18 fields) is authoritative; this document is its operational realization and does not alter it.

## Consumers

- 009 `resolvePlan` (unit templates, `timeoutPolicyMs`, `hardStopMarginMs`), 009 dispatch worker (queue `webaudit-exec-active-security`), `computePlanDeadline` (reads `unitBudgetMs`), the security check dispatcher (`security-check-registry-contract.md`, consumes the Evidence this engine writes), `securityCoverageSummary`, and the reverify resolver (FR-151, re-runs one probe family in a fresh E14 unit).

## Inputs

- Queue payload: exactly `{ executionUnitId }` (009 execution-runtime-contract.md "Queue placement", rule 1). The worker re-reads the unit through `sec_peek_unit` before the claim and `sec_unit_context` after it (FR-201(j), data-model 4.10D), never by a direct table read.
- `ExecutionUnit.configuration`: `{ checks: [{ checkId, checkVersion, endpointIdentity, probeIndices[], identityRef? }], fixtureRefs[], localLimits (<= platform ceilings), x012: { inputs (the signed input manifest, FR-200a), unitMac (FR-173) } }`; no URL, header value, body, credential or token (only identifiers resolved against the registry and `API_SURFACE`/fixture records inside the trusted parent).
- `credentialBindingRef?` (opaque) when an identity is referenced (`auth-workflow-execution-contract.md` and the broker contract deliver the lease; E14 never reads the vault).
- Registry `ProbeDefinition`s (vendored, immutable per version), the grant's `scope` (accounts, roles, action categories) and the Target's current environment classification.

## Outputs

- Sanitized `HTTP_TRANSACTION` Evidence per request; `PERMISSION_COMPARISON` for a cross-identity probe; `CLEANUP_RECORD` for `C2` probes; `SECURITY_REPRODUCTION` only on a `CONFIRMED` verdict path (written by the evaluator's inputs, not by the engine's own judgement). No Findings, no verdicts (the registry decides; FR-064).
- Final `progressSnapshot` (counters only: planned/executed/blocked probes) written atomically in `finalizeExecutionUnit`.

## Operations

```text
dispatchActiveSecurityUnit(executionUnitId) -> void             // 009 worker handler on webaudit-exec-active-security
runActiveSecurityChild(unit, ipc) -> UnitOutcome                // child process; no DB connection, no KEK
sendProbeRequest(frame: StepFrame{stepId, credentialSlots[]}, ctx: UnitCtx) -> ProbeResult   // child: names a plan step only; the parent runs the per-request pipeline
class LocalBudget { reserve(req) -> OK | SEC_BUDGET_*; release(req); }  // atomic increment-and-check (FR-071)
class SecurityHttpClient { send(req, abortSignal) -> Response | TransportError }   // on @webaudit/safe-net
onUnitExpired(unit) -> TERMINATED | PENDING                     // 009 U-1 hook
```

### Dispatch and 009 integration (extends `dispatchExecutionUnit`)

1. Pickup: re-read unit, plan and scan from Postgres. Step 0 (U-1): scan terminal or `now >= effectiveDeadlineAt` -> `sec_refuse_unclaimed_unit(unitId, SCAN_DEADLINE_EXPIRED | SCAN_CANCELLED | SCAN_FAILED)`; remaining < `timeoutPolicyMs + hardStopMarginMs` -> `sec_refuse_unclaimed_unit(unitId, SCAN_DEADLINE_INSUFFICIENT)`; there is no claim yet, so the function re-evaluates the database predicate itself (data-model 4.10B tier U) and a denial leaves the unit `PLANNED` for a later claim or the orchestrator sweep (the host never picks the status or reason). No F07 call, no lease (scan-deadline-contract.md "Dispatch precondition").
2. Claim (FR-195, FR-201): `sec_claim_unit_host(unitId, attempt)` creates the `UnitDispatchRecord` and the `sec-unit-host` claim atomically **without changing the unit status** (a conflict => `SEC_UNIT_HOST_CONFLICT`, stop, never finalize; a unit whose class is outside the principal's registered `servedClasses` is refused by the function). Every refusal from here on is made as the claim owner through `sec_finalize_unit`; the guard refusals below have no worker-unforgeable predicate for an unclaimed unit, so they are never made without a claim.
3. Feature/gate/environment guard (as claim owner), then inputs (FR-013, FR-014, FR-078, FR-200): if `FAHES_SECURITY_ACTIVE` off or tenant not allowlisted -> `REFUSED` (through `sec_finalize_unit`, which applies 009's edge for the pickup status and carries the finalization semantics of FR-201(c)) with record `SEC_ENGINE_DISABLED`; if the Target's **current** environment is `PRODUCTION` -> `REFUSED` `SEC_PRODUCTION_PROHIBITED`; unclassified -> `REFUSED` `SEC_ENVIRONMENT_UNCLASSIFIED` (FR-013, FR-014, FR-078). F01 independently refuses the grant itself (007 FR-015a). Then verify the input manifest (content digest of every item recomputed over the raw bytes before any parser, `rootDigest` equal to the MAC-covered `inputsRootDigest`) and render and record the `PlanStepTable` (`sec_record_step_table`); any mismatch refuses the unit through `sec_finalize_unit(REFUSED, SEC_SCOPE_GATE_ERROR)` and zero F07 consumption.
4. Dispatch checkpoint (009 step 3) and the proofs: `safetyCheckpoint(executionId, targetId, userId, ACTIVE_SECURITY, WebDestination(origin of authorized Target), idempotencyKey, consumes{request:false, concurrency:true}, unitAbortController)`. `STOP` -> `sec_finalize_unit(REFUSED, reason)` with F07's reason verbatim (`NO_MATCHING_GRANT`, `REVOKED`, `EXPIRED`, `BUDGET_EXHAUSTED_CONCURRENCY`, `KILL_SWITCH_PENDING`, ...); **never `KILLED`**, because 009's table has `KILLED` only from `RUNNING` and maps a pre-run kill switch to `REFUSED(KILL_SWITCH_PENDING)`; the finalize applies the edge 009 defines for the status the unit holds at pickup (`PLANNED->REFUSED`, `ADMITTED->REFUSED` or `DISPATCHED->REFUSED`; 012 reads the pickup status and never assumes it; AR-18), releases any F07 lease, propagates `BLOCKED` to direct dependents and writes the final snapshot in one transaction; no process is forked. `PROCEED` -> `sec_transition_unit(PLANNED->ADMITTED)` when the unit is `PLANNED` (guarded by a live F07 `AdmissionLease`, FR-201(c)); nothing when it is already `ADMITTED` or `DISPATCHED`. Only then the fresh Verified Address Binding and Destination Authorization Policy (FR-172, FR-197); a refusal is `sec_finalize_unit(REFUSED, reason)` from the status held (which releases the lease taken at the checkpoint), never a bare transition.
5. `sec_transition_unit` `ADMITTED->DISPATCHED` (skipped when the unit is already `DISPATCHED`), fork the dedicated child (FR-053), `DISPATCHED->RUNNING` (CAS by the claim owner, FR-183); arm the parent-side unconditional `SIGKILL` at `timeoutPolicyMs + hardStopMarginMs` BEFORE any request (009 runtime boundary rule 3). Then, if `credentialBindingRef` is present, the parent requests the broker lease **after `RUNNING`** (broker contract; FR-032, FR-201f: the broker verifies `RUNNING`, the dispatch record and the authenticated principal), holds secret material in parent memory and hands it to the child over IPC. A broker denial calls `sec_finalize_unit(COMPLETED)` from `RUNNING` with every dependent check `BLOCKED` carrying the closed credential reason (`SEC_BROKER_UNAVAILABLE`, `SEC_BROKER_DENIED`, `SEC_CREDENTIAL_*`); the U-1 `DISPATCHED->REFUSED` edge is never used for this.
6. Host loop (parent, every <= 5 s): renew F07 lease via the periodic liveness `safetyCheckpoint` (`consumes{request:false, concurrency:false}`, L39; a stop-pending sub-check, not a ledgered action), re-validate broker lease liveness (FR-039), read `scan terminal OR now >= effectiveDeadlineAt` (database clock). On expiry/stop: abort `AbortSignal`, kill the child, run teardown, finalize per matrix. This is liveness enforcement, not an F07 trigger (U-1).
7. Child runs probes sequentially (default) or with in-flight <= 2 (class ceiling; one in-flight per endpoint+identity), each through `sendProbeRequest`.
8. Teardown and finalization (below, "U-1 obligations").

### The invariant per-request pipeline (FR-055; order never varies, no code path sends without all of it)

**Phase mapping (FR-190, authoritative)**: the step frame is resolved and rendered first (FR-200). Phase A (side-effect-free): step 2 and its dependencies (database clock, consent and `ActiveTestingEnablement`, exact-value registry, address pin, broker `getLeaseStatus`, kill-switch pending-stop read) and rate pacing (step 3). Phase B (releasable): the probe-attempt claim of step 1 (B0, taken here, not before Phase A; releasable by its owner before C1), the auth-attempt reservation (B1) and the local budget reserve (step 4, B2). Phase C: step 5 (C1, the F07 checkpoint) is the single irreversible step; then C2 `markAuthAttemptSent`, C3 the mutation `SENT` flush (step 6), C4 the parent gate's send (step 7). A failure in C2-C4 leaves the F07 unit spent without a send: a bounded, accounted loss (at most one unit per request, never auto-retried, counted as consumed locally, audited `request.admission.spent_unsent`, the check `BLOCKED` with the failing dependency's reason). A Phase A or B failure leaves F07 consumption unchanged and releases every reservation.

For each step frame `{stepId, credentialSlots[]}` from the child (FR-200; the parent assigns the ordinal): the **parent** resolves the immutable plan step from the `PlanStepTable` it rendered at unit start (from the MAC-covered configuration and the pinned registry; hostile input parsed only in the HostileTextExecutor), fills the slots itself (`CANARY`, `FIXTURE_IDENTIFIER`, `RESPONSE_DERIVED` (a token slot only, never a path position or an object identifier, MA-02) and `HOP_MATCHED` (cut by the parent matcher from the retained `Location`, restricted to plan-known identifiers) are parent-derived or parent-extracted from the retained response of the exact prior step; only `CREDENTIAL` values are accepted from the child, checked against the exact-value registry of the step's identity; FR-200), checks the step is an allowed successor within `maxExecutions` and renders the request from the step template; the child names no method, URL, header, body, category, identity or authorization context, and every input below (`identityRef`, `actionCategory`, destination, mutation class, fixture) comes from the step; a frame that fails any of these checks is refused with zero bytes on the wire (`SEC_EGRESS_PERMIT_INVALID`, detail `STEP_NOT_AUTHORIZED` or `SLOT_INVALID`). Destination is built only from authorized inputs (FR-079/FR-083):
1. **Claim probe attempt** (Phase B0 — taken after the Phase A reads and releasable by its owner before C1, FR-190): `IdempotentClaim` scope `sec-probe-attempt` (key in `security-check-registry-contract.md`), written through the fenced wrapper (fence, then claim). Claim already held with recorded result or `SENT` intent -> do not send (below, "Idempotency"). A claim with no `resultRef` older than this unit's `timeoutPolicyMs + hardStopMarginMs` is stale and re-claimable only by a conditional `UPDATE` (FR-166); stale-claim recovery never re-sends a probe whose durable intent is `SENT` or later.
2. **`securityScopeGate(identityRef, role, actionCategory, destination)`** (FR-012): fail closed; refuse an action category absent from the grant's listed categories (empty list authorizes `READ` and `NEGATIVE_PROBE` only; `FIXTURE_MUTATE` only if explicitly listed), an identity/role outside `includedAccountRefs/Roles`, a missing consent flag. A probe whose class the registry marks unsupported (C4/C5 entry, command/template/path-traversal/deserialization/NoSQL active probe, active rate-limit, fuzzing, timing-race) is never rendered: `UNSUPPORTED` `SEC_PROBE_CLASS_UNSUPPORTED`. Reasons: `SEC_ACTION_CATEGORY_NOT_GRANTED`, `SEC_IDENTITY_NOT_IN_SCOPE`, `SEC_CONSENT_MISSING`, `SEC_SCOPE_GATE_ERROR` (any thrown error). Also reject a render over `maxRequestBytes`/`maxHeaderCount` or a destination host outside authorized hosts (FR-067) -> `SEC_DESTINATION_PROHIBITED`.
3. **Rate pacing** (below): wait the per-host minimum inter-request delay (inside the 5 s cadence); honour endpoint pause from a prior 429.
4. **`LocalBudget.reserve`** (FR-070/FR-071, atomic; `release` on a request never sent): total requests, per-endpoint, per-identity, per-workflow, auth attempts, redirect depth, total bytes, duration, retries, mutations. Failure -> `BLOCKED` `SEC_BUDGET_LOCAL_*`; nothing sent; nothing counted at F07.
5. **`safetyCheckpoint(..., consumes{request:true, concurrency:false}, abortController)`** (the primary checkpoint under `ACTIVE_SECURITY`). `STOP` -> final for this call; abort; record the check `BLOCKED` with the F07 reason verbatim; no retry (008 checkpoint boundary rule 3). `PROCEED` -> grant id returned.
   **Dual-class rule (FR-161, L2)**: when the request carries a credential AND is crafted (a `NEGATIVE_PROBE` such as a cross-identity or authenticated validation-boundary probe), a **secondary class-qualified check** `safetyCheckpoint(..., AUTHENTICATED_WORKFLOW, consumes{request:false, concurrency:false}, abortController)` follows the primary one; the secondary check consumes nothing at F07 (the request is counted once, by the primary). Either `STOP` aborts the request with that F07 reason verbatim. The grant (one grant listing both classes, or two grants) MUST authorize both; plan resolution checks only the primary class, so a secondary-class refusal surfaces here at dispatch as `BLOCKED` (AR-10 RECOMMENDED). Credentialed requests with no crafted element are E15 requests with a single checkpoint (`auth-workflow-execution-contract.md`).
6. **Mutation intent** (only `C2`, see `mutation-cleanup-contract.md`): flush `INTENDED` then `SENT` write-ahead intent through the fenced writer BEFORE step 7; the intent carries 3 reserved request units (mutation, cleanup and verification read; local accounting, L9/FR-121).
7. **Send** via `SecurityHttpClient.send(req, AbortSignal)`, which emits a step reference frame to the parent (the child has no network path and never holds a permit; the gate serializes and sends, FR-199), where the signal is composed from the checkpoint's controller, the host loop's expiry controller and the per-request timeout. Cross-origin redirects are never followed; a same-origin redirect is followed only when the parent matches it to a planned `REDIRECT_HOP` step of a declared `READ_ONLY` operation (FR-200(e)), as a separate request that re-enters at step 2 (own checkpoint, own budget, full re-admission); any other `Location` is the observation `redirect_not_followed`.
8. **Bounded read**: stream the body up to the local read cap (default 256 KiB) and stop; record that truncation occurred; update total-byte counters.
9. **Redact, claim, write** (FR-127/FR-128/FR-135): register every secret in play and every newly issued token/`Set-Cookie` value with the exact-value redactor; apply structural header/cookie/query redaction, pattern/entropy detection, body minimization (shape/hash/length class, <= 600-char excerpts); on redaction failure write `{"_redactionFailed": true}` only (FR-129); then the fenced wrapper writes `HTTP_TRANSACTION` ("fence first, claim second, write third": reject if unit terminal, scan terminal or deadline passed; then claim `sec-evidence-write`; then write, all in one transaction).
10. Inspect for abort conditions (lockout signals, 429/`Retry-After`, out-of-scope redirect) and apply them (below).

### `SecurityHttpClient` requirements (FR-054; implementation tasks on safe-net, not a frozen-spec change)

1. Built on `@webaudit/safe-net`; never global `fetch`, never a second HTTP stack; layers 1-4 (scheme/host policy, DNS pinning, connect-guard, redirect re-validation) and sensitive-header stripping are retained unchanged. No 012 allow-list entry; `SAFE_NET_ALLOW_TARGETS` is never set outside tests (FR-079).
2. Additions: (a) multi-value response headers (needed for `Set-Cookie`), (b) per-request timing `{dnsMs, connectMs, ttfbMs, totalMs}` recorded as non-authoritative metadata only (FR-157), (c) an `AbortSignal` honoured during connect, headers and body read, (d) an option that **forbids automatic cross-origin redirect following** and returns the 3xx response for the engine to evaluate, (e) a streaming read with a byte cap.
3. `Authorization`, `Cookie` and custom auth headers are never forwarded off-origin (FR-081). The client holds no state between requests; session state is the `SessionHost`'s.
4. A transport error (timeout, reset, TLS error) is returned as a typed `TransportError`, recorded as evidence (FR-060); safe-net refusal -> `BLOCKED` `SEC_SAFE_NET_REFUSED`.
5. Until these additions exist (SG5) E14 is disabled; there is no fallback client.

### Unit-consumption policy (008 FR-019; FR-072, FR-077)

| Action type (checkpoint call site) | What counts as one unit at F07 | `consumes` |
|---|---|---|
| `HTTP_REQUEST` | one outbound HTTP request, including a probe, a baseline read and a verification read | `{request:true, concurrency:false}` |
| `REDIRECT_HOP` | each followed planned hop is one additional request | same |
| `LOGIN_ATTEMPT` | one login request (counted additionally against the local auth-attempt limit) | same |
| `LOGOUT` | one logout request | same |
| `FIXTURE_MUTATION` | one mutating request (plus two reserved units: its cleanup and its verification read, L9) | same |
| `FIXTURE_CLEANUP` | one cleanup request (draws from the reservation; the verification read draws the third reserved unit) | same |
| `SESSION_REFRESH` | one refresh/re-login request (also counts as an auth attempt when it is a login) | same |
| unit dispatch | one concurrency lease for the unit | `{request:false, concurrency:true}` (L39) |
| periodic liveness / stop-pending check (<= 5 s) | nothing (not a ledgered action) | `{request:false, concurrency:false}` (L39) |
| secondary class-qualified check for a credentialed crafted request (FR-161) | nothing (counted once by the primary) | `{request:false, concurrency:false}` |

Every **retry** is a new request with a new `idempotencyKey` and one unit. A request refused before send consumes nothing. In-flight cadence (FR-056): while a request or wait is in flight, a "stop pending" sub-check or full checkpoint at least every 5 s of wall-clock; a long idle wait is a polling loop with checkpoints (that wait spends no request unit).

### Rate pacing and lockout (FR-073, FR-074)

- Minimum inter-request delay per host: 250 ms for `C1`, 500 ms for `C3`, applied before the checkpoint.
- A 429 or any `Retry-After` pauses that `(endpoint, identity)` for the remainder of the unit (no retry to "get past" it); record `BLOCKED` `SEC_RATE_LIMIT_ENCOUNTERED`.
- Lockout-signal set (status 423, `Retry-After` on a login response, "account locked" body class): all further authentication attempts for that identity in the scan are blocked `SEC_ACCOUNT_LOCKOUT_RISK`.

### Request budgets (FR-069, FR-070; enforced BEFORE sending; retries consume budget)

See "Budgets / limits".

### Retry policy and FR-024 idempotence proof

1. Unit `retryPolicy.maxAttempts: 1` (009 FR-024; no proof of whole-unit idempotence is claimed because probes may mutate state or trigger lockouts and the sessions are not replayable). A crash or lost worker therefore ends the unit `FAILED` (`TRANSIENT_INFRASTRUCTURE`) with no re-dispatch; coverage records the affected checks `BLOCKED`/`INCONCLUSIVE`.
2. **Request-level** retry (FR-057): permitted only for a probe whose check declares `idempotent: true` (registry rejects `idempotent` on `C2`/`C3`), at most 1 retry, only for a transport error before any response byte, each retry consuming F07 budget, local budget and a new `idempotencyKey`. Retries of mutating or authentication requests are forbidden.
3. The FR-024 proof recorded here: an `idempotent: true` request is a `C0`/`C1` read-shaped request with no side effect declared (`sideEffects: []`), so repeating it cannot change target state; any other request type has no such proof and is never retried.

### Timing (FR-061; plan.md "Unit timing"; provisional until measured)

`timeoutPolicyMs = 600000` including setup, lease acquisition, work, persistence, teardown and finalization; `hardStopMarginMs = 60000`; `queueWaitAllowanceMs = 60000` (platform); `maxAttempts = 1`; `unitBudgetMs = 1 x (600000 + 60000 + 60000) = 720000`; `dispatchThresholdMs = 660000`. Composite critical path contribution in plan.md: 2 940 000 ms total (AUTH 1 020 000 + ACTIVE 720 000 + passive legacy 900 000 + `M` 300 000), well below the 21 600 000 ms ceiling. A request that cannot start within the remaining unit time (`timeoutPolicyMs - elapsed - teardown reserve`) is not started (`SEC_BUDGET_LOCAL_DURATION`). Values are provisional: the `M` calibration and measurement of E14 phase budgets are a precondition of activation (U-1).

### U-1 obligations (scan-deadline-contract.md; any missing item blocks activation)

1. **`onUnitExpired(unit) -> TERMINATED | PENDING`**, idempotent. For E14 `TERMINATED` means: the child process is confirmed dead (parent `SIGKILL` + exit observed), the local jar (if any) is disposed, and, if a broker lease exists, `confirmLeaseDestroyed(leaseId)` succeeded (FR-039/FR-052). Otherwise `PENDING` (unit keeps its F07 lease; sweep retries; at `hardStopMarginMs` past the deadline the unit is finalized `FAILED`/`TRANSIENT_INFRASTRUCTURE` detail `TERMINATION_UNCONFIRMED` and an operator alert fires).
2. **Hosting-failure backstop** (F1; data-model 4.10F crash matrix, AR-22, activation blocked until approved and implemented; the child also exits at the absolute hard TTL and on loss of its parent channel): independent of the hosting process, the broker lease carries an absolute expiry <= dispatch time + `timeoutPolicyMs + hardStopMarginMs` (<= 30 min; FR-033, L8), and the broker revocation sweep revokes the lease of any terminal unit; the child holds no persistent state, so a dead host leaves only a lease that expires by itself. For E14 units that hold no lease the backstop is the parent-armed SIGKILL plus the 009 self-healing pass, which suffice (L40); `onUnitExpired` is still declared.
3. **Module-result finalizer**: E14 does not write `ModuleResult`; the SECURITY finalizer (`security-check-registry-contract.md`) is the registered finalizer and covers checks whose producing unit ended in any non-`COMPLETED` status.
4. **Fenced evidence wrapper**: a write rejected by the fence is annotated with the FLAG `SEC_STALE_EVIDENCE_REJECTED` on the check's coverage record (never a verdict). Every unit-produced write (`HTTP_TRANSACTION`, `PERMISSION_COMPARISON`, `CLEANUP_RECORD`, `sec-probe-attempt` claims) goes through the wrapper; order is **fence first, claim second, write third** in one transaction; a rejected writer leaves no live claim. A conformance test proves no E14 code path calls generic `recordEvidence`.
5. **Finalize guard**: before calling `finalizeExecutionUnit` the host confirms its F07 lease is live (last checkpoint renewal) and the deadline has not passed; a stale holder losing this check does not finalize (scan-deadline-contract.md "Evidence and finalization fencing" rule 1).
6. Child-to-parent: the child never holds a Postgres connection; every checkpoint, claim, evidence write and lease check is an IPC round trip to the parent.

### Failure classification (009 R9a; FR-059; engines never set `failureClass`)

- A completed probe with any HTTP status (200/401/403/404/500...) is `COMPLETED`; the status is evidence. A successful exploit indicator is `COMPLETED` with a finding signal, never `FAILED`.
- `FAILED` is used **only when no probe of the unit completed** (FR-059, L28). `FailureClass.TARGET_UNAVAILABLE` only when the target itself broke (every request fails to connect or 5xx before a single probe completes); the unit ends per classification function in the owning worker. `CUSTOMER_CODE_FAILURE` is not used.
- Mid-run credential or grant revocation (`SEC_CREDENTIAL_REVOKED`, `SEC_SESSION_GRANT_EXPIRED`): the unit ends `COMPLETED` with the affected checks `BLOCKED` when at least one probe completed; `FAILED` only when none did (L28).
- Child crash/OOM/SIGKILL by the parent deadline: `FAILED` with the worker's classification (`TIMEOUT` or `TRANSIENT_INFRASTRUCTURE`).
- Local budget exhaustion or abort conditions: the unit still ends `COMPLETED` (the work it did is valid); affected checks are `BLOCKED` per FR-076.

### Cancellation, kill and crash semantics

1. User cancel -> F07 `USER_CANCELLATION` -> abort signal, unit `CANCELLED`; operator/safety stop or kill switch while `RUNNING` -> `KILLED` (before `RUNNING` the unit is `REFUSED` with the F07 reason, never `KILLED`); both `acknowledgeStop` then `recordStopped` after teardown.
2. **In-flight requests may complete remotely** (008 FR-014 named limitation): the engine aborts its side, but the target may already have processed the request. A response arriving after abort is neither trusted nor persisted. Reports state this.
3. **Residue (FR-122, FR-162, FR-171)**: residual manifests (`CLEANUP_RECORD` `RESIDUAL`) and `SESSION_UNCONFIRMED` records for a stopped/killed/cancelled/expired unit are written by the **parent-side SECURITY finalizer/sweeper from durable `MutationIntent` rows**, not by the unit (its fenced writer refuses post-stop writes); idempotent, no request. User cancellation is an F07 stop, so no cleanup follows; the UI/report states residual fixture state may remain (FR-171; U30 dependency).
   **Kill-switch fail closed**: `KILL_SWITCH_PENDING` at any checkpoint ends all sends; after a stop, no further request of any kind is issued, **including cleanup and logout** (admission refuses them; `mutation-cleanup-contract.md`); sessions are dropped locally (`SEC_SESSION_NOT_SERVER_INVALIDATED` FLAG).
4. Crash recovery: a recovered/swept unit never reuses a prior lease or jar; `attempts:1` means no re-run; the claims and write-ahead intents determine the coverage records.
5. Teardown order (always within `hardStopMarginMs`): abort signal -> stop sends -> drop jars/zeroize best-effort -> `confirmLeaseDestroyed` -> final progress -> finalize.

### Production refusal, no customer code, no AI

Refusal points: plan resolution, broker (FR-032), `securityScopeGate`, dispatch step 2, F01 FR-015a. E14 never executes customer code (FR-068; source execution only via 011 Provider Port, which never receives 012 credentials), never calls a model (FR-065), and treats every response as untrusted data (FR-134).

## Invariants

1. Every byte sent on the network was preceded, in order, by scope gate, local pre-check, `safetyCheckpoint` `PROCEED`, and (for `C2`) a durable `SENT` intent.
2. Number of requests sent <= number of checkpoint `PROCEED` results for `HTTP_REQUEST/REDIRECT_HOP/LOGIN_ATTEMPT/LOGOUT/FIXTURE_*/SESSION_REFRESH` call sites for that unit.
3. No request is sent to a destination outside the authorized Target hosts; no cross-origin redirect is followed.
4. No unit of class `ACTIVE_SECURITY` is dispatched against a PRODUCTION or unclassified target.
5. The queue payload is exactly `{executionUnitId}`; the unit row contains no secret, URL value or header value.
6. No unit-produced evidence is written outside the fenced wrapper.
7. A `STOP` result is never retried with the same key expecting a different outcome.
8. After an F07 stop or deadline no further request is issued by that unit.
9. `maxAttempts` is 1; no whole-unit retry exists.
10. Local limits never exceed their stated ceilings and are applied before send; they are labeled "LOCAL - not F07-ledgered" in every report.

## Safety & Authorization (F01 / F07 / production)

F01 grant listing `ACTIVE_SECURITY` (non-production only; 007 FR-015a), fresh per request through `safetyCheckpoint` (never direct `isAuthorized`, FR-004); ownership alone never authorizes (FR-005). Per-request `securityScopeGate` supplies account/role/category semantics that F01 does not enforce (named limitation). Environment re-read at each check; a reclassification to PRODUCTION stops via F07 (`ENVIRONMENT_RECLASSIFIED`) and is never healed. Targets are WEB-kind destinations; hosts must satisfy 007 boundedness; private-network targets unsupported.

## Failure states

| Condition | Unit status | Check verdict | Reason code |
|---|---|---|---|
| Scan terminal / deadline at pickup | `REFUSED` | `BLOCKED` | `SCAN_CANCELLED`, `SCAN_FAILED`, `SCAN_DEADLINE_EXPIRED`, `SCAN_DEADLINE_INSUFFICIENT` (verbatim) |
| PRODUCTION target | `REFUSED` | `BLOCKED` | `SEC_PRODUCTION_PROHIBITED` |
| Unclassified target | `REFUSED` | `BLOCKED` | `SEC_ENVIRONMENT_UNCLASSIFIED` |
| Flag/gate off | `REFUSED` | `NOT_TESTED` | `SEC_ENGINE_DISABLED` |
| F01/F07 refusal at the dispatch checkpoint (before `RUNNING`) | `REFUSED` (never `KILLED`) | `BLOCKED` | verbatim upstream (`NO_MATCHING_GRANT`, `EXPIRED`, `OUT_OF_SCOPE`, `BUDGET_EXHAUSTED_REQUEST`, `BUDGET_EXHAUSTED_CONCURRENCY`, `KILL_SWITCH_PENDING`, `INTERNAL_ERROR`) |
| Action category not granted / identity out of scope / consent missing / gate error | `COMPLETED` | `BLOCKED` | `SEC_ACTION_CATEGORY_NOT_GRANTED` / `SEC_IDENTITY_NOT_IN_SCOPE` / `SEC_CONSENT_MISSING` / `SEC_SCOPE_GATE_ERROR` |
| Destination prohibited / safe-net refusal / redirect out of scope | `COMPLETED` | `BLOCKED` | `SEC_DESTINATION_PROHIBITED` / `SEC_SAFE_NET_REFUSED` / `SEC_REDIRECT_OUT_OF_SCOPE` |
| Local limit exhausted | `COMPLETED` | `BLOCKED` | `SEC_BUDGET_LOCAL_REQUESTS`, `SEC_BUDGET_LOCAL_BYTES`, `SEC_BUDGET_LOCAL_ENDPOINT`, `SEC_BUDGET_LOCAL_IDENTITY`, `SEC_BUDGET_LOCAL_AUTH_ATTEMPTS`, `SEC_BUDGET_LOCAL_MUTATIONS`, `SEC_BUDGET_LOCAL_REDIRECTS`, `SEC_BUDGET_LOCAL_DURATION` |
| 429 / `Retry-After` | `COMPLETED` | `BLOCKED` | `SEC_RATE_LIMIT_ENCOUNTERED` |
| Lockout signal | `COMPLETED` | `BLOCKED` | `SEC_ACCOUNT_LOCKOUT_RISK` |
| Broker unavailable / credential state (lease requested after `RUNNING`) | `COMPLETED` through `sec_finalize_unit` | `BLOCKED` | `SEC_BROKER_UNAVAILABLE`, `SEC_CREDENTIAL_MISSING/_EXPIRED/_REVOKED/_REJECTED/_RATE_LIMITED/_SCOPE_INVALID`, `SEC_CREDENTIAL_LEASE_ALREADY_ISSUED` |
| Transport error / ambiguous response | `COMPLETED` | `INCONCLUSIVE` | `SEC_RESPONSE_AMBIGUOUS` |
| Weak signal | `COMPLETED` | `INCONCLUSIVE` | `SEC_SIGNAL_WEAK` |
| Target unreachable for all probes | `FAILED` (`TARGET_UNAVAILABLE`) | `BLOCKED`/`INCONCLUSIVE` | `SEC_RESPONSE_AMBIGUOUS` |
| Kill switch / stop mid-unit | `KILLED` / `CANCELLED` | `BLOCKED` for unexecuted; executed keep evidence | `KILL_SWITCH_PENDING` / F07 reason |
| Credential/grant revoked mid-run | `COMPLETED` if >= 1 probe completed, else `FAILED` | affected `BLOCKED` | `SEC_CREDENTIAL_REVOKED` / `SEC_SESSION_GRANT_EXPIRED` |
| Probe class unsupported in v1 | `COMPLETED` | `UNSUPPORTED` | `SEC_PROBE_CLASS_UNSUPPORTED` |
| Evidence write rejected by fence | n/a | FLAG on check | `SEC_STALE_EVIDENCE_REJECTED` |
| Deadline mid-run | `FAILED` (`TIMEOUT`, detail `SCAN_DEADLINE`) | unexecuted `BLOCKED` | `SCAN_DEADLINE_EXPIRED` |
| Termination unconfirmed | `FAILED` (`TRANSIENT_INFRASTRUCTURE`, `TERMINATION_UNCONFIRMED`) | affected `BLOCKED` | `TERMINATION_UNCONFIRMED` (verbatim) |

## Idempotency & retry

Unit `idempotencyKey` derived from `(unit id, attempt)` per 009 rule 4; `sec-probe-attempt` claim per probe; `sec-evidence-write` per write. A redelivered/recovered unit finds claims: recorded result -> skip; `SENT` mutation intent -> never re-send (`SEC_MUTATION_SENT_UNCONFIRMED`); non-mutating probe with no recorded result -> `INCONCLUSIVE` unless `idempotent: true` (one retry). Whole-unit retry: none (`maxAttempts: 1`).

## Evidence

`HTTP_TRANSACTION` fields: method, endpoint identity, status, response header **names** with flagged-value indicators, header/cookie flag metadata, timing metadata, redirect chain (hops as identities), body shape/length class/hash, <= 600-char redacted excerpt, truncation flag, request id, check id/version, probe index, `CredentialVersion` id (never value). No raw header values for credentials/cookies, no query values, no full bodies, no screenshots/HAR of authenticated pages (FR-133). Observability events: unit id, check id, outcome class, budget counters only (plan.md field 17).

## Budgets / limits

- **F07-authoritative**: request count (cumulative per grant), concurrency (leases, 30 s TTL, fenced), duration (grant expiry). 012 class ceilings (tighter, provisional): <= 300 requests/unit, <= 2 in-flight.
- **LOCAL - not F07-ledgered (pre-checked before send)**: per endpoint <= 8; per identity <= 100; per workflow <= 60; auth attempts <= 3 per identity (hard max 5); redirect depth 0 cross-origin / <= 3 planned same-origin hops; body read <= 256 KiB; total response bytes <= 32 MiB/unit; retries <= 1 (only `idempotent`); mutations <= 3 per fixture, <= 10 per unit; inter-request delay 250 ms (`C1`)/500 ms (`C3`); `maxRequestBytes`, `maxHeaderCount` from registry. Local limits are only ever tighter than F07's.

## Reverify

Fresh minimal single-unit REVERIFY plan with one probe family; fresh F01 (`destination = Issue.location`) and F07 admission; fresh broker lease if an identity is required; previous evidence preserved. A reverify E14 unit follows this entire contract unchanged; stored exploits are never replayed.

## Boundary rules (MUST NOT)

1. E14 MUST NOT send without the complete pipeline order; no bypass flag exists.
2. MUST NOT use global `fetch`, a second HTTP stack, or modify safe-net's SSRF layers.
3. MUST NOT follow a cross-origin redirect automatically or forward auth headers off-origin.
4. MUST NOT call `isAuthorized` directly; MUST NOT cache a `PROCEED` beyond its one action.
5. MUST NOT perform cleanup, logout or any request after an F07 stop or grant revocation.
6. MUST NOT retry a mutating, authentication or non-`idempotent` request.
7. MUST NOT hold a KEK, data key, DB connection (child) or persistent secret; MUST NOT write secrets to disk, env, command line, queue, log or Redis.
8. MUST NOT execute customer code, call a model, download probes/payloads at runtime, or use OAST.
9. MUST NOT map a measured security result (200/401/403/successful exploit signal) to `FAILED`.
10. MUST NOT write evidence outside the fenced wrapper; MUST NOT set `failureClass` or Finding attribution.
11. MUST NOT discover and probe endpoints outside the plan (FR-063).
12. MUST NOT run any active probe against PRODUCTION or an unclassified target.

## Named limitations

- Requests may complete remotely after abort/kill; cancellation does not reverse issued requests.
- Scope-gate semantics for accounts/roles/categories are enforced by 012 code and conformance tests, not by F01.
- Byte, auth-attempt, per-endpoint, per-identity, retry and mutation limits are locally enforced and not F07-ledgered.
- Memory zeroization is best-effort in a garbage-collected runtime; short lease lifetimes compensate.
- `timeoutPolicyMs` and `M` are provisional until calibrated.
- Time-based/race, OAST, fuzzing and active rate-limit probing are unsupported in v1.

## FR traceability

FR-003, FR-004 (fresh authz, checkpoint only); FR-012 (scope gate); FR-053..FR-061 (engine, client, pipeline, cadence, retry, fenced writer, cancel, failure, timing); FR-062, FR-063 (composite, no off-plan discovery); FR-064..FR-068 (no self-attribution, no AI, probe data, size limits, no customer code); FR-069..FR-077 (budgets, local limits, accounting, pacing, lockout, finite loops, exhaustion, call sites); FR-078..FR-085 (production, destinations, redirects, SSRF); FR-105..FR-110 (probe families executed here); FR-127..FR-135 (evidence, redaction, idempotent writes); FR-148 (probe identity); FR-152 (reverify); FR-161 (dual-class checkpointing); FR-162 (residual manifests by the parent finalizer); FR-166 (claim staleness); FR-171 (cancellation residue warning).

## Acceptance tests required (deterministic, fixture-based; not executed in planning)

- `T-E14-pipeline-order`: a spy asserts Phase A reads -> Phase B reserve -> Phase C checkpoint -> mark SENT -> internal permit -> gate send -> read -> redact/claim/write for every request, incl. redirect hops and retries.
- `T-E14-no-send-without-proceed`: checkpoint `STOP` (each F07 reason) yields zero sends and a `BLOCKED` check with the verbatim reason.
- `T-E14-local-budget-before-send`: exhaustion of each local limit blocks pre-send with the matching `SEC_BUDGET_LOCAL_*`; F07 counter unchanged.
- `T-E14-retry-consumes-budget`: an `idempotent` probe retry consumes one F07 unit and a new key; a non-idempotent probe is never retried.
- `T-E14-redirect-out-of-scope`: cross-origin 302 is not followed, `SEC_REDIRECT_OUT_OF_SCOPE`, no Authorization forwarded.
- `T-E14-ssrf-adverse`: loopback/metadata/IPv6-mapped/rebinding destinations refused (`SEC_SAFE_NET_REFUSED`) with zero connection.
- `T-E14-production-refusal`: PRODUCTION and unclassified targets are refused at plan, dispatch and broker; zero units run.
- `T-E14-429-lockout`: 429 pauses endpoint+identity; lockout signal blocks auth attempts; no retry.
- `T-E14-kill-mid-request`: kill during a request aborts, result not persisted, no later request or cleanup, `KILLED`.
- `T-E14-status-not-failed`: 401/403/500/successful probe all end `COMPLETED`.
- `T-E14-deadline-hooks`: `onUnitExpired` returns `PENDING` until lease destroyed; then `TERMINATED`; `TERMINATION_UNCONFIRMED` path alerts.
- `T-E14-fenced-writer-only`: static + runtime check that every unit-produced write uses the wrapper; stale holder is rejected leaving no claim.
- `T-E14-payload-and-row-secret-free`: queue payload is exactly `{executionUnitId}`; unit row, logs, evidence contain no registered secret.
- `T-E14-crash-recovery`: crash after send before record -> no re-send, `INCONCLUSIVE`/flag, no whole-unit retry.
- `T-E14-dispatch-threshold`: remaining < 660000 ms refuses `SCAN_DEADLINE_INSUFFICIENT` with no F07 call.

## Resolved additions

- Item 1 (dispatch vs per-request checkpoint split) -> L39: dispatch `consumes{concurrency:true}`, per-request `consumes{request:true}`, periodic liveness `consumes{false,false}`. Applied in dispatch steps 3 and 6 and the unit-consumption table.
- Item 2 (FAILED vs FR-059) -> L28/FR-059: `FAILED` only when no probe completed; mid-run revocation is `COMPLETED` with `BLOCKED` checks. Applied in Failure classification and Failure states.
- Item 3 (duration code) -> no gap; `SEC_BUDGET_LOCAL_DURATION` stands.
- Item 5 (lease-less backstop) -> L40: 009 self-healing pass plus parent SIGKILL suffice; `onUnitExpired` still declared.
- L2/FR-161 (dual-class checkpointing), L3/FR-162 (parent finalizer writes residual manifests), L9 (3 reserved units), L11 (`SEC_PROBE_CLASS_UNSUPPORTED`, `SEC_STALE_EVIDENCE_REJECTED`), L29/FR-171, L30/FR-166 applied above.

## Open for closure

- A unit killed by the parent deadline SIGKILL is `FAILED` (`TIMEOUT`) under 009 classification even if probes had completed, which sits uneasily with FR-059 "`FAILED` only when no probe completed". Owner: confirm FR-059 governs 012-side measured results only and the 009 deadline classification stands.
- 009 progress vocabulary (verified L36): `emitProgress` tick is `{label, completedUnits?, totalUnits?, indeterminate?}`; E14's counters-only snapshot fits, no 009 state/`waitingOn` names are used here.
- (The mutation-intent ordering question is resolved: `INTENDED` is durable after checkpoint `PROCEED` and `SENT` immediately before the socket write; plan D8 and `mutation-cleanup-contract.md` Consolidated repairs item 1.)

## Consolidated repairs (authoritative; third repair pass, 2026-10-14)

Single normative section replacing the earlier "Analyze and adversarial repairs" and "Blocker repairs B-1..B-13" addenda: superseded items were deleted, not overridden; retained items keep their original review labels. Requirements: spec FR-161..FR-201. Nothing here claims runtime feasibility; T650 and the other feasibility gates stay open.

1. **Per-request idempotency key (G-1, FR-072)**: every checkpoint call carries `idempotencyKey = H(unitIdempotencyKey, callSite, requestOrdinal | probeClaimKey, redirectHopIndex)`; the unit-level key is used only by the dispatch checkpoint; retries and redirect hops get distinct ordinals; the secondary dual-class check uses `H(primaryKey, "SECONDARY")`. Test `T-E14-per-request-key`: N sent requests => exactly N `BudgetConsumption` rows; a redelivered ordinal => one.
2. **Single live host (G-28, FR-183, FR-201)**: `DISPATCHED -> RUNNING` is a CAS by the claim-owning host through `sec_transition_unit`, with `hostInstanceId` derived from the authenticated principal; dispatching a `RUNNING` unit with a live lease held elsewhere is refused. Test `T-E14-double-dispatch`.
3. **Atomic reservation (G-29, FR-071)**: `LocalBudget.reserve/release` replaces `precheck/commit`; credentialed-unit counters are read from a durable per-plan source. Test `T-E14-local-budget-concurrent-reserve`.
4. **Decoded-size caps (G-41, FR-070)**: decoded bytes, decompression ratio, JSON depth and key count are capped with truncate-and-flag (never throw). Test `T-E14-decompression-bomb`.
5. **Redirect credentials (G-9, FR-081)**: `SecurityHttpClient` strips every credential-class header on any non-identical origin (scheme+host+port) and refuses https->http hops; the earlier statement that safe-net already strips custom headers is withdrawn. Test `T-E14-redirect-credentials`.
6. **Local-limit labels (F-19)**: per-unit request ceilings and in-flight counts are LOCAL; F07 concurrency is one lease per unit.
7. **Liveness renewal (F-21)**: whether a `consumes{false,false}` checkpoint renews the 30 s F07 lease is unspecified upstream; local test asserts a unit survives > 30 s on liveness checkpoints alone; clarification request AR-12.
8. **Time (FR-178)**: all `now` values are the database clock.
9. **HostileTextExecutor (B-4, FR-174).** Redaction, every classifier (CSP, Set-Cookie, reflection, engine-error signature, PII, name classifiers), JSON shaping and OpenAPI parsing run only in a `worker_threads` pool with `resourceLimits`, per-job input cap (<= read cap) and a hard per-job timeout (200 ms; 10 s OpenAPI) enforced by **terminating the thread**; in both child and parent no main thread runs a pattern over hostile text. A terminated job fails closed (`{"_redactionFailed": true}` / `INCONCLUSIVE` `SEC_ANALYSIS_BUDGET_EXHAUSTED`). Tests: `evidence.redaction.adversarial-complexity` and one adversarial-complexity fixture **per classifier**, asserting event-loop lag < 100 ms and termination.
10. **Child stdio and crash policy (B-12, FR-194).** `stdio: ['ignore','ignore','ignore','ipc']`, minimal environment, handlers emit only a closed crash code over IPC; the parent logs only closed crash codes, exit code and signal. Test `engine.child.hard-crash-secret-not-leaked` (error object embeds a registered secret; nothing in parent logs, container output, Sentry or BullMQ).
11. **Egress gate, step reference frames, canonical serialization (FR-175, FR-199, FR-200).** The child has no network path, never emits HTTP bytes and holds no permit; it sends `{stepId, credentialSlots[]}` and nothing else. The parent renders the request from the immutable plan step and the gate serializes HTTP/1.1 itself (`Host` from the admitted host:port, `Content-Length` from the body, always `Connection: close`), rejects forbidden headers (`Content-Length`, `Transfer-Encoding`, `Connection`, `Host`, `Upgrade`, `Expect`, `TE`, `Trailer`, `Proxy-*`, `Keep-Alive`, `HTTP2-Settings`), CR/LF/NUL values, CONNECT/TRACE, userinfo/fragment URLs and any host:port other than the admitted one, so smuggling by length conflict or pipelining is not representable. **The gate does not normalize or decode the path**: it sends the rendered bytes exactly (canaries are byte-exact) and refuses dot-segments, backslashes and encoded ambiguity (`%2e`, `%2f`, `%5c`, double encoding) unless the step declares them, and any path whose scope outcome differs between its raw and single-decoded forms. One request per upstream connection, ALPN `http/1.1`, TLS >= 1.2 with full chain/expiry/hostname validation and the recorded SPKI hash, session resumption disabled across units; `rejectUnauthorized: false` never appears (code-search test). The internal permit is parent bookkeeping and defense in depth, not the control against a compromised child; the control is the plan-step binding and the admission ledger's at-most-once send per ordinal. The response is streamed as opaque bytes under the cap (connect 5 s, first byte 15 s, idle 5 s after the last byte, total 30 s) and never parsed or followed by the gate; a redirect is never a child decision and there is no redirect slot: the parent follows a `Location` only through a planned `REDIRECT_HOP` step of an operation the customer declared `READ_ONLY` (a customer assertion, not proof: misdeclaration is a stated residual and the hop is labelled customer-asserted), matched byte-exact against closed typed path **and query** shapes whose values are the parent-cut `HOP_MATCHED` slots (FR-200(d)(e)), as a new admitted request. **T650 is a mandatory feasibility gate** (frame gate, per-request handshake cost at the request ceiling, the cost of servers that ignore `Connection: close`, response streaming, OS egress denial, TLS exposure parent versus isolated helper): if it fails, active and authenticated execution stays disabled until a replacement design passes a new independent review. Tests: `engine.child.no-direct-egress`, `engine.redirect.hostile-location-query-refused`, `engine.redirect.hop-query-text-slot-refused-at-render`, `engine.redirect.misdeclared-read-only-residual-labelled`, `engine.frame.hop-matched-value-in-frame-refused`, the compromised-child suite `engine.frame.other-host-step-refused`, `engine.frame.other-path-refused`, `engine.frame.other-identity-or-category-refused`, `engine.frame.extra-field-refused`, `engine.frame.out-of-order-step-refused`, `engine.frame.step-replay-exceeds-max-executions-refused`, `engine.frame.child-supplied-response-derived-value-refused`, `engine.frame.child-supplied-fixture-or-canary-refused`, `engine.slot.credential-not-in-registry-refused`, `engine.slot.other-identity-secret-refused`, `engine.slot.stale-response-refused`, `engine.slot.truncated-response-no-extraction`, `engine.slot.cross-identity-response-refused`, `engine.slot.cross-destination-response-refused`, `engine.slot.consume-limit-enforced`, `engine.slot.provenance-unavailable-safe-failure` (step not sent, nothing consumed, `INCONCLUSIVE`), `engine.redirect.arbitrary-location-refused`, `engine.redirect.cross-origin-refused`, `engine.redirect.unplanned-state-changing-target-refused`, `engine.redirect.307-308-method-preserve-unplanned-refused`, `engine.redirect.planned-target-revalidated-after-substitution`, `engine.redirect.hostile-segment-logout-refused`, `engine.redirect.encoded-path-confusion-refused`, `engine.redirect.cross-identity-substitution-refused`, `engine.redirect.hop-requires-read-only-declaration`, `engine.redirect.free-text-path-slot-refused-at-render`, `engine.redirect.hostile-location-arbitrary-credentialed-endpoint-refused`, `engine.redirect.operation-identity-mismatch-refused`, `engine.redirect.revalidates-consent-enablement-scope-mutation`, `engine.inputs.renderer-reads-only-manifest`, `engine.inputs.swapped-or-mutated-item-refused-before-parse`, `engine.inputs.stale-or-newer-item-refused`, `engine.inputs.cross-tenant-item-refused`, `engine.inputs.root-digest-mismatch-refused`, `engine.steps.restart-different-table-refused`, `engine.gate.ordinal-exactly-once`, `engine.gate.forbidden-header-refused`, `engine.gate.smuggling-unrepresentable`, `engine.gate.path-ambiguity-refused`, `engine.gate.tls-invalid-refused`, `engine.gate.spki-mismatch-refused`, `engine.gate.http2-only-unsupported`, `engine.gate.idle-timeout-closes-held-connection`, `engine.no-reject-unauthorized-false`.
12. **Admission order and fail-closed matrix (FR-190).** Phase A, side-effect-free reads (no budget, ledger, claim or counter changes): A1 database clock; A2 `securityScopeGate` with consent, `ActiveTestingEnablement`, cool-off and environment; A3 exact-value registry; A4 address pin intact and re-proof not overdue; A5 broker `getLeaseStatus` (<= 1 s) and ledger health within grace for credentialed requests; A6 kill-switch pending-stop read. Phase B, releasable: B0 the `sec-probe-attempt` claim, B1 `reserveAuthAttempt` for LOGIN/REFRESH (RESERVED), B2 local budget `reserve`. Phase C: C1 the F07 `safetyCheckpoint` with the per-request key, the single irreversible step (cumulative request consumption cannot be returned); then C2 `markAuthAttemptSent`, C3 the mutation `SENT` flush, C4 the gate's send. A Phase B failure releases the reservations taken so far; a C1 refusal releases B0-B2; a C2-C4 failure leaves the F07 unit spent without a send — a bounded, accounted loss (<= 1 unit per request, no automatic retry, local budget counts it as consumed, audit `request.admission.spent_unsent`, reasons `SEC_BROKER_UNAVAILABLE` / `SEC_SCOPE_GATE_ERROR` / `SEC_EGRESS_PERMIT_INVALID`). The ordinal is parent-assigned and monotonic; after any replayed F07 `GRANTED` the parent re-runs A6. Error and reason mapping: clock/consent/registry/environment => `SEC_SCOPE_GATE_ERROR` (missing consent => `SEC_CONSENT_MISSING`, missing enablement => `SEC_DESTINATION_AUTHORIZATION_UNMET`); local reserve => `SEC_BUDGET_LOCAL_*`; F07 reasons verbatim (`INTERNAL_ERROR` => none); address pin => `SEC_TARGET_ADDRESS_UNVERIFIED`; broker status => `SEC_BROKER_UNAVAILABLE`; ledger => `SEC_RESTORE_QUARANTINE`/`SEC_BROKER_UNAVAILABLE`; MAC key at issue => `SEC_BROKER_DENIED`. Unlisted dependencies fail closed. One error-path fixture per row plus `admission.f07-unchanged-when-phase-a-or-b-fails`, `admission.b-failure-releases-reservations`, `admission.claim-released-before-c1`, `admission.c2-failure-spent-unsent-accounted`, `admission.c3-failure-spent-unsent-accounted`, `admission.c4-failure-spent-unsent-accounted`, `admission.crash-after-c1-reservation-swept-not-failure`, `admission.replayed-granted-rechecks-kill-switch`.
13. **Unit host ownership and dispatch order (FR-195, FR-201).** The order is the one in "Dispatch and 009 integration" above, which follows 009 `dispatchExecutionUnit` steps 0-5 unchanged: pickup and U-1 precondition (unclaimed, database-verified refusal); `sec_claim_unit_host` (no status change); flag/environment guard as claim owner; input manifest verification and `PlanStepTable` render/record; the dispatch checkpoint with `STOP` -> `sec_finalize_unit(REFUSED, F07 reason)` through the existing 009 edge for the pickup status (never `KILLED` before `RUNNING`) and `PROCEED` -> `sec_transition_unit(PLANNED->ADMITTED)`; fresh VAB and DAP; `ADMITTED->DISPATCHED`, fork, `DISPATCHED->RUNNING`, SIGKILL armed; broker lease after `RUNNING`. Status transitions are owned as in FR-201(d): `PLANNED->ADMITTED`, `ADMITTED->DISPATCHED` and `DISPATCHED->RUNNING` by the claim-owning host through `sec_transition_unit`; every pre-run refusal (`->REFUSED`) through `sec_finalize_unit` (claim owner only), except the four database-verified U-1 step-0 reasons on an unclaimed `PLANNED` unit, which go through `sec_refuse_unclaimed_unit` (FR-201(c)(ii)); both carry the finalization semantics of FR-201(c); `RUNNING->terminal` by the host (`sec_finalize_unit`) or the orchestrator sweep (`sec_sweep_finalize_unit`) after the SIGKILL deadline and termination confirmation. A crashed host keeps its claim (never stale-reclaimed, `maxAttempts` 1); a second host conflicts and must not transition or finalize. Before `finalizeExecutionUnit` the wrapper verifies it still owns the claim (the function enforces it). Tests `T-E14-double-dispatch`, `dispatch.claim-changes-no-status`, `dispatch.checkpoint-stop-uses-existing-edge`, `dispatch.pre-run-refusal-finalizes-atomically`, `dispatch.pre-run-stop-never-killed`, `dispatch.input-mismatch-refuses-before-checkpoint`, `dispatch.broker-denial-finalizes-from-running`, `dispatch.crash-keeps-claim-sweep-finalizes`, `dispatch.guard-refusal-requires-claim`, and the unclaimed-refusal and sweep-abuse suite of T822 and T829.
14. **Atomic budgets (FR-071, FR-191).** `LocalBudget.reserve/release` as above; auth attempts are reserved through the broker (`AuthAttemptReservation`), not counted locally only; a Phase B/C failure releases both reservations.
