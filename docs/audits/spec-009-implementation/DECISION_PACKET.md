# SPEC 009 — decision packet (DEC-047, DEC-051, DEC-066)

**Status 2026-10-29: none of the three is approved.** Checked in `docs/audits/fahes-master-audit/final-planning/DECISION_REGISTER.md` (rows DEC-047/051: *RECOMMENDED — OWNER APPROVAL REQUIRED*; DEC-066: *OWNER DECISION REQUIRED*),
`phase-2/OWNER_DECISIONS_TO_CLOSE.md` Batch 2, and a repository-wide search for an approval record (none). The 2026-10-28 amendment approved DEC-034/044/045/048/049 only. A recommendation is not an approval; this packet is what the owner answers, one line each (`DEC-047: A`).

## What is approved, and what is not (to avoid conflating two things)
- **U-1 (Scan Deadline Policy) as committed in `299b424`** (`contracts/scan-deadline-contract.md`, FR-047, `ScanPlan.deadlineMs/deadlineBreakdown`): the owner's SPEC 009 instruction states the U-1 amendment is part of the approved scope, so its arithmetic is implemented (see `SESSION_PROGRESS.md`).
- **U-1b v5** (a *proposed* later revision: stop definition, ledger lifecycle, loop start, claim mechanics) is **not** approved and was reviewed **NOT READY** (`remediation/U1B_V4_FINAL_REVIEW.md`). **DEC-066 is the decision about that text.** Nothing here treats v5 as approved.

## DEC-047 — single terminal-finalization authority
| | |
|---|---|
| Question | `runtime-finalization-contract.md` non-negotiable rule 1 says `finalizeExecutionUnit` is "the **only** code path that transitions an `ExecutionUnit` to a terminal status". SPEC 012's design (FR-201) needs terminal writes for `ACTIVE_SECURITY`/`AUTHENTICATED_WORKFLOW` inside `SECURITY DEFINER` functions so the worker role holds no status privilege — three entry points. Read literally that is a second path. |
| **Recommended A** | One *logical* `finalizeExecutionUnit` with a database implementation; SPEC 012's entry points call one shared body (idempotency, lease release, guarded edge, snapshot, one-level `BLOCKED`); equivalence proven by a transition-policy equality test. |
| Alternative B | Amend rule 1 to permit several terminal paths. |
| Architecture | A keeps one authority and one place for the F07 lease-release call (008 `f07_release_leases_by_execution` is already transaction-joinable, DEC-045 A). B multiplies the places that must release leases and propagate `BLOCKED`. |
| Security | A keeps the worker role privilege-free for status (matches DEC-044). B widens the trusted surface. |
| Migration / compatibility | A: finalization lives in SQL + a thin TypeScript caller; no change to legacy scans (FR-040). B: a contract amendment but no schema effect. |
| Depends on it | CORE-06 (`finalizeExecutionUnit`), T-U1-7/8/9 (every expiry/fence/gate path finalizes through it), SPEC 012 finalize functions. |

## DEC-051 — effect-authorization ledger (`authorizeEffect`)
| | |
|---|---|
| Question | The plan-unit gate alone cannot stop a *new* authorization after a unit is terminal ("Phase 2C" finding). Should 009 define a generic ledger (authorized → confirmed) that engines' own effect tables conform to? |
| **Recommended A** | Adopt a 009 ledger *contract*; each engine keeps a conforming ledger (SPEC 012 reuses its existing intents). |
| Alternative B | No ledger: accept that a new authorization may be recorded after terminalization. |
| Honest limit of A | A yields "no *new database authorization* after terminalization" only. An effect already authorized and in flight is not prevented by it. |
| Architecture / schema | A adds a table (or per-engine tables) beyond the eight planned models, and per-effect contention on the unit row. **It changes what the schema migration (CORE-01) must contain** — which is why the register blocks CORE-01 on it. |
| Security | A closes post-terminal authorization races (relevant to FR-022a, T-U1-9 fencing). B leaves an acknowledged gap. |
| Depends on it | CORE-01 (schema), CORE-05 (effect fencing), T-U1-9, SPEC 010 E-01, SPEC 011 E-05, SPEC 012 E-07. |

## DEC-066 — the U-1b amendment text
| | |
|---|---|
| Question | Approve the complete SPEC 009 U-1b amendment text? v5 was reviewed **NOT READY**: it contradicts 008 on `STOPPED` (008 now has an approved definition: `STOPPED` only after no live lease, DEC-049 A) and misattributes the concurrency refusal. |
| **Recommended A** | The assistant drafts **v6** incorporating the Phase 2C repairs (stop definition aligned to 008's approved one, terminology, ledger lifecycle, host-loop start) for the owner's review *before* any approval. |
| Alternative B | Approve v5 as it stands. **Not recommended** (known contradictions). |
| Depends on it | SPEC 009 start per the register (G-01/G-02), the committed-text consistency pass, and every task that cites claim/stop/ledger semantics (DEC-056/057/058/064 are the proposed technical clarifications v6 would carry). |
| Note | A v6 draft needs DEC-047/051 answered first (register ordering: DEC-066 follows DEC-021, 048–053). It is therefore the *last* of the three to close. |

## Technical clarifications that ride on these (Level 2; not the owner's to approve unless they choose)
DEC-056 claim-token mechanics · DEC-057 single-statement CAS + `FOR SHARE` lease check · DEC-058 stop-first cause precedence · DEC-064 sweep may finalize `DISPATCHED → REFUSED` without termination confirmation only if the start gate holds. Last session's owner delegation covered **SPEC 008's** technical decisions only; it was not extended to 009. The register marks these "implementation investigation + owner approval of the clarification". Until approved, the **status-by-cause matrix** (T-U1-7), claim/dispatch CAS (CORE-03/04) and effect fencing (T-U1-9) stay unbuilt — the matrix's `DISPATCHED` column is exactly what DEC-064 questions.

## What this packet blocks and what it does not
Blocked: schema migration (CORE-01) and everything that reads or writes `ScanPlan`/`ExecutionUnit`/`Evidence`/`Artifact`, dispatch/claim, finalization, T-U1-1/3/4(integration)/5–10.
**Not** blocked (done this session, or doable): the pure planning rules, contract tests, test harness design, documentation — see `IMPLEMENTATION_BACKLOG.md` (column "independent now").
