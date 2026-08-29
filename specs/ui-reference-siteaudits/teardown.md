# UI Clone Discovery: siteaudits.ai

**Captured**: 2026-08-23 · **Skill**: `ui-clone` (upstream `98cf482`) · **Method**: Playwright MCP,
computed styles + accessibility tree + full-page metrics

Reference evidence only. Design decisions for our product live in [/DESIGN.md](../../DESIGN.md);
product decisions in [/PRODUCT.md](../../PRODUCT.md).

- Tokens: [design-tokens.json](./design-tokens.json)
- Hero capture: [screenshots/reference/hero-1440.png](./screenshots/reference/hero-1440.png)
- Accessibility tree: [screenshots/reference/a11y-snapshot-home.yml](./screenshots/reference/a11y-snapshot-home.yml)

---

## Page map

Single-page marketing site. `document.scrollHeight` 7134px at 1440×900 — roughly eight screens.

| # | Section | Height | Purpose |
| --- | --- | --- | --- |
| 0 | Promo bar | 50px | Dismissible. Emerald `#10b981`, flash-sale discount code. |
| 1 | Hero | 639px | Centred logo, two-tone H1, subhead, URL input + CTA, Product Hunt badge. **No nav.** |
| 2 | Value band | 2644px | "Time to See What's Really Going on With Your Site" — three long-form prose blocks with repeated `Analyze My Site` CTAs. |
| 3 | Three steps | — | Run audit → get report → follow steps. |
| 4 | Why us | 756px | Three value props: Clear Reports, Actionable Recommendations, Comprehensive Coverage. |
| 5 | Coverage grid | 760px | 11 named audit categories + "More". |
| 6 | Closing CTA | 456px | Repeat of the hero ask. |
| 7 | Footer | — | Four links only: Affiliates, Agencies, Privacy, Terms. |

Routes discovered: `/`, `/login`, `/privacy`, `/terms`, `affiliate.siteaudits.ai`.
`/pricing` **302s to `/login`** — pricing is authenticated-only.

## What the design actually does

Five decisions carry the whole page:

1. **No navigation.** The homepage offers exactly one action. There is no menu to browse, no
   pricing link, no docs. Every section terminates in the same CTA.
2. **Typography is the entire visual system.** One variable family (Lexend Deca, 100–900), no
   imagery in the hero, no illustration. The only decoration is a faint dotted-grid wash behind
   the hero and two orange corner gradients further down.
3. **Square by default.** 215 of ~250 styled elements have `border-radius: 0`. Rounding appears
   only on controls (6px) and cards (8px). This reads as deliberate and is cheap to reproduce.
4. **Depth without shadow.** Three shadows on the entire page. Section separation comes from
   background tint steps — `#ffffff` → `#fafafa` → `#f9fafb`.
5. **Narrow measure.** 896px container. Long-form persuasive copy in a single column, short line
   lengths, generous vertical rhythm.

**Motion**: none worth cloning. Colour-only transitions at Tailwind's default 150ms
`cubic-bezier(0.4,0,0.2,1)`. No GSAP, no ScrollTrigger, no scroll reveals, no parallax. The
ui-clone animation and video pipelines have nothing to capture here — recorded as a gap per the
skill's protocol rather than an omission.

**Voice**: aggressively casual and anti-jargon. "no-BS insights", "the wingman your website needs",
"as easy as pie", "a friendly intervention for your website", "Your Website Called—It Wants a
Promotion". Consumer-SMB register throughout.

## Product model, as observed

| Dimension | What the site shows |
| --- | --- |
| Input | A URL. Nothing else — no repository, no upload. |
| Entry | Free audit, no signup required to trigger it. Classic lead magnet. |
| Monetisation | Per-audit **Pro upgrade**, not a subscription. "UPGRADE ALL YOUR AUDITS TO PRO." |
| Discounting | Aggressive and public — 65% off, coupon `HURRY65`, urgency framing in a top bar. |
| Pricing visibility | Hidden behind login. Deliberate: they want the audit run before the price lands. |
| Coverage claimed | Visual branding, responsive design, accessibility, cookie consent, typography and hierarchy, performance, metadata, interactive elements, navigation, content accessibility, social media, "More". |
| Journey | Three steps, ending at "follow the steps". |
| Channels | Affiliate programme (own subdomain) and an agency track. |
| Support | Live chat launcher. |
| Social proof | One Product Hunt badge, 29 upvotes. No testimonials, logos, or case studies. |

## Where their product stops

Directly relevant to our positioning, and all verifiable from the public site:

- **The journey ends at a report.** Step 3 is "follow the steps to optimize your site". Nothing
  verifies that you did, and nothing re-checks it.
- **No security or automated testing.** The 11 named categories are presentation, performance, SEO,
  and accessibility. No vulnerability scanning, no dependency analysis, no functional testing.
- **URL-only.** No repository or archive input, so no finding can reach the source — no dependency
  CVEs, no bundle analysis, no query-pattern problems.
- **No re-verification and no completion state.** There is no "you are done" moment, which is
  exactly the moment our spec is built around (US2, US3).
- **No stated separation of measurement from AI opinion.** Everything is presented in one
  register.

## Fidelity notes, if a literal clone were ever built

Reproducible from public evidence: full token set, type scale with its tracking, layout measure,
section rhythm, control styling, gradient washes, transition timing.

Not reproducible and not attempted: the wordmark and logo glyph, marketing copy, the dotted-grid
hero texture as an asset, the Product Hunt badge, the chat widget, anything behind `/login`.

Per the skill's asset-independence rule, a build would need Lexend Deca self-hosted (it is
OFL-licensed, so that is permitted) with zero requests to the reference domain.

## Legal boundary

Layout conventions, colour values, type scales, and spacing systems are not protectable and are
normal competitive input. The wordmark, logo, and marketing copy are theirs. This teardown records
them as observations; nothing in [/DESIGN.md](../../DESIGN.md) reuses them.
