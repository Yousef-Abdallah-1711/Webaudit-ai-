# Auth / API / Business-Logic Correctness Checklist: Security / Authentication / Authorization / API / Business-Logic Testing Platform (SPEC 012)

**Purpose**: Authentication, authorization, API and business-logic checks have explicit expected outcomes, controlled fixtures and honest limits
**Created**: 2026-10-10 · **Re-scored**: 2026-10-11 after the analyze pass and the independent adversarial review repairs (no stale marks carried over)
**Feature**: [spec.md](../spec.md), [plan.md](../plan.md), [analyze-report.md](../analyze-report.md), [adversarial-review.md](../adversarial-review.md)

**Review Ownership**: reviewer-owned requirements-quality artifact. `[x]` means the criterion was verified against the package text (the check is named after each item); it does **not** mean implementation is complete or that a design is secure.
**Marker Semantics**: items needing owner judgment, upstream commits, an independent re-review or implementation evidence stay `[ ]` with the reason shown.

## Authentication

- [x] CHK001 Auth checks enumerate login, session, logout, expiry, cookie flags, fixation, CSRF, recovery structure, MFA observation, error uniformity and authorization after logout — _FR-086_
- [x] CHK002 Password guessing, credential stuffing and account takeover are out of scope (C5) — _FR-087_
- [x] CHK003 Recovery flows never trigger mail/SMS to real recipients; customer sinks required — _FR-088_

## Authorization

- [x] CHK004 Authorization tests use customer identities and registered fixtures only; no enumeration or third-party data — _FR-091/092_
- [x] CHK005 Pairwise expectation vs observation uses status class and a fixture-confined oracle; confirmed vs suspected vs fixture limitation are separated — _FR-093/094_
- [x] CHK006 Admin identities are fixture owners only; identities default to UNSET (not an actor) — _FR-095_
- [x] CHK007 Oracle strength: unique >= 16-char marker, negative control — _FR-140_

## API

- [x] CHK008 API discovery is offline and separate from probing; discovery is not authorization — _FR-098/100_
- [x] CHK009 Spec parsing is bounded and isolated (size, depth, nodes, aliases, 10 s terminate) — _FR-084_
- [x] CHK010 Active API probes are structured, schema-derived, <= 8 per operation, no fuzzing — _FR-102_
- [x] CHK011 Static/spec-based analysis is separated from active requests — _FR-101_

## Business logic and mutation

- [x] CHK012 Business-logic verdicts require customer-defined invariants from a closed predicate vocabulary; no invariant, no verdict — _FR-114/115_
- [x] CHK013 Customer-asserted sandbox fixtures are a stated limitation; live-mode indicators abort — _FR-117_
- [x] CHK014 Every mutation has write-ahead intent, bounded count, verified cleanup and a residual manifest; no cleanup after a stop — _FR-119..122_
- [x] CHK015 A test with failed or unverified cleanup is never NO_ISSUE_DETECTED — _FR-123_
- [x] CHK016 CSRF token absence is never reported as exploitable — _FR-108_
- [x] CHK017 Dependency advisories are offline, provenance-stamped, freshness-bound and never claim exploitability from a version — _FR-111/170_
- [x] CHK018 Operation declarations that enable active API probes have an entity, closed DTO, consent link and a change tripwire — _FR-192_
- [x] CHK019 Sensitive-class workflows need an interactive recorded confirmation; non-interactive runs refuse — _FR-117_

## Open

- [ ] CHK020 011's DEPENDENCY evidence payload is typed (advisory matching currently degrades to SEC_VERSION_UNRESOLVED when fields are absent) — _OPEN — 011 owner; recorded in advisory-matching-contract_ **Class: upstream amendment dependency (011 owner; advisory matching degrades safely meanwhile).**

## Notes

- Scores are mechanical-plus-reviewed as of 2026-10-11; any later edit to spec/plan/contracts requires re-running the generator checks (analyze2.py + this script) before trusting a mark.
- Unchecked items are not defects in the planning text; they are decisions, commits, reviews or implementation evidence that do not yet exist.
