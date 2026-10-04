# Asset Inventory

## Existing Fahes material represented

These are content/function references used to compose the standalone artifact; production binaries/components are not imported into the page:

- Existing Fahes wordmark text and simple monogram reference: `apps/web/components/public/Public.tsx` and public header sources.
- Existing Arabic hero, section, FAQ and pricing copy: `apps/web/messages/ar/public.json` and navigation/common message files.
- Existing Fahes audit/report/readiness concepts: public marketing components under `apps/web/components/marketing/`.
- Existing real credit schedule: `packages/config/src/pricing.ts`.
- Existing URL-to-signup handoff contract: `apps/web/lib/hero-scan-handoff.ts`.

## New original artifact-owned visuals

- The Fahes monogram is a CSS-created letter tile, not a copied logo asset.
- The atmospheric hero signal arcs and dots are original inline SVG and CSS radial gradients.
- Report cards, status badges, sample readiness board, comparison cards, workflow tiles and interactive audit-area content are original HTML/CSS compositions filled with Fahes content.

## CSS / inline SVG treatment

- All layout, color, typography fallback, surfaces, gradients, borders, radii, shadows, responsive rules and accessible focus treatment are authored in `index.html`.
- Decorative SVG is inline and original. CSS creates the remaining stars/glows and section transitions.
- No remote fonts, scripts, stylesheets, image URLs, CDN dependencies or runtime requests to Katteb are referenced.

## Reference assets not reused

- Katteb logo and wordmark.
- Goals/tasks thumbnails, product screenshots, video, illustrations and proprietary artwork.
- Third-party logos and reference-hosted assets.
- Font binaries downloaded from the reference site.

## Local font limitation

Cairo is the intended family, based on the measured reference direction. A legal local Cairo font source has not been established. The artifact therefore declares Cairo followed by Noto Sans Arabic and system Arabic-safe fallbacks; actual Cairo rendering is not verified in screenshots.
