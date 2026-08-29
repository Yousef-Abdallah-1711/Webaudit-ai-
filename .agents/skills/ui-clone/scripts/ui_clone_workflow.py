#!/usr/bin/env python3
"""Initialize artifact skeletons for the ui-clone skill."""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path


VIEWPORTS = [
    {"name": "desktop", "width": 1440, "height": 900},
    {"name": "laptop", "width": 1280, "height": 800},
    {"name": "tablet", "width": 768, "height": 1024},
    {"name": "mobile", "width": 390, "height": 844},
]


def write(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if not path.exists():
        path.write_text(content, encoding="utf-8")


def init_project(args: argparse.Namespace) -> None:
    root = Path(args.root).resolve()
    project = root / "specs" / args.name
    now = datetime.now(timezone.utc).isoformat()

    for folder in [
        "screenshots/reference",
        "screenshots/implementation",
        "screenshots/diff",
        "screenshots/overlays",
        "reports",
    ]:
        (project / folder).mkdir(parents=True, exist_ok=True)

    write(project / "specification.md", f"""# {args.name} specification

Reference URL: {args.url}
Created: {now}
Fidelity: strict observable parity

## Clone boundary

Recreate public frontend behavior visible from the reference. Do not assume access to private source, databases, credentials, CMS internals, or unlicensed copyrighted assets.

## Routes

- {args.url}

## Viewports

{chr(10).join(f"- {v['name']}: {v['width']}x{v['height']}" for v in VIEWPORTS)}
""")

    write(project / "plan.md", """# Plan

1. Intake and legality gate
2. Reference capture
3. Forensic discovery
4. Dependency report
5. Foundation build
6. Section-by-section implementation
7. Integration checks
8. Visual/behavior comparison
9. Repair loop
10. Independent review
11. Final audit
""")

    write(project / "tasks.md", """# Tasks

Each task must move: pending -> implementing -> testing -> comparison -> repair -> independent-review -> approved.

## INTAKE

- [ ] INTAKE-001 Record clone scope, routes, framework, install permission, backend limits, and asset/legal constraints.

## DISCOVERY

- [ ] DISCOVERY-001 Capture reference screenshots for desktop, laptop, tablet, and mobile.
- [ ] DISCOVERY-002 Extract page sections, tokens, assets, interactions, animations, and runtime dependencies.

## DEPENDENCIES

- [ ] DEP-001 Write dependency-report.md with evidence for every package.

## FOUNDATION

- [ ] FOUNDATION-001 Create project structure, design tokens, base styles, fonts, containers, animation utilities.

## SECTIONS

- [ ] SECTION-001 Replace this with one task group per discovered section.

## REVIEW

- [ ] REVIEW-001 Run visual comparison for all viewports.
- [ ] REVIEW-002 Run interaction and animation review.
- [ ] REVIEW-003 Repair until acceptance gates pass or factual blockers are documented.
- [ ] REVIEW-004 Run independent review when subagents are available/requested.
- [ ] REVIEW-005 Write final audit.
""")

    write(project / "research.md", "# Research\n\nRecord reference observations, screenshots, runtime evidence, and implementation decisions here.\n")
    write(project / "progress.md", f"# Progress\n\n- {now}: initialized ui-clone workflow for {args.url}\n")
    write(project / "page-map.md", "# Page map\n\nPopulate after discovery.\n")
    write(project / "decisions.md", "# Decisions\n\nRecord non-obvious implementation and parity decisions here.\n")
    write(project / "acceptance-criteria.md", """# Acceptance criteria

- Layout matches reference within 1-2 px where practical.
- Screenshot diff is <= 2% per required viewport/section.
- Typography, colors, spacing, media crop, shadows, masks, and gradients match extracted reference tokens.
- Animations and scroll effects match observable timing/easing/trigger behavior.
- Responsive behavior matches reference at all required viewports.
- No console errors, missing assets, unintended horizontal overflow, or broken interactions.
""")
    write(project / "responsive-matrix.md", "# Responsive matrix\n\n| Viewport | Width | Height | Status |\n|---|---:|---:|---|\n" + "\n".join(f"| {v['name']} | {v['width']} | {v['height']} | pending |" for v in VIEWPORTS) + "\n")

    write(project / "design-tokens.json", json.dumps({"colors": {}, "typography": {}, "spacing": {}, "breakpoints": VIEWPORTS}, indent=2))
    write(project / "asset-manifest.json", json.dumps({"images": [], "videos": [], "icons": [], "fonts": [], "generated_equivalents": []}, indent=2))
    write(project / "interaction-manifest.json", json.dumps({"navigation": [], "forms": [], "hovers": [], "scroll": [], "animations": []}, indent=2))
    write(project / "dependency-report.md", "# Dependency report\n\nDocument evidence before installing packages.\n")

    for report in [
        "visual-fidelity.md",
        "interaction-fidelity.md",
        "animation-fidelity.md",
        "performance.md",
        "accessibility.md",
        "final-audit.md",
    ]:
        write(project / "reports" / report, f"# {report.removesuffix('.md').replace('-', ' ').title()}\n\nPending.\n")

    print(project)


def main() -> None:
    parser = argparse.ArgumentParser(description="ui-clone workflow helper")
    sub = parser.add_subparsers(dest="command", required=True)
    init = sub.add_parser("init", help="initialize clone artifacts")
    init.add_argument("name")
    init.add_argument("url")
    init.add_argument("--root", default=".")
    init.set_defaults(func=init_project)
    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
