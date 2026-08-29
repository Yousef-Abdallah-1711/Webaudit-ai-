# Screen Map — design reference → route → tasks

**Source**: `design-system/` (vendored from the Claude Design export, 2026-08-23)
**Consumed by**: the frontend tasks in [specs/001-webaudit-mvp-baseline/tasks.md](../specs/001-webaudit-mvp-baseline/tasks.md)

This is the join table. A model implementing a frontend task looks up its task ID here to find the
authoritative reference. **A surface with no row here has no design — request one rather than
inventing it** (constitution v1.1.0, Design Adherence).

---

## Components — port these first

15 components, each with three files in `design-system/components/`: `.jsx` (reference
implementation), `.d.ts` (prop contract), `.prompt.md` (usage rules and the reasoning behind them).

**Read the `.prompt.md` before porting.** It carries constraints that are not visible in the code —
for example `SeverityBadge.prompt.md` explains why the badge may never be restyled toward the brand
accent.

| Component | Reference | Ports to | Task |
| --- | --- | --- | --- |
| Button | `components/core/Button.jsx` | `apps/web/components/ui/Button.tsx` | T237 |
| Input | `components/core/Input.jsx` | `apps/web/components/ui/Input.tsx` | T237 |
| Card | `components/core/Card.jsx` | `apps/web/components/ui/Card.tsx` | T237 |
| Badge | `components/core/Badge.jsx` | `apps/web/components/ui/Badge.tsx` | T237 |
| Eyebrow | `components/core/Eyebrow.jsx` | `apps/web/components/ui/Eyebrow.tsx` | T237 |
| StatRow | `components/core/StatRow.jsx` | `apps/web/components/ui/StatRow.tsx` | T237 |
| PromoBar | `components/core/PromoBar.jsx` | `apps/web/components/ui/PromoBar.tsx` | T237 |
| TwoToneHeading | `components/core/TwoToneHeading.jsx` | `apps/web/components/ui/TwoToneHeading.tsx` | T238 |
| SeverityBadge | `components/core/SeverityBadge.jsx` | `apps/web/components/report/SeverityBadge.tsx` | T239 |
| AttributionMark | `components/report/AttributionMark.jsx` | `apps/web/components/report/AttributionMark.tsx` | T239 |
| ScoreArc | `components/report/ScoreArc.jsx` | `apps/web/components/report/ScoreArc.tsx` | T131 |
| ModuleStatus | `components/report/ModuleStatus.jsx` | `apps/web/components/report/ModuleStatus.tsx` | T132 |
| IssueCard | `components/report/IssueCard.jsx` | `apps/web/components/report/IssueCard.tsx` | T133 |
| ProgressRow | `components/report/ProgressRow.jsx` | `apps/web/components/scan/ProgressRow.tsx` | T130 |
| VerdictPanel | `components/report/VerdictPanel.jsx` | `apps/web/components/report/VerdictPanel.tsx` | T168 |

## Public pages — 7 screens

Reference kit: `design-system/ui_kits/marketing/`. Runnable exports:
`design-system/reference-pages/public-pages/`.

| Screen | Reference | Route | Task |
| --- | --- | --- | --- |
| Landing | `ui_kits/marketing/Landing.jsx` + `reference-pages/public-pages/1 Home page.html` | `/` | T240 |
| Pricing | `ui_kits/marketing/Pricing.jsx` + `.../2 Pricing.html` | `/pricing` | T193 |
| Sign in | `ui_kits/marketing/AuthPages.jsx` + `.../3 Sign in.html` | `/login` | T128 |
| Create account | `ui_kits/marketing/AuthPages.jsx` + `.../4 Create account.html` | `/signup` | T128 |
| Verify email | `ui_kits/marketing/AuthPages.jsx` + `.../5 Verify email.html` | `/verify-email` | T128 |
| Forgot password | `ui_kits/marketing/AuthPages.jsx` + `.../6 Forgot password.html` | `/forgot-password` | T128 |
| Reset password | `ui_kits/marketing/AuthPages.jsx` + `.../7 Reset password.html` | `/reset-password` | T128 |

Shared chrome (`Public.jsx`) supplies the public header and footer. The landing page has **no
navigation bar** — one page, one action.

## Customer app — 9 screens

Reference kit: `design-system/ui_kits/app/`. Runnable export:
`design-system/reference-pages/WebAudit AI Dashboard.html`.

| Screen | Reference | Route | Task |
| --- | --- | --- | --- |
| App shell + sidebar | `ui_kits/app/Sidebar.jsx` | `(dashboard)/layout.tsx` | T241 |
| New scan | `ui_kits/app/Screens.jsx` | `/scan/new` | T129, T179 |
| Live progress | `ui_kits/app/Screens.jsx` | `/scan/[id]` | T130 |
| Report | `ui_kits/app/Screens.jsx` | `/reports/[id]` | T134 |
| Fixes board | `ui_kits/app/Screens.jsx` | `/fixes` | T155–T157 |
| Readiness | `ui_kits/app/Screens.jsx` | `/reports/[id]/readiness` | T168 |
| Usage | `ui_kits/app/Account.jsx` | `/usage` | T242 |
| Billing and plans | `ui_kits/app/Account.jsx` | `/billing` | T192 |
| Profile | `ui_kits/app/Account.jsx` | `/settings` | T242 |

The app kit's README states six behaviours it reproduces rather than decorates. Each traces to a
requirement, and the port must preserve all six:

| Behaviour | Requirement |
| --- | --- |
| The quote is not a charge | FR-011, FR-012 |
| Areas land independently | FR-033 |
| Degraded never reads as a pass | FR-053 |
| Green requires a passing check | FR-060, SC-007 |
| Every finding carries attribution, never hover-revealed | FR-032, SC-006 |
| Two credit lifetimes shown distinctly | FR-078, SC-022 |

## Operator console — 10 screens

Reference kit: `design-system/ui_kits/admin/`. Runnable export:
`design-system/reference-pages/WebAudit AI Admin Console.html`.

**Deliberately a separate application** from the customer app — shared chrome invites acting on the
wrong account. Dark `#1f2937` rail with an `operator` chip so context is never ambiguous.

| Screen | Route | Task |
| --- | --- | --- |
| Admin shell (dark rail) | `(admin)/layout.tsx` | T243 |
| Overview | `/admin` | T243 |
| Queue | `/admin/queue` | T214 |
| Scans | `/admin/scans` | T244 |
| Capabilities | `/admin/capabilities` | T213 |
| AI providers | `/admin/providers` | T244 |
| Users | `/admin/users` | T215 |
| Plans | `/admin/plans` | T215 |
| Margin | `/admin/billing` | T212 |
| Audit log | `/admin/audit-log` | T244 |
| Settings | `/admin/settings` | T244 |

## Coverage gaps — no design exists

Request a design before implementing. Do not invent these.

| Surface | Task | Note |
| --- | --- | --- |
| Design intent questionnaire | T201 | Referenced in the app kit but no dedicated screen. |
| Tablet range 768–1024px | all | Type scale never measured. Only 1440 and 390 exist. |

## Documented exceptions — invented under explicit authorization

The constitution's process for this ("deviating from a principle requires a documented exception...
and an issue to remove it") rather than a silent gap. Not a precedent for the row above — each future
gap still gets asked about, not guessed.

| Surface | Task | Note |
| --- | --- | --- |
| Annotated screenshot | T143 | No artboard existed anywhere in `design-system/` (confirmed by a full content search, including `_ds_manifest.json`). User authorized an original design on 2026-08-27, built from existing tokens and `IssueCard`'s severity/attribution visual language — see `research.md`'s decision record. Replace with a real artboard if one is ever produced. |

## Viewports

Designed and measured at **1440** and **390**. Visual-diff baselines exist for both. 768 is
interpolated and carries a looser threshold until a tablet scale is measured.

## Provenance

Vendored, not fetched — the same rule constitution Principle II applies to audit capabilities. The
export derives from `DESIGN.md`, `PRODUCT.md`, `CLAUDE.md`, and
`WebAuditAI_ARCHITECTURE.md`; its own `uploads/` folder contains the copies it read. Token values are
therefore already consistent with the DESIGN.md system rather than a reinterpretation of it.
