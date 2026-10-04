# Animation manifest

## Evidence observed

- Hero art is atmospheric and contains small stars and curved rays; the screenshot establishes its appearance but not whether it is CSS, video, canvas, or a background image.
- Task-versus-goal area includes a “replay” control and progress-like examples, indicating a repeatable demo/timeline.
- Goal-room content is tabbed and displays progress bars/percentages and a daily dashboard.
- Main script URL observed: `https://katteb.com/assets/js/main.js`; Alpine.js 3 CDN script is present. Tailwind CDN runtime is also present. Presence does not prove each interactive element is implemented by those libraries.
- Video button advertises a 5:38 explainer; source/player URL was not confirmed.

## Not yet measured

| Property | State |
| --- | --- |
| Library ownership per animation | Unknown; do not assume GSAP or ScrollTrigger |
| Hero movement / looping | Not measured |
| Scroll reveal/pin/scrub | Not measured |
| Demo replay duration/easing | Not measured |
| Goal progress timing | Not measured |
| Tab transition timing | Not measured |
| Video playback behavior | Not inspected |
| Reduced-motion fallback | Not inspected |

## Future implementation requirements

- Reinspect each animated section before implementation and capture at least initial, midpoint, and final states where motion changes layout/content.
- Record trigger conditions, duration, easing, delay, repeat, pause/resume, and reduced-motion behavior with evidence.
- Keep content understandable with motion disabled; do not animate progress in a way that implies a real outcome.
- Use CSS/React behavior unless runtime evidence demonstrates a need for a dedicated animation package.
