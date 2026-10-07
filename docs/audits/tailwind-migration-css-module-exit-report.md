# Tailwind migration CSS Module exit report

The pre-migration audit counted **66 CSS Modules** in `apps/web`. After Wave 8, **2 remain**. Each is still imported by its listed consumer and contains a CSS feature that Tailwind utilities cannot express on that element.

## Retained special-case modules

| CSS Module | Current consumer and verified use | Why it remains |
| --- | --- | --- |
| `components/auth/AuthShell.special.module.css` | `components/auth/AuthShell.tsx` applies `rtlLayout` to the two-column grid and adds `rtlSingleColumn` when no context is passed. | The `html[dir='rtl']` ancestor selector swaps grid areas and has separate responsive and single-column rules. Tailwind cannot condition these utility rules on that ancestor selector. |
| `components/public/Public.special.module.css` | `components/public/Public.tsx` uses the classes on the mobile drawer and its empty menu-icon `<span>`. | The hamburger strokes are `::before`/`::after` pseudo-elements, and the drawer's closed/open transforms change direction under an `html[dir='rtl']` ancestor. These pseudo-elements and ancestor-conditioned transforms are not expressible with the available utilities. |

## Wave summary

- **Wave 0 — foundation:** established the migration baseline and Tailwind/token utility setup.
- **Wave 1 — shared primitives:** migrated shared UI primitives.
- **Wave 2 — public/marketing:** migrated public and marketing surfaces, including the homepage pricing teaser.
- **Wave 3 — auth:** migrated the auth surface, retaining only the RTL grid-area special case.
- **Wave 4 — dashboard shell:** migrated the dashboard shell and its shared navigation components.
- **Wave 5 — settings/usage/billing:** migrated the customer account, usage, and billing pages.
- **Wave 6 — scan/report/fixes:** migrated scan, report, and fixes surfaces.
- **Wave 7 — admin:** migrated the operator console.
- **Wave 8 — missed pricing page:** migrated the full `/pricing` route page and removed its CSS Module.
