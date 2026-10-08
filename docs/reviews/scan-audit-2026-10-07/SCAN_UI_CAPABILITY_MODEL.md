# /scan UI Capability Model

Read-only audit, 2026-10-07.

## What `/scan` exposes today

`apps/web/app/(dashboard)/scan/page.tsx` renders `ScanForm` (`apps/web/components/scan/
ScanForm.tsx`), which composes `InputTabs` (`apps/web/components/scan/InputTabs.tsx`). The full
control surface:

| Control | Component | Data model | API field | Backend consumer |
|---|---|---|---|---|
| Input-mode tabs (URL / connected repo / ZIP upload) | `InputTabs` | `InputSelection` discriminated union (`{kind:'url',value}` \| `{kind:'repo',fullName}` \| `{kind:'archive',targetId,fileName}`) | `POST /targets` (url/repo) or `POST /scans/upload` (archive, staged immediately on file choice, before any area is picked or any credit charged) | `apps/api/src/routes/targets.routes.ts`, `apps/api/src/routes/intake.routes.ts` |
| Area checkboxes (one per `ModuleType`) | `ScanForm` | `selected: ModuleType[]`, defaults to `ALL_AREAS` (all 5 checked) | `POST /scans/quote` body, then `POST /scans` body | `apps/api/src/services/intake/quote.ts:quoteFor`, `create-scan.ts:createScan` |
| Live cost estimate | `ScanForm` | client-computed via the **same shared** `quoteAreas()` function the server uses | — (display only; never sent) | `packages/config/src/pricing.ts:quoteAreas` |
| "Accept and run" submit | `ScanForm` | — | `POST /scans/quote` then `POST /scans` with the quote's `credits` as `acceptedQuote` | `create-scan.ts:createScan` (re-validates the quote server-side — the client estimate is informational only) |

**No other controls exist.** No viewport/browser/locale/theme selector, no credential/test-account
field, no security-mode toggle (safe vs. active vs. destructive), no load-profile input, no
staging-vs-production target designation, no branch/commit selector (repo mode always resolves the
default branch today, per `CURRENT_SCAN_ARCHITECTURE.md` SS4).

## Is `/scan` a thin launcher or deeply coupled to the five domains?

**Structurally a thin launcher, in practice coupled only by absence of alternatives.** The area
checkbox list is driven by iterating `ALL_AREAS: ModuleType[]` (`packages/config/src/pricing.ts`),
so a sixth domain would render automatically without new markup — the component is not hardcoded to
five labels. But there is zero UI affordance today for anything beyond "which of these fixed
domains, against this one target" — no advanced-options section, no per-domain configuration, no
concept of a scan "profile" distinct from an area selection.

## Can `/scan` evolve into the richer model (scan source / scan profile / domains / advanced options)?

Additively, yes, at the UI layer — new form fields and new request-body fields are a bounded change
to `ScanForm`/`InputTabs` and the `createScan` request schema. The real blocker is not the UI: it is
that most of the *backend concepts* those future fields would bind to (security mode, test
credentials, load profile, staging/production classification) do not exist yet (see
`TARGET_CAPABILITY_GAP_MATRIX.md`). Building the UI control before the backend concept exists would
produce a control with nothing to configure.

## Current scan configuration schema (exhaustive, from source)

What a user can configure today, end to end: input mode + its one value (URL string / repo
full-name / staged-archive target), and which subset of the five fixed `ModuleType`s to run. That
is the complete configuration surface. No pages/depth, no routes, no credentials, no roles, no
browser/viewport/locale/theme, no network-condition simulation, no expected-user-count/duration/RPS,
no security-mode toggle, no test-account binding, no API-base-URL vs. staging-URL vs.
production-URL distinction, no environment-variable injection.
