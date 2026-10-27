# SPEC 006–012 Dependency Map

Written 2026-10-22 against HEAD `e425773` plus working tree. Labels: `DOC` document text · `HEAD` / `WORKING_TREE` · `CODE`. Nothing here asserts implementation: IMPLEMENTATION = NONE and ACTIVATION = OFF for 007–012 (VERIFIED by Master Audit and Independent Review).

## 1. Intended order (DOC: `006/roadmap.md`, each spec's header)

```
Constitution v1.2.0 (2026-10-07)
   └─ 006 master architecture / ADR-001…009 / roadmap
        └─ 007 F01 target · environment · ownership · authorization · scope
             └─ 008 F07 safety admission · leases/fencing · budgets · kill switch · audit   (depends only on F01)
                  └─ 009 F02+F03+F04 planning · evidence · runtime/queue/progress (+ U-1 deadline, WORKING_TREE)
                       ├─ 010 E10/E11 + D22–D25 web testing
                       ├─ 011 E12/E13 + D26 source/backend/database testing   (needs 009 U-1 for SOURCE_EXECUTION)
                       └─ 012 F05+E14+E15+D20 security/auth/API testing       (needs 007, 008, 009; reads 010/011)
Not specified: F06 pricing, E16, E17, D21, D27, U30–U34
```

## 2. Tracking, status and freeze facts (VERIFIED unless marked)

| Spec | Header status | Git | Tasks (impl) | Code | Freeze evidence beyond the header |
|---|---|---|---|---|---|
| Constitution | v1.2.0, last amended 2026-10-07 | HEAD | n/a | n/a | version/sync-impact report |
| 006 | `Draft` (`spec.md:7`) | HEAD (single commit `0afb9f7`) | 15 planning, checked | n/a | ADR-004…007 "Decided (product-confirmed 2026-10-07)", ADR-008 "Decided and implemented"; no owner freeze record found |
| 007 | frozen | HEAD | 42, unchecked | none | none found |
| 008 | frozen; "no implementation has occurred" | HEAD | 36, unchecked | none | none found |
| 009 | frozen | HEAD **+ 10 uncommitted U-1 edits + 1 untracked file** | 10 U-1 unchecked; 39 planning checked; no impl list | none | U-1 "owner-authorized 2026-10-10" (DOC only) |
| 010 | frozen | HEAD | 48 planning checked; no impl list | none (probe-pool library only) | none found |
| 011 | FROZEN 2026-10-10 | **untracked** | 347, unchecked | none | closure review (two independent reviews claimed, not stored) |
| 012 | NOT FROZEN | **untracked** | 538, unchecked | none | n/a |

## 3. Direct dependencies and hidden assumptions

| From → To | Dependency (DOC) | Hidden assumption / missing upstream contract | Risk |
|---|---|---|---|
| 007 → 006 | taxonomy, ADR-004 | 006 not formally frozen (RM-A1) | status ambiguity |
| 008 → 007 | `isAuthorized` called fresh inside admission | 007 signature has no account/role/action-category parameters (AR-1, RECOMMENDED) | local mitigation in 012 |
| 009 → 007/008 | `isAuthorized`, `safetyCheckpoint`, lease release | `releaseLease` unspecified in 008 (AR-19) | 009 finalization rule 3 (one transaction) cannot be met without it |
| 009 internal | diagram vs runtime contract ordering | RM-B1 / `U1_PICKUP_ORDERING_OPTIONS.md` | status semantics for every downstream spec |
| 010 → 009 | execution units, evidence, finalization | U-1 obligations on BROWSER/CRAWLER not in 010 text (RM-B9) | silent amendment risk |
| 011 → 009 | U-1 (deadline), artifact budgets (U-2 by interpretation) | U-1 not committed; AG2 behavioural self-test is CI status only | frozen-spec premise outside Git |
| 012 → 007 | per-class grants, FR-015a production prohibition | grant creation cannot be gated on consent (AR-14, OPTIONAL) | local enforcement points only |
| 012 → 008 | admission, leases, fencing | caller-supplied identifiers and `now` (AR-19, REQUIRED FOR ACTIVATION); no `AdmissionLease` release by authority | blocks FR-201 deployment |
| 012 → 009 | `resolvePlan`, finalization, queues, sweep | rule 1 single-authority (AR-18 item 5); per-tenant routing absent (AR-20, Mode S only); hosting backstop (AR-22) | tenant isolation claim; recovery |
| 012 → 011 | read-only `source-*` inputs | 011 untracked (AR-9) | inputs `NOT_TESTED` if absent |
| 012 → F06 | per-component pricing (AR-15) | F06 not specified | active/authenticated work not purchasable |
| 012 → 006 ADR-005 | flat pricing for both active classes | class-level settlement needs ADR amendment (AR-17) | OD-3 |

## 4. Reverse flows and cycles

- **No hard cyclic dependency** among the contracts as written. There are three **reverse flows** in which a downstream spec forces change upstream:
  1. 011 → 009: U-1 (applied in the working tree).
  2. 012 → 007/008/009: AR-13, AR-18 item 5, AR-19, AR-20, AR-22 (requested, unapproved).
  3. 012 → 006: AR-17 (ADR-005), conditional on Q4 Option 2.
- **Soft cycle**: 009's task list cannot be finished until the ordering ruling (RM-B1); the ordering ruling affects 011/012 text that already cites it; 012's DB boundary (AR-13) affects the 007/008/009 schemas that have not been built — if 007/008/009 are built first, AR-13 becomes a retrofit (RM-C2). Break the cycle by deciding Q2 and Q6 first.
- **Hidden roadmap change**: F05 (credentials/sessions) was a roadmap foundation spec depending on F01; it is absorbed into 012, so the foundation order in 006 `roadmap.md` no longer matches the numbered specs.

## 5. U-1 citation inventory (for re-validation after RM-B1)

- **011** (14 files): `spec.md`, `plan.md`, `research.md`, `tasks.md`, `upstream-amendment-requests.md`, `closure-review.md`, `adversarial-review.md`, `adversarial-review-u1.md`, `checklists/{hostile-code-isolation,requirements,upstream-architecture-compatibility}.md`, `contracts/{coverage,source-rule-registry,untrusted-execution}-contract.md`.
- **012** (40 files): normative — `spec.md`, `plan.md`, `data-model.md`, `research.md`, `tasks.md`, `upstream-amendment-requests.md`, and contracts `active-security-execution`, `auth-session`, `auth-workflow-execution`, `credential-broker`, `mutation-cleanup`, `security-check-registry`, `security-coverage`, `security-evidence`, `security-reverify`, `security-scope`; the rest are review/repair records (historical).
- **009** itself: `spec.md` (FR-047), `plan.md`, `tasks.md`, `data-model.md`, `research.md`, `contracts/{execution-plan,execution-unit,execution-runtime,runtime-finalization,evidence-envelope,scan-deadline}-contract.md`.
- **007, 008, 010**: no file cites U-1 (grep: none).

## 6. Provenance and freeze risks (summary)

1. U-1 text exists only in the working tree; 011 and 012 plan against it.
2. 011 and 012 are untracked: no history, no backup in Git.
3. "Frozen" is asserted by headers with no owner record found for 006, 007, 008, 010, 011.
4. Independent reviews are self-declared or not stored; U-1's only review is a self-review.
5. `.specify/feature.json` points at 011, so SpecKit Analyze cannot be run for 012 without an owner-approved re-point.
6. Pre-existing unrelated work (14 `apps/web` files, 2 untracked `apps/web/*.mjs`, `docs/audits/frontend-design/`, four `showcase-*` directories) must be excluded from any spec commit.

## 7. Missing upstream contracts (to be requested or decided; none invented here)

008 transactional/unit-keyed lease release (AR-19) · 008 trust model of caller-supplied identity and clock · 009 single normative dispatch sequence (RM-B1) · 009 position on rule 1 (AR-18 item 5) · 009 per-tenant routing (AR-20, conditional) · hosting-failure backstop for 012 engines (AR-22) · F06 price table (AR-15) · 010 position on U-1 obligations (RM-B9) · 006 explicit status (RM-A1).
