# Tailwind migration visual baseline

Captured before Tailwind installation or styling changes using a production `next build` + `next start` Playwright harness.

- Git SHA: `de897ab22c6158827c5ae465dfcbfe5bdf310d3b`
- Routes: `/`, `/ar`, `/pricing`, `/login`, `/signup`, `/forgot-password`, `/reset-password`, `/verify-email`.
- Viewports: desktop `1440×900` and mobile `390×844`.
- Themes: light and dark (`document.documentElement.setAttribute('data-theme', 'dark')`).
- Authenticated dashboard, scan, report, and admin areas were skipped: the requested baseline-only capture did not warrant booting and seeding the real API/worker/database stack; fresh wave-specific baselines will be captured before Waves 4/5/6/7.
- Screenshots are local, uncommitted artifacts under `docs/audits/tailwind-migration-baseline/`.

## Screenshot files

- `docs/audits/tailwind-migration-baseline/forgot-password__desktop-1440__dark.png`
- `docs/audits/tailwind-migration-baseline/forgot-password__desktop-1440__light.png`
- `docs/audits/tailwind-migration-baseline/forgot-password__mobile-390__dark.png`
- `docs/audits/tailwind-migration-baseline/forgot-password__mobile-390__light.png`
- `docs/audits/tailwind-migration-baseline/home__desktop-1440__dark.png`
- `docs/audits/tailwind-migration-baseline/home__desktop-1440__light.png`
- `docs/audits/tailwind-migration-baseline/home__mobile-390__dark.png`
- `docs/audits/tailwind-migration-baseline/home__mobile-390__light.png`
- `docs/audits/tailwind-migration-baseline/home-ar__desktop-1440__dark.png`
- `docs/audits/tailwind-migration-baseline/home-ar__desktop-1440__light.png`
- `docs/audits/tailwind-migration-baseline/home-ar__mobile-390__dark.png`
- `docs/audits/tailwind-migration-baseline/home-ar__mobile-390__light.png`
- `docs/audits/tailwind-migration-baseline/login__desktop-1440__dark.png`
- `docs/audits/tailwind-migration-baseline/login__desktop-1440__light.png`
- `docs/audits/tailwind-migration-baseline/login__mobile-390__dark.png`
- `docs/audits/tailwind-migration-baseline/login__mobile-390__light.png`
- `docs/audits/tailwind-migration-baseline/pricing__desktop-1440__dark.png`
- `docs/audits/tailwind-migration-baseline/pricing__desktop-1440__light.png`
- `docs/audits/tailwind-migration-baseline/pricing__mobile-390__dark.png`
- `docs/audits/tailwind-migration-baseline/pricing__mobile-390__light.png`
- `docs/audits/tailwind-migration-baseline/reset-password__desktop-1440__dark.png`
- `docs/audits/tailwind-migration-baseline/reset-password__desktop-1440__light.png`
- `docs/audits/tailwind-migration-baseline/reset-password__mobile-390__dark.png`
- `docs/audits/tailwind-migration-baseline/reset-password__mobile-390__light.png`
- `docs/audits/tailwind-migration-baseline/signup__desktop-1440__dark.png`
- `docs/audits/tailwind-migration-baseline/signup__desktop-1440__light.png`
- `docs/audits/tailwind-migration-baseline/signup__mobile-390__dark.png`
- `docs/audits/tailwind-migration-baseline/signup__mobile-390__light.png`
- `docs/audits/tailwind-migration-baseline/verify-email__desktop-1440__dark.png`
- `docs/audits/tailwind-migration-baseline/verify-email__desktop-1440__light.png`
- `docs/audits/tailwind-migration-baseline/verify-email__mobile-390__dark.png`
- `docs/audits/tailwind-migration-baseline/verify-email__mobile-390__light.png`
