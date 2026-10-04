# Specification — Katteb Arabic landing page

## Goal

Produce a reference-grounded, responsive recreation specification for the public Arabic landing page at [katteb.com/ar](https://katteb.com/ar/). Preserve the observed section order, RTL composition, dark/light rhythm, typography, core colors, cards, interactive states, and responsive changes. All clone-specific written artifacts are Markdown.

## Pages and routes

- In scope: `/ar/` landing page, including header, hero, eleven content sections, final goal form, and footer.
- Out of scope: linked pricing, goal/task libraries, account creation, chat, app dashboards, checkout, enterprise contact, video hosting internals, CMS, and backend behavior. Their visible destination URLs are recorded only where useful.

## User-visible structure

1. Absolute header over the hero: logo, primary navigation, language control, sign-in, and free-start CTA. At mobile width, navigation collapses to a menu button, logo, and start CTA.
2. Night hero: two-line RTL headline, short supporting copy, goal prompt field with two actions, compact task-versus-goal distinction, decorative star field and purple/blue light rays fading to the page background.
3. Video introduction: centered “five minutes” heading and supporting copy; a wide video poster/player surface.
4. Task versus goal: numbered eyebrow, heading/copy, animated side-by-side examples and a comparison table.
5. How a goal works: five numbered steps; one outcome/range input, market research, a free plan, browser execution in connected tools, and daily measurement/reporting.
6. Goal room: interactive five-goal selector, progress and timing indicators, daily report, milestones, and recurring workflow.
7. Daily report: dark band with delivery-channel tabs and example report layouts.
8. User control and trust: six principles covering editing, observed metrics, duplicate-contact avoidance, pause/resume/end, real browser activity, and honest outcomes.
9. Goal library: category tabs, goal cards, task cross-promotion, and links to browse the full library.
10. Pricing: two plans (Lite and Goals), feature lists, CTAs, credit note, enterprise CTA, and fair-use link.
11. FAQ: contact prompt and seven accordion items.
12. Final goal form: goal text area, 14/30/60/90/180 day options, free-plan action, and free-chat link.
13. Footer: logo/summary, social links, product links, agent links, alternatives, comparisons, company links, and copyright.

## Fidelity and implementation evidence

- Future implementation target: strict visual fidelity at 1440×900, 1280×800, 1024×768, 768×1024, and 390×844.
- Reference screenshots presently exist at 1440×900 and 390×844 only. The other configured widths remain to be captured during implementation.
- The full-page page is approximately 15,318 CSS pixels tall at 1440 and 18,292 CSS pixels at a 390-wide browser viewport. Heights vary by viewport because content stacks and wraps.
- The hero `h1` measures 60.8px / 79.04px at 1440 and 23.424px / 33.96px at 390. Main `h2` measures 50.4px / 66.53px at 1440 and 29.6px / 39.07px at 390.
- Body uses Cairo, system-ui, sans-serif. The page is RTL. Primary visual palette and additional sampled values are in [design-tokens.md](design-tokens.md).
- The reference desktop content canvas is rendered 1425px wide in the inspected browser; mobile layout content is 375px wide while the viewport reports 390px. Record browser scrollbar effects when comparing screenshots.

## Interaction and motion scope

- Header links navigate to public pages/anchors; menu control is mobile-only in the captured state.
- Hero prompt is editable; “choose a goal” and “start a task” are separate actions.
- Goal room tabs swap the selected goal dataset; daily-report tabs swap delivery-channel mockups.
- Goal-library category tabs filter cards; goal-card CTA routes to a goal detail/start flow.
- FAQ uses an expandable/collapsible accordion with one item expanded initially.
- Final form has selectable deadline radios and a plan-writing CTA. Submission behavior behind the form must not be represented as successful without an actual backend.
- Scroll reveals, animated progress, hero background motion, video playback, hover/focus, and menu-open details need fresh runtime verification during implementation. Durations and easing are currently unmeasured.

## Assets and privacy

Publicly loaded fonts and Font Awesome are remote; the logo and goal/task thumbnails are hosted on Katteb domains. A future build must localize licensed assets and self-host permitted fonts/icons or make documented equivalents. No request to the original domain or remote Google Fonts may remain in the final implementation, per the skill’s asset-independence gate.

## Known blockers

- The observed page provides no source access or license grant for artwork, logo, video, or font files.
- Some imagery is lazy-loaded; the complete set of 100 goal examples was not individually validated for successful loading.
- The target’s paid/account routes and integrations cannot be represented as functioning backend services within a static marketing-page clone.
- No implementation screenshots, visual diffs, or final visual-fidelity pass exist yet.
