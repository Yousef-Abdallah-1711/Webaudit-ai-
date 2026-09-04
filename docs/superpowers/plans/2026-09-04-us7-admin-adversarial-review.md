# US7 Admin Console Engineering Review — T202–T215

**Date:** 2026-09-04
**Scope:** Session 4 (spec-kit Phase 9a, US7 admin backend, T202–T211) and Session 5 (Phase 9b, US7
admin frontend, T212–T215) of [the full-project remediation
roadmap](2026-09-03-full-project-remediation-roadmap.md) — the first `requireOperator`-gated surface
in the entire codebase.
**Method:** Two independent review passes, run in parallel — one over every backend admin service,
route, and the auth boundary; one over every admin frontend page, the shared shell, and the typed API
client — each reading the actual shipped code and tests directly, not `tasks.md`'s description of it,
cross-checked against [CLAUDE.md](../../CLAUDE.md)'s seven non-negotiables and the constitution. Both
passes were explicitly instructed to hunt for the two defect shapes the prior
[Phases 4–7 engineering review](2026-09-02-phases-4-7-engineering-review.md) found and everything else
missed: a check that exists but is never wired into the real request path (that review's Finding 4),
and a guarantee a module comment or task description claims that the code doesn't quite keep under a
specific timing/failure case (that review's Finding 6). All verification commands below were actually
run, including an ad hoc, since-deleted repro script confirming Finding 1 empirically before it was
reported.
**Status column:** ✅ Fixed in this review cycle · 🔴 Open (recorded, not fixed — Minor/Informational,
per this session's own "Minor findings recorded, fixed only if cheap" rule) · — Not applicable
(informational only, or a pre-existing condition outside this review's scope).

---

## Consolidated findings, most severe first

| # | Sev | Area | Finding | Status |
|---|-----|------|---------|--------|
| 1 | **Important** | Backend — `capabilities.routes.ts` | A combined `PATCH` body (`isEnabled` + `planIds`) is not atomic: a bad `planIds` value can 400 the request *after* the `isEnabled` half has already committed and been audited | ✅ Fixed |
| 2 | **Important** | Frontend — `admin/users/page.tsx` | Header shows a fabricated-looking `"0 accounts"` during the loading window and on a 401/403 refusal, indistinguishable from a genuinely empty system — the one admin page that skipped the null-guard every sibling page already has | ✅ Fixed |
| 3 | Minor | Backend — `users.service.ts` | `listUsers` issues one `balanceOf` query per row (up to 50 concurrent per page) rather than one batched query | 🔴 Open (traced, not fixed — a `balanceOf` batching change is shared, broader-scoped work, not cheap) |
| 4 | Minor | Backend — `capabilities.service.ts` / `providers.service.ts` | Each mutation's audit-log `before` snapshot is read outside its replace transaction, leaving a narrow (unconfirmed, very-low-likelihood on an operator-only surface) window for a stale `before` under true concurrent admin writes | 🔴 Open (traced, unconfirmed — not reproduced) |
| 5 | Informational | Backend — `capabilities.routes.ts` | `listCapabilities` (a full table scan with joins) can run up to 3× inside one combined `PATCH` request | — (cosmetic/perf only) |
| 6 | Minor | Frontend — `AdminShell.tsx` | Top bar shows a permanently hardcoded `"operator · khalid@webaudit.ai"` / `"7 workers"` / `"3 queued"` on every admin page, including the four now backed by real data | — (pre-existing since T243, already deliberately tested; out of this review's scope to re-wire) |
| 7 | Minor | Frontend — test coverage | None of the 7 admin frontend unit tests exercised the error/401/403 rendering path before this review (only the pre-data static shell) | ✅ Partially addressed — a regression test for Finding 2 was added; a full error-path test per page remains open |
| 8 | Informational | Frontend / design system | Admin `.module.css` files mix raw `px` literals with token `var()` usage | — (pre-existing, already-documented gap: CLAUDE.md's "Known open items" #4 / PROGRESS.md's carried corrections; not new) |
| — | — | — | Every other item both reviews were instructed to check (audit-log completeness, the T202 authz sweep's exhaustiveness against every real mounted route, the full service→route→aggregator→app mount chain, the capability-delete/provider-chain/queue-cancel guarantees, client-side-authorization absence, backend/frontend shape parity, margin-percentage omission under every code path) | Checked, no defect found | — |

No Critical findings in either pass.

---

## Backend review — Session 4 (T202–T211)

**Claimed guarantees checked:** every operator mutation writes exactly one `AuditLogEntry` (FR-089);
every admin route refuses a non-operator "however constructed" (FR-008, T202); a capability with
recorded execution history can never be deleted; a rejected provider-chain replacement leaves the
previous chain completely untouched; the two system-internal maintenance-queue job kinds
(`workspace-teardown`, `questionnaire-deadline`) can never be cancelled by an operator.

### Files reviewed
- `apps/api/src/services/admin/{users,plans,margin,capabilities,providers,queue,audit-log}.service.ts`
- `apps/api/src/routes/admin/{users,plans,margin,capabilities,providers,queue,index}.routes.ts`
- `apps/api/src/middleware/auth.middleware.ts`
- `apps/api/src/app.ts` (the `/admin` mount point)
- `apps/api/tests/contract/admin.{users,plans,margin,capabilities,providers,queue}.test.ts`
- `apps/api/tests/integration/{margin-attribution,capability-enable}.test.ts`
- `apps/api/tests/adverse/admin-authz.test.ts`
- `apps/api/prisma/schema.prisma` and the migrations touching `AuditLogEntry`, `ProviderChainEntry`,
  `CapabilityPlan`

### Findings

**1. IMPORTANT — combined capability `PATCH` was not atomic.**
File: `apps/api/src/routes/admin/capabilities.routes.ts:86-96` (pre-fix).
`PATCH /admin/capabilities/:id` accepts `{isEnabled?, planIds?}` in one body — the route's own module
note frames this as one coherent operator intent ("turn this on, but only for pro and up"), the same
atomic ethos `providers.service.ts` documents elsewhere in this phase ("a rejected replacement leaves
the previously-configured chain completely untouched"). The two mutations ran as sequential,
independently-committing service calls with no enclosing transaction and no shared up-front
validation.

**Failure scenario, empirically confirmed** (via a temporary, since-deleted repro test): sending
`{isEnabled: false, planIds: ["does-not-exist"]}` against a capability seeded `isEnabled: true` ran
`setCapabilityEnabled` first (committing `isEnabled: false` and writing one `capability.update` audit
row), then `setCapabilityPlanRestrictions` threw `PlanNotFoundError` on the bad plan id, and the route
answered `400 INVALID_PLAN_ID` — a response telling the caller the request failed, sitting next to a
real, committed, audited mutation. The more dangerous direction is the mirror image,
`{isEnabled: true, planIds: ["does-not-exist"]}`: an operator meaning "enable this, but only for a real
tier" gets a 400 while the capability is now live and **unrestricted for every plan**, because the
enable half committed before the restriction half was even attempted.

**Fix applied:** extracted the plan-existence check already inside `setCapabilityPlanRestrictions` into
a new exported, side-effect-free `validatePlanIdsExist(db, planIds)` (`capabilities.service.ts`), and
the route now calls it — as a pure read, before either mutation — whenever `planIds` is present in the
body. `setCapabilityPlanRestrictions` itself still runs the same check internally (belt-and-braces for
any other caller), so its own behavior is unchanged. A new contract test
(`admin.capabilities.test.ts`: "a combined isEnabled + bad planIds body commits neither half
(atomicity)") sends both dangerous orderings against a capability seeded `isEnabled: true` and asserts
`isEnabled` stays `true`, no `CapabilityPlan` row exists, and — critically — **zero** audit-log entries
are written for that capability, proving neither half landed. All 14 tests in
`admin.capabilities.test.ts` plus `capability-enable.test.ts`'s SC-010 proof pass after the fix.

### The six specific checks this pass was asked to make

1. **Audit-log completeness (T210).** Enumerated every mutation across all five admin services. Every
   one is followed by exactly one `recordAuditLog` call, including the refused-delete path
   (`capability.delete_refused`). **No gap found** beyond Finding 1's atomicity issue, now fixed.
2. **Is `admin-authz.test.ts` exhaustive against the real mounted routes?** Counted every
   `router.get/post/patch/delete` across all six route files: 16 routes. `admin-authz.test.ts`'s
   `ROUTES` array has exactly 16 entries, one-for-one. **No gap found** — every route is covered three
   ways (no token / genuine non-operator / forged `isOperator: true` claim), plus a closing positive
   case per no-param GET route.
3. **Full mount chain, traced for every capability.** service → route → `router.use()` in
   `routes/admin/index.ts` → `app.use('/admin', ...)` in `app.ts:327`, with `requireAuth` then
   `requireOperator(db)` mounted first, reading `isOperator` from the database every request rather
   than the JWT claim. **Confirmed sound**, and no orphaned service export was found anywhere.
4. **Specific claimed guarantees, traced against real code and races:** capability-delete's
   check-then-delete has a structurally sound FK-violation (P2003) fallback that also audits the
   refusal — traced, no defect found, though a dedicated concurrent-execution race test is absent.
   Provider-chain replacement is genuinely transactional (`db.$transaction([deleteMany, createMany])`,
   only after `buildChain` validates) — confirmed sound by the existing "leaves a pre-existing valid
   chain completely untouched" test. Queue cancellation of the two protected job names is confirmed the
   *only* mechanism preventing a silent workspace/deadline leak — `sweepOrphanedWorkspaces` is
   confirmed still called only from test files, and the scan-cancel route never calls `job.remove()`
   directly, so there is no alternate path to the same effect.
5. **Dead code presented as a guarantee.** Checked every exported service function for a live route
   call site. **None found** unmounted.
6. **Module-note claims vs. literal code.** Every strong claim ("always", "never", "guaranteed") checked
   against the literal code held up, except the one in Finding 1 (now fixed).

---

## Frontend review — Session 5 (T212–T215, plus the earlier-shipped T243/T244 shell/pages)

**Claimed guarantees checked:** the frontend performs no authorization of its own (server-side
`requireOperator` is the only real gate); every real page's typed API-client interfaces genuinely match
the backend's actual response shapes; the margin page never computes or displays a fabricated
percentage under any code path; the queue page's Cancel button never special-cases the two
system-protected job names; design-system token discipline holds in every `.tsx` file.

### Files reviewed
- `apps/web/app/(admin)/admin/{billing,capabilities,queue,users,plans}/page.tsx` + `.module.css`
- `apps/web/app/(admin)/admin/{scans,providers,log,settings}/page.tsx` (the two earlier, still-static
  T244 pages, confirmed not accidentally half-wired)
- `apps/web/components/admin/{AdminShell,format,index}.tsx`
- `apps/web/lib/api.ts` (full file, including `request<T>()` and `ApiError`)
- `apps/api/src/services/admin/{users,plans,margin,capabilities,queue}.service.ts` and their routes
  (read directly to verify the frontend's assumed shapes, not trusted from `lib/api.ts`'s own
  declarations)
- All 7 `apps/web/tests/unit/admin-*.test.ts` files

### Findings

**2. IMPORTANT — fabricated `"0 accounts"` on the Users page.**
File: `apps/web/app/(admin)/admin/users/page.tsx` (pre-fix: `const [total, setTotal] = useState(0)`,
header `meta={\`${String(total)} accounts\`}`).
On a 401/403 refusal or during the loading window before the first fetch resolves, `total` stayed at
its initial `0` — the header read **"Users — 0 accounts"** in the same render as, and visually above,
the error banner. This is inconsistent with every sibling page built in the same session:
`AdminCapabilitiesPage` explicitly guards its meta text against exactly this
(`capabilities === null ? 'trust derives from discovery root' : ...`); `AdminQueuePage`/`AdminPlansPage`
use static meta text with no count at all; `AdminBillingPage` shows `'—'` for every Stat while
`report === null`. The Users page was the one screen that skipped that guard.

**Fix applied:** `total` is now `number | null`, defaulting to `null` and set only on a successful
fetch. The header's `meta` prop is now conditionally omitted entirely (via a spread, since
`AHeadProps.meta` is a plain optional `string` under this repo's `exactOptionalPropertyTypes`) while
`total === null` — so neither the loading window nor an auth refusal ever renders a count-bearing meta
line. The "Load more" visibility check was updated to short-circuit on `total !== null` first. A new
test (`admin-users.test.ts`: "never shows a fabricated '0 accounts'...") asserts the string `"accounts"`
never appears anywhere in the pre-data shell. All 7 admin frontend test files (27 tests, up from 26)
pass after the fix; `pnpm run lint:adherence` stays clean (0/0, 97 files).

### The eight specific checks this pass was asked to make

1. **No client-side authorization anywhere.** Grepped every admin page and shared component for
   `isOperator`/`decodeJwt`/route-guard patterns — the only `isOperator` reference is the Users page
   displaying a server-returned boolean as button label text, not gating anything. **Confirmed absent**,
   matching `auth.middleware.ts`'s own documented design ("Frontend route guards are usability, never
   security").
2. **What actually happens on a 401/403, per page?** Traced for all five real pages: `ApiError`'s real
   server message surfaces in a visible `--sev-critical` banner on every page; no page crashes or shows
   a blank screen. **Finding 2 above was the one exception**, now fixed.
3. **Frontend/backend shape parity**, verified field-by-field against the real service files (not
   `lib/api.ts`'s own declarations): `AdminUserSummary` matches the list endpoint exactly, with no
   detail-only field leaking in; `MarginCapabilityRow` correctly carries no revenue field, matching
   `CapabilityMarginRow`'s deliberate design; `AdminJobSummary.timestamp` is `number` (epoch ms) on both
   sides. **No mismatch found.**
4. **Margin page — no fabricated percentage under every path**, including the loading state and an
   empty `perScan` array. **Confirmed sound** — every Stat renders `'—'` while `report === null`; both
   `reduce` calls have an explicit `0` initial accumulator; no `%` sign anywhere in the file.
5. **Queue page Cancel + the two protected job names.** Re-read the current committed code directly:
   **confirmed** no client-side name-check exists — the real 409 refusal surfaces through the same
   error banner as any other refusal.
6. **Users pagination / Plans `includeInactive=true`.** Re-verified against the current code (not
   re-citing a prior review): `onLoadMore` reads `users.length` fresh from the render closure, a single
   shared `busy` flag prevents a double-click race, `getAdminPlans(true)` is passed explicitly, and the
   `isActive` toggle reads fresh per-row state. **Confirmed sound.**
7. **Module-note comments vs. literal rendered JSX**, re-checked against current file content, not
   assumed accurate because a comment says so. **All held up.**
8. **Design-system token discipline** — direct grep (not just trusting a prior `lint:adherence` run) for
   raw hex/px literals in every admin `.tsx` file. **Zero found** in live code (one comment merely
   *mentions* a rejected pattern as prose). The one place raw values do leak through is `.module.css`
   files (Finding 8 in the table above) — an already-documented, pre-existing gap (CLAUDE.md's Known
   open items #4), not newly discovered here.

---

## Verification gate — run after both fixes

```
pnpm --filter @webaudit/api exec tsc --noEmit -p .                          → clean
pnpm --filter @webaudit/api exec eslint src/routes/admin src/services/admin → clean
pnpm test apps/api/tests/contract/admin.capabilities.test.ts \
          apps/api/tests/integration/capability-enable.test.ts              → 2 files / 14 tests passed

pnpm --filter @webaudit/web exec tsc --noEmit -p .                          → clean
pnpm --filter @webaudit/web exec eslint "app/(admin)/admin/users/page.tsx" tests/unit/admin-users.test.ts → clean
pnpm run lint:adherence                                                     → 0 warnings/errors, 97 files
pnpm test apps/web/tests/unit/admin-{users,billing,capabilities,queue,plans,shell,screens}.test.ts
                                                                              → 7 files / 27 tests passed
```

Full whole-branch gate (`pnpm run lint && pnpm run lint:adherence`, `pnpm -r typecheck`,
`pnpm run test`, `pnpm run test:adverse`, `pnpm run test:visual`, production build) run separately —
see PROGRESS.md's dated review section for the exact counts, including the one pre-existing,
already-disclosed gap (`pnpm run typecheck`'s root script failing on an unrelated turbo
cyclic-dependency warning, PROGRESS.md's Open Decision #16) that this review did not introduce and is
out of scope to fix here.

## Not fixed in this review (recorded per the roadmap's own "Minor findings recorded, fixed only if
cheap" rule)

- Finding 3 (`listUsers`'s per-row `balanceOf` calls) — batching this correctly is shared code used
  elsewhere; a proportionate fix is broader-scoped than this review.
- Finding 4 (audit-log `before` snapshot read outside its transaction) — traced, not reproduced; very
  low likelihood on an operator-only, low-concurrency surface.
- Finding 6 (`AdminShell`'s hardcoded operator identity/queue-depth stats) — pre-existing since T243,
  already deliberately tested as correct; wiring real values is a separate, larger task (a real "who am
  I" endpoint, a real live queue-depth figure) outside this review's admin-surface-correctness mandate.
- Finding 7 (no admin page has a full error-path test beyond the one new regression test for Finding 2)
  — retrofitting all five pages is a larger testing-infrastructure task, not a "cheap" fix.
- Finding 8 (CSS Modules raw px/hex) — an already-documented, cross-cutting gap in the adherence lint's
  own coverage (CLAUDE.md's Known open items #4), not specific to this surface.
- PROGRESS.md's Open Decision #17 (no per-screen visual-regression baseline for the admin console) —
  named again here since this review is the natural place to weigh in: this pass did **not** attempt to
  resolve it, since building reference images is design/tooling work outside an engineering review's
  scope, but confirms the decision is still open and still accurately described.
