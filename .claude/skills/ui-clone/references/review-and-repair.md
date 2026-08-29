# Review and repair

The clone is not complete until the final audit passes or a blocker is documented.

## Section review loop

For every section:

1. Capture reference and implementation screenshots at all configured viewports.
2. Compare dimensions, text wrapping, colors, spacing, shadows, media crop, and z-index layering.
3. Test interactions and animation states.
4. Write findings to `reports/visual-fidelity.md` or section notes.
5. Repair the highest-impact differences first.
6. Repeat until the section passes or `--max-repair-cycles` is reached.

## Full-page review loop

After sections pass:

- capture full-page screenshots,
- compare screenshot diffs,
- test scroll from top to bottom,
- test mobile navigation,
- test all visible interactive controls,
- check console/network errors,
- check layout shift and overflow,
- check reduced-motion behavior.

## Pass criteria

Strict mode defaults:

- full-page screenshot diff <= 2% unless the user sets another threshold,
- key section screenshot diff <= 1.5%,
- no text wrapping mismatches in hero/headline/key CTAs,
- no missing visible assets,
- no unapproved color/font substitutions,
- no broken interactions,
- no console errors caused by the implementation.

## Repair priority

Fix in this order:

1. structure and section dimensions,
2. typography and wrapping,
3. major colors/backgrounds/assets,
4. spacing and alignment,
5. animation timing and scroll triggers,
6. hover/focus/detail states,
7. performance/accessibility cleanup.

## Final audit report

`reports/final-audit.md` must include:

- reference URL/source,
- implementation path,
- command/options used,
- pages and sections completed,
- dependencies installed and why,
- screenshots compared,
- diff results,
- interaction results,
- animation results,
- accessibility/performance notes,
- remaining gaps/blockers,
- exact local run command.
