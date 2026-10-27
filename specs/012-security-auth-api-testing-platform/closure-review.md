# SPEC 012 Closure Review — 2026-10-11

> **Superseding note (2026-10-11, blocker-repair pass):** the status below is the state at the first closure review. Blockers B-1..B-13 have since been repaired and mapped in `repair-matrix.md`; the owner approved P1, P2, P3, P7, P10/AR-3, P13, P15 and deferred P11. SPEC 012 is **still NOT FROZEN** and awaits a second independent review (`second-review-handoff.md`). Nothing below is edited retroactively.


**Decision: NOT FROZEN.** SPEC 012 stays `PLANNING COMPLETE — NOT FROZEN`. Runtime activation remains disabled (SG1–SG10 unchanged; flags default-off). No implementation, migration, deployment, commit or push occurred. SPEC 013 was not started.

Two independent conditions block the freeze: (A) the independent re-review returned **READY-WITH-REPAIRS** with one GAP and 19 WEAK ratings still open and a 13-item must-fix list; (B) the owner has not approved the provisional product decisions. Either alone blocks; clearing (B) without (A) is not sufficient.

## 1. Verified repository state

| Item | Value |
|---|---|
| Branch / HEAD | `main` / `e42577304a2c` (`e425773`) |
| Remote divergence | `origin/main` is the same commit; `HEAD...origin/main` = 0 / 0 |
| Tracked modifications | 10 files under `specs/009-core-scan-execution-platform/` (+169 / −4): the owner-authorized U-1 amendment (spec, plan, research, data-model, tasks, 5 contracts) |
| Untracked, relevant | `specs/009-core-scan-execution-platform/contracts/scan-deadline-contract.md`; `specs/011-source-backend-database-testing-platform/` (37 files); `specs/012-security-auth-api-testing-platform/` (39 files including this one) |
| Untracked, unrelated | `showcase-eink/`, `showcase-esaalnybot/`, `showcase-omanda-ai/`, `showcase-trimora/` (untouched) |
| Application/code/Prisma/tooling diffs | none (`git diff` over `apps packages .specify AGENTS.md CLAUDE.md PROJECT_MAP.md` is empty) |
| Frozen upstream 006–011 modified by 012 | none (every file under specs/006–011 has an mtime earlier than the creation of `specs/012/spec.md`) |

## 2. Evidence (re-run on the final files; scripts, not self-report)

| Check | Result |
|---|---|
| FR numbering | 187 contiguous, 0 duplicates, 0 missing |
| FR ↔ tasks | 360 tasks; 0 FRs without a task; 0 tasks without an FR; trace table has 187 rows, **0 mismatches** vs recomputation; 0 dangling task refs |
| FR → contracts | every FR cited by ≥ 1 contract |
| Reason codes | 78 unique, one per row; 0 unregistered tokens in non-historical documents; all 78 appear in ≥ 1 contract |
| Stale values | 0 occurrences of the 15-minute lease, hard-50 step cap, 2 request units, 8-entry advisory table, P1–P12, four-bucket, superseded vocabularies |
| Contracts | 19 / 19 contain the mandated sections (5 headings normalized this pass) |
| Checklists | 8 files, 140 items: 126 checked against the package text, 14 open (owner decisions, commits, re-review, implementation). Two open items were reworded to reflect the re-review result |
| Mermaid | 17 diagrams: structural lint 0 problems. **Not rendered** (no renderer installed; installing a browser-backed tool was out of scope) |
| Upstream (U-1 / 011) consistency | 009 U-1 numbers 012 relies on match the working tree (6 h ceiling, `unitBudgetMs`, T-U1-1..10 present in 009 tasks); 011 header, AG1–AG10 and U-1 references present and consistent |

Mechanical checks prove internal consistency. They do not prove the design is secure, and implementation-dependent items are not marked complete.

## 3. Independent re-review (`adversarial-rereview.md`)

Written by a reviewer that did not write SPEC 012, its repairs, or the original review. The original `adversarial-review.md` ratings were **not** changed.

- 53 originally WEAK/GAP scenarios: **33 ADEQUATE, 19 WEAK, 1 GAP** (scenario 7, third-party resource access). 8 GAPs improved (A13 to ADEQUATE; 35, 49, A1, A10, A18, A27, A28 to WEAK).
- Regression check on the 25 originally ADEQUATE: 4 regressions, all availability not safety (two-grant dual-class vs the same-grant-id rule; unspecified failure mode of the new per-request broker status read; the 24 h attempt window starving legitimate runs; the per-request-key guarantee tested only against an F07 stub).
- 18 new issues (N-1..N-18) and a fail-open inventory.
- **Verdict: READY-WITH-REPAIRS.**

I verified the five load-bearing claims against the repository before relying on them: (1) the existing ownership verification reads DNS TXT through `node:dns` (`apps/api/src/services/control-gate/verify.ts:27`), so "proof checked over the connection" does not hold for that method; (2) `apps/worker/src/readiness/verdict.ts:61` passes an area on `score >= threshold` alone, so a `DEGRADED` SECURITY score of 100 can clear a readiness verdict — my persisted marker does not stop this by itself; (3) `persist.ts:195` uses `createMany({ skipDuplicates: true })` (first writer wins), contradicting "highest confidence wins by upsert"; (4) 009 places the Plan Resolver in `apps/api` while my tasks T117/T119/T537 place resolution and the unit-MAC code in `apps/worker` — an inconsistency I introduced; (5) FR-177 gates "grant creation", which is 007's unmodifiable `createAuthorization`; only 012's use points (plan resolution, broker issue) can enforce it.

## 4. Architecture verification (Step 4)

| Area | Status | Basis |
|---|---|---|
| F01 authorization / environment / production | Text verified; **blocker** | FR-003/078, 007 FR-015a confirmed. FR-172 address binding is defeated by DNS-TXT verification, an attacker-declared address set, and a mid-unit re-point (scenario 7 GAP). Production prohibition remains customer-attested (stated) |
| F07 admission, per-request budgets, leases | Consistent; residual | `consumes` patterns consistent across 9 documents; per-request key rule specified; its only test uses an F07 stub; status-read failure mode unspecified (N-8) |
| 009 lifecycle, U-1 deadlines | Consistent; **blocker** | U-1 arithmetic and obligations match; resolver location mismatch (N-1); two writers on `ModuleResult(SECURITY)` during the parallel run (N-6); stale host can finalize a live unit (N-9) |
| 010 browser boundary | Verified | BROWSER units only, unauthenticated, non-mutating; authenticated browser deferred (AR-2) |
| 011 handoffs | Verified; residual | `SOURCE_SURFACE`/`RouteIdentity` consumed by name; 011's `DEPENDENCY` payload is untyped, so advisory matching degrades to `SEC_VERSION_UNRESOLVED` (011's owner) |
| Credential broker isolation | **Blocker** | DB-role limits on 007/008/009 tables are an implementation constraint recorded in no amendment request; compromised-child path can send without gate/F07/budget/intent (N-2) |
| Tenant boundaries / RLS | Specified | FR-182 + DTO allow-lists; implementation-dependent |
| Session lifecycle | Specified; residual | teardown ordering specified; broker status-read error mode and the "push flag" are not coherent with the broker's egress |
| Production mutation prohibitions | Verified in text | FR-078/FR-122; no cleanup after any stop |
| Evidence fencing and redaction | Specified; **blocker (A10)** | a same-thread 200 ms watchdog cannot interrupt a running regex; the test covers redaction only |
| Coverage and DEGRADED scoring | **Blocker** | persisted `coverageComplete` exists, but readiness/`overallScore` consume score alone (`verdict.ts:61`); T577 is a string lint, not a decision test |
| Refund, cancellation, cleanup | Verified; **owner decision** | cancel ⇒ no cleanup, warning (FR-171); but `isDelivered` treats `DEGRADED` as delivered, so whether an area whose active checks never ran is billed in full is undecided |
| API destination binding and consent | **Blocker** | scenario 7 GAP; FR-177 enforceable only at plan resolution and broker issue |
| Recovery after worker crashes | Specified; residual | write-ahead intents, claim staleness, parent-finalizer manifests; restore detection depends on a runbook step (A18/N-14) |

**Hidden fail-open paths cannot be ruled out.** The re-reviewer's inventory lists seven still open: broker status-read error mid-run; epoch-store failure; DB-clock query failure; consent-record/audit read errors; a replayed F07 `GRANTED` after a stop; a child that sends without a parent `PROCEED`; an address proof satisfied by DNS-TXT or a declared address set.

## 5. Product decisions requiring explicit owner approval

No decision below has been approved. Nothing was approved on the owner's behalf.

| # | Decision | Provisional default | Security implication | Product implication | Recommendation | Mandatory before freeze |
|---|---|---|---|---|---|---|
| P1 | Customer-provided test accounts mandatory | Yes | Fahes never creates, guesses or harvests credentials; removes credential-attack class | Customers must set up test accounts; adds onboarding friction | Approve | **Yes** (shapes vault, identity model, UX) |
| P2 | Non-production state-changing tests | Supported, default off, per-class consent | Residual side effects on customer fixtures; in-flight requests complete remotely; no cleanup after a stop | Enables business-logic and mutating authz tests; higher support burden | Approve as default-off | **Yes** |
| P3 | MFA | Only exempt accounts / pre-established session fixtures | No bypass or OTP interception; honest `SEC_MFA_CHALLENGE_UNSUPPORTED` | MFA-enforced targets cannot be tested in v1 | Approve | **Yes** (scope) |
| P4 | Dependency advisory matching in v1 | Yes, offline signed snapshot | No scan-time lookup; stale data ⇒ `NOT_TESTED` | Needs an operator import process and cadence owner | Approve | No (not safety-critical) but needs an owner |
| P5 | Customer-defined business invariants | Yes, declarative only | No customer code executed | Closed predicate set limits expressiveness | Approve | No |
| P6 | Initial API types | OpenAPI 3.0/3.1 REST/JSON | Smaller parser attack surface | GraphQL/gRPC/SOAP unsupported | Approve | No |
| P7 | Authenticated testing in first release | Behind SG gates; passive first | Largest risk surface (credentials, sessions) | Decides whether the first release ships passive-only | Approve passive-first; authenticated only after SG3/SG7/SG10 | **Yes** |
| P8 | Authenticated browser testing | No (AR-2) | Avoids unredacted authenticated screenshots/HAR | No authenticated DOM-XSS checks | Approve | No |
| P9 | Private-network targets / customer agent | No | Keeps safe-net unchanged | On-prem/private staging cannot be tested | Approve | No |
| P10 / AR-3 | A WEB-kind Target suffices for APIs | Yes — owner to confirm | If the owner wants a distinct API kind, a 007 amendment becomes REQUIRED before API checks activate | Cross-domain API flows unsupported | Approve WEB-kind | **Yes** (decides whether an upstream amendment is needed) |
| P11 | KMS provider and broker hosting | Unknown | Provider must offer unwrap-only IAM, key versioning, audit | Cost and ops ownership | Defer; investigate under SG3 | No for freeze; **Yes** before SG3 |
| P12 | Credential max 90 d / default 30 d; lease ≤ min(unit timeout + margin, 30 min) | as stated | Shorter exposure | Re-registration cadence | Approve | No |
| P13 | Scoring of `DEGRADED` SECURITY results | Scored; persisted `coverageComplete:false`; no cap | A clean passive-only scan can score 100 and, today, pass readiness | Decides whether partial coverage can look healthy | **Do not approve as written.** Approve scored + marker **and** require readiness/certificate no-go and an additive partial marker in `overallScore` (re-review must-fix 3); decide cap yes/no | **Yes** |
| P14 | Reverify billing and refund of customer-side INCONCLUSIVE | Legacy `REVERIFY_COST` semantics | Prevents refund abuse | Depends on F06 | Approve as a recorded F06 dependency | No |
| New | Billing/refund of a `DEGRADED` SECURITY area whose active checks never ran | undecided | — | `isDelivered` treats `DEGRADED` as delivered | Owner decision; recommend flat price only for what ran | **Yes** |

## 6. Remaining blockers and the minimum actions to clear them

### Security / architecture (from the independent re-review; all fixable inside 012 documents and tasks; no frozen upstream text must change)

| # | Blocker | Minimum action |
|---|---|---|
| B-1 | Scenario 7 / FR-172 still a GAP | Require HTTP-file proof for active classes; remove the customer-declared address-set escape; enforce the proof-derived address on every connection of the unit; fixtures for DNS-TXT and mid-unit re-point |
| B-2 | A1 / FR-173 / N-1: resolver principal | Name `apps/api` as plan resolver and MAC-key holder; relocate T117/T119/T537; MAC the identity list and class; record an amendment request for the DB-role constraints on 007/008/009 tables |
| B-3 | Scenarios 35/49 / FR-186: score still passes readiness | Decision-level consumer requirements: readiness no-go and no certificate when `coverageComplete:false`; additive partial marker in `overallScore`; name the files (`apps/worker/src/readiness/verdict.ts`, scoring consumers); resolve the two-writer conflict on `ModuleResult(SECURITY)` (N-6); P13 decided |
| B-4 | A10 / FR-174 | Mandate terminable worker-thread (or proven-linear) execution for all hostile-text parsing; extend the test beyond redaction |
| B-5 | N-2 / A3: compromised child | Parent-minted single-use per-request permit, bound to unit/host:port/ordinal, enforced by the egress proxy |
| B-6 | 13 / A2: lease status read | Fail closed on status-read error; drop the "push flag"; add the "≤ 1 request after revoke" task and an error-path fixture; add the missing tasks in N-8 |
| B-7 | 18 / N-3: attempt counter has no writer | Broker `reserveAuthAttempt`; count failures separately from successes |
| B-8 | A27 / N-4: FR-177 | Restate against the enforcement points that exist (plan, dispatch, broker issue, per-request); add dispatch/per-plan checks; record the amendment request that 007 grant creation cannot be gated |
| B-9 | 43 / N-7: merge rule | Group-barrier materialization, or drop "highest confidence wins by upsert" (009 is first-writer-wins) |
| B-10 | 24 / N-5 | Entity and DTO for operation declarations (`readOnlyDeclared`, `fixtureConfined`, `protectedMarkerRef`) |
| B-11 | A18 / N-14 | Automatic restore/rollback detection, not a runbook step |
| B-12 | 9 / N-15 | Child stdio and crash-output policy |
| B-13 | N-9, N-10 | CAS-first dispatch/finalize ownership; resolve two-grant vs same-grant-id contradiction |
| B-14 | Should-fix | N-11 stale-text sweep, N-12, N-13, N-16, N-17 and scenarios 19, 25, 29 |
| B-15 | Second independent review | After B-1..B-13, a reviewer who did not author the repairs re-rates all remaining WEAK/GAP scenarios and the 18 new issues |

### Owner decisions

D-1 Approve or amend P1, P2, P3, P7, P10/AR-3, P13 and the new DEGRADED billing question (mandatory); D-2 confirm the remaining provisional defaults P4–P6, P8, P9, P12, P14 (recommended); D-3 name owners for broker operations, key rotation and snapshot cadence (SG10); P11 may stay open for freeze but not for SG3.

## 7. Upstream provenance and safe commit sequence (for owner approval — nothing committed)

SPEC 009 U-1 and SPEC 011 are present, consistent and **uncommitted**. SPEC 012 depends on both. Proposed docs-only sequence, staging explicit paths only (never `git add -A`, which would sweep in the four `showcase-*` directories):

1. `git add specs/009-core-scan-execution-platform/` → commit "docs(009): record controlled amendment U-1 (plan-level scan deadlines)" — 10 modified files + `scan-deadline-contract.md`; verify with `git diff --cached --stat` (expect +169/−4 plus the new contract).
2. `git add specs/011-source-backend-database-testing-platform/` → commit "docs(011): add frozen source/backend/database testing planning package" — 37 files; 011 depends on step 1 (U-1), so it must follow.
3. After SPEC 012 is frozen: `git add specs/012-security-auth-api-testing-platform/` → commit "docs(012): add security/auth/API testing planning package".

Check `git status` shows no `showcase-*` paths staged before each commit. No push without separate authorization.

## 8. Preserved gates

Implementation gates SG1–SG10, default-off flags, `attempts: 1` for side-effecting units, and the 007 FR-015a production prohibition are unchanged. No runtime behavior is enabled by this review.

## 9. Next recommended action

Approve or amend the mandatory decisions in §5 (especially P13 and AR-3), then repair B-1…B-13 in the SPEC 012 documents, then run a second independent re-review. When that review returns READY-FOR-FREEZE and the owner decisions are recorded, freeze 012 and apply the commit sequence in §7.
