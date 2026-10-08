# Handoff Brief: Foundation Spec 01 — Target / Environment / Ownership / Authorization / Scope

**For**: whoever runs `/speckit-specify` to create this child spec next. This brief is
self-contained — you should not need to open the rest of `specs/006-scan-architecture-v2/` to get
started, though `plan.md`'s Safety & Authorization Model section and `data-model.md`'s
Authorization & Scope entities are the deeper reference if you want it.

## Why this spec exists

Fahes's scanning platform today only ever offers *passive* testing, so it never needed an explicit
model of "is this user allowed to run this specific kind of test against this target" — proving
you control a domain was the only gate anything needed. The master architecture
(`specs/006-scan-architecture-v2/`) establishes that future active/adversarial/authenticated/
load-generating testing classes cannot reuse that one gate: Ownership Verification and
Authorization must become two permanently distinct, separately-granted concepts (Constitution
Principle X, `.specify/memory/constitution.md` v1.2.0). This spec is where that distinction becomes
real, implementable entities.

## What you own

Three new entities (conceptual shapes already sketched in `data-model.md`, not finalized — that
finalization, including the real Prisma migration, is your job):

1. **TargetEnvironment** — classifies a Target as production/staging/development. Must never, by
   itself, grant or imply any testing permission (Constitution Principle X). Decide: can a Target
   have no classification (unclassified), and if so, confirm every Environment-restricted
   execution class refuses rather than defaults-permits for an unclassified Target.
2. **TargetAuthorization** — an explicit, separately-granted permission for one or more execution
   classes against a Target, with a Scope, an Environment restriction, and request/concurrency/
   duration budgets. Never references `TargetVerification`. Decide: the real lifecycle
   (`GRANTED -> ACTIVE -> REVOKED | EXPIRED` was sketched in `data-model.md`; validate or revise
   it), who can grant one (the target's owner? an admin? both?), and how a grant's budgets are
   actually enforced at runtime (you define the contract; Foundation Spec 04 — Execution Runtime —
   implements enforcement against it).
3. **ScopeDefinition** — included/excluded domains, subdomains, routes, APIs, repos, branches,
   accounts, roles, actions. Decide: the actual pattern-matching semantics (glob? regex? exact
   list?) and what "excluded takes precedence over included on overlap" means precisely for your
   chosen pattern language.

## What you must NOT touch or duplicate

- **`Target`** (existing Prisma model) — unchanged. Your entities attach to it; you do not modify
  its fields.
- **`TargetVerification`/`ControlLevel`** (existing) — unchanged, and never referenced by
  `TargetAuthorization`. If you find yourself wanting to add a field to `TargetVerification` to
  make Authorization easier, stop — that is the collapse Constitution Principle X exists to
  prevent.
- Any engine's actual execution logic (Active Security, Authenticated Workflow, etc.) — you define
  what Authorization/Scope/Environment *mean* and how they're granted/checked; you do not design
  how any engine *uses* a grant once obtained.

## Open questions this spec must resolve (not inventable by the master architecture)

From `specs/006-scan-architecture-v2/decisions.md`'s Open Decisions table:

1. **`TODO(ACTIVE_SECURITY_AUTHORIZATION_MODEL)`** (constitution v1.2.0 Sync Impact Report): the
   concrete authorization-level taxonomy and its data-model representation. The master spec's
   working model (passive / browser-interactive / authenticated / active-security / load /
   high-impact-staging-only) was accepted by product 2026-10-07 as a *starting point*, not a final
   answer — you may refine it with new evidence, but you are not required to keep it unchanged if
   your detailed design surfaces a better shape.
2. A genuine nuance found during this master spec's own task validation: some testing categories
   (IDOR, business-logic/price/coupon manipulation, race conditions) span **two** execution classes
   (`AUTHENTICATED_WORKFLOW` for session/role setup, `ACTIVE_SECURITY` for the actual adversarial
   request) rather than fitting cleanly into one. Decide whether your Authorization model grants
   per-class or needs a composite-grant concept for tests that inherently need both.

## What "done" looks like for this spec

Per Constitution Principle XIV and this master spec's own `quickstart.md` validation steps 3-5
(authorization-is-not-ownership, untrusted-code-isolation — not applicable to F01 itself, and
tenant-isolation), your own spec's checklist must demonstrate: Ownership Verification and
Authorization remain two non-collapsible entities everywhere in your design; every new entity you
define is tenant-scoped at creation; and your spec explicitly unblocks F02 (Scan Profiles/
Execution Planning), F05 (Credentials/Sessions), and F07 (Safety/Kill Switch) per
`specs/006-scan-architecture-v2/roadmap.md`'s dependency table — those three specs cannot be
planned in concrete detail until yours exists.
