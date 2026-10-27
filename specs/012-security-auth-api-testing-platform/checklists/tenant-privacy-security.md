# Tenant and Privacy Security Checklist: Security / Authentication / Authorization / API / Business-Logic Testing Platform (SPEC 012)

**Purpose**: Tenant isolation, PII minimization, redaction, retention and consent are specified for every 012 surface
**Created**: 2026-10-10 · **Re-scored**: 2026-10-11 after the analyze pass and the independent adversarial review repairs (no stale marks carried over)
**Feature**: [spec.md](../spec.md), [plan.md](../plan.md), [analyze-report.md](../analyze-report.md), [adversarial-review.md](../adversarial-review.md)

**Review Ownership**: reviewer-owned requirements-quality artifact. `[x]` means the criterion was verified against the package text (the check is named after each item); it does **not** mean implementation is complete or that a design is secure.
**Marker Semantics**: items needing owner judgment, upstream commits, an independent re-review or implementation evidence stay `[ ]` with the reason shown.

## Isolation

- [x] CHK001 Credentials, sessions, evidence and artifacts are tenant-scoped; storage keys carry the scan and unit — _FR-132_
- [x] CHK002 Cross-tenant ids return not-found; every 012 table is tenant-filtered — _data-model V-14_
- [x] CHK003 Closed DTO allow-lists, row-level security and IDOR/mass-assignment conformance tests exist — _FR-182_
- [x] CHK004 Account deletion shreds credentials and purges tables the User cascade does not reach — _FR-167_
- [x] CHK005 Credentials are never reachable from any SOURCE_EXECUTION Guest or the sandbox runner — _FR-025_
- [x] CHK006 The unit MAC key, the mandatory FR-201 DB-role isolation (activation prerequisite) and per-request lease status keep a compromised worker from reaching arbitrary tenants' credentials; the residual is stated — _FR-173; AR-13_

## Privacy

- [x] CHK007 PII is minimized to classes and counts; names are treated as values; PII detectors run on excerpts — _FR-128/132_
- [x] CHK008 Logs, Sentry, BullMQ and crash dumps are covered by a process-global exact-value registry and runtime posture — _FR-180_
- [x] CHK009 Customer responses are untrusted data: never HTML-rendered, never fed unredacted to AI, strings normalized — _FR-134_
- [x] CHK010 Screenshots/HAR are not pixel-redacted; none are captured for authenticated pages in v1 — _FR-133_
- [x] CHK011 Confidential evidence kinds are excluded from share links and bulk exports by default — _FR-185_
- [x] CHK012 Retention: ciphertext, leases, evidence and consent records have stated retention and deletion — _data-model section 12_

## Consent and disclosure

- [x] CHK013 A versioned consent record captures authority, third-party, non-production and data-handling attestations — _FR-177_
- [x] CHK014 AI-processing disclosure/opt-out and 'observed responses are target-asserted' are in the SG9 copy list — _plan SG9_

## Open

- [ ] CHK015 Consent/disclosure copy approved by product/legal (U30 dependency) — _OPEN — gate SG9, task T524_ **Class: activation-only gate SG9 (U30 copy, a future spec).**
- [ ] CHK016 Legal review of hosting-provider and third-party exposure beyond recorded attestations — _OPEN — residual risk 8 in adversarial-review Part 5_ **Class: owner and legal decision before SG9.**

## Notes

- Scores are mechanical-plus-reviewed as of 2026-10-11; any later edit to spec/plan/contracts requires re-running the generator checks (analyze2.py + this script) before trusting a mark.
- Unchecked items are not defects in the planning text; they are decisions, commits, reviews or implementation evidence that do not yet exist.
