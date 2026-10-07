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

## Auth visual-system alignment — 2026-10-07

The user authorized a focused visual alignment of `/login`, `/signup`, and the shared auth routes after
reviewing the approved landing refresh. Auth business logic and security behavior remain frozen.

### Root cause and route behavior

- Auth routes render through `(auth)/layout.tsx`, which used `MinimalAuthHeader` and `AuthShell`
  directly instead of the `PublicPage` composition. This intentionally avoided the public header's
  duplicate sign-in/signup actions and mobile drawer, but also omitted `PublicFooter`.
- `AuthFrame` used the shared generic `Button` primary variant. That variant reads the legacy orange
  `--accent`; public CTAs layer on `marketingPrimaryCta` (`--gradient-cta-marketing`). Auth therefore
  bypassed the current action recipe even though the shared button itself was current.
- `AuthContextPanel` used the generic inverse surface, and auth typography/forms used product defaults
  rather than the approved Fahes marketing font and surface roles.
- The shared locale switch computed `/ar/<auth-path>` through `next-intl/navigation`, but those
  paths are outside the route matcher's supported public-page set and no `[locale]` auth route exists.
  Clicking Arabic from `/login` therefore reached a 404. Runtime checks confirmed `/login` and
  `/signup` are the supported paths; the Arabic locale is selected through the existing `wa-lang`
  cookie/local-storage preference without changing the auth pathname.

### Chosen alignment

- Keep a minimal auth header built from the shared wordmark and theme/language controls. Reusing the
  full `PublicHeader` would duplicate auth actions and introduce its mobile drawer into the focused
  form flow.
- Reuse `PublicFooter` because the approved auth artboards use `PublicPage`, which includes the shared
  footer. The auth footer adds product and pricing navigation without duplicating the form action in
  the header.
- Keep the existing auth form structure, OAuth action, and the semantic pass/blocked/warning/error
  colors. Apply existing Fahes marketing tokens and the `marketingPrimaryCta` recipe to auth surfaces
  and actions; do not change the global `--accent` token or generic Button behavior.
- Keep auth pathnames unprefixed. The shared language toggle updates the existing locale store on
  auth routes without asking next-intl to navigate to unsupported prefixed paths. Other routes keep
  their existing locale-prefix navigation behavior.
