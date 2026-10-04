# Fahes Full-Page Independent UI/UX Audit

**Scope:** the public marketing landing page only (`apps/web/app/[locale]/(public)/`), English + Arabic,
light + dark theme, desktop through mobile. **Review only — nothing in the repository was edited.**

**Method.** This audit was produced by dispatching six independent, parallel reviewers that could not see
each other's output, per the user's explicit instruction to delegate rather than review inline:

| Reviewer | Tool | Scope |
|---|---|---|
| A | Codex (`gpt-6-luna`, effort `high`, `--read-only` sandbox) | Typography tokens, i18n raw-key check, RTL code-correctness, Tailwind/design-system duplication |
| B | Codex (`gpt-6-luna`, effort `high`, `--read-only` sandbox) | Reference-fidelity diff vs. `specs/fahes-design-refresh/index.html`, cards/borders/radii/shadows/icons |
| C | Kimi (`kimi-2.1.1`) | Visual hierarchy, spacing & rhythm, containers/scale, section composition, background rhythm |
| D | Kimi (`kimi-2.1.1`) | Header, hero composition, CTA inventory, accessibility (code), interaction states (code), visual consistency |
| E | Claude subagent (live browser, Playwright) | Responsive matrix (6 widths × 2 locales), RTL/LTR visual check, theme toggle, i18n leak scan, console/network/broken-image/layout-shift, rendered colors |
| F | Claude subagent (live browser, Playwright + axe-core) | Automated + manual accessibility, keyboard/focus, product-mockup legibility scoring, live interaction testing |

All six were given the same read-only mandate and the same severity/category/evidence rules. Both Codex
runs and both Kimi runs were verified afterward to have touched **zero files** (`git status --porcelain`
unchanged at 53 pending lines, identical to the pre-existing dirty tree, before and after every run).
Codex's model/effort was independently confirmed from its own session log: `model: gpt-6-luna`,
`effort: high`.

## Which `impeccable` skill guidance applied

- **Absolute bans** — directly triggered: gradient text on the H1 (banned explicitly), the repeated
  tiny-tracked-eyebrow pattern (banned explicitly, found on both the reference artifact and production),
  nested cards (banned explicitly — found in report frame→finding, readiness board→blocker note,
  remediation card→measurement/prompt panels, pricing shell→highlight cards/table), and the
  border-plus-large-shadow "ghost card" pattern flagged repeatedly below.
- **Brand register (`reference/brand.md`)** — the marketing page is a brand surface, not product UI, so
  this register governed the color/typography/imagery judgment calls below (Committed color strategy is
  expected and fine here; the issue is execution bugs, not the strategy).
- **AI slop test** — the page does **not** read as generic AI output: it has a named palette strategy,
  real product-shaped mockups, and a committed aesthetic. The slop-adjacent patterns present (gradient
  text, repeated eyebrows, nested/ghost cards) are narrow, fixable instances, not a systemic "this looks
  AI-made" failure.
- **Critique.md heuristics** (Nielsen-style) informed the CTA/consistency/accessibility findings (Audits
  10–12, 19, 22, 23) even though this ran as a code+browser diagnostic rather than the full dual-agent
  `critique` flow, since the user's own 25-part audit spec superseded `critique.md`'s output format.

---

## 1. Executive Verdict

| Dimension | Score |
|---|---|
| Overall quality | **6/10** |
| Desktop | 6/10 |
| Mobile | 4/10 |
| Arabic typography | 6/10 |
| Visual hierarchy | 5/10 |
| Product presentation | 8/10 |
| Consistency | 5/10 |
| Accessibility | 6/10 |
| Responsive quality | 6/10 |

**Verdict: BLOCKED BY IMPLEMENTATION BUGS.**

Not a design problem. Three independent reviewers confirmed the design-token layer (colors, container
widths, section padding, radii, background rhythm, type-scale *definitions*) is an unusually faithful,
pixel-close port of the approved `specs/fahes-design-refresh/index.html` artifact. But a small number of
concrete, mechanical implementation bugs — one dead Tailwind config key, one over-broad CSS selector, one
missing size token — are currently breaking the primary mobile navigation, muting the primary CTA's text
color, and silently collapsing the type scale on several headings/labels. Fix those (and the handful of
P1s below), and this moves to a polish pass, not a redesign.

---

## 2. Top 10 Problems

**1. [P0 · DESIGN SYSTEM · IMPLEMENTATION BUG] `tailwind.config.ts:26` sets `theme.fontSize: {}` at the top level (not inside `extend`), wiping Tailwind's entire default font-size scale.**
Independently found by reviewer C, independently confirmed by direct grep of the compiled CSS
(`.text-xs/.text-sm/.text-base/.text-lg/.text-2xl/.text-xl` all have **zero rules**). Every bare
`text-xs`/`text-sm`/`text-lg`/`text-2xl` class across ~14+ call sites — the readiness heading, the
pricing highlight numbers, the hero eyebrow/kicker, the scanner header, audit-area tab labels, header nav
links — silently renders at the inherited body size (16px, or 14px ≤640px) instead of its intended
11–24px. This is the single highest-ROI fix on the page: one config change resolves roughly six separate
"this heading doesn't look important enough" symptoms at once (Readiness's left column, in particular,
loses almost all its visual weight because of this). *Fix:* either restore the default Tailwind scale or
sweep every bare `text-*` call site onto a named marketing token.

**2. [P0 · BUG/RESPONSIVE · IMPLEMENTATION BUG] Mobile menu trigger and drawer-close button collapse to a near-zero hit target.**
Independently found by **both** live-browser reviewers (E and F) using different methods. Root cause
(F): `theme.extend.size` in `tailwind.config.ts` registers `'marketing-faq-icon'` but never
`'landing-header-control'`/`'landing-core'` — only separate `width`/`height` extensions got those keys.
Tailwind 3.4+'s `size-*` utility reads exclusively from `theme.size`, so `size-landing-header-control`
(used on both the hamburger trigger and the drawer-close button in `Public.tsx:45-46`) silently compiles
to no CSS. Measured: hamburger `34×4.66px`, close button `21.8×19px`. The hamburger's three bars render
as disconnected floating dashes, not an icon (`bugs/en-390-header-zoom.png`,
`mobile-menu-trigger-zoom.png`). This is the **only** way to open navigation at ≤640px, on every page,
both locales.

**3. [P0 · COLOR/ACCESSIBILITY · IMPLEMENTATION BUG] Mobile drawer nav text is white-on-white (literally invisible) on the homepage.**
Found by reviewer F. `Public.special.module.css`'s `.heroChrome a:not([aria-current='page']) /
.heroChrome button { color: var(--text-marketing-inverse-muted) }` and the `aria-current` sibling rule
were written for the transparent desktop header floating over the dark hero image — but the mobile
drawer `<section>` is a DOM descendant of that same `<header class="heroChrome">`, so the "inverse" (light
text for a dark background) rule leaks into the drawer's own opaque white panel. Computed: "Product" nav
link = `rgb(255,255,255)` on a white drawer background; "How it works"/"Pricing" = pale lavender
`rgb(196,203,224)`, also near-invisible. Confirmed settled (not a transition artifact) and homepage-only.

**4. [P1 · COLOR · IMPLEMENTATION BUG] The primary CTA's own text renders muted gray-lavender instead of white, on the hero itself, both themes, both locales.**
Found and root-caused by reviewer E. Same `.heroChrome a:not([aria-current='page'])` selector from #3
(specificity `0,2,1`) beats the `Button` component's `text-white` utility (`0,1,0`) and overrides the
gradient CTA's intended bright-white label with the muted token meant only for plain nav links. Computed:
`rgb(196,203,224)` where `#FFFFFF` is expected, on the `"Start free"` / `"ابدأ مجاناً"` header button —
roughly 3.9:1 contrast on the gradient, likely failing WCAG AA for 14px bold text. This also masks a
second, currently-invisible bug (F): the shared `Button.tsx` primary variant still hardcodes
`hover:bg-accent-hover` (the dashboard's orange token) — hidden today only because the always-on gradient
`background-image` paints over the `background-color` layer underneath.

**5. [P1 · INTERACTION · IMPLEMENTATION BUG] AR→EN language toggle does not reliably navigate back to English.**
Found by reviewer F (live-clicked, instrumented with `waitForURL`). EN→AR works and is fast (293ms).
AR→EN re-navigates to `/ar` instead of `/` under a 20s `waitForURL` timeout; a separate looser-timing run
eventually landed on English after several seconds. Single-sourced (not cross-confirmed by reviewer E,
who checked RTL mirroring but not the toggle's round-trip), concretely instrumented — **recommend a
focused manual re-check before scheduling a fix**, but treat as real pending that check.

**6. [P1 · COLOR/CONSISTENCY · IMPLEMENTATION BUG] On non-landing public pages (pricing, login, signup), the header's "Sign in" link and the active nav link both render near-invisible.**
Found by reviewer D. `LangToggle`/`ThemeToggle` receive a `active === 'nav_product'` conditional class
(`Public.tsx:227-228`) for correct contrast on the light (non-hero) header, but the ghost "Sign in"
button (`Public.tsx:207,217`) and `navLinkActive` (`Public.tsx:49`, hard-coded white) do not — so on
`/pricing` the active nav link and "Sign in" both render white/pale-lavender on a near-white header
background (confirmed: `pricing/PricingPage.tsx:227` passes `active="nav_pricing"`). The conditional fix
that protected the toggles was never applied to these two elements.

**7. [P1 · CONSISTENCY · DESIGN SYSTEM] The "primary CTA" is implemented at three different heights and corner radii because every marketing call site hand-patches the dashboard-styled shared `Button`.**
Found by reviewer D, corroborated by reviewer B's elevation findings. 36px (`Public.tsx:210`, `size="sm"`)
vs. 48px (`Public.tsx:310`, default `md`) vs. 56px (`scan-handoff-form.tsx:54`), all at the dashboard's
6px radius, against the approved reference's single 44px pill. The same 5-class gradient override is
copy-pasted at 5 call sites. *Direction: one dedicated marketing CTA variant, not per-site overrides.*

**8. [P2 · ACCESSIBILITY · DESIGN SYSTEM] No `focus-visible` styling anywhere the shared `Button` renders (header CTA, drawer actions, both scanner submits) or on either toggle.**
Found by reviewer D, confirmed by reviewer F's keyboard pass (these controls are currently visible only
because Chromium's native fallback ring happens to render against this background — not an authored
style, and not guaranteed across browsers/forced-colors mode). Where focus rings *are* authored, three
different hues are used inconsistently (violet / lime / indigo) against the reference's single uniform
lime ring everywhere.

**9. [P2 · CARD · DESIGN QUALITY, present in the reference itself] Repeated "ghost card" pattern (1px border + large blur shadow used together) across the scanner, report frame, readiness board, remediation card, pricing shell, and audit-area explorer.**
Found by reviewer B, directly against the `impeccable` skill's elevation guidance ("use border or shadow
selectively, with one consistent elevation rule"). This is a **design quality issue that also exists in
the approved artifact**, not a production regression — flagged separately per the fidelity/quality split
the task required.

**10. [P2 · HIERARCHY/CONSISTENCY · REFERENCE FIDELITY] Section eyebrow/kicker treatment is implemented four different ways, and three sections (Trust, FAQ, FinalCta) lost it entirely.**
Found independently by both reviewer B and reviewer C. The artifact opens every section with one
consistent `.section-no` pattern (11px/800, tracked, dash prefix). Production has: dash+tracking
(`report-showcase.tsx`), the shared `Eyebrow` component forcing uppercase + the **dashboard's** muted-gray
token on an ice background (wrong family, `production-gap.tsx`), a plain untracked span (`loop.tsx`,
`remediation.tsx`, `audit-areas.tsx`, `pricing-preview.tsx`), and nothing at all (`trust.tsx`, `faq.tsx`,
`final-cta.tsx` — the artifact has "06·", "09·", "10·" on all three). The closing CTA in particular reads
visibly thinner than the reference because of this.

---

## 3. Systemic Problems

1. **`tailwind.config.ts:26`'s `fontSize: {}` at the theme root wipes the default type scale.** Root
   cause of Top-Problem #1 and of most Audit-1/Audit-2 hierarchy findings below.
2. **`.heroChrome`'s color selector in `Public.special.module.css` is scoped to the whole `<header>`,
   but the mobile drawer and the filled CTA button are both DOM descendants of that header.** One
   over-broad rule, written for the transparent-header-over-dark-hero case, causes three separate visible
   symptoms: the invisible drawer nav text (#3), the muted primary-CTA text (#4), and (on other public
   pages) the invisible "Sign in"/active-nav-link pair (#6 — a sibling bug in the same family: a
   conditional that *should* generalize across all header text wasn't applied everywhere it needed to be).
3. **`theme.extend.size` never registers `landing-header-control`/`landing-core`.** Root cause of
   Top-Problem #2 (mobile nav trigger/close button collapse).
4. **The shared product `Button` component is dashboard-styled (orange accent, 6px radius, no
   focus-visible) and every marketing call site re-overrides it ad hoc** instead of using a dedicated
   marketing variant. Root cause of the CTA height/radius drift (#7), the masked orange hover color (#4),
   and the missing focus rings on every primary CTA (#8).
5. **No shared "SectionHeader" primitive exists**, so eyebrow/kicker markup was reimplemented four
   different ways and three sections silently lost it (#10); heading-to-lead gap values also drift
   (36px vs. the token's 38px in several files) for the same underlying reason — no single source of
   truth for section headers.
6. **Positive counter-finding:** the marketing design-token layer itself (background colors, container
   widths, section padding, border-radius tokens, type-scale *definitions*, background alternation
   sequence) is implemented with pixel-exact-to-measured fidelity against the approved artifact —
   independently confirmed by three reviewers via direct value comparison. Every bug above sits as a
   narrow, mechanical defect on top of a correct foundation; none of them indicate the token system
   itself needs rework.
7. **Two generations of marketing components coexist.** `checks.tsx`, `ai-development.tsx`, and
   `proof.tsx` remain in `apps/web/components/marketing/` with an older styling convention
   (`max-[640px]` raw breakpoints, dashboard `type-*` classes) but are **not** imported by `page.tsx` —
   confirmed unused by three independent reviewers. Dead code, not a visible bug, but a maintenance trap
   and the likely source of future accidental edits to the wrong file.

---

## 4. Section-by-Section Audit

Render order (confirmed independently by two reviewers reading `page.tsx`/`LandingPage.tsx`): **Header →
Hero → ReportShowcase → ProductionGap → Loop (workflow) → Readiness → Remediation → Trust → AuditAreas →
PricingPreview → FAQ → FinalCta → Footer.** This maps 1:1 onto the artifact's own section order.

| Section | What works | What doesn't | Severity | RTL |
|---|---|---|---|---|
| **Header** | RTL mirroring via logical properties; `aria-current="page"` on active link; absolute/transparent-over-hero positioning matches reference | Wordmark is text-only (reference has a gradient monogram tile); "Sign in"/active-link invisible off the hero (#6); CTA height/radius mismatch (#7); 3 different focus-ring hues; control order differs from reference (reverses in RTL) | P1–P2 | mirrors correctly |
| **Hero** | Single real `<h1>`; scanner is prominent and well-proportioned (9/10, see §7); stats bar aligned with scanner width; no empty-field guard removed from the artifact caught as P3 bug | Eyebrow+kicker both render at the wrong (wiped) 16px size (#1); CTA text muted (#4); decorative SVG is a simplified stand-in for the artifact's halo+arcs; no live-region confirmation on submit | P1–P3 | correct; URL input explicitly `dir="ltr"` |
| **ReportShowcase** | Near-exact fidelity to the artifact's frame/finding split, padding, and gap; mockup reads as real product UI (9/10) | Nested card (frame→finding, banned pattern); severity-pill hue drifts from the artifact | P2–P3 | evidence string correctly `<bdi dir="ltr">` |
| **ProductionGap** | Card geometry (min-height, padding) matches exactly | Grid is 1040px wide vs. the artifact's 1000px; `Eyebrow` component forces the wrong (dashboard) muted-gray color on an ice background | P2 | n/a |
| **Loop (workflow)** | Card geometry matches; four-step structure intact | Missing the artifact's lead line under the heading; steps lack the artifact's symbol+caption anatomy; heading-gap uses 36px not the 38px token | P2 | n/a |
| **Readiness** | Correct 0.8/1.2 split, 1000px width, board/blocker structure; mockup reads well (9/10) | **Worst composition break on the page**: the left copy column's heading renders at 16px instead of 24px (#1), so the board visually dominates by accident, not by design; status-pill hues drift from artifact | P1 (hierarchy) | n/a |
| **Remediation** | Dark two-column split matches artifact exactly; mockup is dense but legible (8/10); AI-callout content enrichment is a reasonable addition | Nested measurement/prompt panels inside the repair card (banned pattern); card gradient reads flatter/darker than the reference; atmosphere reuses the hero's radial at the wrong opacity | P2–P3 | evidence strings correctly LTR |
| **Trust** | Exact 2×2 contiguous-border ledger geometry; four verifiable control claims preserved | No eyebrow, no lead — section opens abruptly (one of the three sections missing its eyebrow, #10) | P2 | n/a |
| **AuditAreas** | Desktop tab explorer is excellent (correct ARIA tablist, roving tabindex, RTL-correct arrow-key inversion); explorer geometry matches artifact exactly | Tab labels render at 16px not 12px (#1); at 390px the 5th tab ("Search visibility") scrolls out of view with **zero affordance** hinting it's scrollable (6/10 mockup score, the one weak mockup) | P2 | arrow-key direction correctly inverted |
| **PricingPreview** | Shell geometry exact; mobile 5-cost grid reflows sensibly to 2 columns; mockup reads well (9/10) | Highlight numbers render at 16px not 23px (#1), so the intended focal numbers read as paragraph text; label/number order is flipped vs. the artifact; one highlight's content was swapped (95 vs. 60) | P1–P2 | n/a |
| **FAQ** | Fully keyboard-operable native `<details>/<summary>`; correct `[dir=rtl]:order-first` icon mirroring; exemplary semantics | Missing eyebrow (#10); question text renders at 12px vs. the artifact's 14px (a *live* wrong token, not the fontSize bug); heading has an unexplained `max-w-[12ch]` risking a hard wrap in Arabic | P2–P3 | icon mirrors correctly |
| **FinalCta** | Reconnects visually with the hero (identical navy token) as the artifact intends; same scanner component reused and still legible at 390px (8/10) | Missing eyebrow + HTTPS-indicator row + closing "foot-truth" line present in the artifact; scanner radius (18px) disagrees with the hero's own scanner instance (22px) — same component, two geometries | P2 | n/a |
| **Footer** | Column structure and link destinations match `content-mapping.md`'s approved boundary | Missing monogram tile (same as header); column ratio drifts slightly (1.6fr vs. 1.5fr); mobile brand cell doesn't span full width (`col-span-full` missing) | P3 | n/a |

---

## 5. Typography Audit

**Fonts actually loaded** (confirmed from `apps/web/app/layout.tsx` + `fonts.css`): Cairo Arabic/Cairo
Latin served **locally** via `next/font/local` (`cairo-arabic.woff2`, `cairo-latin.woff2`), with Lexend
Deca, JetBrains Mono, and Noto Sans Arabic via `next/font/google` as fallbacks. `--font-marketing` stacks
`Cairo Arabic → Cairo Latin → Noto Sans Arabic → --font-sans`. This matches the artifact's intended
Cairo/mono stacks and is a correctly-implemented, intentional choice — not a fallback accident.

**The scale as *declared*** (desktop @1440, from `landing.css`): display 60.8px, H2 50.4px, FAQ heading
39px, remediation heading 42px, closing heading 45px, demo heading 25px, card/workflow heading 18px, area
heading 21px, body 14px, lead 14px/1.85, description 12px/1.75, label 11px, micro 10px, stat 24px
(mobile 18px). This scale is a faithful, measured port of the artifact.

**The scale as *rendered*** — this is where the critical bug lives: because of `tailwind.config.ts:26`
(`fontSize: {}`), every bare Tailwind size utility (not the named marketing tokens, which are unaffected)
resolves to **zero CSS**. Confirmed by direct grep of the compiled stylesheet. Concretely broken:

| Element | Intended | Renders as | File:line |
|---|---|---|---|
| Readiness heading | 24px | 16px | `readiness.tsx:15` (`text-2xl`) |
| Pricing highlight numbers (80/3/60) | 23px | 16px | `pricing-preview.tsx:95` (`text-2xl`) |
| Hero eyebrow | 12px | 16px | `hero.tsx:18` (`text-xs`) |
| Hero kicker | — (extra row, no artifact equivalent) | 16px | `hero.tsx:20` |
| Scanner header text | 11px | 16px | `hero.tsx:30` (`text-xs`) |
| Audit-area tab labels (>640px) | 12px | 16px | `audit-areas.tsx:91` (`text-xs`) |
| Header nav links | 13px | 16px | `Public.tsx:43` (`text-sm`) |
| Remediation code snippet | 11px | 16px | `remediation.tsx:82` (`text-sm`) |

A second, independent (and live-rendering-correct) issue: **FAQ question text uses the `text-marketing-
description` *named* token at 12px**, where the artifact specifies 14px for the FAQ summary specifically
(`faq.tsx:23` vs. `index.html:186`) — this one is a wrong-token choice, not the fontSize bug, and needs
its own fix.

**Arabic-specific findings:** negative letter-spacing (`tracking-[-0.03em]` to `-0.035em`) is applied
locale-neutrally to headings that also render in Arabic — Arabic script doesn't benefit from (and can
visually suffer from) negative tracking the way Latin display type does. The artifact applies the same
negative tracking to its own headings, so this is classified a **design quality issue present in the
reference itself**, not a production-only deviation. No Arabic-specific weight/line-height overrides
exist; both locales share the same responsive viewport-based scale, which is consistent with the
artifact's own approach.

---

## 6. Spacing & Layout Audit

**Containers** — measured against the artifact, all match except one: ProductionGap's 3-card comparison
grid reuses the 1040px demo-frame token where the artifact caps it at 1000px (each card renders ~337px vs.
~325px — a minor but real drift). Every other container (header 1320px, hero 1152px, demo frame 1040px,
workflow/areas/pricing 960px, readiness/remediation/trust/FAQ 1000px, closing 760px, footer 1120px,
gutters 24px/16px) matches the artifact exactly.

**Section padding** — 108px/53px (desktop/mobile) is used consistently across the light/ice sections,
104px/54px for remediation, 92+88 / 57+52 for the closing — all match the artifact.

**The one real spacing inconsistency:** heading-to-lead gap uses two competing values — `mb-9` (36px,
hard-coded in `production-gap.tsx`, `loop.tsx`, `trust.tsx`, `audit-areas.tsx`) vs. the 38px token
`mb-marketing-report-heading-gap` (used correctly in `report-showcase.tsx`, `pricing-preview.tsx`) — where
the artifact uses 38px everywhere. A second, pervasive but sub-visible pattern: Tailwind's 4px grid can't
express several of the artifact's odd-numbered measured values (13px, 17px, 19px, 23px, 25px), producing
consistent ±1–2px drift across card padding and gaps. Several of the needed tokens already exist in
`landing.css` but aren't applied everywhere.

**Mockup-vs-container scale — explicitly checked, no problem found.** This was a specific concern in the
master audit brief ("are product mockups too small relative to their surrounding space?"). Measured: the
Readiness board fills ≈581px of its 1000px container, the Remediation repair card ≈613px of 1000px, the
ReportShowcase frame fills its full 1040px band — all matching the artifact's own ratios exactly. No
"small mockup lost in a huge section" instance was found anywhere on the page.

---

## 7. Product Mockup Audit

Scored live, at 1440px and 390px, by reviewer F (axe/interaction reviewer) with legibility and scale as
the primary criteria:

| Mockup | Score | Note |
|---|---|---|
| Scanner (hero) | **9/10** | Reads instantly as a real control; fully legible at 390px without zoom |
| Report preview | **9/10** | Believable finding card with real-looking evidence; proportionate whitespace |
| Readiness board | **9/10** | Reads like a real release-gate UI, not an illustration |
| Pricing/credits preview | **9/10** | Real-looking numbers/labels; mobile 5-cost grid reflows cleanly to 2 columns |
| Final scanner (closing CTA) | **8/10** | Same component correctly re-themed for the dark closing band |
| Remediation example | **8/10** | Dense but well-organized; the longest mobile scroll of any mockup, still fully readable |
| Audit-area tab explorer | **6/10** | Excellent at 1440px; at 390px the 5th tab scrolls out of view with no affordance hinting it's scrollable |

No mockup reads as a generic placeholder/illustration — all seven use realistic labels, data shapes, and
structure appropriate to an audit product. This is the strongest area of the page.

---

## 8. Color / Surface / Border / Shadow Audit

**Colors as rendered** (sampled via `getComputedStyle`, reviewer E) match the approved tokens exactly:
hero `#0C1428`, night `#070D1C`, canvas `#F8FAFF`, ice `#EEF3FF`, ink `#1A2440`, the five-stop CTA
gradient — all pixel-exact to the artifact's declared custom properties, in both locales. The one
exception is the CTA text-color bug (#4 above) — not a token problem, a cascade bug.

**Axe-flagged contrast violations (EN only, 1440px):** three small bold "eyebrow"-style labels sit
0.1–0.24 points under the 4.5:1 AA threshold: `.type-eyebrow` "The production gap" label (4.26:1),
the "Verify before production" pill in Remediation (4.34:1), and the "Five check areas" eyebrow in
AuditAreas (4.39:1). Axe did not flag the identical components on the Arabic page even though the colors
are the same — the ratios are borderline enough that rendering differences nudge them across axe's
threshold; **treat this as a real cross-locale issue, not an AR-only pass.**

**Borders/radii/shadows:** radius values are centralized as named tokens but are bespoke per component
(11px to 24px) rather than drawn from a compact shared scale. Shadow tokens are likewise named but applied
without a consistent depth rule — see Top Problem #9 (the repeated border+large-shadow "ghost card"
pattern, present in the artifact itself). Nested-card instances: report frame→finding, readiness
board→blocker note, remediation card→measurement/prompt panels, pricing shell→highlight cards+table,
audit explorer→tab panel.

**Iconography:** the marketing components import no dedicated icon library — symbols are built from text
glyphs, numerals, and CSS dots/circles, so there's no standardized size/stroke-weight system. Only two
places in the codebase handle directional-glyph RTL mirroring (`ai-development.special.module.css` — an
unused component — and `audit-areas.tsx`'s keyboard arrow-key logic); the live remediation connector arrow
has no RTL mirroring at all (confirmed by both a code reviewer and a live-browser reviewer).

---

## 9. RTL Audit

**What's correct (confirmed by multiple independent reviewers):** `dir="rtl"` resolves correctly on
`/ar`; header/nav mirrors correctly (wordmark moves to the trailing edge, CTA cluster to the leading
edge); hero stats mirror correctly (the "start" anchor flips sides appropriately, not a bug); tab order
in the header matches the mirrored visual order; the scan-URL input, report-evidence address, `<bdi
dir="ltr">`-wrapped evidence strings, and JSON snippets all stay correctly LTR-readable inside the RTL
page; the FAQ's open/close icon uses `[dir=rtl]:order-first` correctly; `audit-areas.tsx`'s roving-tabindex
arrow-key navigation correctly inverts for RTL.

**What's wrong:**
- `scan-handoff-form.tsx:59` uses physical `text-right` for localized helper text instead of logical
  `text-end` — coincidentally correct in RTL, wrong in LTR (locale-dependent alignment of the same
  element). P2, code-level bug.
- The remediation section's "build → verify" connector uses a literal right-pointing arrow glyph with no
  RTL mirroring (`remediation.tsx:49-51`) — the *unused* `ai-development.tsx` counterpart does mirror its
  equivalent connector, so the handling is inconsistent between a live and a dead component. P2.
- Hero stat values (`<strong>` with `font-mono`) have no explicit `dir="ltr"`/isolation despite being
  numeric — they currently render fine because digits are direction-neutral, but there's no isolation
  safety net if the content ever changes. P2, implementation bug (latent).
- **(Reference fidelity, not a bug)** the directional "←" arrow the artifact appends to every primary CTA
  ("ابدأ مجاناً ←" / "Start free →"-equivalent) as a deliberate RTL-aware motion cue was dropped entirely
  in production — found independently via live DOM query (reviewer E). P3.

---

## 10. Responsive Audit

Full-page screenshots were captured at all six required widths (1440/1280/1024/768/390/360), both
locales — 12 combinations total, reviewer E.

**Zero horizontal overflow found at any of the 12 combinations** (`scrollWidth === clientWidth` measured
directly, not estimated) — a genuinely clean result on a dimension that's very commonly broken.

**1440/1280/1024/768, both locales:** no issues found beyond what's already covered in the section-by-
section audit (the fontSize bug affects these widths identically to mobile, since it's not a
responsive-specific bug).

**390/360, both locales:**
- The mobile nav trigger/close-button hit-target collapse (Top Problem #2) is the first thing a mobile
  visitor would try to interact with, on every page.
- Touch targets under 44×44px are the norm rather than the exception at this width: the wordmark link
  (51×22), drawer-close "×" (22×19), drawer lang/theme toggles (36px tall), "Copy prompt" (38px tall), all
  five audit-area tabs (38px tall), and every footer link (20px tall, **zero vertical padding**). This is
  a systemic small-control-height choice (36–38px baseline) rather than isolated mistakes, and it matches
  the artifact's own control sizes — so it's a general mobile-UX note, not a fidelity regression.
- Re-clicking the hamburger while the drawer is already open is blocked by the drawer's own full-screen
  backdrop (`z-40`) covering the trigger (`z-20`) — not a focus trap (Escape/backdrop/close-button all
  work), but the trigger's own `aria-expanded` semantics imply it should remain clickable. P3.
- Mobile drawer open/close itself, and content reflow (4-col→2-col→1-col grid collapses, workflow cards,
  pricing grid), all work correctly with no clipped text or broken grids.

---

## 11. Accessibility Audit

**Automated (axe-core, WCAG2A/AA, 1440px, reviewer F):** EN — 1 violation rule / 3 instances, impact
"serious" (the three borderline eyebrow-contrast cases in §8), 30 passed rules, 41 axe-"incomplete" nodes
(mostly gradient/translucent backgrounds axe can't auto-certify — manually spot-checked and found
legible). AR — **0 violations**, 30 passed, 18 incomplete. The same three components render clean in
Arabic purely because of borderline-threshold rendering differences — treat as a real EN+AR issue, not
an AR pass.

**Manual (keyboard, reviewer F + code review by reviewer D):**
- Heading order is clean throughout: exactly one `<h1>`, no skipped levels, correct nested `<h2>`/`<h3>`/
  one `<h4>`.
- Landmarks mostly present: `<header>`, two `<nav>` (desktop + labelled drawer), `<main>`, `<footer>`;
  9 of 11 sections carry `aria-labelledby` — `loop.tsx` and `production-gap.tsx` are the two exceptions
  (unnamed sections with un-id'd headings), P3.
- No `div onClick` anti-pattern anywhere in scope — every interactive element is a native control.
- Both scanner inputs have real, programmatically-associated `sr-only` labels.
- FAQ is fully keyboard-operable (native `<details>/<summary>`, confirmed by live Enter-key toggle test).
- Mobile drawer accessibility is **exemplary**: correct `aria-expanded`/`aria-controls`, `role="dialog"` +
  `aria-modal`, initial focus to the close button, a real Tab focus trap, Escape-to-close, focus returns
  to the trigger on close, `inert` + scroll-lock while open — ahead of the reference's own script, per
  reviewer D. (The drawer's *visual* bugs — #2 and #3 above — are separate from this correct behavioral
  implementation.)
- `AuditAreas`'s tab widget has correct `tablist`/`tab`/`tabpanel` ARIA roles, roving tabindex, and
  RTL-correct arrow-key inversion — a correctly implemented ARIA pattern, confirmed by live click+arrow-key
  testing.
- Touch targets: see §10.
- `prefers-reduced-motion` only reduces `--duration-reveal`/`--duration-land`; the drawer's own transition
  (`--duration`, 150ms) and all plain Tailwind `transition-colors` utilities are unguarded. P2.
- No `focus-visible` styling on the shared `Button` component or either toggle (Top Problem #8); three
  inconsistent focus-ring hues elsewhere.

---

## 12. Interaction Audit

Tested live (reviewer F): header nav hover (correct), CTA hover (visually correct, but masks the orange
hover-color bug from #4), theme toggle (correct — `data-theme` flips and visibly re-themes both locales),
scanner input/submit (correct client-only handoff confirmed — `sessionStorage` write + `/signup` redirect,
no real backend scan triggered), FAQ click expand/collapse (correct, independent of the keyboard test),
audit-area tab click + arrow-key navigation (correct, panel content updates), mobile drawer open/close by
click (correct). **The one broken interaction found:** the AR→EN language toggle (#5 above).

---

## 13. Technical Visual Bugs

Confirmed, reproducible implementation bugs (not fidelity nitpicks), from reviewer E's console/network/
layout instrumentation:

- Repeated `net::ERR_CONNECTION_REFUSED` on every page load, both locales: `GET
  http://localhost:3001/auth/me` and `POST http://localhost:3001/auth/refresh` — the `AuthProvider`
  checks auth state even on the anonymous public marketing page, against an auth service not running in
  this dev environment. **Flagged as an environment limitation to verify against a live backend, not a
  confirmed page bug** — but worth confirming whether the public marketing route needs these calls at all.
- Zero broken images found (`naturalWidth === 0` check, all 12 viewport/locale combinations).
- No layout shift detected by a crude H1-position spot-check between `domcontentloaded` and
  `networkidle` — this only catches shifts affecting the H1's position, not full CLS; not thoroughly
  tested beyond this spot check.
- Zero raw i18n key leakage (`public.*`-style strings) found in rendered DOM text at 1440px, either
  locale — the only regex match was the intentional fake evidence URL `shop.example`, correctly appearing
  in the demo finding card. This corroborates the equivalent code-level check (reviewer A: both locale
  dictionaries have the same 157 keys, zero missing on either side).
- Theme toggle via `localStorage.setItem` + `page.reload()` did **not** apply (`data-theme` stayed unset)
  in reviewer E's first attempt, while clicking the real toggle button worked correctly every time.
  Flagged by the reviewer as a possible hydration-timing question worth a closer look, not asserted as a
  confirmed bug — the UI control itself works.

---

## 14. Reference Fidelity vs. Independent Quality

### A. Things production gets wrong compared with the approved HTML artifact

- Header/footer wordmark is text-only; the artifact has a 27px gradient monogram tile.
- Header control order differs from the artifact (reverses in RTL).
- Header/closing CTA is 36–56px/6px-radius vs. the artifact's 44px pill/800-weight/translateY hover.
- ProductionGap's comparison grid is 1040px vs. the artifact's 1000px.
- Workflow steps are missing the artifact's symbol+bottom-caption anatomy and intro lead.
- Readiness's blocker-note stripe is 2px vs. the artifact's 3px; status-pill hues drift from the artifact.
- Trust/FAQ/FinalCta are missing their section eyebrows entirely; FinalCta is also missing the HTTPS-
  indicator row and the closing "foot-truth" line.
- Pricing highlight content order is flipped (number-above-label vs. label-above-number) and one
  highlight's content was swapped (95 vs. 60).
- FAQ question text uses a 12px token where the artifact specifies 14px.
- Footer column ratio is 1.6fr vs. 1.5fr; mobile brand cell doesn't span the full grid width.
- The directional "←" arrow on primary CTAs (a deliberate RTL motion cue in the artifact) was dropped.
- Dark theme remaps the artifact's explicitly light-only design (`data-theme="light"` in the source) —
  a supported-but-unreviewed-against-the-reference condition, not a bug, but worth a conscious decision.

### B. Things that match the approved artifact but should still be improved because the result is weak

- The repeated border+large-shadow "ghost card" treatment on the scanner, report frame, readiness board,
  remediation card, pricing shell, and audit explorer — present in the artifact itself.
- Nested cards (report frame→finding, readiness board→blocker note, remediation card→measurement/prompt
  panels, pricing shell→highlight cards+table) — the artifact has the same nesting; `impeccable`'s guidance
  flags nested cards as always wrong regardless of source.
- Gradient text on the H1's second line — both the artifact and production use
  `background-clip: text` + gradient, which `impeccable` explicitly bans.
- Repeated tiny-tracked-eyebrow-per-section pattern — present throughout the artifact; flagged as AI-
  scaffolding-adjacent regardless of the source being hand-authored.
- Negative letter-spacing applied to Arabic headings — the artifact does the same; Arabic script doesn't
  benefit from negative tracking the way the Latin display face does.
- Canvas (`#F8FAFF`) and ice (`#EEF3FF`) backgrounds are near-neighbors, making several light-section seams
  intentionally whisper-subtle in the artifact itself — not a defect, but worth a conscious call if a
  stronger light-section rhythm is ever wanted.

---

## 15. Recommended Repair Order

**Wave 1 — Implementation bug fixes (highest ROI, lowest risk, no design decisions required).**
Restore `tailwind.config.ts`'s default font-size scale (or sweep bare `text-*` classes onto marketing
tokens); add `landing-header-control`/`landing-core` to `theme.extend.size`; scope `.heroChrome`'s color
rules away from the mobile drawer and the filled CTA button (likely by restricting the selector to the
desktop header row, or giving the drawer/CTA their own explicit color classes that win); apply the
`active==='nav_product'`-style conditional to the ghost "Sign in" link and `navLinkActive` so non-landing
public pages get correct header contrast; verify and fix the AR→EN language-toggle navigation.

**Wave 2 — CTA system consolidation.** One dedicated marketing `Button` variant (correct height/radius/
weight, authored `focus-visible`, correct resting *and* hover colors) replacing the five copy-pasted
gradient overrides; unify the three focus-ring hues into the reference's single lime ring.

**Wave 3 — Section-header primitive + fidelity restoration.** One shared `SectionHeader`/`SectionNo`
component to fix the four-way eyebrow drift and restore Trust/FAQ/FinalCta's missing eyebrows and
FinalCta's missing closing elements; fix the 36px/38px heading-gap split; restore the ProductionGap
1000px width and the workflow step anatomy.

**Wave 4 — Card/elevation cleanup.** Resolve the repeated ghost-card pattern and the nested-card
instances with one consistent elevation rule (border *or* shadow per surface, not both); this is a design
decision, not a bug fix, so it should go through a design pass rather than be auto-applied.

**Wave 5 — Accessibility & responsive polish.** Fix the three borderline eyebrow-contrast pairs; add an
edge-fade/peek affordance to the AuditAreas mobile tab row; raise footer-link and small-control touch
targets toward 44px where feasible; extend `prefers-reduced-motion` coverage to the drawer transition and
Tailwind's `transition-colors` utilities; add RTL mirroring to the remediation connector arrow and an
explicit `dir="ltr"` isolation on hero stat values.

**Wave 6 — Micro-polish.** Gradient-text → solid-color H1 emphasis; FAQ question token correction (12px→
14px); footer column-ratio/mobile-span fix; restore the dropped directional-arrow CTA affordance; retire
the three unused legacy marketing components.

---

## 16. Files Likely Requiring Changes

- `apps/web/tailwind.config.ts` — the `fontSize: {}` wipe (Wave 1) and the missing `size` keys (Wave 1).
- `apps/web/components/public/Public.special.module.css` — the `.heroChrome` color-scoping bug (Wave 1).
- `apps/web/components/public/Public.tsx` — ghost-button/active-nav-link conditional (Wave 1), wordmark
  treatment, control order, footer column ratio/mobile span (Wave 3/6).
- `apps/web/app/theme.tsx` — `LangToggle` AR→EN navigation logic (Wave 1); icon-control border treatment.
- `apps/web/components/ui/Button.tsx` (or wherever the shared `Button` lives) — marketing CTA variant,
  focus-visible, hover-color fix (Wave 2).
- `apps/web/components/marketing/hero.tsx`, `final-cta.tsx` — eyebrow/kicker sizing fallout from Wave 1;
  scanner radius disagreement between the two instances; missing closing elements (Wave 3).
- `apps/web/components/marketing/readiness.tsx`, `pricing-preview.tsx`, `audit-areas.tsx` — direct
  fallout of the Wave 1 fontSize bug on their headings/numbers/labels.
- `apps/web/components/marketing/loop.tsx`, `production-gap.tsx`, `trust.tsx` — missing eyebrows/leads,
  heading-gap token drift (Wave 3).
- `apps/web/components/marketing/faq.tsx` — question-text token correction, missing eyebrow (Wave 3/6).
- `apps/web/components/marketing/remediation.tsx` — nested-panel cleanup (Wave 4), connector-arrow RTL
  mirroring (Wave 5).
- `apps/web/app/tokens/landing.css`, `colors.css`, `dark.css` — radius/shadow consolidation (Wave 4),
  motion-reduce coverage (Wave 5).
- `apps/web/components/marketing/checks.tsx`, `ai-development.tsx`, `proof.tsx` — candidates for removal
  (Wave 6; confirm unused before deleting).

---

## 17. What NOT to Change

- The design-token layer itself: background colors, container widths, section padding, the background
  alternation sequence (navy hero → canvas/ice strict alternation → one night island → alternation
  resumes → navy closing → white footer — an exact, token-for-token match to the artifact with no two
  adjacent sections sharing a background).
- The product-UI mockups' content and structure (scanner, report frame, readiness board, remediation
  card, pricing shell) — these are the strongest part of the page (§7) and already match the artifact's
  intent; any fix work here should be the elevation/nesting cleanup in Wave 4, not a content rebuild.
- The mobile drawer's *behavioral* implementation (focus trap, Escape, focus return, `inert`/scroll-lock)
  — exemplary, already ahead of the reference; only its *visual* bugs (hit target, text color) need
  fixing, not its logic.
- The `AuditAreas` tab widget's ARIA implementation (tablist/tab/tabpanel roles, roving tabindex, RTL
  arrow-key inversion) — correct as built.
- RTL handling for mixed-direction content (LTR-isolated URLs/code/evidence strings, header mirroring,
  hero-stat ordering) — correct throughout, confirmed by three independent reviewers.
- The locally-served Cairo font strategy and the overall Arabic-first intent — correctly implemented and
  distinct from (not accidentally reusing) the dashboard's Lexend Deca system.
- The mockup-to-container size ratios — explicitly checked against the stated concern in the audit brief
  and found to already match the artifact; no "shrunk" or "lost in whitespace" instance exists.

---

## 18. Evidence

**Routes reviewed:** `http://localhost:7100/` (EN), `http://localhost:7100/ar` (AR) — against an
already-running dev server, verified via `curl` 200 responses before testing.

**Viewports:** 1440, 1280, 1024, 768, 390, 360 — full-page screenshots at every width × locale
combination (12 total), plus isolated mockup/focus/interaction screenshots.

**Browser checks:** Playwright (chromium) for responsive screenshots, RTL/theme verification, console/
network/broken-image/layout-shift instrumentation, computed-style color sampling, and live interaction
testing (clicks, keyboard tabbing, arrow-key navigation); `@axe-core/playwright` for automated WCAG2A/AA
scanning.

**Computed-style checks:** rendered colors sampled via `getComputedStyle` against the declared token
values; compiled-CSS grep confirming the `fontSize: {}` bug (independently re-verified by the
orchestrator, not just the reporting reviewer); touch-target measurement via `getBoundingClientRect`.

**Console/network findings:** repeated `ERR_CONNECTION_REFUSED` to a local auth service not running in
this dev environment (flagged as environment-dependent, not confirmed as a page bug).

**Tools/agents used:** 2× Codex (`gpt-6-luna`, effort `high`, `--read-only` sandbox — model/effort
independently confirmed from the Codex session log), 2× Kimi (`kimi-2.1.1`), 2× Claude subagent with
Playwright + axe-core. All six confirmed to have made zero repository changes
(`git status --porcelain` identical before and after, 53 pending lines matching the pre-existing dirty
tree in every case).

**Screenshots and raw data** (not committed — local scratch artifacts only):
`C:\Users\yosea\AppData\Local\Temp\claude\h--Projects-Webaudit-ai-\03d469b8-e83c-4995-abd6-89d377714583\scratchpad\fahes-audit\screenshots\`
(subfolders `responsive/`, `rtl/`, `theme/`, `bugs/`, `a11y/`, `interaction/`, `mockups/`) and
`...\scratchpad\fahes-audit\{codex-1-out,codex-2-out,kimi-1-out,kimi-2-out}\final.txt` /
`result.json` for the two delegated code-review runs each.

---

## Final Recommendation

**1. Is the current page structure fundamentally good enough to keep?** Yes. Section order, container
widths, background rhythm, and the type-scale *definitions* are an unusually faithful port of the
approved artifact, confirmed independently by three reviewers via direct value comparison.

**2. Redesign, or a fidelity/polish pass?** A fidelity-and-bug-fix pass. Nothing found here calls the
design direction into question; the page is held back by roughly five mechanical implementation bugs
(Wave 1) plus a CTA-system consolidation (Wave 2), not by a wrong design.

**3. The five changes with the highest visual ROI:** (1) restore the Tailwind font-size scale, (2) fix
the mobile-nav hit-target/size-token bug, (3) fix the `.heroChrome` color-scoping bug (drawer text + CTA
text + other-page header contrast, three symptoms from one root cause), (4) consolidate the CTA system
into one marketing `Button` variant, (5) build the shared `SectionHeader` primitive to restore the three
missing eyebrows and fix the heading-gap drift.

**4. Fix globally first or section-by-section first?** Globally first. Every Wave-1 item is a shared
config/CSS-module/component fix whose blast radius spans most sections; fixing them first will make the
section-by-section findings in §4 shrink substantially before any section-level work starts, and will
avoid fixing the same symptom five times in five different files.

**5. Is Arabic typography currently production quality?** Close, not quite. Font loading/strategy and RTL
mixed-content handling are correctly and deliberately implemented. The open items are the Wave-1 font-
size bug (affects Arabic exactly as it affects English), locale-neutral negative letter-spacing on
Arabic headings (present in the artifact too — a design call to revisit), and the unexplained
`max-w-[12ch]` risk on the FAQ heading in Arabic.

**6. Are product mockups large/clear enough?** Yes — this is the strongest part of the page (average
~8.3/10 across seven mockups, §7). Only the AuditAreas mobile tab-scroll affordance needs attention.

**7. Is mobile genuinely designed, or merely responsive?** Genuinely designed in intent (zero overflow
across 12 width/locale combinations, sensible grid collapses, correct mockup legibility at 390px) but
currently **not usable** as shipped, because the only mobile nav entry point is visually and functionally
degraded by the Wave-1 bugs. Fix those and mobile moves from "blocked" to "well-designed."

**8. Is the approved HTML artifact itself good enough as the final target, or are there weaknesses worth
correcting?** Mostly good enough, with the specific weaknesses listed in §14-B worth a conscious decision
before the next implementation pass: the ghost-card elevation pattern, the nested-card instances, gradient
text on the H1, the repeated-eyebrow pattern, and Arabic negative-tracking. None of these require
abandoning the artifact — they're refinements to carry forward past it, not reasons to distrust it.

**9. What should the next implementation agent do first?** Wave 1, in this exact order: (a) fix
`tailwind.config.ts`'s `fontSize`/`size` keys, re-render, and re-screenshot to confirm the hierarchy
findings in §4/§5 actually resolve; (b) fix the `.heroChrome` selector scoping and re-verify all three
symptoms (drawer text, CTA text, other-page header contrast) independently; (c) manually re-verify the
AR→EN language-toggle bug before scheduling a fix, since it was single-sourced. Only after Wave 1 is
verified should Waves 2–6 begin, since several of their symptoms (e.g., some Audit-23 consistency
findings) may partially resolve as side effects of Wave 1 and shouldn't be fixed twice.
