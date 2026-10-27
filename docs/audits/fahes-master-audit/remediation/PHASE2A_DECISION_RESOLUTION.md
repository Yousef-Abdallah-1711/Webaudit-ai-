# Phase 2A — Decision Resolution

Recorded 2026-10-22. Source of every answer below: the owner's message in this conversation (not a repository file). Authority of an answer = explicit owner statement; AI recommendations are never counted. **No specification, code, schema or test file was changed in this phase.**

| ID | Owner answer (as given) | Status | Evidence / authority | Implications | Remaining uncertainty |
|---|---|---|---|---|---|
| Q1 | "a + b + c — ADRs are decided. Master-spec approval date: [ENTER ACTUAL DATE]. Contract-freeze date: [ENTER ACTUAL DATE]. Do not infer either date." | **ACCEPTED IN PART — INCOMPLETE** | (a) corroborated by `006/decisions.md` ADR status lines and constitution v1.2.0. (b) and (c) are owner statements with **no date supplied**; the answer contains unfilled template placeholders. No repository record of either act exists | The 006 header and "frozen 006" references in 008/010 **cannot** be edited: the approved wording needs the two dates, and the owner forbade inferring them. Until the dates arrive, documents may say "owner-stated approval and freeze, dates pending" and nothing else | Date of master-spec approval; date of contract freeze (and whether they are the same act) |
| Q2 | "B — enqueue first, then F07 admission on pickup. Record as a formal SPEC 009 amendment requiring explicit approval. Do not silently rewrite U-1. Preserve the existing state model unless the approved amendment explicitly changes it. Define ADMITTED and DISPATCHED consistently across diagram, data model, runtime contract and SPEC 012 references." | **OPTION ACCEPTED; AMENDMENT TEXT NOT YET AUTHORIZED** | Owner statement. The amendment itself needs a separate explicit approval, so no 009 file is edited | See "Q2 analysis" below. Two follow-up questions (Q2.1, Q2.2) must be answered before amendment text can be written without choosing for the owner | Q2.1 meaning of `DISPATCHED`; Q2.2 whether a terminal edge from `DISPATCHED` is required |
| Q3 | (a) U-1 committed as a separate docs-only change set **after** the approved Q2 amendment is reflected in the text; (b) 011 separately after U-1; (c) 012 stays untracked until its open decisions are resolved and independent review is complete; (d) owner runs all commits; prepare path lists and validation evidence only. | **ACCEPTED** | Owner statement | `FUTURE_COMMIT_PLAN.md`. No commit, stage or stash by the assistant, ever | none for the plan itself; the *content* of the first commit is blocked by Q2 follow-ups |
| Q10 | Do not apply RM-A4, RM-B4, RM-B6, RM-C9, RM-E9 if doing so would mix unrelated provenance; prepare them as separate reviewable changes after U-1/011 provenance is separated; RM-B4 remains gated by Q2; use SPEC-prefixed identifiers (`012-P16`, `011-P4`). | **ACCEPTED** | Owner statement | None of the five is applied. RM-B4 and RM-B6 sit in files that U-1 also modifies, so they can only be a **second** 009 change after the U-1 commit. New cross-spec identifiers are SPEC-prefixed from now on | Whether RM-A4 (untracked 012) and RM-E9 (untracked 012) wait until 012 is tracked, or are applied while untracked — they touch only 012 files, so they do not mix with U-1/011 provenance; owner to confirm |
| Q4–Q9 | not answered | **OPEN** | — | Defaults stay in force: `AREA_COUNT` billing unchanged, legacy `DEGRADED` unchanged; Mode P only planned mode with no isolation claim; AR-13/19/22 and AR-18 item 5 unresolved; 012 OD-1, P14, P16 (refuse all), P17, D6 batch, P11 and 011 P1–P8 provisional; U-1 obligations on 010 not imposed beyond text; "independent review" undefined | all as in `OWNER_DECISIONS_REQUIRED.md` |

## Consistency checks on the answers

- Q2 B vs approved invariants: no conflict found with ADR-003/004/005/009 or the approved P-items.
- Q2 B vs SPEC 012: 012 already reads pickup this way. `012/spec.md:416` FR-195 treats U-1 step 0 as a pickup action on a **PLANNED** unit ("the unit stays `PLANNED`"), and `sec_refuse_unclaimed_unit` is `PLANNED`-only. It also keeps `ADMITTED->DISPATCHED` conditional ("skipped when already `DISPATCHED`", `active-security-execution-contract.md:44`) and its test T814 requires `REFUSED` from `PLANNED`, `ADMITTED` **and** `DISPATCHED` (`012/tasks.md:609`).
- Q2 B vs HEAD 009 spec: `009/spec.md:383-385` defines `DISPATCHED` as "a queue job exists for it". Under B a job exists while the unit is still `PLANNED` and F07 has not run. **The existing definition and B cannot both hold** — the amendment must change a definition; the owner has asked for that to be explicit.
- Q3 vs Q2: consistent — U-1 text is committed only after the amendment is reflected in it.
- Q1 vs evidence: no contradiction; only missing dates.

## Q2 analysis (what B requires; nothing chosen beyond B)

Sequence implied by the answer (DOC-derived):
1. Producer: plan resolved; unit `PLANNED`; queue job created with payload `{executionUnitId}`. **No F07 call, no lease while queued.**
2. Pickup: worker re-reads unit/plan/scan; U-1 step 0 (deadline/terminal) → on fail, `REFUSED` from `PLANNED`.
3. F07 `safetyCheckpoint` (authoritative store: PostgreSQL per 008 FR-017; unchanged): `STOP` → `REFUSED(reason)`; `PROCEED` → `ADMITTED` (lease exists from here when concurrency is consumed).
4. `ADMITTED` → `DISPATCHED` → fork → `RUNNING`.
This keeps the existing HEAD meaning of `ADMITTED` ("passed F07") and the 007/008-visible edge set `PLANNED→ADMITTED→DISPATCHED→RUNNING`. It changes the meaning of `DISPATCHED` and invalidates the Phase 1 statement that B needs one edge fewer (see Q2.2 — my Phase 1 note missed the crash window below).

**Q2.1 — what does `DISPATCHED` mean under B?** (state-model change; owner must pick)
- **(i)** "Admitted by F07 and handed to the host for forking; no child process/Guest has started yet." Order unchanged: `PLANNED→ADMITTED→DISPATCHED→RUNNING`. Lease held in `ADMITTED` and `DISPATCHED`. The 009 spec FR-022 sentence ("a queue job exists") and the data-model comment are rewritten; the HEAD diagram label `ADMITTED→DISPATCHED: queue job created` is rewritten to "dispatch to host".
- **(ii)** "A queue job exists" kept literally: `DISPATCHED` is set at enqueue, **before** F07, so admission follows it. This reorders the state model (`PLANNED→DISPATCHED→ADMITTED→RUNNING`) and changes the meaning of `ADMITTED` and the HEAD edges; every consumer of `ADMITTED→DISPATCHED` (012 `sec_transition_unit`, T814) changes.
- **(iii)** Remove `DISPATCHED` as a persisted pre-`RUNNING` state (fork and `RUNNING` in one step). Smallest crash window but removes an enum value used by 008/010/011/012 text.
Trade-offs: (i) minimal text change and matches 012's sequence; (ii) honours the old definition but is the largest model change; (iii) fewest states but touches the enum.

**Q2.2 — terminal edge from `DISPATCHED`.** Under (i) a crash or deadline between `ADMITTED→DISPATCHED` and `DISPATCHED→RUNNING` leaves a unit in `DISPATCHED` holding a lease; the scan deadline then expires. Today's `expirePlanUnits` matrix finalizes it with `DISPATCHED→REFUSED`. Without that edge no valid terminal move exists from `DISPATCHED` (`FAILED` is defined for `RUNNING`). Options: keep the U-1 edge `DISPATCHED→REFUSED` (and rename its reason), or allow `DISPATCHED→FAILED` (`TRANSIENT_INFRASTRUCTURE`) — a different edge, or accept (iii). `PLANNED→REFUSED` is needed under every variant (step 0 refusal from `PLANNED`).

**Other items the amendment must define** (already enumerated in the Phase 1 brief; to be written once Q2.1/Q2.2 are answered): lease acquisition, renewal and release (release capability is AR-19 — not invented here); finalization authority (AR-18 item 5, Q6 — remains open); crash/orphan cleanup depends on AR-22 (open); the immutable plan deadline text of U-1 is unchanged; obligations on SPEC 010 depend on Q8 (open).

## SPEC references that the amendment will touch once authorized (inventory, not edits)

- 009: `spec.md:382-385` (FR-022 definitions), `data-model.md:53-65` comments, `plan.md:253-261` diagram, `contracts/execution-runtime-contract.md` steps 0–4 and 6a, `contracts/execution-unit-contract.md` rule 7, `contracts/runtime-finalization-contract.md:19,50-52`, `contracts/scan-deadline-contract.md:113-128,177-200,266-272`, `tasks.md` T-U1-4/T-U1-7/T-U1-9.
- 012 (untracked; wording only, after the amendment is approved): `spec.md` FR-183 (:401), FR-195 (:416); `contracts/active-security-execution-contract.md:43-44,265,276`; `contracts/auth-workflow-execution-contract.md:40`; `data-model.md:1191`; `plan.md:367`; `tasks.md` T814 (:609), T056 (:90); `upstream-amendment-requests.md` AR-18.
- 011: no reference to `DISPATCHED` or to the two added edges found in its normative files (spec, plan, data-model, tasks, research, contracts, checklists); it cites U-1 generically.
- 010: none.
