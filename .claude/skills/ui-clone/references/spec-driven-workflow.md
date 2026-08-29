# Spec-driven workflow

Create planning artifacts before implementation. Keep them current as work proceeds.

## specification.md

Must define:

- pages/routes in scope,
- fidelity target,
- user-visible sections,
- animation and interaction scope,
- asset policy,
- backend/CMS/API scope,
- out-of-scope items,
- known blockers.

## plan.md

Must define:

- framework and package manager,
- file architecture,
- dependency decisions,
- design token approach,
- animation architecture,
- responsive strategy,
- testing/comparison strategy,
- review-agent strategy.

## tasks.md

Use section-level tasks. Each task must include:

```yaml
id: HOME-HERO-001
section: Hero
status: pending
depends_on: []
reference_evidence:
  - screenshots/reference/home/1440-hero.png
implementation_files: []
requirements:
  visual:
    - Match headline wrapping and position at all viewports.
    - Match background/media treatment.
  animation:
    - Match entrance timing, stagger, easing, and scroll trigger.
  interaction:
    - Match hover/focus states.
verification:
  visual: required
  animation: required
  interaction: required
  responsive: required
review:
  independent_agent: visual-review-agent
acceptance:
  - Visual diff passes threshold.
  - No console errors.
  - No undocumented missing assets.
```

## progress.md

Track:

- current phase,
- current task,
- approved tasks,
- failed tasks,
- active blockers,
- repair cycles used,
- next action.

## decisions.md

Record every non-obvious deviation from the reference:

- asset replacement,
- package substitution,
- animation approximation,
- responsive compromise,
- backend/mock decision,
- legal constraint.
