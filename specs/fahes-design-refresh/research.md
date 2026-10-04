# Fahes Design Refresh — Implementation Decision

## Decision record

**Decision date:** 2026-10-04  
**Status:** Approved for production implementation  
**Authority:** User approval in `specs/fahes-design-refresh/index.html` and the associated implementation request.

The approved Arabic Fahes artifact is the visual and structural authority for the public landing route.
The product remains Fahes: content, service claims, real credit costs, authentication, and the URL-to-signup
handoff come from the existing application. This is a translation of the approved visual direction, not a
copy of Katteb's product meaning, assets, or brand.

### Scope and implementation boundaries

- Apply the approved full-page order, responsive geometry, semantic color palette, Cairo marketing type,
  header treatment, report sample, readiness example, remediation band, area selector, pricing, FAQ, and
  final scan handoff to `/` and `/ar`.
- Keep pricing values tied to `@webaudit/config`; keep the scan URL in the existing tab-scoped handoff and
  continue to `/signup` without starting a scan in the hero.
- Keep locale switching, theme switching, mobile-menu keyboard/focus behavior, footer routes, and auth
  routes operational.
- Implement tokens in the app's own token files and semantic Tailwind aliases. `design-system/` remains
  read-only and is not imported at runtime.
- Retain the established product severity colors and meanings for sample findings. The Fahes electric
  colors are reserved for the marketing direction and interactions.

### Verification boundary

The artifact's former review record noted that direct browser access to its local `file:` URL was blocked.
That restriction does not block normal production-route checks. Implementation verification uses the
approved visual specification, generated production screenshots, responsive geometry checks, translation
parity, type checking, and the relevant route/interaction tests. A claim of pixel-level image diff against
the original artifact requires approved screenshot evidence for that artifact.
