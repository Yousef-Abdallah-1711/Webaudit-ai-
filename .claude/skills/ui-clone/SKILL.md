---
name: ui-clone
description: One-command, spec-driven, high-fidelity website cloning workflow. Use when Codex is asked to clone, recreate, copy, match, reverse-engineer, or rebuild a public website/page with pixel-level UI fidelity, responsive behavior, animations, GSAP/ScrollTrigger effects, runtime interactions, assets, dependency detection, visual comparison, repair loops, and independent review agents.
---

# UI Clone

## Primary command

Use one command for the whole workflow:

```text
/ui-clone <reference-url-or-local-html> --name <project-name> [options]
```

This command must run the complete pipeline:

```text
intake -> discovery -> spec -> plan -> tasks -> install -> build section-by-section -> compare -> repair -> independent review -> final audit
```

Do not expose separate normal commands for review, repair, or resume. Those are internal stages of `/ui-clone`. If work is interrupted, rerun the same command with the same `--name`; continue from `specs/<project-name>/progress.md`.

## Required behavior

Treat visual fidelity as the main deliverable. Build a real responsive implementation, not a static screenshot. Match layout, color, typography, spacing, assets, animation timing, scroll effects, hover/focus states, loading states, and breakpoints.

Use public runtime evidence from the reference site. Do not claim access to private source code, databases, proprietary build files, or hidden CMS data. Recreate behavior from observable output. Use licensed assets only; if rights are unclear, generate equivalent replacement assets and record the substitution.

If the user asks for "100%," interpret it as a strict fidelity target:

- static visual diff under the configured threshold,
- typography and wrapping matching at each viewport,
- section dimensions within 1-2 px where practical,
- animation timing within about 50 ms where observable,
- no console errors,
- no broken responsive states,
- no missing visible interactions.

If exact matching is impossible because of inaccessible private assets, paywalled resources, anti-bot protection, third-party credentials, canvas/WebGL internals, or legal restrictions, record the blocker and implement the closest observable equivalent.

## Default options

When the user does not specify options, use:

```text
--fidelity strict
--framework auto
--install true
--review-agents true
--repair-until-pass true
--viewports 1440x900,1280x800,1024x768,768x1024,390x844
--max-repair-cycles 5
```

Framework selection:

1. Prefer the existing project framework if a repo already exists.
2. If no app exists, use Next.js + TypeScript for multi-page/product work.
3. Use Vite + React + TypeScript for static marketing pages.
4. Use plain HTML/CSS/JS only when the user explicitly asks for it or the target is tiny.

Dependency selection must be evidence-based. Install packages only when runtime inspection shows they are needed or they materially reduce fidelity risk. Common examples: `gsap`, `@gsap/react`, `lenis`, `swiper`, `three`, `lottie-web`, `split-type`, `framer-motion`, `playwright`, `pixelmatch`, `sharp`.

## Tools and MCPs to use

Prefer these capabilities when available:

- Browser/Playwright MCP: crawl pages, capture screenshots/videos, test viewports, click/hover/type, inspect DOM and console.
- Chrome DevTools MCP: inspect computed styles, loaded scripts, network assets, performance, animations, layout shifts, and runtime state.
- Filesystem tools: create specs, tasks, implementation files, reports, and progress state.
- Package manager tools: install only justified dependencies.
- Image generation skill/tool: create replacement bitmap assets when licensed source images cannot be reused.
- Subagents: run independent discovery, animation, visual review, behavior review, and final audit passes when requested or when the clone is complex.

If a named MCP is unavailable, continue with the closest available browser automation and record the gap in `reports/final-audit.md`.

## Workflow

### 1. Intake

Create `specs/<project-name>/intake.md` with:

- reference URL or source path,
- target project path,
- selected framework,
- viewports,
- pages/routes to clone,
- fidelity threshold,
- allowed asset policy,
- backend/CMS scope,
- legal/blocked resources note.

Ask only for choices that would materially change the result. Otherwise use defaults and continue.

### 2. Discovery

Capture evidence before implementing. Create:

- `page-map.md`
- `design-tokens.json`
- `asset-manifest.json`
- `dependency-report.md`
- `interaction-manifest.json`
- `animation-manifest.json`
- `responsive-matrix.md`
- `screenshots/reference/`
- `videos/reference/` when animation timing matters

Inspect:

- DOM structure and section boundaries,
- computed styles,
- fonts and font loading,
- colors, gradients, shadows, borders,
- images, videos, SVGs, icons, masks, blend modes,
- layout grids, containers, z-index, sticky/pinned elements,
- hover, focus, active, menu, modal, slider, cursor, form, and route states,
- GSAP timelines, ScrollTrigger pin/scrub/start/end markers, smooth scrolling, SplitText/SplitType behavior, WebGL/canvas/Lottie effects,
- network scripts and dependencies.

Read `references/audit-protocol.md` for the full discovery checklist when the site has complex animations or interactions.

### 3. Spec-driven plan and tasks

Create these artifacts before coding:

- `specification.md`
- `plan.md`
- `tasks.md`
- `acceptance-criteria.md`
- `decisions.md`
- `progress.md`

Tasks must be section-based and stateful:

```text
pending -> implementing -> testing -> comparison -> repair -> independent-review -> approved
```

Every section task must include reference evidence, dependencies, implementation scope, responsive requirements, animation requirements, and acceptance checks. Read `references/spec-driven-workflow.md` for the task contract.

### 3.5. Font forensic and asset independence plan

Before implementation approval, create `reports/font-forensic-audit.md` and `reports/asset-dependency-report.md`.

Audit and record:

- every external CSS, JS, image, SVG, video, and font URL,
- every `@font-face` source and Google/remote font stylesheet,
- computed `font-family`, `font-weight`, `font-style`, `font-size`, `line-height`, and `letter-spacing` for body, nav, buttons, hero title, headings, cards, forms, and footer,
- text width/height/wrapping for key headings and hero typography,
- whether each asset is required, replaced, localized, or intentionally removed,
- local target paths for required assets.

Final approval is forbidden unless runtime verification proves:

- zero requests to the original reference domain,
- zero Google Fonts or remote font requests,
- fonts load from local `/fonts` or bundled app assets,
- no CORS font errors exist,
- computed font families match the expected local families,
- no unintentional fallback font is used,
- all required images/CSS assets are local or replaced with documented equivalents.
### 4. Install and foundation

Install the selected framework and required packages. Do not blindly install every script seen on the reference site; install equivalent packages with clear evidence and license checks.

Build the foundation first:

- reset/base CSS,
- font loading,
- design tokens,
- breakpoints,
- containers/grid,
- header/footer,
- buttons/links/forms,
- smooth scroll,
- animation helpers,
- reduced-motion handling.

### 5. Section-by-section clone

Build one section at a time. For each section:

1. Re-open reference evidence.
2. Implement markup and styling.
3. Implement animation and interactions.
4. Capture implementation screenshots at all configured viewports.
5. Compare against reference.
6. Repair until the section passes.
7. Send to independent review when review agents are enabled.
8. Mark approved only after pass evidence exists.

Do not move to final audit with known failed sections unless a documented blocker exists.

### 6. Compare, repair, and final audit

Run full-page comparison after all sections pass individually:

- desktop and mobile screenshots,
- visual diff,
- console errors,
- network failures,
- animation/scroll verification,
- interaction walkthrough,
- accessibility smoke check,
- performance sanity check.

Read `references/review-and-repair.md` for the required loops and report format.

Final output must include:

- what was cloned,
- where the implementation lives,
- installed dependencies and why,
- fidelity result,
- remaining gaps/blockers,
- how to run it locally,
- links to reports and screenshots.

## Subagent review model

Use subagents only when the user asked for them or the clone complexity justifies independent validation and tool policy allows it. Keep ownership clear:

- primary agent owns the plan, integration, and final decisions;
- discovery agent audits the reference;
- architecture agent checks dependencies and structure;
- section agents may implement isolated sections only when file ownership is clear;
- animation agent validates GSAP/scroll effects;
- visual review agent compares screenshots;
- behavior review agent tests interactions and responsive states;
- final audit agent reviews the completed clone from evidence.

Do not let multiple agents edit the same files at the same time. Prefer subagents for review over parallel editing.

## Output structure

Use this structure inside the target repo:

```text
specs/<project-name>/
  intake.md
  specification.md
  plan.md
  tasks.md
  progress.md
  decisions.md
  page-map.md
  design-tokens.json
  asset-manifest.json
  dependency-report.md
  interaction-manifest.json
  animation-manifest.json
  responsive-matrix.md
  acceptance-criteria.md
  screenshots/
    reference/
    implementation/
    diff/
    overlays/
  videos/
    reference/
    implementation/
  reports/
    visual-fidelity.md
    interaction-fidelity.md
    animation-fidelity.md
    accessibility.md
    performance.md
    final-audit.md
```

## Internal command semantics

`/ui-clone` is resumable and idempotent:

- If `specs/<project-name>/progress.md` exists, continue from the first non-approved task.
- If reference screenshots are stale or missing, recapture them.
- If dependencies are missing, install them.
- If implementation exists, compare first, then repair.
- If all tasks pass, run final audit and stop.

Never finish with "done" until final audit evidence is written.
