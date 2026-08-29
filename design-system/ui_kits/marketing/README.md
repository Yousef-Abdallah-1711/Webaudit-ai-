# Marketing UI kit

Two public surfaces, both cloned from the reference's funnel discipline: **no navigation bar**, one
action, every section terminating in the same CTA.

| File | Screen |
| --- | --- |
| `index.html` | Landing — promo bar, hero, difference, live proof, five areas, fix loop, dark CTA band, footer |
| `Pricing.html` | Public pricing — four tiers, credit schedule |
| `Landing.jsx` | Landing sections + shared `Wordmark` / `Footer` |
| `Pricing.jsx` | Pricing page |

Content measure is 896px throughout except the four-tier grid, which uses the 1280px app measure
because four columns do not fit the marketing measure. Section rhythm is a background tint step
(#ffffff → #fafafa → #f9fafb), never a shadow. The two corner washes appear exactly twice: hero
top-left, final CTA bottom-right.
