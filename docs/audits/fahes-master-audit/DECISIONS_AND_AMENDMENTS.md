# Decisions and Amendments Register

Audit date 2026-10-19 · baseline HEAD `e425773` · **Evidence labels**: VERIFIED / DOCUMENTED / CLAIMED / INFERRED / UNKNOWN / CONFLICTING (see [MASTER_AUDIT_REPORT.md](MASTER_AUDIT_REPORT.md) section 2).

**This register records decisions. It decides nothing.** No option below was selected or approved by the audit. Every "default" is the fail-closed or provisional behavior that the source document itself states. Primary sources: `specs/012-security-auth-api-testing-platform/master-owner-decision-register.md`, `final-owner-approval-package.md`, `upstream-amendment-requests.md`, `specs/011-source-backend-database-testing-platform/upstream-amendment-requests.md`, `specs/011-.../spec.md` §Provisional product decisions (lines 380-387), `specs/006-scan-architecture-v2/decisions.md` §Open Decisions.

## 0. Identifier hygiene warning (CONFLICTING namespaces)

The same labels mean different things in different specs. Always cite with the spec number.

| Label | SPEC 011 meaning | SPEC 012 meaning |
|---|---|---|
| `P1`…`P8` | 011 provisional product decisions (language tier, command templates, private repos, external services in tests, destructive fixture ops, lifecycle scripts, Python, tar) — all **UNCONFIRMED (owner)** | 012 product decisions P1…P18 (customer test accounts, stateful testing, MFA, offline advisories, …) — a different list |
| `U-1`, `U-2` | upstream requests (U-1 became the 009 deadline amendment) | not used; 012 uses `AR-n` |
| `F1`…`F7` | n/a | used twice in 012: seventh-pass F1–F3 and delta-review F1–F7; register rows are disambiguated `7TH-F*` and `D-F*` |
| `F-01`…`F-22`, `A1`…`A5`, `N-5/6/10` | n/a | reused across 012 review passes (fourth, fifth, re-review) |

`OD-1…OD-4` exist **only in SPEC 012** (VERIFIED by search of `specs/`). The prompt's list "P4/P5/P6/P8/P9/P12/P14/P16/P17/P18, P11, AR-12…AR-22" exists in SPEC 012; `AR-11` is a note, `AR-21` exists, `AR-16` is a compatibility note and `AR-3` is CLOSED.

## 1. Owner decisions required NOW (block SPEC 012 freeze or a stated gate)

| ID | Question (source wording summarized) | Documented options | Current default / provisional behavior | Blocks | Approver | Silent-approval check |
|---|---|---|---|---|---|---|
| **OD-3** | Default `AREA_COUNT` bills and refunds a partially covered passive SECURITY area like today (`DEGRADED` counts as delivered, `refundForUndelivered` equal-share), which conflicts with approved principle P15 ("charge only for executed billable work"). | **Option 1**: temporary explicit time-boxed P15 exception while keeping `AREA_COUNT`. **Option 2**: approve P17 class-level settlement **and** ADR-005 amendment AR-17, F06 price table (AR-15) and gate SG1. | `AREA_COUNT` unchanged; conflict stated in FR-189 | 012 freeze; any active/authenticated purchase | Owner | Not silent: 012 states "Not solved". Code fact VERIFIED: `MODULE_STATES_SCORED = ['COMPLETE','DEGRADED']` (`packages/types/src/domain.ts:84`), `refundForUndelivered` (`packages/config/src/refund.ts:15`). |
| **OD-4** | Worker isolation mode: tenant-scoped principals with per-tenant routing (Mode S) vs shared pool with claim-spread rule CS1 (Mode P). | Mode S (needs AR-20 per-tenant routing, 009 owner) or Mode P | Mode P; **tenant isolation under worker compromise is claimed only in Mode S**. The earlier "accept residual" default was withdrawn (final-owner-approval-package D2) | 012 freeze; credential-broker activation | Owner | Not silent. |
| **OD-2** | Who schedules the AR-13 database-privilege boundary and AR-19 008 surface with 007/008/009 implementation owners | Owner assigns owner and date | Unscheduled; broker refuses issuance, E14/E15 disabled | Activation of E14/E15/broker | Owner | Not silent. |
| **OD-1** | `SecuritySettlement` retention period and anonymization on account deletion | Owner defines | Handled with credit ledger retention; not purged by `tenant.purge_012` | Only relevant under OD-3 Option 2 | Owner | Not silent. |
| **P16** | Destination Authorization Policy for active destinations | (policy not chosen) | **Refused for every destination** | Any active testing | Owner | Not silent. |
| **P17** | Class-level billing | not approved | Default `AREA_COUNT`; active and authenticated work not purchasable | Purchase of active work | Owner | Not silent. |
| **AR-8 / D5** | Commit or confirm the 009 U-1 working-tree text (HEAD lacks `PLANNED→REFUSED`, `DISPATCHED→REFUSED`) | commit as docs-only sequence (closure-review.md §7) or confirm otherwise | Uncommitted (VERIFIED, E-03/E-04) | 011 and 012 provenance; SG1 equality test | Owner | Not silent. |
| **AR-9 / D5** | Commit or confirm SPEC 011 (untracked, 37+ files, header says FROZEN) | same | Untracked (VERIFIED, `git status`) | 012 provenance | Owner | **Risk**: header says FROZEN yet no commit exists (CONFLICTING provenance). |
| **D6 batch** | Confirm provisional defaults P4 (offline advisory matching, provisional yes), P5 (customer invariants, declarative only), P6 (OpenAPI 3.0/3.1 REST/JSON), P8 (authenticated browser testing: no), P9 (private-network targets: no), P12 (credential lifetime 90 d max/30 d default, lease ≤ min(unit time, 30 min)), P18 (private-CA, plain-HTTP, non-default ports unsupported) | confirm or amend | Provisional defaults in force | 012 freeze (recommended, not mandatory per closure-review D-2) | Owner | Not silent. |
| **P14** | Reverify billing and refund of customer-side `INCONCLUSIVE` | (owner chooses) | Legacy `REVERIFY_COST` semantics | 012 freeze | Owner | Not silent. |

## 2. Approved by the owner (2026-10-11, DOCUMENTED, unchanged)

P1 customer test accounts mandatory · P2 stateful testing non-production, default OFF, per-class consent · P3 MFA-exempt accounts or pre-established sessions · P7 passive-first · P10/AR-3 web targets cover APIs, no 007 amendment · P13 `DEGRADED` is never a readiness PASS · P15 charge only for executed billable work (**principle only; mechanism not approved**). Evidence: `master-owner-decision-register.md` §1 (UNVERIFIED beyond the document: no approval record outside the 012 documents).

## 3. SPEC 011 provisional decisions (UNCONFIRMED)

P1 Tier-1 TS/JS Node ≥ 22 with npm/pnpm/yarn-classic · P2 Command Templates only · P3 private repos via existing GitHub connection · P4 no customer external services in tests · P5 destructive ops only in disposable in-Guest fixture · P6 lifecycle scripts disabled · P7 Python not in v1 · P8 tar not in v1. 011 records them as defaults with amendment paths and gate **AG8** (operator confirmation). 011 was nevertheless marked FROZEN while these are UNCONFIRMED — documented by 011 itself as "not blockers".

## 4. Decisions deferred (safe to defer until implementation evidence exists)

| ID | Item | Why safe | Source |
|---|---|---|---|
| P11 | KMS provider and credential-broker hosting | Needed only at broker activation (SG3); broker refuses issuance until decided | master-owner-decision-register §2 |
| 006 | Untrusted-code isolation mechanism (`TODO(UNTRUSTED_EXECUTION_MECHANISM)`) | Owned by E13/SPEC 011; 011 keeps execution behind AG1–AG10 and `DisabledProvider` (vendor deliberately unresolved) | 006 decisions.md; 011 spec |
| 006 | Final authorization-tier taxonomy | 007 states it replaced the placeholder; further refinement allowed | 006 decisions.md |
| 006 | Process for revisiting narrow metering scope; "no known escape path" acceptance bar; Billing/Credits UX spec | Explicitly deferred to child specs | 006 decisions.md |
| 006 | Specs spanning two classes (IDOR, business logic) | Addressed by 012 dual-class rule FR-161 (INFERRED) | 006 decisions.md |

## 5. Technical investigations required (no owner decision, but evidence needed)

1. **Managed-database feasibility** of non-superuser NOLOGIN owners, CREATE/TEMP revocation and pooler principal identity (data-model 4.10E; CHK044–CHK057 open) — provider behaviour is unproven until a target deployment exists.
2. **Timing-equality of uniform pre-claim denial** is "a tested bound, not a proof" (IC-2).
3. **Timing budgets** (T523/T650 measurements) are starting values.
4. **Execution-plane vendor** feasibility (011 AG1, FR-157) and external penetration review (FR-041).
5. **Mermaid rendering**: 19/19 012 blocks parse with Mermaid 10.9.1 per 012 (CLAIMED); not re-run here; syntax only, never rendered.
6. **SpecKit Analyze** has never been run for 012 (CLAIMED reason: it would persist `.specify/feature.json`, now pointing at 011).

## 6. Cross-specification amendment and clarification register

Classification is the source document's (`upstream-amendment-requests.md`). **None is approved or implemented** unless marked CLOSED/APPLIED.

| ID | Target | Class | What is asked | Affected contract | Blocking impact | Approval needed |
|---|---|---|---|---|---|---|
| U-1 (011) | 009 | **APPLIED to working tree only** (owner-authorized 2026-10-10) | Plan-level scan deadline: `ScanPlan.deadlineMs`, `scan-deadline-contract.md`, FR-047, tasks T-U1-1..10 | 009 scan timeout, execution-unit edges | `SOURCE_EXECUTION` cannot activate (AG2) until T-U1-1..10 implemented; 012 SG1 equality test | Commit/confirm (AR-8) |
| U-2 (011) | 009 | RESOLVED BY INTERPRETATION | Artifact budgets vs 011 ceilings | 009 artifact budgets | AG6 | none |
| AR-1 | 007 `isAuthorized` | RECOMMENDED | account/role/action-category parameters | scope matching | local `securityScopeGate` | later hardening |
| AR-2 | 010 | OPTIONAL | session-injection primitive | browser contexts | authenticated browser unsupported (P8) | future |
| AR-3 | 007 | **CLOSED 2026-10-11** | WEB kind suffices for APIs | Target kinds | none | none |
| AR-4 | 008 | OPTIONAL | byte/auth-attempt/mutation budget dimension | F07 budgets | engine-local `LocalBudget` | later |
| AR-5 | 008 | OPTIONAL | credential-revocation trigger | kill-switch enums | local handling | later |
| AR-6 | 009 | NONE | redaction scope | `recordEvidence` | none | none |
| AR-7 | 009 | NONE | `FailureClass` target-broke | failure classes | uses `TARGET_UNAVAILABLE` | none |
| AR-8 / AR-9 | 009 / 011 | provenance | commit or confirm | repository | freeze | Owner |
| AR-10 | 009 | RECOMMENDED | per-unit additional authorization classes | `resolvePlan` | local dual-class checkpoint | later |
| AR-12 | 008/009 | RECOMMENDED | lease renewal by `consumes{false,false}`; no U-1 attestation interface | admission/U-1 | SG1 uses CI status | clarification |
| **AR-13** | 007/008/009 tables | **REQUIRED FOR ACTIVATION** | DB privilege model: worker least privilege, roles, positive grants, `sec_*` functions (FR-201) | all three DB owners | broker + every active/authenticated engine | OD-2 schedule + owners |
| AR-14 | 007 | OPTIONAL | consent precondition hook on `createAuthorization` | grant lifecycle | local enforcement FR-177 | later |
| AR-15 | F06 (future) | RECOMMENDED | per-component pricing/refund for unexecuted work | pricing | active work not purchasable | F06 |
| AR-16 | 001 readiness | NONE (note) | readiness compatibility | readiness | none | none |
| AR-17 | 006 ADR-005 | controlled amendment request | class-level settlement vs flat price | ADR-005 | before `CLASS_LEVEL` | Owner (OD-3 Opt 2) |
| AR-18 (6 items) | 009/008 | REQUIRED CLARIFICATION before activation | ADMITTED/DISPATCHED/pre-run KILLED/REFUSED wording; single terminal-finalization authority vs `sec_*` entry points; 008 `releaseLease` | 009 runtime finalization rule 1 | SG1; item 5 before building finalize functions | 009/008 owners |
| **AR-19** | 008 | **REQUIRED FOR ACTIVATION** | transactional, unit-keyed admission/checkpoint/release surface; caller-supplied identifiers and `now` | 008 admission contract | blocks FR-201 deployment | 008 owner (supersedes AR-18 item 6 detail) |
| AR-20 | 009 | conditional (Mode S only) | per-tenant job routing | queue topology | Mode S only | OD-4 |
| AR-21 | 009/010/011 | RECOMMENDED | confinement of non-012 class writes; legacy `Issue` write exposure | worker write surface | hardening | later |
| **AR-22** | 009/011 | **REQUIRED FOR ACTIVATION** (E14, E15) | absolute hard TTL, execution-plane dead-man switch, orphan reconciler | `scan-deadline-contract.md` rule 3 | E14/E15 activation | not approved |

## 7. Questions that must be answered before implementation or activation

**Before any implementation starts (SPEC 007–009 foundation):**
1. Is SPEC 006 formally accepted? Its `spec.md` header still says **Draft** while 007–012 treat it as frozen (CONFLICTING).
2. Who owns the missing implementation task decomposition for 009 and 010? (their `tasks.md` are planning logs.)
3. Is the 009 U-1 text accepted as part of the frozen baseline (AR-8)?
4. Which implementation sequence do 007/008/009 follow, and does it reserve the DB-role/function design (AR-13/AR-19) so it is not retrofitted?

**Before activation of any non-passive class:** OD-2, AR-13, AR-19, AR-22, AR-18 items 1–6, SG1–SG10 (012), AG1–AG10 (011).

**Before any customer purchase of active/authenticated work:** OD-3 and AR-15/AR-17 (if Option 2).
