# Fahes Master Audit Report — SPEC 006–012 Reconciliation and Engineering Handover

**Audit date**: 2026-10-19 · **Auditor**: the main Claude Code session only (no subagents, no delegation, no second reviewer) · **Mode**: read-only audit; the only files created are in `docs/audits/fahes-master-audit/`.

> **This audit is not an implementation, not an independent certification, not a freeze, and not a production-readiness approval.** Nothing was committed, pushed, deployed, migrated, frozen or released.

Companion files: [SPEC_TRACEABILITY.csv](SPEC_TRACEABILITY.csv) · [FINDINGS_REGISTER.csv](FINDINGS_REGISTER.csv) · [DECISIONS_AND_AMENDMENTS.md](DECISIONS_AND_AMENDMENTS.md) · [IMPLEMENTATION_GAP_BACKLOG.md](IMPLEMENTATION_GAP_BACKLOG.md) · [NEXT_AGENT_HANDOVER.md](NEXT_AGENT_HANDOVER.md) · [AUDIT_EVIDENCE_INDEX.md](AUDIT_EVIDENCE_INDEX.md)

---

## 1. Executive summary

1. **Fahes today is the WebAudit AI MVP**: a passive-HTTP scan platform (Next.js web, Express API, BullMQ worker, Prisma/Postgres, Redis, a sandbox-runner and a probe-pool *library*). Its application code was last changed on **2026-10-01** (commit `a7db433`; VERIFIED, E-08). Since then only specs, docs and frontend design work were committed or are sitting in the working tree.
2. **SPECs 007–012 are planning artifacts only. Zero of their requirements are implemented.** A repository-wide search of `apps/`, `packages/`, `scripts/` and `infrastructure/` for 18 spec-owned symbols (`ExecutionGrant`, `ExecutionClass`, `ScanPlan`, `ExecutionGraph`, `ExecutionUnit`, `KillSwitch`, `SafetyAdmission`, `ExecutionLease`, `SafetyBudget`, `CredentialBroker`, `SOURCE_EXECUTION`, `SOURCE_STATIC`, `TestIdentity`, `deadlineMs`, `EvidenceEnvelope`, `fencing`, …) returned **0 matches** (VERIFIED, E-05). None of the planned packages/apps/services (`apps/credential-broker`, `packages/security-engine`, `packages/source-analysis`, `apps/api/src/services/planning|authorization|safety|security`, …) exist (VERIFIED, E-06). The Prisma schema has 29 models and 20 enums, none of them 007–012 entities (VERIFIED, E-07).
3. **"Frozen" is a document header, not a code or Git fact.** 006 says *Draft*; 007, 008, 009, 010 say "Planning complete — frozen"; 011 says *FROZEN* but is **entirely untracked** in Git; 012 says **NOT FROZEN**. The 009 amendment U-1, on which 011 and 012 depend, exists **only in the working tree** (VERIFIED, E-03/E-04).
4. **Checked task boxes are misleading.** The 102 checked tasks in 006/009/010 (15 + 39 + 48) are *planning-session activities*, not implementation (their `tasks.md` headers say so). 007 (42 tasks) and 008 (36 tasks) have genuine implementation task lists, **all unchecked**. 011 (347) and 012 (538) have implementation task lists, all unchecked. **009 and 010 have no implementation task decomposition at all** other than 009's T-U1-1..10 — the foundation of the whole chain lacks a backlog (VERIFIED by file inspection; see section 6).
5. **SPEC 012 is the most-reviewed and least-certified spec.** It had one independent adversarial review and one independent re-review (2026-10-11, verdict READY-WITH-REPAIRS, 1 GAP + 19 WEAK of 53 scenarios open). Every later pass (third → seventh repairs, master audit MA-01…MA-19, IC-1…IC-7, delta F1…F7) was a repair or self-review by the same line of work; the independent reviews they cite are **not stored in the repository**. Of 142 register rows, 112 are `REPAIRED_IN_DOCUMENTS_ONLY`, 22 `OPEN`, 6 `UNKNOWN`, 2 `DEFERRED`, **0 `VERIFIED_CLOSED`**.
6. **The self-reported counts for SPEC 012 reproduce**: 201 FRs (contiguous), 538 tasks (unique), 83 reason codes, 20 planned models, 19 contracts, 19 Mermaid blocks, 237 checklist items (207 checked / 30 open) — all recomputed by this audit (VERIFIED, E-09). The documents are *internally countable*; that says nothing about runtime correctness.
7. **The dominant risk is a security-design dependency chain with no implementation foundation**: 012's tenant isolation under a compromised worker depends on database privileges and security-definer functions over tables owned by 007/008/009 (AR-13, AR-19), on an owner choice between a tenant-scoped and a shared worker pool (OD-4, Mode S vs Mode P), and on a hosting-failure backstop (AR-22) — none implemented, three not approved. The documents themselves state that tenant isolation is **claimed only in Mode S**.
8. **Billing has a stated, unresolved conflict (OD-3)**: the approved principle P15 ("charge only for executed work") conflicts with today's verified behavior (`DEGRADED` is a scored/delivered state; refunds are proportional to undelivered *areas*).

**Recommended first move** (section 15): commit-or-confirm the provenance of 009 U-1 and 011 *as separate docs-only change sets* (owner approval; AR-8/AR-9), then create the missing 009/010 implementation task lists, then implement the 007 → 008 → 009 foundation. Do not start 011/012 implementation.

---

## 2. Scope, methodology and evidence labels

**Scope**: the repository at `C:/Users/Yousef/Desktop/Projects/motakamel`, SPEC 006–012, relevant code, Git state. SPEC 013/014 were not designed.

**Evidence labels** — `VERIFIED` directly observed in inspected code/command output · `DOCUMENTED` stated in a project artifact, not verified in implementation · `CLAIMED` asserted by an agent/document without corroboration · `INFERRED` reasoned, with rationale · `UNKNOWN` insufficient evidence · `CONFLICTING` authoritative sources disagree.

**Reading depth (honest scope statement).** The specs total roughly 3 MB of text (SPEC 012 alone: `spec.md` 205 KB, `tasks.md` 255 KB, `data-model.md` 199 KB, 19 contracts of 21–54 KB each). This audit did **not** read every line of every document.

| Read in full | Read in part / by structure |
|---|---|
| `PROJECT_MAP.md`; 012 `master-owner-decision-register`, `master-upstream-dependencies`, `master-validation-results`, `seventh-review-handoff`, `master-audit-findings`, `final-certification-repair`; 011 `closure-review.md`; `packages/config/src/refund.ts` | All spec headers/status lines; FR indexes and task structures for 006–012; 012 `adversarial-rereview` (scoreboard, new issues, residuals, verdict), 012 `closure-review` (blocker table), the third → sixth repair matrices (finding rows), `upstream-amendment-requests` (summary table), `final-closure-readiness` and `master-independent-review-handoff` (openings); 011 `upstream-amendment-requests` (U-1); 006 `decisions.md` (open decisions, ADR index) and `roadmap.md`; 3 of the 10 modified SPEC 009 contracts and the `spec.md` diff; 007/008 FR openings; legacy code symbols |

Consequently per-FR statements in `SPEC_TRACEABILITY.csv` are **text-extracted** (FR heading + task citations by regex), implementation status is derived from a repository-wide symbol search, and `ConfidenceAndNotes` says so. Anything that required reading a contract body that was not read is marked `DOCUMENTED` or `UNKNOWN`.

**Constraints honoured**: no subagents; no destructive Git; no commit/push; no spec, migration, source or config edits; no migrations/seeds; no tests, probes or hostile code; SpecKit Analyze **not** run (see 14).

---

## 3. Repository identity and baseline (VERIFIED, E-01…E-04)

| Item | Value |
|---|---|
| Root | `C:/Users/Yousef/Desktop/Projects/motakamel` |
| Branch / HEAD | `main` / `e42577304a2ccec873b30bbbf1d712e6348f6196` (2026-10-08 21:33 +0300, "test(web): verify marketing fidelity and prune old artifacts"); 222 commits; no stash |
| Working tree at audit start | 34 entries: 24 modified, 10 untracked (identical to the start-of-session snapshot) |
| Working tree at audit end | 35 entries = the same 34 + `docs/audits/fahes-master-audit/` (this audit). No pre-existing file was altered (re-checked, section 14) |
| `.specify/feature.json` | points to `specs/011-source-backend-database-testing-platform` (unchanged) |
| `.github/` | absent — no CI workflow in this checkout (matches PROJECT_MAP) |

**Pre-existing changes (not mine)**

| Group | Entries | Nature | Status of provenance |
|---|---|---|---|
| Frontend design | 14 modified `apps/web/**` files (`tailwind.config.ts`, tokens, `AdminShell`, `Sidebar`, `Badge`, …) + untracked `apps/web/audit-sweep.mjs`, `auth-state.mjs`, `docs/audits/frontend-design/` | in-progress visual-system work; unrelated to 006–012 | INFERRED intentional; no commit evidence |
| SPEC 009 U-1 amendment | 10 modified files in `specs/009-…` (+169/−4) + untracked `contracts/scan-deadline-contract.md` | controlled upstream amendment raised by SPEC 011, "owner-authorized 2026-10-10" (DOCUMENTED) | **uncommitted** |
| SPEC 011 | `specs/011-source-backend-database-testing-platform/` untracked (37 `.md` files) | frozen planning package | **untracked** |
| SPEC 012 | `specs/012-security-auth-api-testing-platform/` untracked (64 `.md` files) | planning package, not frozen | **untracked** |
| Showcase output | `showcase-eink/`, `showcase-esaalnybot/`, `showcase-omanda-ai/`, `showcase-trimora/` | client-audit-showcase demos | INFERRED unrelated; **must not be swept into a spec commit** (012 closure-review §7 warns against `git add -A`) |

Line-ending note: five `apps/web` files emit "CRLF will be replaced by LF" warnings; 012 says its older files use CRLF and new files LF (DOCUMENTED).

---

## 4. Current product and architecture overview

**Legacy / current system (DOCUMENTED by PROJECT_MAP, spot-verified)**: URL / GitHub zipball / ZIP intake → API validation + quote + credit debit → BullMQ phase jobs → worker capabilities (deterministic checks) → redacted AI interpretation → persisted report → WebSocket progress; fix assertions enqueue narrow re-verification; readiness re-audits against a baseline. Node ≥ 22, pnpm 9, Turbo; Next.js 15/React 19, Express, Prisma/Postgres, BullMQ/Redis; apps `web`, `api`, `worker`, `probe-pool` (library only — "no runnable server/transport yet"), `sandbox-runner`; nine shared packages (E-12). 283 `*.test.ts` files exist under `apps/` and `packages/` (VERIFIED count; none exercises a 007–012 requirement; **none was executed**).

**v2 architecture (SPEC 006–012, DOCUMENTED, none built)**:

* 006 is the master contract: execution-class matrix, ADR-001…009, constitution principles VIII–XIV, roadmap of child specs F01–F07, E10–E17, D20–D27, U30–U34.
* Foundation: **007 (F01)** TargetEnvironment, TargetAuthorization (per-execution-class grants), ScopeDefinition; **008 (F07)** Safety Admission, leases + fencing, budgets, kill switch, execution audit; **009 (F02+F03+F04)** ScanPlan / ExecutionGraph / ExecutionUnit, Evidence envelope, artifacts, runtime/queue/progress/cancellation, finding materialization, plus **U-1** plan-level scan deadline.
* Engines/domains: **010** E10 browser, E11 crawler, D22 UX, D23 accessibility, D24 functional web, D25 SEO; **011** E12 SOURCE_STATIC, E13 SOURCE_EXECUTION (hostile code in a not-yet-chosen Execution Plane), D26; **012** F05 secrets/sessions, E14 active security, E15 authenticated workflow, D20 security, API / business-logic testing.
* Roadmap items **not yet specified**: E16 load, E17 telemetry, D21, D27, F06 pricing, U30–U34. SPEC 013/014 are out of scope here.

---

## 5. Specification status matrix (13.1)

| Spec | Purpose | Document status | Code status | Test status | Open decisions | Dependencies | Confidence |
|---|---|---|---|---|---|---|---|
| **006** architecture v2 | Master contract / ADRs / roadmap | **Draft** in `spec.md` header, yet cited as frozen by 007–012 (CONFLICTING); 15/15 planning tasks checked | N/A (spec: implements nothing) | none | tier taxonomy (provisional), isolation mechanism (→011), billing-scope escalation process (UNKNOWN) | constitution | HIGH on status; MEDIUM on content |
| **007** F01 | Target/Env/Ownership/Authorization/Scope | "Planning complete — frozen" | **Not implemented** (0 symbols; legacy `ControlLevel`/`TargetVerification` ownership gate only) | none; 42 impl tasks unchecked | AR-1, AR-14 (optional/recommended) | 006 | HIGH no code |
| **008** F07 | Safety admission, leases, kill switch, budgets, audit | "Planning complete — frozen"; header says no implementation occurred | **Not implemented** | none; 36 tasks unchecked | AR-4, AR-5, AR-12, AR-19 | 007 | HIGH no code |
| **009** F02-04 | Plan/graph/unit, evidence, runtime, deadline | "Planning complete — frozen" + **uncommitted U-1** | **Not implemented**; legacy `Scan`/`CapabilityExecution` + 15-min sweep remain | none; **no implementation task list** except T-U1-1..10 (unchecked) | AR-8, AR-18, AR-22 | 007, 008 | HIGH no code; HIGH provenance risk |
| **010** web | E10/E11/D22-25 | "Planning complete — frozen"; all 48 tasks are planning | **Not implemented** (`probe-pool` is a library) | none; **no implementation task list** | AR-2 | 007-009 | HIGH no code |
| **011** source | E12, E13, D26 | **FROZEN** header, but **untracked** | **Not implemented** | none; 347 tasks unchecked | P1–P8 UNCONFIRMED; AG1–AG10 | 009 U-1, 007-010 | HIGH no code; provenance risk |
| **012** security/auth/API | F05, E14, E15, D20 | **NOT FROZEN**; untracked | **Not implemented** | none; 538 tasks unchecked | OD-1…OD-4, P4-P6/P8/P9/P12/P14/P16-P18, P11 | 007-011 | HIGH no code; LOW assurance of design |

---

## 6. Detailed per-specification findings

### 6.1 SPEC 006 (DOCUMENTED, partially read)
* Status line is `Draft` (spec.md:7) while `roadmap.md`, 007–012 and PROJECT_MAP treat 006–010 as frozen → **CONFLICTING**; needs an explicit owner statement.
* `decisions.md` defines ADR-001…009. Directly relevant: **ADR-003** (hostile-code needs a wholly new isolation system), **ADR-004** (authorization ≠ ownership, permanently distinct), **ADR-005** (metering narrowly scoped; flat price elsewhere), **ADR-006** (strict parallel run, no cutover), **ADR-009** (active/adversarial/authenticated evidence redacted before storage).
* Open decisions are un-ID'd (a table, not `OD-n`). Items still open: tier taxonomy (provisional), isolation mechanism (assigned to 011/E13), metering-escalation process (UNKNOWN), two-class capabilities (IDOR, price/coupon, races).

### 6.2 SPEC 007 (DOCUMENTED; FR index and tasks read)
24 FRs (FR-001…FR-024, plus lettered sub-requirements such as FR-005a), 42 unchecked implementation tasks (T001 adds `ExecutionClass`, `TargetEnvironmentClassification`, `ScopeTargetKind` enums; T002 `prisma validate`; tests-first per constitution). Checklists 74/74 checked (a *document-review* checklist, not a test). 10 FRs (FR-002, 003, 005, 007, 008, 010, 013, 020, 022, 023) have no explicit FR citation in `tasks.md` (coverage may flow through user-story/contract references — UNVERIFIED). No code.

### 6.3 SPEC 008 (DOCUMENTED)
27 FRs; atomic Safety Admission (FR-001/002), durable Admission Lease with bounded expiry and **fencing** (FR-004/006a), fail-closed (FR-005), kill switch lifecycle (FR-013), all state in the database (FR-017), no AI in safety decisions (FR-025). 36 unchecked tasks; 13 FRs without explicit task citation. **Contract property later flagged by 012 (MA-18, AR-19)**: admission/checkpoint operations take *caller-supplied* `targetId`, `userId`, `executionId` and `now`, and `releaseLease` is unspecified. That is a spoofing surface for any caller that is not fully trusted (INFERRED from 012's reading of the frozen 008 contract; the 008 contract body was not re-read here).

### 6.4 SPEC 009 (DOCUMENTED + VERIFIED diff)
47 FRs. FR-047 (U-1) is the only addition with implementation tasks: **T-U1-1..T-U1-10** (add `ScanPlan.deadlineMs`, `computePlanDeadline`, resolvePlan integration, dispatch step 0 refusal reasons `SCAN_DEADLINE_EXPIRED`/`SCAN_DEADLINE_INSUFFICIENT`, engine host-loop expiry, extend `sweepTimedOutScans`, `expirePlanUnits`, scan-completion gate, fencing helper + two new edges, adverse tests AC-1…AC-20). All unchecked. **The 39 checked tasks (T001–T039) are planning-session steps** (e.g. T001 "Capture git status…"). 40 of 47 FRs have no task citing them.
* **U-1 transitions**: the working tree adds `PLANNED → REFUSED` and `DISPATCHED → REFUSED` (execution-unit-contract rule 7) and a "Scan/plan-end finalization" section (runtime-finalization-contract). `git grep` of those strings in `HEAD` returns nothing → **the committed baseline does not contain them** (VERIFIED, E-04). 012 plans against the working-tree text and records the dependency (AR-8).
* Legacy facts verified: `DEFAULT_MAX_DURATION_MS = 15 * 60_000` (`apps/worker/src/orchestrator/timeout-scheduler.ts:25`), env `SCAN_TIMEOUT_MS`. 011 argues this sweep would terminate and refund a long-running `SOURCE_EXECUTION` scan — the reason for U-1 (DOCUMENTED).
* `contracts/scan-deadline-contract.md` is 26 KB, **untracked**, and is the normative detail for FR-047.

### 6.5 SPEC 010 (DOCUMENTED)
53 FRs (browser contexts, crawler, a11y, SEO, functional workflows, UX, coverage taxonomy, tenant isolation at browser-context level, deterministic-before-probabilistic). **All 48 tasks are checked planning activities**; no implementation decomposition. Checklists 110/110. `apps/probe-pool` has 2 TS files and is a library with no transport (VERIFIED file count, DOCUMENTED claim).

### 6.6 SPEC 011 (DOCUMENTED)
158 FRs, 347 tasks (every FR cited by at least one task — VERIFIED by regex), 37 files, checklists 238/238. Frozen 2026-10-10 after a closure review that recomputed the U-1 deadline arithmetic (13 phases = 2 030 s; four chained units 10 760 000 ms < 6 h ceiling; DOCUMENTED, not re-run). **Execution is fail-closed behind activation gates AG1–AG10** and a `DisabledProvider`; the Execution Plane vendor is deliberately unresolved. AG8: P1–P8 provisional decisions **UNCONFIRMED**. Untracked.

### 6.7 SPEC 012 (see section 10)

---

## 7. Cross-specification dependency map

```
006 (Draft) ─ADR/constitution─► 007 F01 ──► 008 F07 ──► 009 F02/3/4 (+U-1 uncommitted) ──► 010 web
                                   │            │              │
                                   │            └──────────────┼──► 011 source (untracked, FROZEN header)
                                   ▼                           ▼                │
                              F05/F06 (F06 unspec'd)   ──────────────────────► 012 security (untracked, NOT FROZEN)
Gates: 011 AG1-AG10  ·  012 SG1-SG10  ·  AR-13/19/22 REQUIRED FOR ACTIVATION  ·  OD-3/OD-4 owner decisions
```

Hard dependencies (DOCUMENTED): 011 AG2/AG3 need U-1 and 007–010 *runtime* implementations; 012 SG1 needs 007–009 (+010 for browser-derived checks) runtimes, a transition-policy equality test (T814), and CI status of T-U1-10; 012 AR-13/AR-19 need design changes in tables/contracts owned by 007/008/009; 012 consumes 011 `source-*` inputs read-only (`NOT_TESTED` if absent).

---

## 8. Current code reality check (section 9 / 13.2 of the brief)

| Component | Spec contract | Actual code location | Implementation status | Test evidence | Gap / risk |
|---|---|---|---|---|---|
| Ownership verification | 007/ADR-004 keeps it distinct from authorization | `apps/api/src/services/control-gate/` (`verify.ts`, `attest.ts`, `rate-bound.ts`, `reconfirm.ts`), `Target`, `TargetVerification`, `ControlLevel` enum | **Legacy exists** (ownership/control level) | tests exist in `apps/api/tests` (not run) | no `TargetAuthorization`, no execution-class grants; ownership still the only gate |
| Per-class authorization | 007 `isAuthorized` | NOT FOUND IN INSPECTED CODE | MISSING | none | blocks every non-passive class |
| Safety admission / leases / fencing / budgets / kill switch | 008 | NOT FOUND IN INSPECTED CODE | MISSING | none | blocks 009 runtime, 011, 012 |
| ScanPlan / ExecutionUnit / evidence envelope | 009 | NOT FOUND (legacy `Scan`, `ModuleResult`, `Issue`, `CapabilityExecution` only) | MISSING | none | legacy model is the parallel-run baseline (ADR-006) |
| Scan deadline | 009 U-1 | legacy 15-min sweep `timeout-scheduler.ts:25`, `timeout.ts` | legacy only; U-1 MISSING | legacy tests exist (not run) | long-running classes would be refunded/terminated by the legacy sweep |
| Browser / crawler | 010 | `apps/probe-pool/src/browser/pool.ts` (library), `packages/safe-net` | PARTIAL (library, no service) | not run | no cross-process transport |
| Hostile-code isolation | ADR-003, 011 | `apps/sandbox-runner/src/{host,child-harness,limits}` (installed-capability sandbox) | **Different system**; ADR-003 requires a *new* isolation system | not run | legacy sandbox is not the Execution Plane; do not reuse by assumption |
| Redaction | ADR-009 | `packages/redaction` | legacy exists | not run | 012 T-HARDEN-1: legacy `Issue.evidence` redaction gap stated as pre-existing defect (CLAIMED) |
| Credential broker / test identities / sessions | 012 | NOT FOUND | MISSING | none | |
| Source analysis / execution | 011 | NOT FOUND | MISSING | none | |
| Billing/refund | ADR-005, P15 | `packages/config/src/refund.ts`, `packages/types/src/domain.ts` | legacy VERIFIED (below) | not run | conflicts with approved P15 (OD-3) |
| CI | — | none (`.github/` absent) | MISSING | — | no automated gate |

**Verified legacy billing facts (E-10)**: `refundForUndelivered` refunds `floor(charged × undelivered ÷ requested)` — proportional by *count of areas*, all-or-nothing when none delivered; `MODULE_STATES_SCORED = ['COMPLETE','DEGRADED']`, i.e. a `DEGRADED` area is scored and counts as delivered. This reproduces 012's OD-3 premise.

---

## 9. Critical invariant verification (13.2)

| Invariant | Required by | Evidence in code | Evidence in tests | Current result | Remaining gap |
|---|---|---|---|---|---|
| Ownership ≠ authorization | ADR-004, 007 | ownership gate only (legacy) | none for the invariant | NOT IMPLEMENTED | 007 |
| Per-class execution grants | 007 | none | none | NOT IMPLEMENTED | 007 |
| Tenant isolation | 009 FR-041, 012 FR-173/182 | legacy per-user scoping (UNKNOWN depth) | none for v2 | UNKNOWN (legacy), NOT IMPLEMENTED (v2) | 012 claims isolation under worker compromise **only in Mode S** (DOCUMENTED) |
| Atomic admission and budgets | 008 FR-001/002 | none | none | NOT IMPLEMENTED | 008; AR-19 |
| Lease expiry and fencing | 008 FR-004/006a | none | none | NOT IMPLEMENTED | 008; AR-18 item 6 |
| Kill-switch enforcement | 008 FR-013 | none | none | NOT IMPLEMENTED | 008 |
| Hostile-code isolation | ADR-003, 011 AG1 | none (legacy sandbox is a different system) | none | NOT IMPLEMENTED; vendor unresolved | 011 AG1, FR-041 external pen-test |
| Append-only evidence | 009 | none | none | NOT IMPLEMENTED | 009 |
| Reverification | 009/012 | legacy fix-loop `WORKER/reverify/` (not inspected) | not run | UNKNOWN (legacy), v2 NOT IMPLEMENTED | |
| Credential isolation | 012 FR-173/175/201 | none | none | NOT IMPLEMENTED | AR-13, OD-4 |
| Terminal-state authority | 009 runtime-finalization rule 1 | none | none | **CONFLICTING in plan**: 012 adds `sec_finalize_unit`, `sec_refuse_unclaimed_unit`, `sec_sweep_finalize_unit` against 009's "only code path" rule (AR-18 item 5, not approved) | 009/012 owners |
| Audit integrity | 008 FR-021, 012 FR-… | legacy `AuditLogEntry` | not run | v2 NOT IMPLEMENTED | 012 itself names a rollback limit (caller rollback erases its own denial audit row) |
| Correct billing of actual work | P15 | legacy equal-share-by-area | not run | **CONFLICTING** with P15 (OD-3) | owner decision |
| Fail-closed providers | 011 AG1-AG10, 012 SG1-SG10 | none | none | NOT IMPLEMENTED | |

---

## 10. SPEC 012 security and tenant-isolation assessment, and review history

### 10.1 Review chain (reconstructed from artifacts)

| Pass (date) | Document | Independence | Result recorded |
|---|---|---|---|
| Adversarial review (≈2026-10-10/11) | `adversarial-review.md` | independent | 78 scenarios (50 + 28): 25 ADEQUATE, 25 WEAK + 3 GAP (Part 1), 19 WEAK + 6 GAP (Part 2) per re-review scoreboard |
| Re-review (2026-10-11) | `adversarial-rereview.md` | independent | 53 originally weak/gap → **33 ADEQUATE, 19 WEAK, 1 GAP**; 18 new issues N-1…N-18 (2 HIGH); **READY-WITH-REPAIRS** |
| Closure review (2026-10-11) | `closure-review.md` | — | **NOT FROZEN**; blockers B-1…B-13; owner approved P1,P2,P3,P7,P10,P13,P15, deferred P11 |
| 2nd → 6th repair passes (2026-10-11…15) | `repair-matrix`, `third…sixth-repair-matrix` | repair authors; each cites an independent review (N2-x, F-01…22, A1-5, N5-x) **not stored as a file** | repairs written, "not certified" |
| Final certification (2026-10-16) | cited by `seventh-repair-matrix.md` | cited, not stored | verdict "FAILED — REPAIRS REQUIRED"; seventh repair F1-F3, L1-L5 |
| Master audit (2026-10-16) | `master-audit-findings.md` | **self-review** (stated) | MA-01…MA-19 (2 High: MA-01 cross-tenant DoS via broker operations, MA-17 cross-tenant read by a worker; 7 Medium; 10 Low) |
| Certification repair + delta (2026-10-17) | `final-certification-repair.md` | **self-review** (stated) | IC-1…IC-7, delta F1…F7; E14/E15 activation blocked pending AR-22/AR-8 |

**Finding.** After 2026-10-11 there is **no independent review record in the repository**. Two handoff documents request one (`master-independent-review-handoff.md`, `seventh-review-handoff.md`); no result exists. `spec.md:7` lists self-reviews "through the master pass" and does not name the later `final-certification-repair.md` pass (INFERRED stale header).

### 10.2 Compromised-worker map (DOCUMENTED claims vs enforcement)

| Question | What 012 documents | Enforced today |
|---|---|---|
| What can a compromised worker read? | After MA-17 repair: claim-scoped reads via `sec_peek_unit`, `sec_unit_context`, `sec_read_input` + RLS/REVOKEs (T854/T855) | nothing implemented |
| Write/enqueue/claim/finalize? | Claim-scoped security-definer functions, `fahes_sec_derive` for derived records, class-scoped claims, CS1 claim-spread rule; **table-level DML still exists for non-012 classes** (AR-21 RECOMMENDED, not approved) | nothing implemented |
| Per-tenant vs shared pool? | Mode S (tenant-scoped principals + per-tenant routing via AR-20) vs Mode P (shared); **owner choice OD-4 not made**; "isolation is claimed only in Mode S" | nothing |
| Forged evidence inside a claimed unit? | Acknowledged residual (IC-3), "no independent attestation in v1" | nothing |
| Legacy `Issue` writes after coverage marker | Stated exposure (IC-6, AR-21) | nothing |
| Claim liveness / crash recovery | Worst-case bounds only for enforceable cases; no takeover/retry invented (IC-7, 4.10F) ; hosting-failure backstop **AR-22 not approved** | nothing |
| Required platform properties | non-superuser NOLOGIN function owners, CREATE/TEMP revoked, pooler identity rules (4.10E) — provider behaviour **unproven** | nothing |

**Assessment**: the 012 design is unusually self-critical and names its residuals, but it is **a hypothesis with no executable evidence**. It depends on database-level controls spanning three other specs' tables. Treat every "ADEQUATE" as documentary, not demonstrated.

### 10.3 Self-reported counts re-derived (VERIFIED, E-09)
201 FRs contiguous; 538 task ids unique; every FR cited by ≥ 1 task; no task cites an FR outside 1–201; 83 distinct non-prefix `SEC_` reason tokens across contracts; 19 contracts; 20 planned models; 19 Mermaid blocks; checklists 237 items (207 checked, 30 open). The 30 open checklist items are the self-declared activation/provider items (CHK044–CHK057 etc.).

---

## 11. Owner-decision register summary (details: [DECISIONS_AND_AMENDMENTS.md](DECISIONS_AND_AMENDMENTS.md))

* **Open and required now**: OD-3 (billing conflict), OD-4 (Mode S vs P), OD-2 (schedule AR-13/AR-19), OD-1 (settlement retention), P14, P16 (refused for all destinations until decided), P17, AR-8/AR-9 (provenance), D6 batch (P4, P5, P6, P8, P9, P12, P18).
* **Approved (2026-10-11, DOCUMENTED)**: P1, P2, P3, P7, P10/AR-3, P13, P15 (principle only).
* **Deferred**: P11 (KMS/broker hosting).
* **Unconfirmed in 011**: P1–P8 (gate AG8). Different list from 012's P1–P18 — **identifier collision**.
* **No evidence that any agent treated a proposal as approved**; 012 repeatedly states the opposite. **However**: 011 is labelled FROZEN while its own provisional decisions are UNCONFIRMED, and 009 U-1 was "owner-authorized" yet never committed — freeze language is ahead of the owner-confirmation trail.

---

## 12. Open blockers and release risks (13.3)

| # | Blocker | Severity | Evidence | Affected | What unblocks it | Owner decision? |
|---|---|---|---|---|---|---|
| 1 | No implementation of any v2 foundation (007/008/009) | Critical | E-05/E-06 | everything | implement 007→008→009 | no |
| 2 | 009/010 lack implementation task lists | High | tasks.md inspection | 009, 010 | generate tasks (new work) | no |
| 3 | 009 U-1 uncommitted; HEAD lacks `PLANNED→REFUSED`, `DISPATCHED→REFUSED` | High | E-03/E-04 | 009, 011, 012 | owner approves a docs-only commit | **yes** (AR-8) |
| 4 | 011 untracked while "FROZEN" | High | `git status` | 011, 012 | owner commit/confirm | **yes** (AR-9) |
| 5 | AR-13 DB privilege model not scheduled | Critical (activation) | AR-13, OD-2 | E14, E15, broker | schedule + design with 007/008/009 owners | **yes** (OD-2) |
| 6 | AR-19 008 transactional surface missing | Critical (activation) | AR-19 | 012 FR-201 | 008 amendment/clarification | owner + 008 owner |
| 7 | AR-22 hosting-failure backstop | Critical (E14/E15) | AR-22 | E14/E15 | 009/011 clarification | yes |
| 8 | OD-4 isolation mode undecided | High | OD-4 | tenant isolation claim | owner chooses S or P | **yes** |
| 9 | OD-3 billing conflict | High | OD-3; E-10 | billing of security area | Option 1 or 2 | **yes** |
| 10 | No independent review after 2026-10-11 | High | repo | 012 freeze | independent reviewer | process |
| 11 | 011 AG1 Execution Plane vendor unresolved | Critical (SOURCE_EXECUTION) | 011 spec | 011 | vendor selection + isolation acceptance bar + external pen-test | **yes** (owner/AG10) |
| 12 | 006 status Draft vs "frozen" | Medium | spec.md:7 | all | owner status statement | **yes** |
| 13 | No CI | Medium | `.github/` absent | all | add CI | no |
| 14 | Identifier collisions (P/F/A/N) | Medium | section 6 of Decisions | docs | prefix IDs with spec number | no |
| 15 | Platform feasibility unproven (managed DB roles, pooler, microVM) | High | CHK044-057; AG1 | 012, 011 | prototype in target environment | no |

---

## 13. Git working-tree and uncommitted-contract risks

1. **012 plans against text that is not in Git.** Its HEAD reference `e425773` lacks the two U-1 edges; if the working tree is lost or reset, 011 and 012 lose their upstream contract. (VERIFIED, E-03/E-04.)
2. **011 and 012 exist only on this machine's disk** (no commit, no remote evidence). Total of ~100 files / ~3 MB of planning work is unprotected by version control.
3. **Safe sequence already proposed by 012** (`closure-review.md` §7), **not executed**: (a) `git add specs/009-core-scan-execution-platform/` → docs commit; (b) `git add specs/011-…/` after (a); (c) 012 after its freeze. Stage explicit paths only; `git add -A` would sweep in the four `showcase-*` directories and unrelated `apps/web` changes. This audit did not perform it (owner approval is an open item).
4. **Formal amendment vs clean change set**: U-1 touches 10 frozen 009 files; INFERRED that it should land as one separate, attributable "amendment U-1" commit so frozen-baseline history stays auditable.
5. `.specify/feature.json` points at 011, which blocks the SpecKit Analyze prerequisite step for 012 without re-pointing (documented by 012).

---

## 14. Validation performed and not performed (E-xx in the evidence index)

**Executed (all read-only)**: `git rev-parse/branch/status/stash/log/diff --stat/grep HEAD`; ripgrep symbol searches; file/dir listings; Python scripts in the scratchpad that parse `spec.md`/`tasks.md` (FR/task counts, FR→task citation coverage, SEC_ token count, checklist/mermaid/model counts); reading of source files.

**Not run, with reason**: `pnpm test`, `test:adverse`, `typecheck`, `lint` (need DB/Redis, may write caches; none target 007–012 anyway); E2E; load tests; migrations/seed; any probe or hostile-code execution; SpecKit Analyze (would persist `.specify/feature.json`); Mermaid parse/render (not re-run; 012's "19/19 parse with 10.9.1" is CLAIMED); any code-review of legacy code.

**Result-bearing statements**: no test was executed by this audit, so **no requirement is `IMPLEMENTED_AND_VERIFIED`**. 538 requirement rows: 506 `PLANNED_ONLY`, 32 `UNKNOWN` (text references legacy/unchanged behaviour whose legacy implementation may satisfy it; not verified).

**Post-condition check (end of audit)**: `git status --short` = 35 entries (34 original + this audit's directory); `git diff --stat` still 24 files, +215/−21; `git diff --stat -- specs/009*` still 10 files, +169/−4; `.specify/feature.json` unchanged.

**Coverage table (13.4)**

| Metric | Value |
|---|---|
| Requirements documented (FR) | 538 (006: 28, 007: 24, 008: 27, 009: 47, 010: 53, 011: 158, 012: 201); lettered sub-requirements (e.g. FR-005a) are folded into the base ID |
| Mapped to code | 0 (+ 32 with possible legacy coverage, unverified) |
| Mapped to tests | 0 spec-owned test files exist |
| Planned tasks | 006: 15 (planning) · 007: 42 · 008: 36 · 009: 49 (39 planning-checked, 10 U-1 unchecked) · 010: 48 (planning) · 011: 347 · 012: 538 |
| Tests executed / passed / failed | 0 / 0 / 0 (by this audit) |
| Blocked / not run | all |

---

## 15. Recommended next steps (strict priority order)

1. **Owner decision on provenance (AR-8, AR-9)**; then commit 009 U-1 and 011 as separate docs-only change sets, explicit paths only. (Protects ~100 uncommitted files.) — *requires owner approval; do not do it implicitly.*
2. **Owner statement on SPEC 006 status** and a one-line rule for identifier namespacing (`011-P1` vs `012-P1`).
3. **Create the missing implementation backlogs for 009 and 010** (task decomposition from their plans/contracts) — new planning work, not a repair of existing tasks. Gap IMP-G01/G02.
4. **Implement 007 (F01)** per its 42 tasks, tests first; reserve DB-role/function design points required by AR-13.
5. **Decide OD-2 and OD-4**, then resolve AR-19 (008 transactional surface) *before* building 008, so it is not retrofitted.
6. **Implement 008 (F07)**, then **009** including U-1 T-U1-1..10 with the legacy 15-minute sweep regression tests unchanged (parallel run, ADR-006).
7. **Resolve OD-3** (billing) before any security-area purchase surface is built; keep `AREA_COUNT` until then.
8. **Obtain a genuinely independent review of 012** (read-only, not authored by the repair line) against the current files, then address OPEN rows; only then consider a freeze decision.
9. **Add CI** (none exists) so that implementation of 007–009 is gated by automated typecheck/lint/test.
10. Only after 7–9: 010 passive/browser work, then 011 `SOURCE_STATIC`; **keep SOURCE_EXECUTION, E14, E15 and the broker dark** until AG1–AG10 / SG1–SG10, AR-13/19/22 are satisfied.

---

## 16. Known / unknown / unverified

**Known (VERIFIED)**: Git baseline; working-tree contents; absence of any 007–012 code, packages and schema entities; U-1 absent from HEAD; legacy 15-minute sweep; legacy refund/scoring semantics; 012 and 011 counts; FR→task coverage for 011/012; 009/010 `tasks.md` are planning logs; 102 checked tasks in 006/009/010 (15 + 39 + 48) are planning activities; file inventories.

**Unknown**: legacy test pass/fail state; correctness of most spec contract bodies not read; legacy reverify/readiness behaviour; whether managed Postgres can meet 4.10E; Execution Plane feasibility; owner intent on pending decisions.

**Unverified (CLAIMED)**: 012's Mermaid parse; independent reviews cited after 2026-10-11; the owner approvals of 2026-10-11 (recorded only in 012 documents); 011's 200k-trial deadline simulation; 012's statement that SpecKit prerequisites resolve read-only.

---

## 17. Handover

See [NEXT_AGENT_HANDOVER.md](NEXT_AGENT_HANDOVER.md). In one paragraph: **start by reading `PROJECT_MAP.md`, this report's sections 1, 12, 13, and `DECISIONS_AND_AMENDMENTS.md`; do not assume any 007–012 requirement is built, any "frozen" label is Git-backed, any checked task is implementation, or any 012 "ADEQUATE/REPAIRED" is verified; do not `git add -A`, reset, or clean; do not run SpecKit Analyze without deliberately re-pointing `.specify/feature.json`.**
