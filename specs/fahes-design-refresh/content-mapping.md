# Fahes × Katteb Full Page Translation

**Status:** design specification only. No production UI, tokens, Tailwind, components, routes, translations, backend behavior, dependencies, or deployment changes are authorized by this artifact.

**Direction:** use the measured Katteb Arabic public page as the visual and structural reference; use Fahes as the only source for product meaning, claims, copy, prices, and actions. The reference’s product concepts and media are excluded.

## Content inventory and mapping

| Reference section | Reference purpose | Fahes equivalent | Existing Fahes content source | Decision | Reason |
|---|---|---|---|---|---|
| Header | Brand, primary navigation, language, account and conversion actions | Fahes wordmark; product / how-it-works / pricing; language and theme controls; sign-in / start-free. Move the current “first audit free” promo into the hero eyebrow. | `apps/web/components/public/Public.tsx`; `apps/web/app/[locale]/(public)/LandingPage.tsx`; `apps/web/components/ui/PromoBar.tsx`; `apps/web/messages/ar/navigation.json`; `apps/web/messages/ar/common.json`; `apps/web/messages/ar/public.json` | Adapt | Keep Fahes destinations and the 50-credit offer; the reference header overlays the hero, so show the offer in the hero instead of retaining the separate H15 promo strip. |
| Hero | Large promise and primary input over a full-bleed atmospheric field | Production-readiness promise, Fahes URL scanner, 50 / 5 / 3 proof points | `apps/web/components/marketing/hero.tsx`; `apps/web/messages/ar/public.json`; `packages/config/src/pricing.ts` | Adapt | Keep the real Fahes headline, form handoff and constants; replace H15’s inset Core-and-scanner layout with the centered reference composition. |
| Video introduction | Explain the product through an embedded video | A report-reading demonstration using the existing sample finding | `apps/web/components/marketing/report-showcase.tsx`; `apps/web/messages/ar/public.json` | Adapt | No Fahes marketing video was found in the public page sources. Use the existing labeled sample report; do not invent or embed a video. |
| Task vs. goal comparison | Contrast two reference product concepts | Measured evidence vs. inference; verified vs. unverified; visible failure vs. hidden failure | `apps/web/components/marketing/production-gap.tsx`; `apps/web/messages/ar/public.json`; project rules in `AGENTS.md` | Adapt | Fahes has no goals/tasks product. Its existing production-readiness principles provide a truthful comparison without borrowing those semantics. |
| How goals work | Explain a multi-step product workflow | Audit → understand findings → fix → re-check → readiness decision | `apps/web/components/marketing/loop.tsx`; `apps/web/components/marketing/report-showcase.tsx`; `apps/web/components/marketing/readiness.tsx` | Adapt | Preserve the real four-step audit loop and make the report interpretation/readiness decision explicit using existing content. |
| Goal Room | Show selectable examples and a detailed progress view | Readiness board with audit-area statuses and explicit blockers | `apps/web/components/marketing/readiness.tsx`; `apps/web/components/marketing/proof.tsx` | Adapt | Readiness and per-area evidence are real Fahes concepts. Demo values remain clearly marked illustrative and are not scan results. |
| Daily Report | Present recurring reports with selectable delivery channels | Dark issue/remediation panel: measured finding, source location, copy-ready repair instruction, targeted re-check, plus independent verification of AI-assisted builds | `apps/web/components/marketing/report-showcase.tsx`; `apps/web/components/marketing/loop.tsx`; `apps/web/components/marketing/ai-development.tsx`; `apps/web/components/marketing/copy-prompt-button.tsx` | Adapt | Fahes markets reports, repair instructions and independent verification, not daily reporting or email/Telegram/Slack delivery. The recurring schedule and channels are omitted. |
| Trust / Control | Explain limits and user control | Read-only audit, per-hop request checks, temporary source workspaces, separate report retention | `apps/web/components/marketing/trust.tsx`; `apps/web/messages/ar/public.json` | Keep / adapt | These are existing Fahes claims; use reference card/ledger treatment without importing its claims. |
| Goal Library | Browse examples by category | Five audit areas and their currently documented checks | `apps/web/components/marketing/checks.tsx`; `apps/web/messages/ar/public.json`; `packages/config/src/pricing.ts` | Adapt | Use PERFORMANCE, SECURITY, UI, TESTING and SEO with their real descriptions and credit costs. No goal or task catalog is added. |
| Pricing | Compare the reference’s paid plans | Fahes’s real credit model: one-time free allocation, per-area cost, full-audit bundle, re-check and readiness pass | `apps/web/components/marketing/pricing-preview.tsx`; `packages/config/src/pricing.ts` | Adapt | The public Fahes pricing page’s `$0 / $29 / $99 / $299` values are explicitly described in `PricingPage.tsx` as source placeholders with monetary price points unresolved. Do not show them as real prices. Link to `/pricing` for the existing route; present real credit costs only. |
| FAQ | Resolve purchase and product questions | The six existing Fahes FAQ question/answer pairs | `apps/web/components/marketing/faq.tsx`; `apps/web/messages/ar/public.json` | Keep / restyle | Keep current Arabic answers verbatim in meaning; render as reference-style native disclosure rows. No new FAQ claims. |
| Final goal form | Repeat the conversion form at page end | Fahes scanner URL field and audit CTA | `apps/web/components/marketing/hero.tsx`; `apps/web/lib/hero-scan-handoff.ts`; `apps/web/messages/ar/public.json` | Adapt | Reuse the existing URL-to-signup handoff behavior in the proposal. The form stores `wa-hero-scan-url` and continues to `/signup`; submitting does not itself start an audit. |
| Footer | Brand summary, ordered route groups and legal/social navigation | Fahes wordmark/tagline; product, pricing, account routes; existing footer note | `apps/web/components/public/Public.tsx`; `apps/web/messages/ar/navigation.json` | Adapt | Keep existing Fahes links and only the current product destinations; do not add reference-only social or business links. |

## Verified Fahes content and limits

- Arabic hero: “تظن أن موقعك جاهز؟ أثبت ذلك، ثم أطلقه.” The explanatory copy covers performance, security, design, testing and search visibility; measurement comes before explanation and fixes are re-verified.
- The real hero handoff stores the entered URL in session storage under `wa-hero-scan-url` and navigates to `/signup`. It does not run a scan in the hero.
- Current headline facts are 50 one-time free credits, 5 audit areas and 3 credits for a targeted re-check.
- Real schedule: PERFORMANCE 20, SECURITY 20, UI 25, TESTING 20, SEO 10 credits; all five together cost 80 rather than 95; readiness pass 60 credits.
- Existing report and readiness marketing panels identify their data as illustrative. Any such UI in the artifact keeps that label; it does not assert a real user result.
- A video asset and cash-denominated Fahes plan prices were not established from the current marketing sources. The proposed page does not fabricate either.

## Reference measurements and responsive behavior

The older reference reports and screenshots were used as the baseline. I also inspected the live Arabic page at 1440×900, 1280×800, 1024×768, 768×1024 and 390×844. Browser `innerWidth` is 15 CSS pixels narrower than nominal viewport width because of its vertical scrollbar; reported element bounds below are the live CSS-pixel bounds at each viewport. These measurements describe the reference, not a pixel-match claim for Fahes.

| Nominal viewport | Live page content width | Header | Hero | H1 | Page / responsive observations |
|---|---:|---:|---:|---|---|
| 1440×900 | 1425 | 92px after settling at top | 845px | 60.8 / 79.04px, weight 900 | Centered hero title and bounded prompt; desktop story panels; two 460px pricing cards; 14 / 20px body. |
| 1280×800 | 1265 | 92px | 845px | 60.8 / 79.04px, weight 900 | Same desktop composition; two pricing cards; tabbed room keeps vertical selector beside the detailed panel. |
| 1024×768 | 1009 | 92px | 845px | 60.8 / 79.04px, weight 900 | Desktop header remains; two pricing cards; story demos remain paired, with tighter column proportions. |
| 768×1024 | 753 | 92px | 820px | 51.2 / 66.56px, weight 900 | Hamburger replaces horizontal navigation; story panels lengthen and stack more; goal-room selector becomes a horizontal strip; pricing cards stack to one column. |
| 390×844 | 375 | 91px closed | 656px | 23.424 / 33.9648px, weight 900 | Hamburger, compact brand and free-start action; long sections stack; horizontal tab strips; one pricing card per row; full-width FAQ and footer columns stack. |

Additional observed measurements and behavior:

- H2 at the documented desktop endpoint is 50.4 / 66.528px, weight 900; at 390 it is 29.6 / 39.072px. Body is 14 / 20px, weight 400. The prompt field is 16 / 26px. Cairo weights 400, 500, 600, 700, 800 and 900 are the reference direction.
- At 390 the mobile drawer opens below the 87–91px header, occupies about 318×457px at x≈29/y≈99, overlays the page and locks body scrolling. The closed-state header has a 40×40px menu control. The horizontal-to-mobile header transition is between the inspected 768 and 1024 widths; its exact breakpoint was not isolated.
- Header computed CSS includes a 300ms `cubic-bezier(.4, 0, .2, 1)` transition. Scrolling did not produce an observed header state/class change in the inspected session; do not claim a verified scroll-triggered transition.
- The live goal-room has five tabs. At desktop they appear as a vertical selector (about 270px wide); at 768 and 390 they become a horizontal row (126px high). Selecting the second tab changes both selected state and its associated panel.
- The live report-channel control has three tabs. The live audit-library control showed 12 categories including “most popular”; older `page-map.md` says 11, so the live count supersedes that stale count for current visual notes.
- Pricing shows two side-by-side cards at 1440, 1280 and 1024, then one column at 768 and 390. The 390 pricing section measured about 1,840px high.
- The current live FAQ has eight native disclosure rows (older page-map says seven). The first row was open initially; opening the second closed the first. Use Fahes’s six existing FAQ pairs in the translation.
- The mobile footer becomes a long vertical order; the desktop footer remains a multi-column grid. Reference footer route groups are not copied.
- No meaningful reduced-motion, animation trigger, repeat, scroll-timing or element-specific motion values were verified here. The artifact uses no copied animation and documents motion as unverified; reduced-motion support is included for its own CSS-only treatment.
- Live page heights vary with dynamic panels and disclosure state; use section order and observed responsive transformations rather than presenting full-page height as a fixed token.

## Typography and assets

- Use Cairo as the intended public-marketing family at the measured size/weight relationships, with the current browser/system Arabic sans stack only as a local preview fallback. Do not load Google Fonts or copy reference font binaries.
- A legal/local Cairo font source has not yet been established. Production font packaging remains an approval-stage dependency, not a design-artifact dependency.
- The design artifact uses original CSS and inline SVG ornament only. Reference logo, video, illustrations, screenshots, product mockups, third-party logos and other proprietary assets are not reused.
- Design tokens shown in the artifact are a proposal in the reference color direction. Do not edit the production semantic token system or its `data-theme` architecture before design approval.
