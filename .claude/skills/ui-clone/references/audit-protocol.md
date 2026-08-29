# Audit protocol

Use this checklist during discovery for high-fidelity clones.

## Capture baseline

- Capture full-page and section screenshots for every configured viewport.
- Capture key animation/video evidence when motion affects fidelity.
- Save HTML snapshots when legally and technically possible.
- Record console errors and blocked resources.
- Record browser, viewport, DPR, timezone, and reduced-motion state.

## Visual audit

- Layout: section order, width, height, grid, flex, absolute positioning, overflow, clipping, sticky/pinned behavior.
- Typography: font family, fallbacks, weight, size, line-height, letter spacing, text transform, wrapping, optical alignment.
- Color: CSS variables, exact computed colors, gradients, opacity, blend modes, shadows.
- Assets: images, SVGs, videos, icons, masks, background images, responsive sources, lazy-loading behavior.
- Responsive: breakpoint changes, menu changes, column stacking, hidden/show states, typography scaling.

## Interaction audit

- Header/nav states, mobile menu, dropdowns.
- Hover/focus/active states for buttons, cards, links, inputs.
- Forms: validation, success/error states, disabled/loading states.
- Sliders/tabs/accordions/modals.
- Cursor effects, drag behavior, parallax, scroll progress.
- Route/page transitions if present.

## Animation audit

- Identify libraries: GSAP, ScrollTrigger, Lenis, Swiper, Lottie, Three.js, SplitType/SplitText, Framer Motion, CSS-only.
- Record trigger points, scrub values, pinning, stagger, easing, duration, delay, repeat, yoyo.
- Record initial and final states for each animated element.
- Record reduced-motion behavior or create a safe fallback.

## Dependency audit

For each dependency candidate, record:

- evidence from runtime/network/package clues,
- purpose,
- version if observable,
- proposed implementation package,
- license or replacement risk,
- whether it is required or optional.
