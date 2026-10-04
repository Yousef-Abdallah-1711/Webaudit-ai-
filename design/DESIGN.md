# WebAudit AI — Design System

**Version** 3.0 · **Date** 2026-08-23 · **Status** Approved and vendored · **Governs** constitution v1.1.0 (Design Adherence)

The design system is **code**, vendored at [design-system/](design-system/). This document is the
map and the reasoning; the files are the truth. Where they disagree, the files win.

| | |
| --- | --- |
| Tokens | [design-system/tokens/](design-system/tokens/) — 8 files, 97 declared tokens |
| Components | [design-system/components/](design-system/components/) — 15, each with `.jsx` + `.d.ts` + `.prompt.md` |
| Screens | [design-system/ui_kits/](design-system/ui_kits/) — 26 across marketing, app, admin |
| Guidelines | [design-system/guidelines/](design-system/guidelines/) — 17 specimen cards |
| Baselines | [design-system/reference-pages/](design-system/reference-pages/) — runnable exports for visual diff |
| Adherence rules | [design-system/_adherence.oxlintrc.json](design-system/_adherence.oxlintrc.json) — 33 lint rules |
| Screen → route → task | [design/screen-map.md](design/screen-map.md) |

**Lineage.** v1.0 was a teardown of [siteaudits.ai](https://www.siteaudits.ai/) — runtime-extracted
tokens, preserved as historical evidence at
[specs/ui-reference-siteaudits/](specs/ui-reference-siteaudits/teardown.md). v3.0 is sourced from our
own built system, which was generated *from* v2.0 and therefore carries the same measured values
rather than a reinterpretation of them.

---

## 1. Thesis

**We are a diagnostic instrument, not a growth hack.** The product tells people their site is
insecure, slow, or broken and then asks them to act. One constraint decides most of the visual
language: *findings must read as credible.*

Three consequences:

1. **Evidence outranks decoration.** Screenshots, headers, traces, and diffs are the visual
   interest. Nothing is layered on top of them.
2. **Severity is the only thing that shouts.** Colour is spent almost entirely on severity.
3. **The state of the work is always visible.** Users live in a red-to-green loop across days.

---

## 2. Colour

Source of truth: [design-system/tokens/colors.css](design-system/tokens/colors.css).

### Brand — one accent, whole product

```css
--accent: #fe5a01;  --accent-hover: #fe4a00;  --accent-ring: #fa7014;
```

CTA fill, the emphasised half of a two-tone headline, the focus ring. Nothing competes with it.

### Severity — a separate scale that may never use the accent

```css
--sev-critical: #b91c1c;  --sev-high:     #c2410c;  --sev-medium:   #a16207;
--sev-low:      #4d7c0f;  --sev-info:     #52525b;  --sev-resolved: #047857;
```

**The accent means "clickable" everywhere.** If `high` severity were also brand orange, a severity
badge and a CTA would be indistinguishable and the scale would stop working. `--sev-high` is
`#c2410c` — deeper, browner, still hot, visibly not the accent. This rule is a comment in
`colors.css` and is enforced by the adherence linter.

`--sev-resolved` and `--sev-low` are deliberately different greens: "verified fixed" and "minor
issue" must never be confusable on the fixes board.

**Severity is never colour alone** — every badge pairs an icon with a text label. We audit
accessibility; failing it ourselves would be indefensible.

### Text, surfaces, borders

```css
--text-strong: #111827;  --text-primary: #1f2937;  --text-secondary: #6b7280;
--text-zinc:   #3f3f46;  --text-muted:   #737373;  --text-on-accent: #fafafa;

--surface-page: #ffffff;  --surface-raised: #fafafa;
--surface-sunken: #f9fafb; --surface-inverse: #1f2937;

--border-subtle: #e5e5e5; --border-default: #e5e7eb; --border-width: 0.667px;
```

`--text-on-accent` is `#fafafa`, not pure white — measured. **Borders are 0.667px**, a sub-pixel
hairline; at 1px the interface reads visibly heavier.

Dark mode: [design-system/tokens/dark.css](design-system/tokens/dark.css). Severity hues lighten and
desaturate rather than inverting, so the scale keeps its order. **Dark severity values are not yet
contrast-verified** — T228.

---

## 3. Typography

Source: [tokens/fonts.css](design-system/tokens/fonts.css),
[tokens/typography.css](design-system/tokens/typography.css).

```css
--font-sans: "Lexend Deca", system-ui, sans-serif;   /* variable 100–900 */
--font-mono: "JetBrains Mono", ui-monospace, monospace;
```

One family for everything — no serif, no separate display face.

**Mono marks machine truth.** Headers, selectors, file paths, measured values. Mono means *we
observed this*; sans means *we concluded this*. This is the typographic expression of the
constitution's measured-versus-inferred split, and it is load-bearing, not decoration.

### Scale — desktop (measured at 1440)

| Token | Size / line | Weight | Tracking |
| --- | --- | --- | --- |
| `--type-display` | 48 / 48 | 700 | **−1.2px** |
| `--type-h2` | 36 / 40 | 700 | **−0.9px** |
| `--type-h3` | 30 / 36 | 700 | normal |
| `--type-card-title` | 24 / 32 | 600 | normal |
| `--type-lead` | 20 / 28 | 400 | normal |
| `--type-body-lg` | 18 / 28 | 500 | normal |
| `--type-body` | 16 / 24 | 400 | normal |
| `--type-small` | 14 / 20 | 400 | normal |
| `--type-eyebrow` | 15.2 / 20 | 700 | **+1.52px** |

### Scale — mobile (measured at 390)

| Token | Desktop | Mobile | Tracking |
| --- | --- | --- | --- |
| `--type-display-mobile` | 48 / 48 | **24 / 32** | −0.6px |
| `--type-h2-mobile` | 36 / 40 | **30 / 32** | −0.75px |
| `--type-body-mobile` | 16 / 24 | **14 / 20** | **+0.35px**, weight 500 |

Two counter-intuitive measured behaviours, and the reason a desktop-only build is incomplete:

1. **The display size halves** — 48 → 24px, not the usual ~25% step. It keeps a long headline to two
   or three lines on a phone instead of six.
2. **Body tracking goes positive** and weight rises 400 → 500. Small text is loosened and slightly
   bolder rather than left alone.

The signature of the system is tracking *direction*: negative on display, positive on small and
uppercase, neutral between.

> ⚠️ **These mobile tokens are defined in the vendored export but no media query applies them.**
> T126 wires the `@media (max-width:640px)` block. Until then mobile renders at desktop sizes.

---

## 4. Radius, elevation, space

```css
--radius-none: 0;      /* default */
--radius-control: 6px; /* buttons, inputs */
--radius-card: 8px;    /* cards, panels */
--radius-pill: 9999px; /* badges, chips */
```

**Square by default.** 215 of ~250 styled elements carry zero radius. Rounding is reserved for
controls and cards. If a new element does not obviously need rounding, it gets `0`. This does more to
produce the system's feel than any colour choice.

**Depth comes from tint, not shadow** — `#ffffff` → `#fafafa` → `#f9fafb`. Three shadows exist in
total ([tokens/elevation.css](design-system/tokens/elevation.css)). Reach for a tint step before a
shadow.

Space: 4px base, geometric `4 8 12 16 24 32 48 64 96 128`. Controls are **48px tall, always**.

---

## 5. Layout

```css
--container-marketing: 896px;   /* single column, short measure */
--container-app:      1280px;   /* reports need tables and code */
```

Breakpoints `640 / 768 / 1024 / 1280 / 1536`. The marketing page has **no navigation bar** — one
page, one action, every section terminating in the same CTA. Mobile stacks the URL input and its
button full-width.

**The operator console is a separate application** from the customer app, deliberately: shared
chrome invites acting on the wrong account. Dark `#1f2937` rail with an `operator` chip.

---

## 6. Components

15 components in [design-system/components/](design-system/components/). Each ships three files:
`.jsx` (reference), `.d.ts` (prop contract), **`.prompt.md` (usage rules and the reasoning)**.

Read the `.prompt.md` before porting — it carries constraints invisible in the code.

**Core** — Button, Input, Card, Badge, Eyebrow, StatRow, PromoBar, TwoToneHeading, SeverityBadge

**Report** — ScoreArc, ModuleStatus, IssueCard, AttributionMark, ProgressRow, VerdictPanel

Three exist because DESIGN.md v2 named them as patterns with no component form: `Eyebrow`,
`TwoToneHeading`, and `AttributionMark`. Wrapping them stops them being re-implemented per screen.

### The six that carry the product

| Component | Requirement it keeps |
| --- | --- |
| `ScoreArc` | Animates once only. Shows delta against baseline. |
| `ModuleStatus` | Five states; `degraded` must not resemble `complete` — FR-053 |
| `IssueCard` | 3px severity left rule; attribution always visible — FR-032 |
| `AttributionMark` | `measured` vs `ai-judgment`, never hover-revealed — SC-006 |
| `VerdictPanel` | `go` / `no-go` with named blockers — FR-070 |
| `ProgressRow` | Elapsed time, safe-to-close, honest shimmer — FR-044 |

The issue card is the one exception to square-by-default austerity: a 3px left rule in the severity
colour.

---

## 7. Motion

```css
--duration: 150ms;  --easing: cubic-bezier(.4, 0, .2, 1);
```

**Colour only** — `color`, `background-color`, `border-color`, `fill`, `stroke`. Hover is a colour
step, never a transform, never a shadow change. Press is the same mechanism one step further — no
shrink, no scale, no bounce. Focus is a 1px `#fa7014` ring, always visible, never removed.

No scroll animation, no parallax, no reveal effects. Extended only where scans genuinely take
minutes: a 600ms score reveal (once), a 300ms module land, and an indeterminate shimmer that loops
**only while work is actually happening**. A fake progress bar on a product that measures honesty is
a contradiction.

`prefers-reduced-motion: reduce` removes all of it except opacity fades.

---

## 8. Voice

Plain, specific, never cute. Say the consequence.

| Don't | Do |
| --- | --- |
| "Uh oh, your site needs some love!" | "3 critical issues could expose user data." |
| "Your website called—it wants a promotion." | "Your site fails at 200 concurrent users." |
| "Something went wrong" | "The security audit could not finish: the site refused our requests. You were not charged." |

Sentence case everywhere; uppercase only on the eyebrow token. Second person for the user's actions,
first person plural only for platform commitments. **No emoji.** No exclamation marks outside the
readiness verdict. No "AI-powered" as a value claim.

**Admit weakness in the product's own voice.** A degraded area says exactly what is missing, in
words. That honesty is a brand asset.

Two rules from the constitution: never overstate confidence, and **never claim a fix we did not
verify** — the word "fixed" appears only after a check passed.

---

## 9. Enforcement

Design adherence is machine-checked, not trusted.

**`pnpm lint`** runs [_adherence.oxlintrc.json](design-system/_adherence.oxlintrc.json) — 33 rules:

- `Raw hex color — use a design-system color token via var()`
- `Raw px value — use a design-system spacing token via var()`
- `Font not provided by the design system`
- `<IssueCard> attribution must be one of 'measured' | 'ai-judgment'`
- `<ModuleStatus> state must be one of 'waiting' | 'running' | 'complete' | 'degraded' | 'not-applicable'`

The last two are notable: **the linter enforces FR-032 and FR-053.** A model cannot ship an
unattributed issue card or a fourth module state.

**`pnpm test:visual`** diffs every ported surface against
[reference-pages/](design-system/reference-pages/) at 1440 and 390, threshold ≤0.5%.

Both must pass before a frontend task is complete. See
[quickstart.md](specs/001-webaudit-mvp-baseline/quickstart.md) Scenario 11.

---

## 10. Open items

| Item | Status | Task |
| --- | --- | --- |
| Mobile media query | Tokens defined, never applied | T126 |
| Self-hosted fonts | Loads from Google Fonts — violates §3 | T127 |
| Local icons | Loads Lucide from unpkg CDN | T247 |
| Dark severity contrast | Values exist, unverified | T228 |
| Annotated screenshot | **No design** — blocked, do not invent | T143 |
| Design intent questionnaire | **No dedicated screen** | T201 |
| Tablet 768–1024 scale | Never measured; interpolated | — |
| Logo and wordmark | Undesigned by decision. Plain type: "WebAudit" + accent "AI". Do not take one from the reference. | — |

The first three are the same class of problem: a product that reports on third-party requests must
not make them. Fixing them is not polish.
