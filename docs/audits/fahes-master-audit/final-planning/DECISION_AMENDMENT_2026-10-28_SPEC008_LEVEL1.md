# Decision Amendment 2026-10-28 — SPEC 008 Level 1 owner approvals

**Type**: dated amendment. The historical rows of `DECISION_REGISTER.md` (DEC-034, 044, 045, 048, 049 — status
"OWNER DECISION REQUIRED" / "RECOMMENDED — OWNER APPROVAL REQUIRED") are **not rewritten**; they were accurate
when written. This file records the later approval. Where the two differ, this amendment governs from its date.

**Approval source**: the project owner's explicit statement in the 2026-10-28 SPEC 008 continuation session
(the owner is the same person who holds the project-owner role in `DECISION_REGISTER.md`). Questionnaire:
`phase-2/OWNER_DECISIONS_TO_CLOSE.md` "Batch 1 — Before SPEC 008 starts". No other authoritative owner decision
on these five IDs exists in the repository at HEAD `21600e3` (searched `docs/`, `specs/`, `PROCESS_FOR_THE_APP.md`);
nothing supersedes this approval.

**Scope of the approvals**: they approve *direction/options*. They do **not** approve any unseen contract text or
detailed design. The detailed text is in `specs/008-safety-killswitch-budget-audit/amendments/` and
`f02-role-privilege-design.md` and is `DRAFT — PENDING OWNER SIGN-OFF`.

| ID | Original question | Options offered | Selected | Architectural / contract consequence | Implementation dependency |
|---|---|---|---|---|---|
| DEC-034 | Who owns, and when, the AR-13/AR-19 design (OD-2)? | A: owner = project owner, assistant drafts F-02 for review before S-01; or name another owner/date | **A** | Owner is accountable; F-02 is drafted, then reviewed. Does not approve the unseen F-02 text. | S-01 (schema) waits for F-02 sign-off |
| DEC-044 | Adopt the AR-13 database role/privilege-boundary direction? | A: adopt (separate roles, definer functions; design in F-02). B: defer until before the SPEC 012 broker | **A** | New DB roles, positive grants, `SECURITY DEFINER` functions for safety-sensitive writes of the 008 tables. No compromised-worker resistance is claimed until grants, functions and negative tests exist and runtimes connect as those roles. | S-01, S-02, E-06 |
| DEC-045 | How is F07 admission/release exposed (AR-19)? | A: transaction-joinable, unit-keyed, token-free finalizer release, context-derived identity and clock. B: application-level service only. C: separate admission service | **A** | 008 contracts amended (admission, checkpoint, release, kill-switch). DB clock only. Idempotent counter-correcting release. | S-02, S-03, CORE-06, E-06 |
| DEC-048 | Who advances a stop when no live host exists? | A: finalizer acknowledges by authority **and** a reconciler. B: finalizer only. C: alert only | **A** | New reconciler job in 008; finalizer-by-authority acknowledgement call; admission stays refused while a stop is unresolved (fail closed). | S-04, CORE-06 |
| DEC-049 | `recordStopped` order until AR-19 exists | A: reconciler records `STOPPED` once no live lease exists. B: after finalize regardless. C: only after reclaim | **A** | `STOPPED` is written only by a path that has verified no live in-scope lease; no timeout-only transition. | S-04, CORE-06 |

**Still unresolved and gating (not approved by this amendment)**: DEC-050 (lock order across admission/renewal/release/
reclaim/reconcile; EV-01), DEC-063 (lease reclaim sweep + drift reconciliation as a real job; EV-05), DEC-068 (audit
identifier/redaction rules for new events), DEC-056/057/058 (SPEC 009 claim mechanics; not needed for 008 alone),
DEC-047 (single terminal-finalization authority; affects CORE-06 only). The F-02 document proposes text for DEC-050
and DEC-063 for the owner to approve; a proposal is not an approval.

**Contradictions found while recording** (reported, not resolved):
1. DEC-045 "context-derived identity from the claimed unit" has no source in the repository today: `ExecutionUnit`/claim
   belong to SPEC 009 (not implemented). 008 can derive tenant and grant from DB rows (`Target.userId`,
   `TargetAuthorization`) and the clock from the database, but cannot derive from a *claimed unit* until 009 exists.
2. 008 `safety-admission-contract` step 2 calls F01 `isAuthorized` (TypeScript); DEC-045 A requires operations callable
   inside a database transaction, including by definer functions (AR-19). A SQL function cannot call a TypeScript service.
   See F-02 §6 (two-layer proposal).
3. `AdmissionLease` has no `scanId`/`targetId`, so SCAN/TARGET-scope reconciliation (DEC-048/049) cannot verify "no live
   in-scope lease" from the data model as frozen. An additive column is proposed in F-02 §7.

## Addendum — owner-delegated technical decisions (same day, later in the session)

The owner then delegated the remaining *technical* implementation decisions to the implementing engineer
("resolve the remaining TECHNICAL implementation decisions autonomously"). The following were decided on that
authority. They are **owner-delegated technical decisions, not owner answers**, and keep that label:

| ID | Decision | Where recorded |
|---|---|---|
| DEC-050 (lock order) | Scope advisory locks → `BudgetCounter` → `AdmissionLease` → `KillSwitchState` → inserts; reconciler never waits | `f02-role-privilege-design.md` §7, §13; migration header |
| DEC-063 (lease reclaim) | Repeatable `safety-sweep` job, database-clock expiry, skip-locked, no revival of expired leases | F-02 §13; `apps/worker/src/orchestrator/safety-lease-sweep.ts` |
| DEC-068 (audit redaction) — SPEC 008 events only | TypeScript redaction for TypeScript callers; fixed structural payloads for SQL-originated events | F-02 §5, §13 |
| F-02 Q1–Q5 | As in F-02 §13 | F-02 §13 |

Still open and **not** decided here: DEC-047 (single terminal-finalization authority, SPEC 009), DEC-051, DEC-056/057/058/064
(SPEC 009 claim mechanics), DEC-060 (provisional timing values: `ack_grace` 30 s and the 5 s/30 s/60 s constants are
implementation defaults, not calibrated), DEC-061, DEC-032, and the D-1 browser-pool decision. Business pricing, legal
policy and frozen product requirements were not changed.
