# WebAudit AI — Design System

**WebAudit AI audits a website across five dimensions — performance, security, design, testing,
search visibility — and then walks the owner from red to green.** A user submits a URL, a connected
repository, or an uploaded archive. The system measures deterministically first, then uses AI to
explain and prioritise what was measured. Output is a health score, an executive summary, and
per-issue remediation prompts pasted straight into a coding agent. As issues get fixed, a narrow
cheap re-check turns each one green only when the check actually passes; when nothing critical or
high remains, a full fresh re-audit returns an explicit production-readiness verdict.

Positioning, in one line from PRODUCT.md §2: *everyone else sells you a report; we sell you the walk
from red to green, and we verify each step.*

## Sources

Everything here derives from materials the user attached. Nothing is invented from memory.

| Source | Path given | What it supplied |
| --- | --- | --- |
| Design baseline | `uploads/DESIGN.md` (= `motakamel/DESIGN.md`) | Every colour, type, radius, elevation, layout and motion token below |
| Product definition | `uploads/PRODUCT.md` | Voice, register, audience, pricing tiers, product principles |
| Architecture | `uploads/WebAuditAI_ARCHITECTURE.md` | System shape behind the app surfaces |
| Agent guidance | `uploads/CLAUDE.md` | Repo conventions |
| Attached codebase | `motakamel/` (local folder, read-only) | `specs/ui-reference-siteaudits/` teardown and token evidence; `specs/001-webaudit-mvp-baseline/` requirements |

The design baseline is itself a clone-grade teardown of **siteaudits.ai**, captured via Playwright
computed styles at 1440×900 and 390×844. Tokens marked `[CLONED]` in DESIGN.md are runtime-measured
from that reference; tokens marked `[EXTENDED]` (severity scale, dark mode, app surfaces) have no
reference and are built from the same Tailwind palette the reference itself draws on.

**There is no logo.** DESIGN.md §11 and §12 state the wordmark is undesigned and explicitly *not*
to be taken from the reference. Wherever a mark would go, this system renders the words
"WebAudit AI" in plain Lexend Deca — the accent orange on "Audit". Do not draw one.

---

## Content fundamentals

**Register: technical and plain.** The audience is a developer or technical founder with a launch
date, and secondarily an agency delivering client sites. The explicitly-rejected audience is the
non-technical small-business owner — DESIGN.md §11 names the reference's consumer voice ("the
wingman your website needs", "as easy as pie") as the one thing not to clone. Adopt its
*specificity about pain*, not its jokes.

**Person.** Second person for the user's actions and property ("your site", "you fix it"); first
person plural only for platform commitments ("we never charge for our failures"). Never
first-person singular. Never a personified product.

**Casing.** Sentence case for headings, buttons, labels, and nav. Uppercase only for the eyebrow
token, which carries `+1.52px` tracking. No Title Case On Buttons.

**Sentences do one job.** Short declaratives. A claim, then the mechanism behind it:

> Green means verified. An issue turns green when a check passes, never when a user says so.

> A re-check is under 4% of a full audit.

> Zero users charged for a failure of ours.

**Numbers are specific and always present** — 80 credits, 3 credits, 50 free credits, 7,134px page,
0.667px border. Vagueness reads as evasion to this buyer. Where something is unknown, say so
plainly: "Dark-mode severity values — need contrast verification. Not yet done."

**Admit weakness in the product's own voice.** PRODUCT.md §4 has a section headed "Where they are
genuinely stronger, and we should admit it". That honesty is a brand asset, not a lapse; UI copy
inherits it. A degraded audit area says exactly what is missing, in words.

**No emoji.** None appear in any source document body copy or UI spec. Do not introduce them.

**Mono means machine truth.** Headers, selectors, file paths, measured values, credit codes are set
in mono. Sans means "we concluded this"; mono means "we observed this". This is the typographic
expression of the measured-versus-inferred split, and it is load-bearing — not decoration.

**Forbidden copy patterns.** No exclamation marks outside the readiness verdict. No fake urgency. No
progress language that isn't literally true (a shimmer runs only while work is genuinely happening).
No "AI-powered" as a value claim — AI is described by what it does, and every finding it produced is
labelled.

---

## Visual foundations

**The whole system rests on one decision: square by default.** 215 of roughly 250 styled elements on
the reference carry zero radius. Rounding is reserved — 6px for controls, 8px for cards, pill for
badges. If a new element doesn't obviously need rounding, it gets `0`. This does more to reproduce
the feel than any colour choice.

**Colour.** One accent, `#fe5a01`, for the entire product: CTA fill, the emphasised half of a
two-tone headline, the focus ring. Nothing competes with it. Text runs a grey ladder from
`#111827` strong through `#1f2937` body to `#6b7280` secondary and `#737373` muted. Text on
accent is `#fafafa`, not pure white — measured.

**Severity is a separate scale and may never use the accent.** The accent means "clickable"
everywhere; if high severity were also brand orange, a badge and a CTA would be indistinguishable.
`--sev-high` is `#c2410c` — deeper and browner, still hot, visibly not the accent.
`--sev-resolved` (`#047857`) and `--sev-low` (`#4d7c0f`) are deliberately different greens:
"verified fixed" and "minor issue" must never be confusable on the fixes board. Severity is never
colour alone — every badge carries an icon and a text label.

**Borders are 0.667px.** A sub-pixel hairline, measured. At 1px the interface reads visibly heavier.

**Depth comes from background tint, not shadow.** `#ffffff` → `#fafafa` → `#f9fafb` steps
separate sections. There are exactly three shadows on the entire 7,134px reference page. Reach for a
tint change before a shadow.

**Type.** Lexend Deca, variable 100–900, one family for everything. No serif, no separate display
face. The signature is tracking direction: **negative on display** (−1.2px at 48px), **positive on
small and uppercase** (+1.52px on the eyebrow, +0.35px on mobile body), neutral in between. Two
measured behaviours that are counter-intuitive and essential: the hero *halves* on mobile
(48px → 24px, not the usual ~25% step), and body tracking goes positive while weight rises 400 → 500
on small screens — small text is loosened and slightly bolder rather than left alone.

**Backgrounds.** No imagery, no illustration, no texture, no pattern. Three gradients exist on the
whole page: the CTA gradient (`#f97316` → `#ef4444`) and two corner washes at 40–50% opacity
orange fading to transparent. The corner washes are the only decorative fills in the system. Full
bleed is used for section bands and the promo bar; content sits in an 896px marketing measure or a
1280px app measure.

**Animation.** Colour only, 150ms, `cubic-bezier(.4,0,.2,1)` — `color`, `background-color`,
`border-color`, `fill`, `stroke`. The reference has **no scroll animation, no parallax, no
reveal effects** across its full page; that was verified, and recorded as a finding rather than an
omission. The app extends this only where scans genuinely take minutes: a 600ms score-arc reveal
(once only), a 300ms module-result land, and an indeterminate shimmer that loops *only while work is
actually happening*. `prefers-reduced-motion` removes all of it except opacity fades.

**Hover** is a colour step, never a transform, never a shadow change: accent `#fe5a01` → `#fe4a00`,
neutral surfaces step one tint darker, text links move toward `--text-strong`. **Press** is the same
mechanism one step further — no shrink, no scale, no bounce. **Focus** is a 1px ring in
`#fa7014` (`--shadow-focus`), always visible, never removed.

**Transparency and blur.** Used in exactly two places: the corner washes (rgba orange), and severity
backgrounds which are flat tints rather than alpha. There is no glass, no backdrop blur, no
scrim-over-image — because there are no images.

**Cards** are white on a tinted section, an 8px radius, a 0.667px `#e5e7eb` border, and at most
`0 1px 2px rgba(0,0,0,.1)`. Most panels carry the border and no shadow at all. The issue card is the
one exception to square-by-default austerity: a **3px left rule in the severity colour**.

**Layout rules.** 896px marketing container, single column, short line lengths. 1280px app
container, because report tables and code evidence do not fit in 896px. Controls are 48px tall,
always. The marketing page has **no navigation bar** — one page, one action, every section
terminating in the same CTA. Mobile stacks the URL input and its button full-width rather than
sitting them side by side.

---

## Iconography

**The attached sources contain no icon assets** — no icon font, no SVG sprite, no PNG set. The
reference teardown captured tokens, not glyphs, and DESIGN.md lists the reference's own marks
(dotted-grid texture, Product Hunt badge, chat widget) under "what we do not take".

**Substitution, flagged:** this system uses **Lucide** from CDN
(`https://unpkg.com/lucide@latest`) — outline, 2px stroke, 24px grid, square-cornered geometry
that matches a square-by-default system. It is the closest match to the plain technical register and
it is what a Tailwind-derived stack would reach for. Swap it for the real set the moment one exists.

Rules of use: icons are **1.5–2px stroke, currentColor, never filled, never multi-colour**. Every
severity badge pairs an icon with a text label — the icon never carries the meaning alone
(accessibility: we audit it, so we cannot fail it). Sizes are 16px inline with body, 20px in
controls, 24px standalone. **No emoji anywhere.** Unicode characters are used only as typographic
separators (`·` between counter items, `→` in links), never as icons.

---

## Index

| Path | What |
| --- | --- |
| `styles.css` | The one entry point. `@import` list only. |
| `tokens/` | `fonts`, `colors`, `typography`, `radius`, `elevation`, `layout`, `motion`, `dark` |
| `guidelines/` | Foundation specimen cards (Colors, Type, Spacing, Brand) |
| `components/core/` | Button, Input, Card, Badge, SeverityBadge, Eyebrow, TwoToneHeading, PromoBar, StatRow |
| `components/report/` | ScoreArc, ModuleStatus, IssueCard, AttributionMark, VerdictPanel, ProgressRow |
| `ui_kits/theme.jsx` | Shared `useTheme` + `ThemeToggle`; theme persists in `localStorage` under `wa-theme` |
| `ui_kits/marketing/` | Public pages, one shared header and footer: landing, pricing, sign in, register, verify, forgot, reset |
| `ui_kits/app/` | Customer dashboard — collapsible sidebar; new scan, live progress, report, fixes, readiness, usage, billing and plans, profile |
| `ui_kits/admin/` | **Separate** operator console — overview, queue, scans, capabilities, providers, users, plans, margin, audit log, settings |
| `templates/` | `landing-page`, `pricing-page`, `app-dashboard` — starting folders for consuming projects |
| `SKILL.md` | Agent Skills entry point |

### Routing between the two dashboards

The customer dashboard and the operator console are **separate applications**, deliberately: an
operator surface that shares chrome with a customer surface invites acting on the wrong account. The
public footer links to both (`Dashboard`, `Admin console`); each dashboard links back to the other
and to the public site. The operator rail is dark `#1f2937` with an `operator` chip so context is
never ambiguous.

### Dark mode

Every surface reads `:root[data-theme]`. `ThemeToggle` sits in the public header, the customer
sidebar footer, the profile Appearance row, and the operator top bar; each page sets the stored theme
in a head script before first paint, so there is no flash. Dark severity values still need contrast
verification.

### Intentional additions

- **`Eyebrow`, `TwoToneHeading`, `AttributionMark`** — these are named patterns in DESIGN.md
  (§3 eyebrow token, §7 two-tone headline "signature move", §10 attribution marker required by
  FR-032) that had no component form. Wrapping them keeps them from being re-implemented per screen.
- **Lucide icon usage** — see Iconography; no glyph set existed in the sources.

## Open items (carried from DESIGN.md §12, still open)

- Logo and wordmark — undesigned. This system uses plain type. Do not fill the gap from the reference.
- Dark-mode severity values — present in `tokens/dark.css`, **not yet contrast-verified**.
- Hero product screenshot — needs a real report to exist first.
- Empty-state illustration approach — undecided; default is none.
- Tablet type scale (768–1024px) — never captured. Measure before building that range.
- Lexend Deca binaries — not supplied; loaded from Google Fonts pending self-hosting (DESIGN.md §3
  requires zero remote font requests).
