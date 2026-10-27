# SPEC 012 — Second Independent Review Handoff (prepared 2026-10-11)

> **Superseded in part (2026-10-14)**: the third repair pass (`third-repair-matrix.md`, `third-review-handoff.md`) rewrote FR-172/173/175/186/187/189/190/191/196 and added FR-197..199. Statements below about the earlier address binding, child-held permits, local-only attempt counting and conditional-upsert single writer are historical and no longer normative.

**Audience**: a reviewer who did **not** author SPEC 012, its repairs, the first adversarial review, or the first re-review. The repair author does **not** certify that B-1…B-13 are closed; `repair-matrix.md` lists *claims*, not evidence.

**Output**: write only `specs/012-security-auth-api-testing-platform/adversarial-rereview-2.md` (same structure as `adversarial-rereview.md`: method and independence statement, scoreboard, per-scenario fresh ratings, new issues, fail-open inventory, residual risks, final verdict `READY-FOR-FREEZE | READY-WITH-REPAIRS | NOT READY`). Do not edit any other file; do not change prior ratings.

## 1. What to read (in order)

1. `closure-review.md` §6 (the B-1…B-13 blockers verbatim) and `adversarial-rereview.md` (scenario detail, N-1…N-18, fail-open inventory).
2. `repair-matrix.md` (claims) — then verify each claim in the amended text, not the matrix.
3. `spec.md`: FR-039, FR-070, FR-072, FR-117, FR-141, FR-142, FR-172…FR-177, FR-179, FR-181, FR-186…FR-196 (Part "U — Blocker repairs").
4. Contract addenda titled **"Blocker repairs B-1..B-13 (second pass, 2026-10-11)"** at the end of: `security-scope`, `credential-broker`, `active-security-execution`, `auth-workflow-execution`, `mutation-cleanup`, `test-identity`, `authorization-testing`, `security-evidence`, `security-finding`, `security-coverage`, `security-check-registry`, `api-security-check`, `api-discovery`, `secrets-management`, `auth-session`, `probe-family`, `business-logic-security`, `security-reverify`. They override earlier text.
5. `plan.md` (SG1–SG10, decisions table, diagrams D2/D7/D15/D16), `data-model.md` (§4.3, 4.5, 4.9C, 4.9D, §6, §13), `tasks.md` Phase 17 (T600–T746) and its traceability table, `upstream-amendment-requests.md` (AR-13…AR-16, AR-3 closed).
6. Frozen upstream actually relied on (open and verify): 007 `grant-lifecycle-contract` and `authorization-check-contract`; 008 `safety-admission-contract` (replay rule 3, boundary rule 1), `safety-checkpoint-contract`; 009 `plan.md` (Plan Resolver location), `scan-deadline-contract` (U-1), `finding-materialization-contract`; 010 `data-model` (`IdempotentClaim`); SPEC 011 `source-correlation-contract`.
7. Repository facts: `apps/api/src/services/control-gate/verify.ts` (FILE/DNS methods, `level1RateBound`), `packages/safe-net/src/*` (connect-guard, proxy), `packages/scoring/src/aggregate.ts`, `apps/worker/src/readiness/verdict.ts`, `apps/worker/src/module-runner/persist.ts`, `apps/api/src/services/readiness/certificate.ts`, `apps/worker/src/orchestrator/terminal-refund.ts`/`timeout.ts`.

## 2. Mandatory scope of the review

**A. B-1…B-13.** For each: locate the operative sentence, owner contract, acceptance test and task text (do the tests actually exercise the attack?), then try to defeat it. Suggested attacks:

| B | Try to defeat |
|---|---|
| B-1 | Does the address-control proof (`Host: <ip>`) really distinguish a dedicated host from a shared edge/CDN/PaaS? Any DNS path that satisfies both proofs for infrastructure the tenant does not control (e.g. a tenant who controls an IP's default vhost without owning the machine, anycast, IP reuse inside a unit, IPv6/dual-stack, redirects during proof, proof served by a different backend than probes)? Is the plan-time recency (≤ 24 h) race-free? Can `allowedSubset` or any other declared field widen the set? Is the proof path itself an SSRF/DoS amplifier? |
| B-2 | Is the Plan Resolver really in `apps/api` per 009? What if resolution also runs in a worker (retries, REVERIFY)? Can the worker role still forge units/leases the broker accepts? Is the MAC input complete (identity list, class, config digest) and replay/rollback-safe (platform epoch, key version)? What happens on key rotation mid-scan? |
| B-3 | Walk every consumer in `FR-188`'s list in the real code: does any other consumer of module results decide pass/ready/certificate/notification from the score alone? Is the `null`-on-required-scan rule enough? Does the single-writer guard hold under the real write ordering (`persist.ts`, finalizer, timeout/refund paths)? Is the readiness change genuinely additive? Does partial billing interact badly with `isDelivered`? |
| B-4 | Can any hostile-text path still run on a main thread (logging, error formatting, Sentry, JSON parse, header parsing in undici)? Is thread termination + `resourceLimits` sufficient against memory/CPU exhaustion? |
| B-5 | Is a re-originating gate feasible with HTTP/2, keep-alive, chunked/streamed bodies, redirects, WebSocket upgrades? Can a compromised child smuggle a second request inside one permit? Does the gate itself become a parser-bug surface in the trusted parent? Is OS-level egress confinement actually achievable on the unresolved hosting (P11)? |
| B-6 | Does the fail-closed matrix cover every dependency? Any path where a status/consent/clock read can be cached or skipped? Is the ≤ in-flight bound true with concurrency 2? Livelock/availability cliffs? |
| B-7 | Is `reserveAuthAttempt` race-free with lease exclusivity? Can the counter be reset (crash, restore, reverify) or starved by legitimate runs? |
| B-8 | Is every consent enforcement point reachable only after the record read? What about reverify, passive units, and units dispatched before consent supersession? |
| B-9 | Is the group barrier order-independent and crash-safe? Interaction with REVERIFY and with legacy checks. |
| B-10 | Can a customer-asserted declaration be abused to make Fahes mutate real state? Is the marker-change tripwire sound? |
| B-11 | Can a restore be performed so that the DB matches the checkpoint (e.g. restore + replay)? Failure semantics of the checkpoint store. |
| B-12 | Any remaining child output channel (IPC payloads, temp files, `/proc`, crash dumps)? |
| B-13 | Can the `sec-unit-host` claim be starved/poisoned (denial of service by claiming another unit)? Does the per-class grant rule handle one-grant/two-grant and revoked-mid-unit cases? |

**B. The previously remaining 19 WEAK and 1 GAP scenarios** (original ids): **GAP** 7. **WEAK** 5, 9, 13, 18, 19, 24, 25, 29, 35, 43, 49, A1, A2, A3, A7, A10, A18, A27, A28. Re-rate each (ADEQUATE / WEAK / GAP). `repair-matrix.md` maps each to a repair; A7 and A28 are *accepted residual* — judge whether acceptance is justified.

**C. New security regressions** introduced by the repairs. Hunting list: the permit-mint chain as a new availability/complexity risk; the API plan resolver as a single point of failure/trust; the external checkpoint store as a new dependency; address-control-proof UX/abuse (customers placing tokens on default vhosts); readiness consumer changes breaking existing behavior; group-barrier finalizer ordering; `sec-unit-host` claim vs 009 recovery; HostileTextExecutor resource use; the removal of the declared-address-set path (is the remaining flow still usable?); consistency between main text and addenda; 81-code registry vs documents.

**D. Product-decision dependencies.** Verify the documents mark only P1, P2, P3, P7, P10, P13, P15 as approved, P11 as deferred, and everything else (P4, P5, P6, P8, P9, P12, P14, P16) as not approved; identify any repair whose safety depends on an unapproved decision.

**E. Upstream compatibility.** Confirm no repair requires editing a frozen 006–011 document, and that AR-13…AR-16 correctly classify the gaps. Challenge any "local mitigation" that is really an upstream change.

**F. Fail-open inventory.** Re-derive the table in `adversarial-rereview.md` §5 for the amended package; mark every dependency's failure mode as Closed or OPEN-RISK with a citation.

## 3. Facts the reviewer can re-verify mechanically

196 FRs (FR-001…FR-196, contiguous); 426 task rows (T001…T746 with gaps), no FR without a task and no task without an FR, trace table regenerated untruncated; 81 reason codes, one per row, every `SEC_*` token in non-historical documents registered; 19 contracts with the mandated sections; 16 Mermaid diagrams in `plan.md` plus 3 in `data-model.md` (structural lint only — **not rendered**); 8 checklists. Re-run your own greps; do not trust these numbers.

## 4. What the repair author does NOT claim

- No claim that B-1…B-13 are closed, that the design is secure, or that the 19 WEAK + 1 GAP are resolved.
- The egress-gate feasibility spike (T650) has **not** been performed; the gate's practicality with the chosen HTTP client is unproven.
- KMS provider, broker hosting and the external checkpoint store are undecided (P11 deferred).
- No code, migration, commit, push or deployment exists; every test named in `tasks.md` is a plan, not an executed result.
- 009 U-1 text and all of SPEC 011 remain uncommitted working-tree changes (AR-8/AR-9).

## 5. Verdict semantics

`READY-FOR-FREEZE` only if every B-n is ADEQUATE on re-verification, no GAP and no HIGH new issue remains, and the remaining WEAK items are explicitly accepted limitations. Otherwise `READY-WITH-REPAIRS` (list must-fix) or `NOT READY`. Freezing additionally requires the owner decisions listed in `repair-matrix.md` §Outstanding.
