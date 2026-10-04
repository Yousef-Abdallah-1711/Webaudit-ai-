# Decisions

| ID | Decision | Reason / evidence | Revisit when |
| --- | --- | --- | --- |
| D-001 | Keep this work in `specs/katteb-ar/` and separate from approved product design | Katteb is an external reference, not WebAudit AI design authority | If a product feature intentionally adopts any pattern, follow the project’s design governance separately |
| D-002 | Deliver Markdown artifacts only in this phase | User explicitly requested clone details and everything in `.md` files | If the user later requests implementation, continue from `progress.md` |
| D-003 | Use existing WebAudit app framework for any later implementation | Project map identifies Next.js 15 / React 19 app | Verify current route and package state before implementation |
| D-004 | Treat token values as evidence, not a new reusable product system | Values were extracted from public browser runtime | Recheck if later screenshots/route state reveal theme variation |
| D-005 | Do not reuse logo, video, or illustration assets until rights are confirmed | Public availability does not establish a license | License proof or documented replacement assets become available |
| D-006 | No animation package selected yet | Runtime script presence does not prove a GSAP/ScrollTrigger requirement | Animation inspection demonstrates a material need |
| D-007 | Route, tabs, accordion, and form behavior are documented as visible affordances only | No private backend/API access; no form was submitted | A permitted frontend implementation needs verified interaction behavior |

## Known deviations / approximations

- No implementation has been created, so there are no visual approximations to report.
- Background artwork source, complete lazy-loaded asset inventory, tablet breakpoints, and animation timing remain unresolved.
