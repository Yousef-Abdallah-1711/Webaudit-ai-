# UI Clone Skill

`ui-clone` is a Codex skill for recreating public websites as high-fidelity, responsive implementations. It uses observable runtime evidence, spec-driven planning, section-by-section implementation, screenshot comparison, repair loops, and a final audit.

## Install

Copy this repository into your Codex skills directory as `ui-clone`:

```text
~/.codex/skills/ui-clone/
```

The directory must contain `SKILL.md` at its root. Restart Codex after installation if the skill is not detected immediately.

## Use

Invoke the skill in a prompt:

```text
Use $ui-clone to recreate https://example.com as a responsive React implementation.
```

The skill also defines this workflow command:

```text
/ui-clone <reference-url-or-local-html> --name <project-name>
```

By default, the workflow discovers the reference, creates specification and task artifacts, implements the UI, compares screenshots at multiple viewports, repairs fidelity issues, and writes a final audit.

## Contents

- `SKILL.md` — primary skill instructions and trigger metadata.
- `agents/openai.yaml` — Codex UI metadata.
- `references/` — focused audit, planning, tooling, and review protocols.
- `scripts/ui_clone_workflow.py` — initializes resumable clone artifacts.
- `scripts/visual_diff.py` — creates a pixel-difference image and reports mismatch percentage.
- `scripts/ui-clone-workflow.json` — machine-readable workflow defaults.

## Optional script dependency

`visual_diff.py` requires Pillow:

```text
python -m pip install pillow
```

## Scope

This repository contains only the reusable UI Clone skill. It intentionally excludes generated websites, reference-site assets, screenshots, project dependencies, and clone-specific reports.
