# Intake — Katteb Arabic landing page

| Field | Decision |
| --- | --- |
| Reference | [https://katteb.com/ar/](https://katteb.com/ar/) |
| Captured | 2026-10-04, public runtime in Edge / Playwright |
| Target | `specs/katteb-ar/` in WebAudit AI |
| Requested deliverable | Markdown documentation of the page structure, tokens, layout, typography, behavior, assets, and a later implementation plan |
| Work scope for this run | Reference discovery and clone documentation only; no application source, dependencies, or design-system files changed |
| Framework for a future implementation | Existing Next.js 15 + React 19 frontend, pending route and ownership approval |
| Route in scope | Arabic home page `/ar/` only |
| Reference viewports captured | 1440×900 and 390×844; full-page and viewport screenshots |
| Fidelity target | Strict visual target for a future implementation; no pass is claimed in this documentation-only phase |
| Asset policy | Record public asset URLs and local replacement requirements. Do not assume reuse rights for logos, illustrations, photographs, video, or fonts. |
| Backend/CMS | Out of scope. CTA destinations are mapped as links; no account, payment, or form submission is to be cloned as a working service here. |
| Blocked/private resources | No access to source repository, CMS, private APIs, analytics accounts, or original design files. Findings come from public browser output only. |

## Evidence

- Desktop viewport: [home-1440x900.png](screenshots/reference/home-1440x900.png)
- Mobile viewport: [home-390x844.png](screenshots/reference/home-390x844.png)
- Desktop full page: [home-full-1440.png](screenshots/reference/home-full-1440.png)
- Mobile full page: [home-full-390.png](screenshots/reference/home-full-390.png)
- The page declares Arabic (`lang="ar"`) and right-to-left direction (`dir="rtl"`).

## Scope boundary

“Everything” in this run means the complete single-page public landing-page surface and its visible states, documented in Markdown. It does not mean the private product application behind the sign-in and start links. An actual UI build is a separate implementation phase; the existing WebAudit AI design system remains authoritative for WebAudit product UI and is not modified by this competitor-reference exercise.
