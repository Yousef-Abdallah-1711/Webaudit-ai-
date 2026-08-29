# Task contract

Use this shape in `tasks.md` for every major task:

```yaml
- id: HERO-001
  title: Recreate hero desktop layout
  status: pending
  phase: section
  section: hero
  depends_on:
    - FOUNDATION-003
  reference_evidence:
    - screenshots/reference/home-desktop-hero.png
  implementation_files:
    - app/components/sections/Hero.tsx
    - app/styles/sections/hero.css
  acceptance:
    - Hero headline wraps identically at 1440 and 390 widths.
    - Image positions match reference within 2 px where practical.
    - Entrance animation starts, eases, and ends like reference.
  verification:
    visual: required
    interaction: required
    animation: required
    accessibility: basic
  reviewer: visual-fidelity
```

## Required task groups

- INTAKE
- DISCOVERY
- DEPENDENCIES
- FOUNDATION
- HEADER
- SECTION groups for each discovered section
- FOOTER
- RESPONSIVE
- ANIMATION-INTEGRATION
- VISUAL-COMPARE
- REPAIR
- FINAL-AUDIT

## Section task sequence

For each section:

1. audit reference section
2. implement semantic structure
3. implement desktop styling
4. implement responsive styling
5. integrate assets
6. implement animations/effects
7. test interactions
8. capture implementation screenshots
9. compare
10. repair
11. independent review
12. approve
