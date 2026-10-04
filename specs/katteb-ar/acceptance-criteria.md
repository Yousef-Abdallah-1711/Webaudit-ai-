# Acceptance criteria

The clone has no passing implementation claims yet. A future implementation must meet all applicable criteria below before it is considered complete.

## Structure and content

- All page sections, header links, conversion surfaces, pricing, FAQ, and footer appear in the documented order.
- Arabic copy is right-to-left and shapes correctly; line breaks and reading order match the reference at target sizes.
- Goal library and dashboard mockups use representative data consistently; unsupported backend actions do not claim success.

## Visual

- At 1440×900 and 390×844, key section bounds, color fields, heading wraps, and principal component positions closely match the reference screenshots.
- Compare at 1280×800, 1024×768, and 768×1024 for responsive transitions; no clipping or horizontal overflow.
- Typography uses the documented licensed local Cairo or approved substitute, with matching weights and line metrics.
- Dark hero and report sections, light section surfaces, purple CTA, lime highlights, cards, borders, radii, and shadows match the documented token map.
- Every visible illustration, logo, icon, and video poster is local and permitted, or has a documented replacement.

## Interaction and accessibility

- Mobile navigation, all tab sets, FAQ items, radios, links, and buttons work with pointer and keyboard.
- Focus is visible; tab semantics and expanded/selected states are exposed to assistive technology.
- Tabs change the matching example, not unrelated page content. FAQ answers open and close predictably.
- Reduced-motion preference leaves all content available and removes nonessential movement.
- Forms validate locally; no backend success is shown without a functioning service.

## Independence and runtime

- Zero runtime requests reach the original reference domain or Google Fonts.
- Required fonts and assets load locally; there are no CORS/font errors or unintended fallback families.
- No console errors, broken images, or failed required requests.
- Any external analytics or tracking is omitted unless separately approved for the target project.

## Evidence

- Save reference and implementation screenshots for every required viewport.
- Provide section/page visual comparison evidence and interaction walkthrough findings.
- Complete font and asset forensic reports and final audit with explicit unresolved limitations.
