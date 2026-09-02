# Phases 4–7 Engineering Review — T144–T193

**Date:** 2026-09-02
**Scope:** Phase 4 (US2 — the fix loop), Phase 5 (US3 — production readiness verdict), Phase 6
(US4 — audit source, not just the served page), Phase 7 (US5 — plans, credits, entitlements).
**Method:** Four independent review passes (one per phase), each reading the actual shipped code
and its tests directly — not `tasks.md`'s description of it — cross-checked against
[CLAUDE.md](../../CLAUDE.md)'s non-negotiables. No `plan.md` was available for this feature at
review time; architectural intent was inferred from `tasks.md`'s own inline notes, file layout, and
patterns already established in the code (the `AppDeps` seam, typed-error → route-status mapping,
guarded `updateMany` instead of read-then-write). Anywhere that inference could be wrong is called
out explicitly under each phase's "Assumptions" line.
**Status column:** ✅ Fixed in this review cycle · 🔴 Open · — Not applicable (informational only).

**Update (2026-09-02, remediation pass):** all findings below except 9 and 17 are now ✅ Fixed, via
[2026-09-02-phases-4-7-remediation.md](2026-09-02-phases-4-7-remediation.md)'s 14 tasks (plus one
unplanned regression fix, Task 3b, discovered when Task 3's new check was run against a live database
for the first time). Findings 9 and 17 are deliberately excluded per that plan's own Global
Constraints — 9 is a systemic pattern shared elsewhere in the codebase, not a targeted fix; 17 is an
operational/capacity-planning note, not a code defect.

---

## Consolidated findings, most severe first

| # | Sev | Phase | Finding | Status |
|---|-----|-------|---------|--------|
| 1 | **Critical** | 4 | `owasp-checker` reverify can PASS a still-vulnerable multi-cookie site | ✅ Fixed (Task 1) |
| 2 | High | 5 | Certificate/email guard permanently drops the congratulations email on partial failure | ✅ Fixed |
| 3 | High | 6 | `safeFetch` forwards the GitHub Bearer token to every redirect hop with no host allowlist | ✅ Fixed (Task 2) |
| 4 | High | 7 | FR-079 concurrent-scan limit is dead code, never enforced | ✅ Fixed (Task 3) |
| 5 | High | 7 | `entitlements.middleware.ts` never mounted; routes duplicate the policy ad hoc | ✅ Fixed (Task 4 + final-review follow-up: dead middleware deleted, ad hoc design confirmed) |
| 6 | High | 7 | Webhook effect application isn't transactional with the idempotency claim | ✅ Fixed (Task 5) |
| 7 | Medium | 4 | Client-side N+1 for failing-evidence hydration on the Fixes board | ✅ Fixed (Task 6) |
| 8 | Medium | 5 | No test exercised the route-level certificate/email guard at all | ✅ Fixed (new test added) |
| 9 | Medium | 5 | `moduleOutcomes` JSON cast bypasses type safety at the DB boundary (pre-existing pattern) | 🔴 Open (systemic, deliberately excluded) |
| 10 | Medium | 6 | Source workspace teardown does not fire on cancellation | ✅ Fixed (Task 7) |
| 11 | Medium | 7 | No test for the webhook's fail-closed 503 (no secret configured) | ✅ Fixed (Task 8) |
| 12 | Low | 4 | `tasks.md` T153 overstates reverify correctness for the multi-cookie case | ✅ Fixed (Task 9) |
| 13 | Low | 4 | Fixes page shows "You were not charged" even after a lost-in-transit success response | ✅ Fixed (Task 10) |
| 14 | Low | 5 | Certificate `GET` 404s indistinguishably during the sub-second generation window | ✅ Fixed (Task 11) |
| 15 | Low | 5 / 7 | CSS Modules mix raw px/font-size with design tokens — adherence lint has a blind spot for `.css` files | ✅ Fixed (Task 12) |
| 16 | Low | 6 | Zip64 sentinel field not explicitly rejected (fails safe today via other checks) | ✅ Fixed (Task 13) |
| 17 | Low | 6 | Per-request memory ceiling is not fleet-aware (operational note, not a code defect) | — (deliberately excluded) |
| 18 | Low | 7 | Retention boundary uses `<=`, removing a report at the exact expiry instant | ✅ Fixed (Task 14) |

---

## Phase 4 — User Story 2: the fix loop (T144–T157)

**Claimed guarantee (SC-007):** a user asserts an issue fixed, the platform re-runs *only* that one
check, and the issue turns green *only* when the check passes — no user action may write `RESOLVED`
directly.

### Files reviewed
- `apps/api/src/services/issues/state-machine.ts`
- `apps/api/src/services/issues/attempts.ts`
- `apps/api/src/services/issues/recurrence.ts`
- `apps/api/src/routes/issues.routes.ts`
- `apps/worker/src/reverify/resolve-check.ts`
- `apps/worker/src/reverify/runner.ts`
- `packages/capabilities-vendored/*/src/index.ts` — all 9 capabilities carrying a `reverify` export
  (headers, ssl, owasp, meta, content/data-leak, redaction, plus the three Phase 6 source
  capabilities)
- `apps/web/components/fixes/FixesBoard.tsx`, `apps/web/components/fixes/IssueRow.tsx`
- `apps/web/app/(dashboard)/fixes/page.tsx`
- `packages/types/src/domain.ts` (`ISSUE_STATE_TRANSITIONS`)
- `packages/types/tests/unit/enum-drift.test.ts`
- `apps/api/tests/adverse/verification.test.ts`
- `apps/worker/tests/integration/reverify.test.ts`
- `packages/capabilities-vendored/tests/unit/reverify.test.ts`

### Findings

**1. CRITICAL — `owasp-checker` reverify can falsely report PASSED on a still-vulnerable
multi-cookie site**
File: `packages/capabilities-vendored/owasp-checker/src/index.ts:143-152`.
`safe-fetch.ts` joins multiple `Set-Cookie` response headers into one comma/space-joined string.
The reverify check runs `flagPattern.test(setCookie)` against that joined string — a substring
match anywhere — rather than confirming *every* cookie carries the required flag
(`Secure`/`HttpOnly`/`SameSite`), despite its own comment claiming that's what it does.
*Why it matters:* if a site sets two cookies and only one is correctly flagged, the regex still
matches and the runner records `PASSED` → `RESOLVED`, while a genuinely insecure cookie persists.
This defeats SC-007 at the capability layer — the exact "URL-only capability that can go PASSED
while the problem persists" failure mode the guarantee exists to prevent.
*Fix:* split `Set-Cookie` back into individual cookies before checking (requires `safe-fetch.ts` to
preserve the raw header array), and require the flag on every cookie, not a substring match
anywhere in the joined string.
*Test to add:* two `Set-Cookie` headers, one flagged and one not → expect `FAILED`, not `PASSED`.
(`reverify.test.ts:98-109` currently only covers zero- and single-cookie cases.)

**7. MEDIUM — Client-side N+1 for failing-evidence hydration**
File: `apps/web/app/(dashboard)/fixes/page.tsx:35-55`. `loadFailingEvidence` issues one
`GET /issues/:id/attempts` request per issue needing evidence, refired on every `issue:verified`
event. At the project's stated 10,000+ concurrent-user scale this is N parallel requests per
refresh, with no batched endpoint available.
*Fix:* add a batched `GET /scans/:id/issues/attempts?state=...`, or embed last-failed-evidence
directly on the issues-list response.

**12. LOW — `tasks.md` T153 overstates verification.** Line 346 states reverify "returns
PASSED / FAILED{evidence} / UNVERIFIABLE" without qualifying the multi-cookie aggregation gap
above — not fully substantiated by the code for that case.

**13. LOW — inaccurate user-facing error message.** `apps/web/app/(dashboard)/fixes/page.tsx:112-117`
always shows "You were not charged" on any `assertIssueFixed` failure. True for the 402/409 paths,
but a network failure after the server successfully debited-and-enqueued (response lost in transit)
would show the same message despite a real charge having occurred. Cosmetic — `refresh()` runs
immediately after and shows the true state.

### What verified sound (no findings)
- **Single writer of `RESOLVED`:** `recordVerificationAttempt` (`attempts.ts:66-151`) is the only
  code path that can move an issue to `RESOLVED`. `ISSUE_STATE_TRANSITIONS`
  (`packages/types/src/domain.ts:153-159`) has exactly one inbound edge to `RESOLVED`, confirmed by
  `enum-drift.test.ts:260-263`.
- **Guarded transition, not read-then-write:** both `issues.routes.ts:103-106` and
  `attempts.ts:92-104` use conditional `updateMany` keyed on current state; a retried BullMQ job
  records exactly one attempt (`reverify.test.ts:162-171`).
- **Refund correctness:** `outcomeIsRefundable` (ERRORED, UNVERIFIABLE only) at
  `state-machine.ts:110-112`; FAILED never refunds; a stale/retried job cannot double-refund
  (`attempts.ts:126-143`).
- **Runner scope:** `runner.ts` calls only the one resolved capability's `reverify()` — no
  `runModule` or full-module invocation anywhere in the file.
- `recurrence.ts` and `issues.routes.ts` have no N+1 query patterns.
- `apps/api/tests/adverse/verification.test.ts` genuinely exercises the adversarial shape (unchanged
  assertion, bulk assert-all, throwing check, a positive control), not just the happy path.
- UI is purely presentational, driven by server-returned `issue.state`; realtime reconnection
  triggers a full refetch, covering missed-event gaps.

### Assumptions (no plan.md)
None beyond the general note above — this phase's architecture is fully legible from the code and
`tasks.md`'s own inline reasoning.

---

## Phase 5 — User Story 3: the readiness verdict (T158–T168)

**Claimed guarantee (FR-066–072):** a fresh, full re-audit (no baseline reuse) is diffed against the
baseline by fingerprint; regressions are named, not merely counted; an explicit go/no-go verdict is
returned; a *go* verdict lazily and exactly-once produces a shareable certificate and a
congratulations email.

### Files reviewed
- `apps/api/src/services/readiness/create.ts`
- `apps/api/src/services/readiness/certificate.ts`
- `apps/worker/src/readiness/run.ts`, `diff.ts`, `verdict.ts`
- `apps/api/src/services/email/readiness.ts`
- `apps/api/src/routes/readiness.routes.ts`
- `apps/web/components/report/ReadinessVerdict.tsx` + `.module.css`
- `apps/web/app/(dashboard)/readiness/page.tsx`
- `apps/api/tests/unit/readiness-certificate.test.ts`
- `apps/api/tests/contract/readiness.premature.test.ts`
- `apps/worker/tests/**/readiness*` (fresh, regression/diff, verdict suites)
- `@webaudit/config` (`READINESS_THRESHOLDS`)
- **New in this review cycle:** `apps/api/tests/contract/readiness.certificate-email-guard.test.ts`,
  `apps/api/prisma/migrations/20260902130000_readiness_certificate_email_guard/migration.sql`,
  `apps/api/prisma/schema.prisma` (`ReadinessVerdict.certificateEmailSentAt`)

### Findings

**2. HIGH — Certificate/email guard permanently dropped the congratulations email on partial
failure — ✅ FIXED**
File: `apps/api/src/routes/readiness.routes.ts:209-252` (pre-fix).
The email-send and certificate-generation guard shared one placeholder (`certificateKey: ''`). If
`sendReadinessCongratulations` threw *after* the certificate key had already been committed to its
real value, the catch block's release (`updateMany where certificateKey: ''`) matched nothing — the
placeholder had already been overwritten by the success path — so the reset silently no-op'd. The
row was left with a valid key, so every future `GET` skipped the block entirely and the email was
never retried.
*Fix shipped:* added an independent `certificateEmailSentAt` column with its own claim/release pair
(a distinct sentinel value, `new Date(0)`, that only ever transitions to a real timestamp on success
or back to `null` on failure — never touched by the certificate-generation block). Certificate
generation and email sending are now two fully decoupled guarded sections; either can fail and retry
independently.
*Test added:* `readiness.certificate-email-guard.test.ts` — asserts a mailer failure on the first
`GET` still generates and commits the certificate exactly once, and the email correctly retries and
succeeds on the next `GET`; a second test asserts no re-send once the email has succeeded.
*Verification performed:* `tsc --noEmit`, `eslint`, and `prettier` all clean on the changed files;
the new test was run directly and progresses correctly through app boot, failing only on
`Can't reach database server at localhost:5442` (no Docker/Postgres available in this environment).
**Action needed from you:** run `pnpm services:up && pnpm db:migrate && pnpm test
tests/contract/readiness.certificate-email-guard.test.ts` locally to confirm green, since it could
not be executed end-to-end in this sandbox.

**8. MEDIUM — No test exercised the route-level guard at all — ✅ addressed by the same fix.**
`readiness-certificate.test.ts` only ever tested `certificate.ts` in isolation, never the route's
claim/release mechanism — which is exactly how Finding 2 went unnoticed. The new
`readiness.certificate-email-guard.test.ts` closes this gap.

**9. MEDIUM — `moduleOutcomes` cast bypasses type safety across a JSON boundary.**
`apps/worker/src/readiness/run.ts:100-101` and `readiness.routes.ts` (pre-fix line numbers
216-217) both do `as unknown as X` through `Prisma.InputJsonValue`. This is a deliberate, consistent
pattern matching `attempts.ts` elsewhere in the codebase — not a one-off bug — but a future field
rename in `verdict.ts`'s `ModuleOutcome` or `certificate.ts`'s `CertificateInput['moduleOutcomes']`
would not be caught by the compiler at either boundary. CLAUDE.md's "validate at every boundary"
rule for queue/DB JSON payloads would suggest a runtime Zod parse on read. Flagged as a systemic
pattern, not unique to this phase — not fixed in this cycle.

**14. LOW — Certificate `GET` can 404 while genuinely mid-generation.**
`readiness.routes.ts` (certificate route): the placeholder value doesn't shortcut to a distinct
"still generating" response; a request during the claim window falls through to a generic 404,
indistinguishable from "no certificate will ever exist." Cosmetic — the window is sub-second.

**15. LOW — pre-existing raw-px pattern in `ReadinessVerdict.module.css`.**
Lines 19, 33, 60, 64-69, 86, 93-94, etc. mix literal `px` values with `var()` token usage. The
adherence lint's `no-restricted-syntax` rule matches JS/TSX `Literal` AST nodes only, not CSS files
— so this passes lint and matches a pre-existing pattern already present in `IssueCard.module.css`.
Not a Phase 5 regression, but the CLAUDE.md claim that "a raw px value fails `pnpm lint`" is
effectively unenforced for CSS Modules project-wide. See also Finding 15 in Phase 7 (same root
cause, different file) — this is one systemic gap, not two.

### What verified sound
- **FR-067 fresh audit, no reuse:** `run.ts:28-40` only ever reads baseline rows for comparison,
  never writes to them; `readiness.fresh.test.ts:141-151` confirms baseline rows are byte-identical
  before/after.
- **Verdict boolean logic:** `verdict.ts:90` — genuinely AND (all areas at/above threshold AND zero
  regressions), confirmed by `readiness-verdict.test.ts:44-52`.
- **`overallScore` never null:** intentional, documented divergence (`?? 0` with an accompanying
  blocker), not a silent inflation bug.
- **Regressions are genuinely named**, not just counted (`diff.ts` output shape confirmed against
  `readiness.regression.test.ts:160-163`).
- **Diff performance:** `Map`/`Set` keyed lookups, O(n+m), no nested loops.
- **FR-066 ordering:** the premature check runs before the credit check and the debit
  (`readiness.premature.test.ts:132-135` confirms zero debit rows on refusal).
- **Certificate self-containment:** no external `<link>`, `<script src>`, or `@import` in the
  template — confirmed both by direct reading and by `readiness-certificate.test.ts:26-32`.
- **Idempotent verdict write:** a genuine `upsert` on `scanId` (unique), safe for a retried phase
  job.

### Assumptions (no plan.md)
The exact wording of FR-072's "exactly once" guarantee (does it mean "the certificate" or "the
certificate and the email as one unit"?) was inferred from the route's own doc comment and T166/167's
task text. The fix in this cycle takes the stricter reading (each half exactly once, independently)
as the correct one, since it's the only reading that survives a partial failure without becoming
"never."

---

## Phase 6 — User Story 4: audit source, not just the served page (T169–T179)

**Claimed guarantees (FR-015):** a hostile archive is refused before extraction and before any
charge; a zip bomb is stopped by both a ratio *and* an absolute ceiling; symlinks are refused, never
dereferenced; a per-entry declared size is enforced mid-stream, not trusted from the central
directory; a repository is fetched as a zipball through the same guard, with SSRF re-validation on
the redirect hop.

### Files reviewed
- `packages/safe-archive/src/guard.ts`, `zip.ts` (and the full `packages/safe-archive/src/` tree)
- `apps/api/src/services/intake/upload.ts`, `repos.ts`
- `apps/api/src/services/storage/uploads.ts`
- `apps/worker/src/intake/repo-clone.ts`, `materialise.ts`
- `apps/api/src/routes/intake.routes.ts`
- `apps/web/components/scan/InputTabs.tsx`
- `packages/capabilities-vendored/dependency-scanner/src/index.ts`,
  `bundle-analyzer/src/index.ts`, `css-analyzer/src/index.ts`
- `packages/safe-net/src/safe-fetch.ts`
- `apps/worker/src/workspace/teardown.ts`
- `apps/api/tests/contract/upload.test.ts`
- `packages/safe-archive/tests/**` (adverse: zip bomb, symlink, traversal, declared-size mismatch)
- `packages/safe-net/tests/adverse/ssrf.redirect.test.ts`
- `apps/worker/tests/**/repo-clone*`, `**/materialise*`

### Findings

**3. HIGH — `safeFetch` forwards the GitHub Bearer token to every redirect hop with no host
allowlist**
File: `packages/safe-net/src/safe-fetch.ts:131`, consumed from
`apps/worker/src/intake/repo-clone.ts:108-123`.
`guardedFetch` re-validates the *address* on every redirect hop (correct SSRF layering — resolve
happens at connect time, per hop), but never re-evaluates *headers*: the outgoing header set,
including `authorization: Bearer <token>`, is re-sent unchanged to whatever host the `Location`
header names, so long as that host passes the private/loopback/metadata SSRF policy. Today this is
safe only because GitHub itself controls the redirect target (`api.github.com` → `codeload.github.com`);
nothing in the code enforces that scope, and no test (`ssrf.redirect.test.ts`) inspects the outgoing
request's headers on a cross-origin hop.
*Why it matters:* a credential leak on redirect is a standard SSRF/OAuth-token exfiltration
primitive. `safeFetch` is a shared package — any future credentialed caller inherits the same silent
behavior with no way to opt out.
*Fix:* add an `allowedRedirectHosts` (or `credentialScope`) option to `guardedFetchOptions`; drop
`authorization` and other caller-designated sensitive headers whenever the hop's hostname differs
from the previous hop's, unless explicitly allowlisted. `repo-clone.ts` would pass
`['api.github.com', 'codeload.github.com']`.
*Test to add:* a fixture where hop 0 receives an `Authorization` header and redirects cross-origin;
assert hop 1's captured request has no `authorization` header (plus a same-origin positive case
where the header *is* preserved).

**10. MEDIUM — Source workspace teardown does not fire on cancellation (self-disclosed, known).**
`apps/worker/src/workspace/teardown.ts:16-22`'s own docstring: `COMPLETED`/`FAILED`/`TIMED_OUT` are
hooked via the worker's own `transition()`, but `CANCELLED` is written directly by the API's
`/scans/:id/cancel` route in a different process, which never calls the worker's transition hook.
`sweepOrphanedWorkspaces` is the backstop, on its own schedule, not synchronous with cancellation.
Applies equally to ARCHIVE/REPOSITORY scans as to URL scans — this is the fourth of the
constitution's "four exit paths, four assertions," and it's the one still open.
*Fix:* route cancellation through the worker's state machine (a maintenance-queue job), or have the
API's cancel route enqueue an immediate targeted teardown job instead of relying solely on the sweep.
*Test to add:* an integration test that cancels a scan with a populated ARCHIVE/REPOSITORY workspace
and asserts synchronous destruction (currently absent from `workspace.test.ts` and
`source-materialisation.test.ts`).

**16. LOW — Zip64 sentinel fields aren't explicitly rejected.**
`packages/safe-archive/src/zip.ts:130-138` refuses a file carrying the Zip64 EOCD locator, but
doesn't separately check whether an individual entry's size/offset field is the `0xFFFFFFFF`
sentinel without the accompanying locator. In practice this fails safe today — the sentinel trips
existing size or offset bounds checks — just with a less precise refusal reason for a malformed
input. No test covers this exact byte pattern; optional to fix.

**17. LOW / operational note — per-request memory ceiling is not fleet-aware.**
Each upload/zipball fetch is correctly capped and streamed, so no single request can exceed its
declared budget. At 10,000+ concurrent scale the aggregate worst case (`~50 MB × concurrent
uploads`) has no shared backpressure — this is a queue/rate-limiter concern, not a defect in
`safe-archive` itself.

### What verified sound
- **Ordering:** `extractArchive` calls `inspectArchive` unconditionally, no skip path; the upload
  route validates before any bytes are written and before any `Scan` row or debit exists.
- **Zip bomb:** both a compression-ratio check *and* an absolute `maxUncompressedBytes` ceiling are
  enforced, budget is the `min()` of both.
- **Per-entry byte budget:** enforced via a stream transform during inflate, not just against the
  claimed central-directory size; a mismatch deletes the partial file before the error propagates.
- **Symlinks refused outright**, never dereferenced to decide policy.
- **Path traversal** sanitized against both `../` and absolute paths before joining to the
  extraction root.
- **Repo zipball flow uses `safeFetch`**, and the redirect hop to `codeload.github.com` is
  re-validated (the *address* check, distinct from Finding 3's *header* gap).
- **`stripComponents: 1`** correctly strips the `owner-repo-<sha>/` wrapper — verified for the
  edge case of an entry that is exactly the wrapper directory itself.
- **Revoked connection (T171):** the liveness check runs before the debit; the test asserts no debit
  *and* no refund row, not just a net-zero balance.
- **Capability gating:** dependency-scanner/bundle-analyzer/css-analyzer correctly resolve to
  `NOT_APPLICABLE` with a null (not zero) module score when no source is attached.
- **Bundle-analyzer head+tail fix** (previously recorded in PROGRESS.md as fixed) is confirmed real
  in the current code — it reads both head and tail, not a head-only prefix.
- All of T169–T179 are substantiated by the code as written, more thoroughly tested than most `[X]`
  tasks reviewed elsewhere in this repo. One wording nit only: T171's task-line summary says "fails
  clearly and refunds," but the actual (and correct) behavior is a pre-debit refusal, never a
  debit-then-refund — the task file's own later sentence self-corrects this, so it's a documentation
  slip, not a code defect.

### Assumptions (no plan.md)
None of substance — `packages/safe-archive`'s own docstrings and adversarial test suite make its
intended guarantees explicit enough to review directly against the code.

---

## Phase 7 — User Story 5: pay for capacity with plans and credits (T180–T193)

**Claimed guarantees:** SC-008 (a platform-fault failure is refunded, fully or proportionally, and
visibly); SC-022 (plan credits spend before purchased); renewal replaces rather than tops up plan
lots; the billing webhook fails closed and is idempotent on the provider's event id; entitlement
refusal happens before any charge.

### Files reviewed
- `apps/api/src/services/billing/subscription.service.ts`, `purchase.service.ts`,
  `renewal-warning.ts`
- `apps/api/src/middleware/entitlements.middleware.ts`, `apps/api/src/services/billing/entitlements.ts`
- `apps/api/src/routes/webhooks.routes.ts`, `billing.routes.ts`
- `apps/api/src/services/storage/retention.ts`, `export.ts`
- `apps/web/app/(dashboard)/billing/page.tsx` + `.module.css`
- `apps/web/app/(public)/pricing/page.tsx`
- `apps/api/src/services/credits/debit.ts`, `refund.ts`, `expiry.ts`
- `apps/api/src/services/intake/create-scan.ts` (concurrency-limit gap)
- `apps/api/src/app.ts` (raw-body webhook mounting)
- `apps/api/tests/adverse/refund-on-failure.test.ts`
- `apps/api/tests/integration/renewal.test.ts`
- `apps/api/tests/contract/purchase-free-tier.test.ts`, `entitlements.test.ts`, `billing-webhook.test.ts`

### Findings

**4. HIGH — FR-079 concurrent-scan limit is dead code, never enforced.**
`apps/api/src/services/billing/entitlements.ts:163-188` defines `assertConcurrencyHeadroom`;
`apps/api/src/middleware/entitlements.middleware.ts:60-78` wraps it as
`requireConcurrencyHeadroom`. Neither is called anywhere outside its own definition. The real
`POST /scans` path (`create-scan.ts`) enforces target-uniqueness, input-type entitlement, control
gate, and quote match — but no `concurrentScanLimit` check.
*Why it matters:* a Starter-tier user (limit 1) can start unlimited simultaneous scans today — a
real entitlement bypass, not a cosmetic gap.
*Fix:* call `assertConcurrencyHeadroom` in `createScan` before the debit, alongside the existing
input-type check.
*Test to add:* two scans back-to-back on a plan with `concurrentScanLimit: 1`; assert the second is
refused `CONCURRENT_LIMIT_REACHED` before any debit.

**5. HIGH — `entitlements.middleware.ts` is never mounted; routes duplicate the policy ad hoc.**
`requireEntitlement`/`requireConcurrencyHeadroom` are unused outside their own file.
`create-scan.ts:156-169` and `readiness/create.ts:119-132` hand-roll their own
`plan.allowedInputTypes`/`plan.allowReadinessPass` checks and their own "cheapest permitting tier"
query, rather than calling `assertEntitled` from `entitlements.ts`. `LOAD_GENERATION`/
`CUSTOM_CAPABILITY` entitlements exist only in `entitlements.ts` and are exercised by no request
path today.
*Why it matters:* two independent implementations of the same policy will drift; this is the actual
HTTP-shell deliverable T185 built, and it isn't wired in.
*Fix:* route the two callers through `assertEntitled`, or delete the unused middleware/functions if
the ad hoc checks are the intended final design — and record that decision rather than leaving a
silent duplication.
**Resolved (2026-09-02 remediation, final whole-branch review):** the initial remediation pass (Task
4) deduped the "cheapest permitting tier" query but left `entitlements.middleware.ts` in place, unused
— and Task 3's own new FR-079 enforcement then added a *third*, inline copy of the same
`EntitlementError` → HTTP-envelope mapping directly in `scans.routes.ts`'s catch block, worsening
exactly the drift this finding named. Per this doc's own Assumptions note and Open Question #1: the
ad hoc, per-route typed-error → route-status mapping is confirmed as the intended final design — it
is the pattern `scans.routes.ts` already uses consistently for every other refusal in `POST /scans`
(`DuplicateScanError`, `PlanUpgradeRequiredError`, `ControlLevelRequiredError`, etc.), and
`entitlements.middleware.ts` was the road not taken, not a parallel supported path. Deleted the dead
middleware file rather than wiring it in; `services/billing/entitlements.ts`'s module docstring
updated to describe the actual, single pattern instead of pointing at removed code.

**6. HIGH — Webhook effect application isn't transactional with the idempotency claim.**
`apps/api/src/routes/webhooks.routes.ts:104-151`. The `BillingEvent` row is inserted first
(correct — race-safe idempotency, confirmed insert-first + P2002-catch, no TOCTOU), but the effect
(`subscribe`/`renewSubscription`/`purchaseCredits`) runs afterward as a separate step. A failure
there is caught and answered `200 { applied: false }`. Since the provider sees `200`, it will not
retry — and the event id is already claimed, so a second delivery is silently swallowed as a
duplicate with the effect never applied.
*Why it matters:* a transient DB blip during the effect step permanently loses a paid grant,
recoverable only by manual reconciliation from the raw `BillingEvent.payload`.
*Fix:* wrap insert+effect in one transaction and return `500` on failure (safe now, since the
insert rolls back too and the idempotency check no longer blocks a legitimate retry) — or add an
operator-facing "unapplied events" alert/replay job.
*Test to add:* force `subscribe` to throw after `BillingEvent.create` succeeds; assert the event is
retryable or flagged, not silently `applied:false` forever.

**11. MEDIUM — No test for the webhook's fail-closed 503.**
`billing-webhook.test.ts` covers bad-signature (401), success, idempotency, and unknown-type, but
not the `secret === ''` → 503 branch. Code is correct (no fallback constant — checked explicitly,
given this exact class of bug was a prior Critical finding in this repo), but unverified by CI.
*Test to add:* construct the app with no webhook secret configured (no `deps.secret`, no env var);
assert `503 WEBHOOK_NOT_CONFIGURED`.

**15. LOW — CSS module hardcodes spacing/font-size values alongside design tokens.**
`apps/web/app/(dashboard)/billing/page.module.css` mixes `var(--type-small)`/`var(--sev-critical)`
usage with raw values that have direct token equivalents (e.g. `320px`/`20px` where `--space-5:
20px` exists; several raw `font-size` values alongside `--type-*` tokens in the same file). The
adherence lint's `no-restricted-syntax` rule only matches JS/JSX AST literals, so it cannot see
`.module.css` files at all — a tooling gap, not just a one-file miss, and worth recording in
`research.md` per CLAUDE.md's "prefer amending a document over quietly diverging" rule. Same root
cause as Finding 15 in Phase 5.
*Fix:* replace matching raw values with their token equivalents; separately, note the CSS blind spot
as an open item.

**18. LOW — Retention boundary uses `<=`.**
`apps/api/src/services/storage/retention.ts:85`: `if (expiry <= now)` removes a report at the exact
expiry instant rather than strictly after it. Sub-second impact; worth aligning with the interval-safe
boundary pattern used elsewhere (e.g. `expiry.ts`'s clamp logic).

### What verified sound
- HMAC over the **raw** request body (`express.raw` mounted ahead of `express.json`), compared with
  `timingSafeEqual`, fail-closed on a missing secret (no fallback constant) — all correct, and
  directly addresses this repo's prior Critical "fallback signing secret" finding.
- Idempotency insert-first/catch-P2002 pattern is genuinely race-safe.
- `debit()` lot ordering correctly implements SC-022 (expiry ASC NULLS LAST → PLAN before
  PURCHASED → createdAt), with a `kind` tiebreak specifically avoiding a free-grant-vs-purchase tie
  failure mode.
- `refund.ts` returns credits to the originating lot's kind/lifetime, re-locks and re-reads the
  clock after acquiring locks (a documented prior race fix), and orphans expired-lot refunds into a
  fresh lot rather than resurrecting dead ones.
- `renewSubscription` expires the closing period's plan lots before/alongside granting the new
  period's, inside one transaction — confirmed replace-not-add by `renewal.test.ts`.
- `purchaseCredits` checks entitlement before creating any lot — FR-078 refusal-before-effect
  confirmed.
- `export.ts` HTML is fully self-contained; 404/410/409 refusals correctly differentiate
  missing/removed/not-ready.
- No floating-point money arithmetic found anywhere in the reviewed billing files.
- No N+1/batching concern beyond an inherent one-mailer-call-per-due-subscription loop in the
  renewal/retention sweeps, both capped at reasonable window sizes.

### Assumptions (no plan.md)
Findings 4 and 5 assume `entitlements.middleware.ts` was intended as the actual enforcement path —
inferred from its own docstring and T185's task description, both of which describe it that way. If
the ad hoc per-route checks are instead the deliberate final design, the correct remediation becomes
"delete the dead code and document why," not "wire it in" — this is a maintainer call either way,
not something resolvable from the code alone.

---

## Missing test coverage (cross-phase summary)

- Multi-cookie OWASP reverify aggregation (Finding 1)
- ~~Route-level readiness certificate/email guard~~ — closed by
  `readiness.certificate-email-guard.test.ts` in this cycle (Finding 2/8)
- Cross-origin credential-scoping on a `safeFetch` redirect hop (Finding 3)
- Concurrent-scan-limit enforcement (Finding 4)
- Webhook fail-closed 503 (Finding 11)
- Cancellation-triggered workspace teardown for source-bearing (ARCHIVE/REPOSITORY) scans (Finding 10)
- Webhook effect-application failure after a successful idempotency insert (Finding 6)

## Open questions for a maintainer

1. ~~Is `entitlements.middleware.ts` meant to be wired in, or is the ad hoc per-route enforcement in
   `create-scan.ts`/`readiness/create.ts` the intended final design? (Findings 4, 5)~~ **Answered
   (2026-09-02, final whole-branch review): ad hoc per-route enforcement is the intended design — it
   matches every other refusal in the same route's catch block. `entitlements.middleware.ts` deleted.**
2. Should the CSS-Modules adherence-lint blind spot (Findings 15/15) be closed by extending the
   oxlint rule to `.module.css` files, or is raw px acceptable there by a documented exception?
3. Is FR-072's "exactly once" guarantee meant to cover the certificate and email as one unit, or two
   independently-retryable halves? This review's fix (Finding 2) took the latter reading.

## Next recommended action

Finding 1 (Critical) is the highest-priority open item — it is a capability-layer bypass of SC-007,
the same class of guarantee Finding 2 protected in Phase 5. Recommend fixing it next, following the
same pattern used here: failing test first, then the minimal correctness fix, then a regression test
proving the specific multi-cookie bypass is closed.
