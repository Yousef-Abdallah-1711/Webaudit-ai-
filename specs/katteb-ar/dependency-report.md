# Dependency report

This is evidence about the reference runtime plus future clone recommendations. No packages were installed for this documentation-only phase.

| Name | Detected or chosen | Evidence | Purpose | Version/range | Install decision | Risk / alternative |
| --- | --- | --- | --- | --- | --- | --- |
| Next.js / React / TypeScript | Chosen for future route | Existing repository framework, per project map | Integrate isolated public route | Existing workspace versions | Reuse; no install | Must inspect route and package conventions first |
| Tailwind CSS | Detected | Tailwind CDN script and utility classes on reference | Reference layout styling | CDN is `tailwindcss.com` (no locked version) | Do not use CDN; follow existing local styling stack | Translate needed layout to current app styles |
| Alpine.js | Detected | `alpinejs@3.x.x` CDN request | Reference-side interaction runtime | 3.x.x | Do not install; implement state in React | Actual usage per control not yet verified |
| GSAP / ScrollTrigger | Not detected | No runtime proof collected | Potential scroll effects | None | No install decision justified | Recheck animation evidence if a section requires it |
| Cairo | Detected | Google Fonts CSS; computed family; weights 400–900 loaded | Arabic typeface | Weights 400,500,600,700,800,900 | License-check and self-host if permitted | Use locally available licensed Arabic font if needed |
| Font Awesome | Detected | CDN stylesheet, 6.4.0; Font Awesome 6 faces loaded | Interface and social icons | 6.4.0 stylesheet | Avoid reference CDN; use local approved icons or SVG | License and coverage review required |
| Browser screenshot/diff tooling | Chosen for future verification | UI Clone workflow | Evidence, visual compare, repair | Existing toolchain | Use available tooling; install only if missing/needed | No visual-diff threshold measured yet |
| Facebook Pixel / Google tag / Cloudflare Insights | Detected | Runtime scripts | Reference analytics | Live external versions | Exclude by default | No need to clone reference telemetry |

## Network sources observed

- Google Fonts stylesheet (`fonts.googleapis.com`)
- Font Awesome CDN (`cdnjs.cloudflare.com`)
- Alpine CDN (`cdn.jsdelivr.net`)
- Tailwind CDN (`cdn.tailwindcss.com`)
- Katteb assets and page script (`katteb.com`)
- Facebook tracking (`connect.facebook.net`)
- Google tag manager (`googletagmanager.com`)
- Cloudflare Insights (`static.cloudflareinsights.com`)

Reference runtime dependency presence is not a recommendation to reproduce the same dependency chain.
