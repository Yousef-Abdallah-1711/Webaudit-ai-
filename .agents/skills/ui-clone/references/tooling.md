# Tooling and dependency policy

## Preferred MCP/tool stack

Use the best available equivalent for each role:

- Browser / Playwright MCP: navigation, screenshots, click/type/scroll, visual regression, interaction tests.
- Chrome DevTools MCP: DOM inspection, computed styles, console logs, network requests, performance traces, runtime globals.
- Filesystem/shell: project creation, package installation, test/build execution, artifact generation.
- Image generation: recreate safe bitmap assets only when direct asset use is not licensed or technically unavailable.
- Subagents: independent review passes, not uncontrolled simultaneous editing of the same files.

## Dependency detection

Create `dependency-report.md` with this schema for every dependency:

```text
name:
detected_or_chosen:
evidence:
purpose:
version_or_range:
install_command:
configuration_notes:
license_or_asset_risk:
alternative_if_not_installed:
```

Only install a package when at least one is true:

- detected on the reference site and needed for parity
- required by the chosen framework/build system
- materially reduces fidelity risk for a detected behavior

Do not install random animation/UI packages because they are popular.

## Common runtime evidence

- `window.gsap`, `ScrollTrigger`, minified GSAP script URLs: use `gsap` and register plugins.
- `.swiper`, Swiper globals, swiper CSS: use `swiper`.
- `lenis`, transform-based smooth scroll, RAF scroll driver: use `lenis`.
- split text wrappers or SplitType script: use `split-type` or implement equivalent.
- canvas/WebGL hero, Three globals: use `three` only if canvas behavior is real.
- Lottie JSON/network traces: use `lottie-web`.

## Installation behavior

If `--install` is present, install after `dependency-report.md` is written. If network/package installation fails, document the exact error and continue with a no-install fallback only if parity can still be attempted.
