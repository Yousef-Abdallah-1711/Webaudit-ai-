# Review protocol

## Visual review

Compare:

- screenshot diff percentage
- bounding boxes of major elements
- typography family, size, weight, line-height, letter-spacing, wrapping
- color values
- spacing and section heights
- image crop/object-position
- shadows, gradients, borders, masks, blend modes
- responsive reflow

Strict pass target: <= 2% diff per viewport/section, with no obvious structural mismatch.

## Animation review

Compare:

- trigger point
- duration
- delay/stagger
- easing
- transform origin
- opacity/clip/mask behavior
- scroll pinning/scrub behavior
- cleanup on resize/navigation

Use video/frame captures or trace observations when available. If exact animation internals are inaccessible, match observable behavior and document inference.

## Behavior review

Verify:

- nav open/close
- hover/focus states
- sliders/tabs/accordions
- form validation/submission behavior
- custom cursor
- smooth scrolling
- modals/overlays
- loading/error states
- mobile menu

## Repair loop

Use this order:

1. fix missing/wrong assets
2. fix layout dimensions and containers
3. fix typography/wrapping
4. fix colors/backgrounds/effects
5. fix responsive breakpoints
6. fix animations
7. fix secondary interactions

Stop only when all acceptance gates pass or a blocker is factual and documented.

## Subagent review prompts

When subagents are available and requested, use focused prompts like:

```text
Review the clone artifacts at specs/<project-name> and the implementation against the reference URL. Focus only on visual fidelity. Report mismatches with file/section evidence and do not modify files.
```

Do not pass the intended answer or your suspected bugs. Use independent review as evidence, then the primary agent decides repairs.
