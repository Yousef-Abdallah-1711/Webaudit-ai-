# Fahes Full-Page Visual Specification

**Status:** standalone Arabic translation artifact for design review; production implementation is explicitly deferred.

## Visual direction

Katteb Arabic marketing is the visual and structural reference. Fahes supplies all product meaning, copy, features, prices, claims, routes and intended actions. The composition translates the 13 mapped reference sections into Fahes stories. It does not reuse reference product semantics or assets.

## Reference measurements used

Values below are from the documented live reference inspection and are not claims that this artifact reproduces every pixel. The artifact applies the same relationships and composition while adapting widths and copy for Fahes:

| Property | Measured reference | Translation in this artifact |
|---|---:|---|
| Desktop hero | 845px at 1440, 1280 and 1024 widths | 845px minimum; centered copy and input; dark atmospheric surface fades to canvas |
| Tablet hero | 820px at 768 | 820px minimum at the 768 CSS breakpoint |
| Mobile hero | 656px at 390 | 656px minimum at 640 and below |
| Header | 92px desktop/tablet; 91px at 390 | 92px desktop/tablet; 76px below 640 (intentional compact adaptation) |
| H1 | 60.8/79.04px desktop; 51.2/66.56px at 768; 23.424/33.9648px at 390; weight 900 | Same desktop/mobile scale; 768 tablet size is responsive through CSS |
| H2 | 50.4/66.528px desktop; 29.6/39.072px at 390; weight 900 | Same scale, with smaller local variants for dense sub-panels |
| Body | 14/20px, weight 400 | 14px base with section-specific small text for labels and demos |
| Content frame | Reference varies by section and viewport | 960px centered primary content; demo up to 1040px; header up to 1320px |
| Pricing | Two cards at widths 1024 and above; one column at 768 and 390 | Fahes credit schedule presented as one real-price surface and a five-area cost row; stacks at narrow widths |
| Tabs | Goal-room switches vertical at desktop to horizontal on mobile | Fahes area tabs are horizontally scrollable at all sizes and update Fahes panel content |
| Mobile menu | At 390, approx. 318×457px, x≈29/y≈99, overlay and scroll lock | 318px max-width drawer, backdrop, Escape/close controls and scroll lock |

The reference responsive evidence covers 1440×900, 1280×800, 1024×768, 768×1024 and 390×844. Exact source breakpoints between those measured widths were not isolated; artifact breakpoints at 900, 768 and 640 CSS pixels are implementation choices for this review prototype.

## Proposed color tokens

These are artifact-level design values in the reference direction. They are not production semantic tokens and do not change the application theme system.

| Token | Value | Use |
|---|---|---|
| Canvas | `#F8FAFF` | Main page background |
| Hero | `#0C1428` | Header/hero and closing CTA |
| Night | `#070D1C` | Dark remediation band |
| Ink | `#1A2440` | Main light-surface text |
| Secondary | `#4B5674` | Body copy |
| Muted | `#687695` | Supporting labels (reference report lists `#8B95B5`; artifact chooses a darker readable value) |
| Ice | `#EEF3FF` | Alternating section surface |
| Line | `#E7EDFA` | Borders and separators |
| Electric | `#3024F5` | Primary emphasis |
| Electric bright | `#4945FF` | Highlights |
| Electric pulse | `#6765FF` | Atmospheric glow |
| CTA | `#7C5CFF` | Button accent |
| Lime | `#C7FF45` | Small status accent |
| CTA gradient | `linear-gradient(90deg, #2418FF 0%, #4743FF 55%, #7775FF 100%)` | Main calls to action and selected tab |
| Paper | `#FFFFFF` | Cards and fields |
| Success / warning / danger | `#14795B` / `#A55A00` / `#B42335` | Readiness and finding states |

## Type and rhythm

- Arabic target family: Cairo, weights 400, 500, 600, 700, 800 and 900. The preview uses a system fallback stack because a licensed local Cairo source has not been established. No runtime font request is present.
- Hero H1 and section H2 use the measured reference sizes and heavy weight; headings use tight negative tracking and balanced wrapping.
- Base line height is 1.43; explanatory copy uses approximately 1.75–1.9 for Arabic readability.
- Primary surface radii: 12px controls, 16–20px cards, 22–24px demo frames, 28px large surfaces, pill-shaped CTAs and chips.
- Section padding is 108px desktop, 82px at 768, and 53px on narrow phones; the hero and closing bands have their own spacing.
- Cards use cool gray-blue borders, white surfaces and low-opacity navy shadows. Avoid the previous Fahes orange visual direction.

## Section order and treatment

1. Overlay header with Fahes brand, product navigation, account actions and mobile drawer.
2. Midnight hero with free-credit eyebrow, Fahes production-readiness headline, real URL field and measured stats.
3. Framed sample report demonstration.
4. Evidence and readiness comparison using Fahes’s measured-vs-inferred product language.
5. Four-step audit/fix/re-check workflow.
6. Readiness board with explicit illustrative-data label.
7. Dark report/remediation band with measured example, full-copy action and independent AI-build verification statement.
8. Trust and control grid.
9. Five interactive Fahes audit areas.
10. Real credit schedule and bundle costs, with the unresolved cash price caveat.
11. Six current Fahes FAQ pairs.
12. Repeated scanner CTA using the existing signup handoff contract.
13. Fahes footer and existing route groups.

The light / ice / white surfaces are paced by two dark bands (hero and remediation) and a dark closing CTA. No reference animation has been reproduced because triggers and timing remain unverified.

## Responsive intent

- Desktop uses centered bounded content, multi-column report/workflow/trust layouts and an overlay header.
- At 900px and below, the navigation switches to a mobile drawer. At 768px, comparison and report panels stack and the workflow reduces to two columns.
- At 640px and below, header controls compact, scanner fields stack, workflow and footer reflow, section padding contracts, and area tabs remain horizontally scrollable.
- RTL is set on the document. URL/evidence values use LTR isolation for predictable mixed-direction reading.
- Reduced-motion preference is respected by the artifact CSS. This is an artifact accessibility choice, not a copied reference behavior.

## Interactions and functional boundary

- The area tabs switch between the five real Fahes category descriptions and costs.
- FAQ uses native disclosure controls with Fahes’s six existing question/answer pairs.
- The mobile drawer supports open, close, backdrop dismissal, Escape, focus placement and body scroll locking.
- URL forms preserve the existing handoff contract: store `wa-hero-scan-url` in session storage and continue to signup. A local preview does not start a scan or authenticate a user.
- Copy button copies the complete existing Arabic repair instruction; visible card text identifies itself as an excerpt.
- No backend, authentication, scan, account or billing behavior is implemented in this artifact.

## Production boundary

The only intended new deliverables are this specification folder’s design artifacts. No production tokens, Tailwind configuration, components, routes, translations, dependencies or backend behavior are changed by this visual translation.
