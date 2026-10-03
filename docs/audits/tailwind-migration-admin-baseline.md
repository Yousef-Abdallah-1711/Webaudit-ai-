# Wave 7 admin visual baseline

Captured against Git SHA `4043356809f3b819bd8c0a34ade53835984689cc` on 2026-10-03. The operator account was `operator.wave7.baseline@example.com` (no password recorded). Screenshots are English, full-page captures using 1440×900 and 390×844 browser viewports, in light and dark themes. Theme changes were applied through `data-theme` and `wa-theme`, followed by a 700 ms settle delay.

All 40 PNGs are under `docs/audits/tailwind-migration-baseline/admin/`. Each listed route has four files: `__desktop-1440__light.png`, `__desktop-1440__dark.png`, `__mobile-390__light.png`, and `__mobile-390__dark.png`.

| Route | Exact filename prefix | Observed state |
| --- | --- | --- |
| `/admin` | `admin-overview` | Empty live overview: metrics unavailable and no attention items. |
| `/admin/users` | `admin-users` | Populated with the single test operator account. |
| `/admin/scans` | `admin-scans` | Empty: 0 scans. |
| `/admin/queue` | `admin-queue` | Populated: a failed phase job and recurring maintenance jobs were displayed. |
| `/admin/log` | `admin-log` | Empty: 0 audit-log entries. |
| `/admin/providers` | `admin-providers` | Near-empty: 0 vendors in the provider chain. |
| `/admin/plans` | `admin-plans` | Populated with the four seeded plans: Free, Starter, Pro, and Business. |
| `/admin/capabilities` | `admin-capabilities` | Populated with 21 discovered and enabled capabilities. |
| `/admin/billing` | `admin-billing` | Empty activity: 0 credits, scans, or measured capabilities in the window. |
| `/admin/settings` | `admin-settings` | Defaults and read-only platform switches displayed. |

Exact screenshot paths:

```text
docs/audits/tailwind-migration-baseline/admin/admin-overview__desktop-1440__light.png
docs/audits/tailwind-migration-baseline/admin/admin-overview__desktop-1440__dark.png
docs/audits/tailwind-migration-baseline/admin/admin-overview__mobile-390__light.png
docs/audits/tailwind-migration-baseline/admin/admin-overview__mobile-390__dark.png
docs/audits/tailwind-migration-baseline/admin/admin-users__desktop-1440__light.png
docs/audits/tailwind-migration-baseline/admin/admin-users__desktop-1440__dark.png
docs/audits/tailwind-migration-baseline/admin/admin-users__mobile-390__light.png
docs/audits/tailwind-migration-baseline/admin/admin-users__mobile-390__dark.png
docs/audits/tailwind-migration-baseline/admin/admin-scans__desktop-1440__light.png
docs/audits/tailwind-migration-baseline/admin/admin-scans__desktop-1440__dark.png
docs/audits/tailwind-migration-baseline/admin/admin-scans__mobile-390__light.png
docs/audits/tailwind-migration-baseline/admin/admin-scans__mobile-390__dark.png
docs/audits/tailwind-migration-baseline/admin/admin-queue__desktop-1440__light.png
docs/audits/tailwind-migration-baseline/admin/admin-queue__desktop-1440__dark.png
docs/audits/tailwind-migration-baseline/admin/admin-queue__mobile-390__light.png
docs/audits/tailwind-migration-baseline/admin/admin-queue__mobile-390__dark.png
docs/audits/tailwind-migration-baseline/admin/admin-log__desktop-1440__light.png
docs/audits/tailwind-migration-baseline/admin/admin-log__desktop-1440__dark.png
docs/audits/tailwind-migration-baseline/admin/admin-log__mobile-390__light.png
docs/audits/tailwind-migration-baseline/admin/admin-log__mobile-390__dark.png
docs/audits/tailwind-migration-baseline/admin/admin-providers__desktop-1440__light.png
docs/audits/tailwind-migration-baseline/admin/admin-providers__desktop-1440__dark.png
docs/audits/tailwind-migration-baseline/admin/admin-providers__mobile-390__light.png
docs/audits/tailwind-migration-baseline/admin/admin-providers__mobile-390__dark.png
docs/audits/tailwind-migration-baseline/admin/admin-plans__desktop-1440__light.png
docs/audits/tailwind-migration-baseline/admin/admin-plans__desktop-1440__dark.png
docs/audits/tailwind-migration-baseline/admin/admin-plans__mobile-390__light.png
docs/audits/tailwind-migration-baseline/admin/admin-plans__mobile-390__dark.png
docs/audits/tailwind-migration-baseline/admin/admin-capabilities__desktop-1440__light.png
docs/audits/tailwind-migration-baseline/admin/admin-capabilities__desktop-1440__dark.png
docs/audits/tailwind-migration-baseline/admin/admin-capabilities__mobile-390__light.png
docs/audits/tailwind-migration-baseline/admin/admin-capabilities__mobile-390__dark.png
docs/audits/tailwind-migration-baseline/admin/admin-billing__desktop-1440__light.png
docs/audits/tailwind-migration-baseline/admin/admin-billing__desktop-1440__dark.png
docs/audits/tailwind-migration-baseline/admin/admin-billing__mobile-390__light.png
docs/audits/tailwind-migration-baseline/admin/admin-billing__mobile-390__dark.png
docs/audits/tailwind-migration-baseline/admin/admin-settings__desktop-1440__light.png
docs/audits/tailwind-migration-baseline/admin/admin-settings__desktop-1440__dark.png
docs/audits/tailwind-migration-baseline/admin/admin-settings__mobile-390__light.png
docs/audits/tailwind-migration-baseline/admin/admin-settings__mobile-390__dark.png
```

No routes were skipped. During capture, Redis connections timed out even though the configured local service port was listening; the admin shell displayed “Workers unavailable” and “Queue unavailable,” and the overview's live metrics were unavailable. The queue page still displayed the entries noted above. The e2e stack teardown stopped the API and worker; ports 4400 and 4401 had no remaining listeners afterward. The temporary capture spec was deleted. No application source or existing test files were changed. PNGs remain local and uncommitted.
