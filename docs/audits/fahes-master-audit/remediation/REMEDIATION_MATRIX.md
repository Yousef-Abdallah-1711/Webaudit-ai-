# Remediation Matrix — Phase 1

Baseline: HEAD `e42577304a2ccec873b30bbbf1d712e6348f6196` (2026-10-08 21:33 +0300), branch `main`. Written 2026-10-22. Sources: the Master Audit in `docs/audits/fahes-master-audit/` and the Independent Review (terminal output only; it is **not stored** in the repo, so its corrections are re-verified below with evidence).

**Classification keys**: DOCUMENT_CONFLICT · OWNER_DECISION · SPEC_AMENDMENT · IMPLEMENTATION_GAP · TEST_EVIDENCE_GAP · AUDIT_DATA_GAP · PROVENANCE_GAP.
**Status keys**: OPEN · READY_FOR_OWNER (analysis done, owner input needed) · REMEDIATED_PENDING_REVIEW (a repair exists and has a validation criterion). **Phase 1 made no edit to any existing file, so no item is REMEDIATED_PENDING_REVIEW** (rationale in `PHASE1_REMEDIATION_REPORT.md` §3). Items marked "safe candidate" could be repaired without a product decision and are queued for Phase 2.

Evidence labels: `HEAD`, `WORKING_TREE`, `DOC` (document text), `CODE` (current code, HEAD unless stated).

## A. Source of truth and provenance

| ID | SPEC | Evidence | Class | Depends on | Safe without owner? | Proposed remediation | Validation criterion | Status |
|---|---|---|---|---|---|---|---|---|
| RM-A1 | 006 vs 008/010 | `006/spec.md:7` "Draft"; `010/spec.md:46,807` and `008/spec.md:25` treat 006 as frozen; `006/decisions.md` ADR-004/005/006/007 "Decided (product-confirmed 2026-10-07)", ADR-008 "Decided and implemented"; constitution v1.2.0 amended 2026-10-07 (`.specify/memory/constitution.md:551`); `006/tasks.md` all 15 planning tasks checked | DOCUMENT_CONFLICT, OWNER_DECISION | — | **No**: setting the status is an owner act. Repo evidence supports "ADRs decided, constitution amended" but shows **no** owner statement that the master spec is frozen | Replace the single `Status` token by the five-axis vocabulary in RM-A5; exact candidate wording in `OWNER_DECISIONS_REQUIRED.md` Q1 | 006 header states each axis separately; every downstream "frozen 006" reference names the axis it means | READY_FOR_OWNER |
| RM-A2 | 009 (→ 011, 012) | `WORKING_TREE`: 10 modified 009 files (+169/−4) and untracked `contracts/scan-deadline-contract.md`; `HEAD`: `plan.md:257` has only `ADMITTED --> REFUSED`, no `PLANNED/DISPATCHED --> REFUSED` | PROVENANCE_GAP, OWNER_DECISION | RM-B1 (settle ordering before freezing text) | No | Owner decides commit/confirm (AR-8) after RM-B1 is ruled on; commit as one attributable change set | `git show HEAD:…/scan-deadline-contract.md` exists; `git diff` for 009 empty | READY_FOR_OWNER |
| RM-A3 | 011 | `specs/011-…/` untracked (37 `.md`); header "FROZEN … 2026-10-10"; P1–P8 UNCONFIRMED; closure review claims two independent reviews not stored | PROVENANCE_GAP | RM-A2 | No | Owner decides commit/confirm (AR-9) after RM-A2; header to state which axes hold | `git ls-files specs/011*` non-empty | READY_FOR_OWNER |
| RM-A4 | 012 | `specs/012-…/` untracked (64 `.md`); `spec.md:7` lists self-reviews "through the master pass" and omits `final-certification-repair.md` (IC-1…7, F1…F7); header is otherwise correctly "NOT FROZEN" | PROVENANCE_GAP, DOCUMENT_CONFLICT | RM-A2, RM-A3 | **Header addition is safe** (adds a fact, decides nothing) but is deferred (see report §3) | Add one sentence naming the final pass and that it is a self-review | grep of `spec.md:7` for `final-certification-repair.md` | OPEN (safe candidate) |
| RM-A5 | all | Header vocabulary conflates: planning freeze, owner approval, implementation, activation. Evidence: 007–010 "frozen" with zero code; 011 "FROZEN" untracked; 012 "NOT FROZEN"; constitution/ADR "Decided" | DOCUMENT_CONFLICT, SPEC_AMENDMENT | RM-A1 | Vocabulary proposal is safe; applying it to frozen headers needs owner consent | See "Status vocabulary" below | every spec header carries the four axes | READY_FOR_OWNER |
| RM-A6 | 012, 011 | Reviews called independent are self-declared (`012/adversarial-rereview.md` §1 "I am an independent re-reviewer"); `011/adversarial-review-u1.md:3` states it is **not** independent; later cited reviews not stored | TEST_EVIDENCE_GAP | — | Yes (labelling) | Add an "Independence" column (`SELF_DECLARED_SEPARATE_SESSION` / `NOT_INDEPENDENT` / `NOT_STORED`) in the corrected findings data | every review cited in any status line has a stored file and an independence label | OPEN |
| RM-A7 | tooling | `.specify/feature.json` → 011; SpecKit Analyze would rewrite it; 012 never had an official Analyze | PROVENANCE_GAP | RM-A3 | No (tool behaviour) | Owner decides when to re-point; until then use read-only scripts | unchanged `feature.json` hash | OPEN |

### Status vocabulary (proposal; nothing applied)

`PLANNING_STATUS` (DRAFT / PLANNING_COMPLETE) · `AUTHORITY` (ADRs-decided / OWNER_APPROVED(date) / NOT_APPROVED) · `CONTRACT_FREEZE` (NOT_FROZEN / FROZEN(date) with `git` commit id once tracked) · `IMPLEMENTATION` (NONE / PARTIAL / COMPLETE, with evidence path) · `ACTIVATION` (OFF / gates open, e.g. AG1–AG10, SG1–SG10). Today's truth (VERIFIED/DOC): IMPLEMENTATION = NONE and ACTIVATION = OFF for 007–012.

## B. State machine and execution ordering (SPEC 009 U-1)

Full analysis: `U1_PICKUP_ORDERING_OPTIONS.md`.

| ID | SPEC | Evidence | Class | Depends on | Safe? | Proposed remediation | Validation | Status |
|---|---|---|---|---|---|---|---|---|
| RM-B1 | 009 | `data-model.md:53-65` (enum comments) ADMITTED = "passed F07 safetyCheckpoint… about to dispatch", DISPATCHED = "a queue job exists"; HEAD `plan.md:253-258` PLANNED→ADMITTED on PROCEED, ADMITTED→DISPATCHED on queue job; `execution-runtime-contract.md` enqueues (step 1) **before** F07 (step 3) and sets DISPATCHED after (step 4) | DOCUMENT_CONFLICT, OWNER_DECISION | — | **No** (choice of sequence) | Owner chooses one of Options in `U1_PICKUP_ORDERING_OPTIONS.md`; then one normative sequence replaces the three | one sequence diagram + one numbered contract agree on status at every step; AR-18 items 1–2 closed by text | READY_FOR_OWNER |
| RM-B2 | 009 | `execution-runtime-contract.md` step "0" is placed before "1. Enqueue" but described "on pickup after the re-read and before F07"; `6a` precedes `6` in the amended list | DOCUMENT_CONFLICT | RM-B1 | Renumbering is cosmetic but its position depends on RM-B1 | Re-place after the chosen ordering | numbering monotonic; step text and position agree | OPEN |
| RM-B3 | 009 | `runtime-finalization-contract.md:19` `REFUSED` "never admitted at all" vs `scan-deadline-contract.md:182-186` refusing `ADMITTED`/`DISPATCHED` units; AR-18 item 4 | DOCUMENT_CONFLICT | RM-B1 | Wording fix once RM-B1 decided | Redefine `REFUSED` as "terminal before RUNNING" | all uses of `REFUSED` consistent | OPEN |
| RM-B4 | 009/008 | runtime step 3 "`REFUSED or KILLED`" vs diagram (KILLED only from RUNNING) and matrix `REFUSED(KILL_SWITCH_PENDING)`; AR-18 item 3 | DOCUMENT_CONFLICT | RM-B1 | **Probably safe**: diagram and matrix agree; only step 3 text differs. Deferred with RM-B1 to avoid piecemeal edits | State `REFUSED` for pre-RUNNING stops | step 3 text equals matrix row | OPEN (safe candidate) |
| RM-B5 | 009/008 | `scan-deadline-contract.md:188-190` ADMITTED/DISPATCHED units "hold an F07 lease when checkpoint already returned PROCEED"; step 0 "no F07 call, no lease" (`:121-126`); lease acquisition point differs per ordering option | DOCUMENT_CONFLICT | RM-B1 | No | Settle with RM-B1; define lease-holding statuses explicitly | table: status × lease held? | OPEN |
| RM-B6 | 009 | `plan.md` (WT) "`deadlineMs` … null iff REFUSED" vs `data-model.md` (WT) "non-null iff RESOLVED" | DOCUMENT_CONFLICT | — | **Yes** (logically equivalent for plan states REFUSED/RESOLVED; a wording harmonization only) | Use the data-model wording | grep both files for the same predicate | OPEN (safe candidate) |
| RM-B7 | 011, 012 | 14 files in 011 and 40 in 012 cite U-1/`scan-deadline`; 011 AG2/AG3, 012 SG1 (T814 transition-policy equality, CI status of T-U1-10); 012 plans against the working-tree text | PROVENANCE_GAP, SPEC_AMENDMENT | RM-A2, RM-B1 | No | Re-validate every 011/012 citation after the ordering ruling | citation list in `SPEC_DEPENDENCY_MAP.md` §4 all re-checked | OPEN |
| RM-B8 | 009 | Only review of U-1 is `011/adversarial-review-u1.md` — self-review; no 009-side independent review; `M` uncalibrated (`scan-deadline-contract.md:299-301`) | TEST_EVIDENCE_GAP | RM-B1 | No | Independent review of the final text | stored review file with independence label | OPEN |
| RM-B9 | 009/010 | U-1 imposes `hardStopMarginMs`, backstop, `onUnitExpired`, module-result finalizer on BROWSER/CRAWLER (`scan-deadline-contract.md:291-301`) while 010 text is frozen and silent | SPEC_AMENDMENT, OWNER_DECISION | RM-A2 | No | Owner states whether this is an implementation obligation or a 010 amendment | decision recorded | READY_FOR_OWNER |

## C. Cross-spec architecture and security contracts

| ID | SPEC | Evidence | Class | Depends on | Safe? | Proposed remediation | Validation | Status |
|---|---|---|---|---|---|---|---|---|
| RM-C1 | 008 ↔ 012 | `008/contracts/safety-admission-contract.md:12-20` `requestAdmission(targetId,userId,…,executionId,idempotencyKey,consumes,now)` all caller-supplied; header says "shape, not a finalized interface"; 012 MA-18/AR-19 | SPEC_AMENDMENT | C3 | No | Clarify trust model: trusted-caller-only, or derive identity/clock from context (012 4.10C wrappers) | 008 states which callers may invoke it | OPEN |
| RM-C2 | 007/008/009 | AR-13 (DB roles/security-definer; REQUIRED FOR ACTIVATION). `CODE`: no role/RLS/SECURITY DEFINER in `apps/api/prisma` or `infrastructure`; worker and API use plain `DATABASE_URL` (`apps/worker/src/db.ts:26`) | SPEC_AMENDMENT, IMPLEMENTATION_GAP, OWNER_DECISION (OD-2) | RM-D? none; RM-E3 | No | Schedule design with 007/008/009 owners **before** their schemas are built | role/grant matrix reviewed by all three owners | READY_FOR_OWNER |
| RM-C3 | 008 | AR-19: `releaseLease` unspecified (`008/contracts/safety-checkpoint-contract.md:37`); no unit-keyed, transaction-joinable release | SPEC_AMENDMENT | RM-C2 | No | 008 owner provides capability or accepts alternative | 008 text names signature + transaction contract | OPEN |
| RM-C4 | 009/011/012 | AR-22: absolute hard TTL, dead-man switch, orphan reconciler (restates `scan-deadline-contract.md:286-289`) | SPEC_AMENDMENT, IMPLEMENTATION_GAP | RM-B1 | No | Confirm 009 rule 3 applies to E14/E15 | recorded decision + task | OPEN |
| RM-C5 | 009 ↔ 012 | AR-18 item 5: `runtime-finalization-contract.md` rule 1 "only code path" vs 012 `sec_finalize_unit`/`sec_refuse_unclaimed_unit`/`sec_sweep_finalize_unit` | SPEC_AMENDMENT | RM-C2 | No | 009 owner: "one logical function, database implementation" or amend | decision recorded | READY_FOR_OWNER |
| RM-C6 | 007 | Ownership ≠ authorization (ADR-004). `CODE`: only ownership/control level (`ControlLevel` enum `schema.prisma:55`, `services/control-gate/`); no `TargetAuthorization` | IMPLEMENTATION_GAP | — | n/a | Implement 007 | 007 acceptance tests | OPEN |
| RM-C7 | 007 | Execution-class scoped grants: no implementation (symbol search + inspection of schema and services) | IMPLEMENTATION_GAP | RM-C6 | n/a | as C6 | — | OPEN |
| RM-C8 | 012 | Tenant isolation / worker privilege boundary: no implementation; legacy has no DB roles; isolation claimed only in Mode S (`final-owner-approval-package.md:26-33`) | IMPLEMENTATION_GAP, OWNER_DECISION (OD-4) | RM-C2 | No | See `OWNER_DECISIONS_REQUIRED.md` Q5 | — | READY_FOR_OWNER |
| RM-C9 | 008 | **Guardrail** — `apps/api/src/services/queue/admission-gate.ts` is a Redis Lua queue-capacity reservation (30 s TTL) for `SCAN_QUEUE_MAX_WAITING`. It is **not** F07 Safety Admission: no per-target budgets, no lease fencing, not PostgreSQL-authoritative (008 requires durable state in the database, FR-017). It must not be cited as partial F07 evidence | DOCUMENT_CONFLICT (risk of misreading) | — | **Yes** (a clarifying note; no decision) | Add the note to PROJECT_MAP/008 implementation notes in Phase 2 | note present; audit docs cite it correctly | OPEN (safe candidate) |

## D. Billing and settlement (analysis only; no policy chosen)

Full conflict statement and alternatives: `OWNER_DECISIONS_REQUIRED.md` Q4.

| ID | SPEC | Evidence | Class | Depends on | Safe? | Proposed remediation | Validation | Status |
|---|---|---|---|---|---|---|---|---|
| RM-D1 | 012/006 | OD-3: P15 (approved principle) vs default `AREA_COUNT` (`012/spec.md:410` FR-189); `CODE`: `refundForUndelivered` proportional by area count (`packages/config/src/refund.ts:15-25`); `MODULE_STATES_SCORED=['COMPLETE','DEGRADED']` (`domain.ts:84`) | OWNER_DECISION | — | **No** | Owner picks Option 1 or 2 | decision recorded; FR-189 text matches | READY_FOR_OWNER |
| RM-D2 | 006 | ADR-005 (`decisions.md:63-76`): only `LOAD_CAPACITY` and `SOURCE_EXECUTION` metered; ACTIVE_SECURITY and AUTHENTICATED_WORKFLOW flat-priced; AR-17 requests amendment for class-level settlement | SPEC_AMENDMENT, OWNER_DECISION | RM-D1 | No | Only if Option 2 | ADR-005 amended or explicitly left | READY_FOR_OWNER |
| RM-D3 | 012/legacy | **DEGRADED semantic overload**: legacy `DEGRADED` = "missing interpretation, not measurement" (`packages/scoring/src/aggregate.ts:19-21`); 012 uses a *partial-coverage* meaning with `coverageComplete:false` and P13 "never a readiness PASS" (approved). Existing readiness/diff code treats DEGRADED as lower-confidence (`worker/readiness/diff.ts:95-141`) | DOCUMENT_CONFLICT, IMPLEMENTATION_GAP | RM-D1 | Naming clarification safe; behaviour not | Record both meanings in the glossary; do not change code | glossary entry exists | OPEN |
| RM-D4 | 012 | Refund path equal-share by area vs actual-work principle; call sites: `credits/refund.ts`, `orchestrator/terminal-refund.ts`, `orchestrator/timeout.ts` (`isDelivered`), `api/routes/scans.routes.ts`, `admin/margin.service.ts`, `intake/create-scan.ts` | IMPLEMENTATION_GAP | RM-D1 | No | None until RM-D1 | — | OPEN |

## E. SPEC 012 decisions and review evidence

| ID | SPEC | Evidence | Class | Status |
|---|---|---|---|---|
| RM-E1 | 012 | OD-1 settlement retention (`master-owner-decision-register.md:29`) | OWNER_DECISION | READY_FOR_OWNER |
| RM-E2 | 012 | OD-2 scheduling AR-13/AR-19 (`:30`) | OWNER_DECISION | READY_FOR_OWNER |
| RM-E3 | 012 | OD-3 billing (see D1) | OWNER_DECISION | READY_FOR_OWNER |
| RM-E4 | 012 | OD-4 isolation mode (`final-owner-approval-package.md:22-35`); register still shows superseded Option A/B table at `:32` beside the appended Mode S/P update at `:50` | OWNER_DECISION, DOCUMENT_CONFLICT | READY_FOR_OWNER |
| RM-E5 | 012 | P14 reverify billing; P16 Destination Authorization Policy (default refuse all); P17 class-level billing; D6 batch P4, P5, P6, P8, P9, P12, P18; P11 deferred | OWNER_DECISION | READY_FOR_OWNER |
| RM-E6 | 012 | 112 of 142 register rows are `REPAIRED_IN_DOCUMENTS_ONLY`; none verified; no stored independent review after 2026-10-11 | TEST_EVIDENCE_GAP | OPEN |
| RM-E7 | 012 | Recovery: parent crash, orphaned claims/credentials, audit-row rollback (named limit, `data-model.md` 4.10D/4.10F); AR-22 | IMPLEMENTATION_GAP, TEST_EVIDENCE_GAP | OPEN |
| RM-E8 | 012 | Managed-Postgres feasibility (CHK044–057, `data-model.md` 4.10E) | TEST_EVIDENCE_GAP | OPEN |
| RM-E9 | 012 | Mixed OD naming: master register's OD-4 default text vs final package | DOCUMENT_CONFLICT | OPEN (safe candidate: add a "superseded by" pointer) |

## F. Planning and audit quality

| ID | Scope | Evidence | Class | Safe? | Proposed remediation | Validation | Status |
|---|---|---|---|---|---|---|---|
| RM-F1 | 009 | `tasks.md`: 39 checked planning tasks + T-U1-1..10; no implementation tasks for FR-001…046 | IMPLEMENTATION_GAP (planning) | Yes (new task list is not a decision) | Phase 2: draft task list | every FR cited by ≥ 1 implementation task | OPEN |
| RM-F2 | 010 | `tasks.md` 48 planning tasks; no implementation tasks | as F1 | Yes | Phase 2 | as F1 | OPEN |
| RM-F3 | 011/012 | Same labels, different meanings: `P1–P8`, `F-nn` vs `F1–F7`, `A1–A5`, `N-5/6/10` | DOCUMENT_CONFLICT | Yes for new docs | Spec-prefixed IDs in all *new* documents; map table for old ones | no ambiguous bare ID in new docs | OPEN |
| RM-F4 | audit CSV | `SPEC_TRACEABILITY.csv`: CodeLocation/Test columns identical on all 538 rows, `Dependencies` empty on 538, `VerificationStatus` UNVERIFIED on all, no line numbers | AUDIT_DATA_GAP | Yes | Correction design (below) | schema checks | OPEN |
| RM-F5 | audit CSV | `FINDINGS_REGISTER.csv`: 142 rows, all SPEC 012; none for 007–010; 011's `adversarial-review.md` (107 KB) and U-1 review F1–F8 not ingested; 58 of 78 original scenarios only grouped | AUDIT_DATA_GAP | Yes | Correction design | coverage table per spec | OPEN |
| RM-F6 | audit CSV | Severity values: High/HIGH, Medium/MEDIUM/MED, Low/LOW, LOW-MED, UNSTATED×67, BLOCKER | AUDIT_DATA_GAP | Yes | Normalize to CRITICAL/HIGH/MEDIUM/LOW/UNGRADED with `SourceSeverity` preserved | closed enum check | OPEN |
| RM-F7 | audit | `E-04` command in the evidence index (`PLANNED *(->|→) *REFUSED`) misses Mermaid `-->`. Conclusion was re-verified with all arrow forms (HEAD: no match in 008/009/010). | AUDIT_DATA_GAP | Yes | Correct the recorded command in Phase 2 (do not overwrite the audit now) | reproducible command in index | OPEN |
| RM-F8 | audit | Prior audit said "0 matches ⇒ none exist"; legacy analogs exist (RM-C9; ownership gate) | AUDIT_DATA_GAP | Yes | Add "legacy analog" column | column present | OPEN |

### Correction design for the CSVs (to be built in a later phase; existing CSVs untouched)

`TRACE_v2` columns: `Spec`, `ReqId` (spec-prefixed, lettered sub-IDs kept, e.g. `007-FR-005a`), `SourceRef` (`path:line`), `Status axes` (four from RM-A5), `ImplEvidence` (`path:symbol` or `NONE_FOUND` + search method + date), `LegacyAnalog` (path:line + "NOT_EQUIVALENT"/"PARTIAL" + reason), `TestRef` (planned test id or existing test path), `TestRun` (`NOT_RUN` / command + date + result), `DependsOn` (list of `Spec-ReqId`/`AR-n`/`OD-n`), `Blocker` (decision id), `EvidenceLabel` (VERIFIED/DOCUMENTED/…), `ReviewIndependence`.
`FINDINGS_v2` columns: `FindingId` (spec-prefixed), `Spec`, `Source` (`path:line`), `SeverityNorm`, `SourceSeverity`, `Class` (this file's keys), `Status` (OPEN / REPAIRED_IN_DOCUMENTS_ONLY / VERIFIED_CLOSED …), `ClosureEvidence` (required for VERIFIED_CLOSED: stored independent review path or test run), `Independence`, `DependsOn`. Coverage gate: at least one row set per SPEC 006–012 plus an explicit statement of which review files were ingested (011 `adversarial-review.md`, `adversarial-review-u1.md`, `closure-review.md`; 012 files).

## Dependency among remediation items

`RM-B1` → {B2, B3, B4, B5, B7, B8, A2} · `RM-A1` → A5 → (all header edits) · `RM-A2` → A3 → B7 · `RM-E2/C2` → C3, C5, C8 · `RM-D1` → D2, D4 · `RM-E4` → C8 · F1/F2 independent of owner decisions except B1 (009 tasks should wait for the ordering ruling).
