# Plan — Katteb Arabic landing page

## Current phase

Reference discovery and documentation are complete enough to hand off. Implementation has not started because the requested output for this run is Markdown documentation.

## Future framework and package manager

- Use the repository’s existing Next.js 15 / React 19 / TypeScript application and pnpm workspace if a later implementation is authorized.
- Keep the clone route and components isolated from existing WebAudit product screens.
- Do not import `design-system/` at runtime or change its tokens. Its rules govern WebAudit product surfaces; this spec records an external reference.

## Proposed file architecture

- Route: a dedicated public marketing route under `apps/web/app/(public)/`, after checking existing route conventions and ownership.
- Components: page header, hero, numbered section shell, goal-room tabs, channel tabs, goal-card grid, pricing cards, FAQ, final form, and footer in a page-local component directory.
- Styles: scoped CSS modules or the established frontend styling approach; clone-specific token values should be isolated and named for the reference.
- Assets: permitted images and fonts served locally from the app. Replace assets whose reuse terms cannot be established.

## Design tokens

Use the measured values in [design-tokens.md](design-tokens.md) as a starting map. CSS variables observed in the page are strong evidence; values sampled from computed styles are exact for the captured state. Background effects, radial blends, unlisted radii and intermediate colors require additional sampling from source screenshots/runtime before coding.

## Animation and interaction architecture

- Prefer CSS transitions and small React state for observed tabs, accordion, radios, menu, and progress presentation.
- Add an animation dependency only if runtime inspection proves that a specific effect materially depends on it. None is justified by the evidence gathered so far.
- Respect `prefers-reduced-motion`; keep progress/report content readable without motion.
- Do not fabricate a working video or backend action. Use a licensed equivalent poster and clearly modeled local behavior if the real media cannot be reused.

## Responsive strategy

- Preserve RTL reading order, and inspect logical CSS properties carefully.
- Match the existing desktop grid and stacked mobile sequence from the reference screenshots.
- Validate 1440, 1280, 1024, 768, and 390 widths; 1440 and 390 are the initial evidence baselines.
- At mobile size, the header condenses; hero headline and prompt scale down; large comparison/dashboard areas reflow vertically; interactive tab rows may horizontally scroll or wrap (exact implementation to be checked).

## Verification and review strategy

- Capture reference and implementation screenshots at each required viewport and section.
- Compare text wrapping, section heights, component bounds, colors, and images; iterate repairs up to five cycles.
- Record browser errors, failed requests, keyboard behavior, reduced-motion behavior, and interaction state changes.
- Run project-defined frontend gates only after code exists. No tests/builds were run in this documentation-only phase.
- Final approval requires locally served assets/fonts, no requests to Katteb or Google Fonts, and a completed visual/interaction audit.

## Review strategy

The skill defaults to independent review for a complex clone. During a later code phase, request independent visual and interaction review after the implementation is stable and file ownership is clear. No review agent was used in this docs-only phase.
