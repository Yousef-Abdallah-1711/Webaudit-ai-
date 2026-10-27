# Authorization and Production Safety Checklist: Security / Authentication / Authorization / API / Business-Logic Testing Platform (SPEC 012)

**Purpose**: Authorization, scope, environment and production restrictions are consumed from F01/F07 unchanged and enforced at every point
**Created**: 2026-10-10 · **Re-scored**: 2026-10-11 after the analyze pass and the independent adversarial review repairs (no stale marks carried over)
**Feature**: [spec.md](../spec.md), [plan.md](../plan.md), [analyze-report.md](../analyze-report.md), [adversarial-review.md](../adversarial-review.md)

**Review Ownership**: reviewer-owned requirements-quality artifact. `[x]` means the criterion was verified against the package text (the check is named after each item); it does **not** mean implementation is complete or that a design is secure.
**Marker Semantics**: items needing owner judgment, upstream commits, an independent re-review or implementation evidence stay `[ ]` with the reason shown.

## Authorization points

- [x] CHK001 Authorization is fresh at scan creation, plan resolution, dispatch, every destination, every redirect, every state-changing step and reverify — _FR-003_
- [x] CHK002 Every safety-sensitive action goes through safetyCheckpoint, never isAuthorized directly — _FR-004_
- [x] CHK003 A verified domain alone authorizes nothing active (ownership != authorization) — _FR-005_
- [x] CHK004 Account/role/action-category semantics are defined by 012 and enforced by a fail-closed gate, with the limitation that F01 does not enforce them stated — _FR-012; AR-1_
- [x] CHK005 Empty includedActionCategories is defined conservatively (READ + NEGATIVE_PROBE only) — _scope contract_

## Production and environment

- [x] CHK006 ACTIVE_SECURITY/AUTHENTICATED_WORKFLOW never run against PRODUCTION or unclassified targets, refused at plan, gate, broker and dispatch — _FR-078_
- [x] CHK007 A check is classified mechanically from its probe definition and cannot be relabeled passive to bypass restrictions — _FR-007; registry loader_
- [x] CHK008 Undeclared operations are potentially mutating for every HTTP method — _FR-007_
- [x] CHK009 Unclassified targets refuse active checks; reclassification takes effect immediately and is never healed — _FR-013/014_
- [x] CHK010 Environment integrity: cool-off, non-production attestation and re-attestation exist; the prohibition is stated as customer-attested — _FR-176_
- [x] CHK011 Owner-verified address binding prevents probing a re-pointed name — _FR-172_
- [x] CHK012 A versioned consent record is required for active grants and mutation classes — _FR-177_
- [x] CHK013 C4/C5 operations exist only as UNSUPPORTED registry entries with no probe definition — _FR-010_
- [x] CHK014 No production active-testing amendment is requested; no amendment is REQUIRED — _upstream-amendment-requests.md_
- [x] CHK015 No file under specs/006-011 was modified after this package was started — _mtime check against spec.md creation time_
- [x] CHK016 Verified address binding: HTTP-file proof required; hostname proof and address-control proof over the connection; unit pinned to the proven address set; fresh proof at dispatch; customer-declared address sets and shared-edge attestations removed — _FR-172_
- [x] CHK017 Third-party/shared infrastructure (shared hosting, CDN, PaaS) is refused for active classes; authorization is never established by customer attestation alone — _FR-172(g); P16 default NO_
- [x] CHK018 Consent is enforced at plan resolution, dispatch, broker issue, every permit mint and the mutation gate; a consent lookup error fails closed; the limit of 007 grant creation is recorded (AR-14) — _FR-177; AR-14_
- [x] CHK019 P10/AR-3 is owner-approved and closed: web targets cover APIs only under matching F01 scope and grants; no 007 amendment — _AR-3 closed_

## Destinations

- [x] CHK020 Cross-origin redirects are not followed by default; every followed hop (a planned `REDIRECT_HOP` step only, FR-200(e)) is re-admitted and re-authorized; credentials are stripped on non-identical origins — _FR-081_
- [x] CHK021 A scanner never makes Fahes request a prohibited destination to test the customer's SSRF behavior; OAST is unsupported — _FR-080_
- [x] CHK022 OpenAPI servers[] and external $ref are never request targets — _FR-083/084_

## Open


## Notes

- Scores are mechanical-plus-reviewed as of 2026-10-11; any later edit to spec/plan/contracts requires re-running the generator checks (analyze2.py + this script) before trusting a mark.
- Unchecked items are not defects in the planning text; they are decisions, commits, reviews or implementation evidence that do not yet exist.
