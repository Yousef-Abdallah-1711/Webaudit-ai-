# UI Clone workflow

## Artifact layout

Create all clone planning and evidence under:

```text
specs/<project-name>/
  specification.md
  plan.md
  tasks.md
  research.md
  progress.md
  page-map.md
  design-tokens.json
  asset-manifest.json
  dependency-report.md
  interaction-manifest.json
  responsive-matrix.md
  acceptance-criteria.md
  decisions.md
  screenshots/
    reference/
    implementation/
    diff/
    overlays/
  reports/
    visual-fidelity.md
    interaction-fidelity.md
    animation-fidelity.md
    performance.md
    accessibility.md
    final-audit.md
```

## Phase details

### 0. Intake

Record:

- reference URL and route list
- output framework
- exact local target directory
- viewports
- fidelity threshold
- whether package install is allowed
- whether backend behavior must be mocked or integrated
- legal/asset constraints

### 1. Discovery

Collect:

- full-page and viewport screenshots
- DOM map and section boundaries
- computed typography, colors, spacing, container widths, shadows, borders, gradients
- image/video/icon inventory
- CSS files and runtime script URLs
- animation libraries and global objects
- scroll positions for important visual states
- hover/focus/active states
- form and API behavior

### 2. Planning

Generate one task group per page and section. Do not create vague tasks like "make it better." Every task needs a reference artifact, acceptance criteria, and verification method.

### 3. Build

Build from shared foundations first:

1. reset/base CSS
2. fonts
3. design tokens
4. layout/container system
5. shared UI primitives
6. animation utilities
7. header/footer/navigation
8. sections one by one

### 4. Compare and repair

For every section and viewport:

1. capture implementation screenshot
2. create visual diff
3. list mismatches by priority
4. repair the highest-impact mismatch
5. re-capture and compare
6. approve only when thresholds pass

### 5. Final audit

Verify:

- all sections approved
- all required viewports pass
- no console errors
- no missing assets
- no unintended horizontal overflow
- animations do not conflict across sections
- reduced motion path exists
- final report states exact remaining gaps
