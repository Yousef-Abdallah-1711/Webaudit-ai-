# Clone tasks — Katteb Arabic landing page

These are future implementation tasks generated from the observed page. The current user request is limited to Markdown documentation, so every code task remains pending; no implementation files are claimed or assigned.

## State model

Implementation states: `pending → implementing → testing → comparison → repair → independent-review → approved`. A task can be approved only with evidence. This documentation phase has discovery marked complete, but the clone itself is not approved.

| ID | Section / task group | Status | Dependencies | Required evidence and acceptance |
| --- | --- | --- | --- | --- |
| INTAKE-001 | Intake and scope | complete | — | Intake records route, viewports, asset/legal policy, and docs-only scope |
| DISCOVERY-001 | Page structure and runtime styles | complete | INTAKE-001 | Page map, token map, responsive notes, screenshots |
| DISCOVERY-002 | Interactive states and assets | partial | DISCOVERY-001 | Interaction and asset manifests; tabs/accordion and full asset list still need deeper validation |
| DEPENDENCIES-001 | Local framework/dependency plan | pending | DISCOVERY-002 | Verify project route ownership and package state before any install |
| FOUNDATION-001 | Base RTL layout, font, tokens, header/footer | pending | DEPENDENCIES-001 | Match local asset/font rules and 1440/390 foundations |
| HERO-001 | Header and hero | pending | FOUNDATION-001 | Recreate nav, atmosphere, headline wrap, goal textarea, action states at all viewports |
| WATCH-001 | Video introduction | pending | FOUNDATION-001 | Match player frame and state; use a licensed replacement if video rights/source are unclear |
| COMPARE-001 | Task-versus-goal section | pending | FOUNDATION-001 | Recreate side-by-side example, replay state, timeline/table and responsive collapse |
| HOW-001 | Five-step “inside a goal” section | pending | FOUNDATION-001 | Match five step modules, product mockups, order and mobile stack |
| ROOM-001 | Interactive goal dashboard | pending | FOUNDATION-001 | Verify and recreate five tabs and each goal’s distinct sample report/plan data |
| REPORT-001 | Daily report channels | pending | FOUNDATION-001 | Match dark section, three channel tabs and selected sample layouts |
| CONTROL-001 | Trust/control principles | pending | FOUNDATION-001 | Recreate six principles and associated examples |
| LIBRARY-001 | Goal and task library teasers | pending | FOUNDATION-001 | Category filtering, representative cards, details and browse links; record full 100-goal dataset scope |
| PRICING-001 | Lite/Goals pricing cards | pending | FOUNDATION-001 | Match prices, feature lists, card emphasis, CTA and mobile stack |
| FAQ-001 | Seven-item accordion | pending | FOUNDATION-001 | Match open/closed states and keyboard behavior |
| FORM-001 | Final goal entry | pending | FOUNDATION-001 | Match field, five radios, CTA and alternative chat action; no fake success state |
| FOOTER-001 | Footer | pending | FOUNDATION-001 | Match brand block, columns, links and responsive order |
| RESPONSIVE-001 | Cross-page layout | pending | All sections | Capture 1440, 1280, 1024, 768, and 390; no overflow or broken RTL states |
| MOTION-001 | Motion and reduced motion | pending | All sections | Measure replay, reveals, background motion and reduced-motion behavior before implementing |
| VISUAL-001 | Screenshot comparisons | pending | All sections | Section/page comparisons at required viewports; document measured diffs |
| REPAIR-001 | Visual and behavior repairs | pending | VISUAL-001 | Iterate up to five cycles; resolve or document each mismatch |
| REVIEW-001 | Independent review | pending | REPAIR-001 | Visual and interaction review with evidence |
| FINAL-001 | Final audit | pending | REVIEW-001 | Local assets/fonts, no reference-domain requests, no console errors, final reports |

## Per-section task contract

Each code task must record: reference screenshot/state; source measurements; implementation files; desktop and responsive layout; motion/interaction requirements; keyboard and reduced-motion acceptance; screenshot comparison result; unresolved licensed assets; independent review result.

Reference screenshots for current desktop/mobile baselines are under `screenshots/reference/`. Implementation screenshots and diff images must be added only once code exists.
