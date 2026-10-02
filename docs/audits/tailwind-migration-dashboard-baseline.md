# Tailwind migration dashboard visual baseline

Captured on 2026-10-02 against Git SHA `34617c380eb3b0339c9a3ee1853f7a5be5f6d3ca` using the existing Playwright e2e stack and auth helpers. The browser registered and verified `wave4-dashboard-baseline@example.com`, then signed in through the `/login` UI. Its password follows the same throwaway-password pattern as the existing e2e auth specs; it is intentionally not recorded here.

The stack used `AI_MODE=fixtures` and a local static-site fixture for one real scan. No real external audit target, AI provider, or payment service was used. Screenshots are local, uncommitted artifacts.

## Routes captured

All routes have a full-page screenshot at desktop `1440×900` and mobile `390×844`, in light and dark themes. Theme was set through `document.documentElement.setAttribute('data-theme', theme)` and allowed to settle for 700 ms before each capture.

| Route | Notes |
| --- | --- |
| `/` | Public home route, opened while the browser remained signed in. |
| `/scan` | Actual post-login landing route, confirmed by `loginViaUi()`. |
| `/readiness` | Captured for the signed-in account after its fixture scan. |
| `/fixes` | Captured for the signed-in account after its fixture scan. |
| `/settings` | Captured for the signed-in account. |
| `/usage` | Captured for the signed-in account. |
| `/billing` | Captured for the signed-in account. |
| `/scan/cmurf0zju000evr4gp9qfihgi` | Real scan created against the local static-site fixture and completed in fixture AI mode. |

No routes were skipped. `/progress` was not captured because a real scan was available, so its actual scan-specific progress route was captured instead.

## Screenshot files

- `docs/audits/tailwind-migration-baseline/dashboard/home__desktop-1440__light.png`
- `docs/audits/tailwind-migration-baseline/dashboard/home__desktop-1440__dark.png`
- `docs/audits/tailwind-migration-baseline/dashboard/home__mobile-390__light.png`
- `docs/audits/tailwind-migration-baseline/dashboard/home__mobile-390__dark.png`
- `docs/audits/tailwind-migration-baseline/dashboard/scan__desktop-1440__light.png`
- `docs/audits/tailwind-migration-baseline/dashboard/scan__desktop-1440__dark.png`
- `docs/audits/tailwind-migration-baseline/dashboard/scan__mobile-390__light.png`
- `docs/audits/tailwind-migration-baseline/dashboard/scan__mobile-390__dark.png`
- `docs/audits/tailwind-migration-baseline/dashboard/readiness__desktop-1440__light.png`
- `docs/audits/tailwind-migration-baseline/dashboard/readiness__desktop-1440__dark.png`
- `docs/audits/tailwind-migration-baseline/dashboard/readiness__mobile-390__light.png`
- `docs/audits/tailwind-migration-baseline/dashboard/readiness__mobile-390__dark.png`
- `docs/audits/tailwind-migration-baseline/dashboard/fixes__desktop-1440__light.png`
- `docs/audits/tailwind-migration-baseline/dashboard/fixes__desktop-1440__dark.png`
- `docs/audits/tailwind-migration-baseline/dashboard/fixes__mobile-390__light.png`
- `docs/audits/tailwind-migration-baseline/dashboard/fixes__mobile-390__dark.png`
- `docs/audits/tailwind-migration-baseline/dashboard/settings__desktop-1440__light.png`
- `docs/audits/tailwind-migration-baseline/dashboard/settings__desktop-1440__dark.png`
- `docs/audits/tailwind-migration-baseline/dashboard/settings__mobile-390__light.png`
- `docs/audits/tailwind-migration-baseline/dashboard/settings__mobile-390__dark.png`
- `docs/audits/tailwind-migration-baseline/dashboard/usage__desktop-1440__light.png`
- `docs/audits/tailwind-migration-baseline/dashboard/usage__desktop-1440__dark.png`
- `docs/audits/tailwind-migration-baseline/dashboard/usage__mobile-390__light.png`
- `docs/audits/tailwind-migration-baseline/dashboard/usage__mobile-390__dark.png`
- `docs/audits/tailwind-migration-baseline/dashboard/billing__desktop-1440__light.png`
- `docs/audits/tailwind-migration-baseline/dashboard/billing__desktop-1440__dark.png`
- `docs/audits/tailwind-migration-baseline/dashboard/billing__mobile-390__light.png`
- `docs/audits/tailwind-migration-baseline/dashboard/billing__mobile-390__dark.png`
- `docs/audits/tailwind-migration-baseline/dashboard/scan-id__desktop-1440__light.png`
- `docs/audits/tailwind-migration-baseline/dashboard/scan-id__desktop-1440__dark.png`
- `docs/audits/tailwind-migration-baseline/dashboard/scan-id__mobile-390__light.png`
- `docs/audits/tailwind-migration-baseline/dashboard/scan-id__mobile-390__dark.png`
