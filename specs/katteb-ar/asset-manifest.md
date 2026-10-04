# Asset manifest

Public runtime inventory for [Katteb `/ar/`](https://katteb.com/ar/), captured 2026-10-04. URLs below identify observed sources, not an assertion of reuse permission.

| Asset family | Observed source or count | Use | Next action |
| --- | --- | --- | --- |
| Brand logo | `https://katteb.com/assets/images/katteb-logo.webp?v=2026091` (640×174) | Header/footer wordmark | Replace with a newly drawn typographic equivalent unless a reuse license is obtained |
| Goal thumbnails | `https://katteb.com/chat/assets/lib/goals/<slug>.webp?v=<version>` | Goal-library cards; many examples are present in DOM, loaded lazily | Inventory required cards; license-check or generate equivalent illustrations |
| Task thumbnails | `https://katteb.com/chat/assets/lib/tasks/<slug>.webp?v=<version>` | Cross-promoted task cards | License-check or replace |
| Hero rays/stars | Rendered as hero background layers; exact file/CSS source unresolved | Main visual identity | Inspect computed `background-image`, pseudo-elements and network asset list in implementation phase; produce an original, noninfringing equivalent if uncertain |
| Goal-room/product UI visuals | Product-style dashboard examples and avatar/logo marks in page | Demonstrations of progress/reporting | Recreate as local HTML/CSS UI; do not reuse third-party brand icons without permission |
| Video | 5:38 player surface identified; source URL not captured | Explainer section | Use a licensed/local replacement or non-playing poster with equivalent frame if rights/source remain unclear |
| Cairo font | `https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700;800;900&display=swap` | Arabic and Latin page typography | Confirm license and self-host permitted files; final clone must make no Google Fonts requests |
| Font Awesome 6.4.0 | `https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css` | Interface/social icons | Replace with local, licensed icon package or bundled SVG equivalents |
| Tailwind CDN | `https://cdn.tailwindcss.com/` | Utility CSS | Do not load in final app; translate observed rules into project styles |
| Alpine.js CDN | `https://cdn.jsdelivr.net/npm/alpinejs@3.x.x/dist/cdn.min.js` | Lightweight DOM interaction runtime present | Reimplement needed state in React; exact usage still requires review |
| Main script | `https://katteb.com/assets/js/main.js` | Page interactions and demos | Runtime behavior evidence only; do not copy private/proprietary source |
| Facebook pixel / analytics | `connect.facebook.net`, `googletagmanager.com`, Cloudflare Insights | Third-party analytics/telemetry | Exclude from clone unless the target project independently requires and authorizes equivalent analytics |

## Sample observed media URLs

- Goal examples: `/chat/assets/lib/goals/book-15-sales-calls.webp`, `/chat/assets/lib/goals/ads-return-3x.webp`, `/chat/assets/lib/goals/youtube-1000-subscribers.webp`, `/chat/assets/lib/goals/rank-10-keywords-page-one.webp`, `/chat/assets/lib/goals/double-store-revenue.webp`, `/chat/assets/lib/goals/collect-every-overdue-invoice.webp`.
- Task examples: `/chat/assets/lib/tasks/find-50-leads.webp`, `/chat/assets/lib/tasks/product-video.webp`, `/chat/assets/lib/tasks/competitor-price-check.webp`, `/chat/assets/lib/tasks/reply-to-reviews.webp`.
- The goal list exposes numerous additional `/goals/<slug>.webp` variants, including sales, leads, social, content, SEO, commerce, service, operations, research, and finance. The complete list was not verified for load success because the library is lazy-loaded.

## Independence gate for a later clone

- No requests to `katteb.com` or its subdomains at runtime.
- No Google Fonts or other remote font requests.
- No unlicensed logo, photograph, illustration, video, or third-party mark.
- All required imagery is local or replaced with an explicitly documented equivalent.
- Verify font loading, computed family, and console/network failures before final approval.
