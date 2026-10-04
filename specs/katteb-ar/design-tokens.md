# Design tokens — runtime extraction

Source: public page runtime at [katteb.com/ar](https://katteb.com/ar/), captured 2026-10-04. `Exact` means directly observed as a CSS custom property or computed browser value. `Sampled` means the value belongs to the inspected element/state. Do not fill gaps from guesswork.

## Brand and surface colors

| Token / role | Value | Evidence |
| --- | --- | --- |
| `--kb-cloud` / page canvas | `#F8FAFF` | Exact CSS custom property; body background `rgb(248, 250, 255)` |
| `--kb-midnight` / hero night | `#0C1428` | Exact custom property; hero background `rgb(12, 20, 40)` |
| Daily-report dark band | `#070D1C` (`rgb(7, 13, 28)`) | Sampled computed section background |
| Main ink / body text | `#1A2440` (`rgb(26, 36, 64)`) | Sampled computed body text |
| `--kb-ink-2` / secondary text | `#4B5674` | Exact CSS custom property |
| `--kb-ink-3` / muted text | `#8B95B5` | Exact CSS custom property |
| `--kb-lime` / lime highlight | `#C7FF45` | Exact CSS custom property; used on small “new”/status accent |
| `--kb-electric` / blue-violet | `#3024F5` | Exact CSS custom property |
| `--kb-electric-bright` | `#4945FF` | Exact CSS custom property |
| `--kb-electric-pulse` | `#6765FF` | Exact CSS custom property |
| Primary hero goal button | `#7C5CFF` (`rgb(124, 92, 255)`) | Sampled computed button background |
| `--kb-ice` | `#EEF3FF` | Exact CSS custom property |
| `--kb-line` and `--kb-mist` | `#E7EDFA` | Exact CSS custom properties |
| Light control border | `#E3E9F6` (`rgb(227, 233, 246)`) | Sampled computed border, e.g. replay control |
| White | `#FFFFFF` | Observed in headings, cards, and primary controls |

The common shades in this table are confirmed; the page also uses status greens, translucent white borders, gradients, and numerous one-off neutral shades. The browser color-frequency scan found common values including `#2F6B00`, `#62C400`, `#EAFBD0`, `#EDF1F9`, and `#EDF1F8`; their component semantics need targeted confirmation before tokenization.

## Gradient and atmospheric treatment

| Token | Value |
| --- | --- |
| `--kb-gradient` | `linear-gradient(90deg, #2418FF 0%, #4743FF 55%, #7775FF 100%)` |

Hero art combines a nearly black navy field, fine star-like dots, wide curved blue/violet light rays rising from the lower edge, and a pale fade into the following section. Screenshot evidence is in the reference captures. The exact layered background image/gradient source is not fully distinguished yet; treat decorative rays as an asset/dependency investigation item, not as a single confirmed CSS gradient.

## Typography

| Element / role | Desktop at 1440 | Mobile at 390 | Weight and notes |
| --- | --- | --- | --- |
| Body | 14px / 20px | 14px / 20px | 400; `Cairo, system-ui, sans-serif` |
| Hero `h1` | 60.8px / 79.04px | 23.424px / 33.9648px | 900; normal tracking; two lines at both captured sizes |
| Standard section `h2.hg-h2` | 50.4px / 66.528px | 29.6px / 39.072px | 900; normal tracking |
| Hero action buttons | 13.5px / 20px | 13.5px / 20px | 800 |
| Prompt textarea | 16px / 26px | 16px / 26px | 400; placeholder and content contrast against dark/translucent surface |

Remote stylesheet observed: Google Fonts CSS for Cairo weights 400, 500, 600, 700, 800, and 900. Computed font and all loaded Cairo weights were available in the captured runtime. A future clone must self-host only if license terms allow; otherwise select and document a metrically close licensed substitute.

## Shape, border, and elevation

| Component | Measured style |
| --- | --- |
| Hero goal action | Pill radius `9999px`; purple fill; white text; shadow `rgba(124, 92, 255, 0.9) 0px 14px 34px -16px`; 108×40px at both inspected widths |
| Comparison replay button | 999px radius, white surface, `#E3E9F6` border, 117×36px in observed state |
| Header | Transparent over hero, absolute positioning; no shadow in initial state |
| Prompt card | Translucent navy/purple fill with a thin light border and large rounded corners, visible in both screenshots; exact computed radius/border requires a selector-level follow-up |

## Layout and breakpoints

- Hero uses top padding classes equivalent to 144px on small screens and 192px from the `md` breakpoint, with bottom padding 96px / 144px.
- At 1440, the nav is a horizontal row; at 390, its menu links are hidden behind the hamburger control.
- Captured hero section height: 845px at 1440 and 656px at mobile.
- Main headings have a max width around 760px in desktop samples; hero content is bounded to a centered region.
- CSS utility classes indicate Tailwind breakpoints (`sm`, `md`, `lg`); exact custom breakpoint overrides have not been exhaustively audited. Standard utility breakpoints are evidence only for used classes, not a complete page-wide breakpoint contract.
- RTL is structural, not merely text-aligned: preserve `dir="rtl"`, Arabic shaping, logical margins/padding, tab order, and icon direction.

## Motion values still unknown

Animation durations, easing, stagger intervals, scroll trigger offsets, and reduced-motion behavior have not been measured. See [animation-manifest.md](animation-manifest.md); do not treat screenshot movement or class naming as proof of a particular library.
