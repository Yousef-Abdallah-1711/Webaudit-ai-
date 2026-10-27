# Claude Code entry point

Follow [AGENTS.md](AGENTS.md), the shared project rules, then read
[PROJECT_MAP.md](PROJECT_MAP.md) first for project context.

Do **not** read the entire repository or all documentation at startup. Use the map to identify the
task's domain, search that area, and read detailed files only when the task needs them. An explicitly
exhaustive audit/search must still cover its full requested scope.

Startup: global instructions -> shared project rules -> compact map -> current domain ->
relevant source/docs -> work and test. AGENTS.md owns the rules; this file intentionally does not
duplicate project documentation.

## Master process document

At session start also read [PROCESS_FOR_THE_APP.md](PROCESS_FOR_THE_APP.md): SPEC status, dependency
order, task ledger, open decisions and the per-task lifecycle. Before any implementation decision:
read the canonical SPEC and repository rules for the task, check `git status` before editing, follow
the task sequence and decision gates, and preserve unrelated work. That file is a navigation and
execution guide and never authorizes overriding a canonical contract; contradictions are reported,
not silently resolved. Update it when verified task status, dependencies, decisions or blockers
change. For small tasks use it plus targeted references instead of re-reading every historical audit
document; open the original sources when a decision or claim needs verification.

## Mandatory delegation for implementation work

For this project, Claude acts as **orchestrator/reviewer only**. All code implementation —
features, fixes, UI/UX changes, refactors — is delegated to `/codex-delegate` (Codex CLI, model
`gpt-6-luna`, reasoning effort `high`, per the user's global Codex delegation rules). Claude does
not write or edit application source directly except when delegation is technically impossible
(e.g. the `codex` CLI is unavailable). Claude still: writes the brief, dispatches, independently
re-verifies the diff and real gate commands (never trusts the implementer's self-report), and
commits. This applies repo-wide, not just to the auth/email work it was first established for.

<!-- gen:docs-index:start hash=874a2c300bb6 -->
Project documentation lives in [docs/README.md](docs/README.md).

- `docs/reference/` is **generated** — do not hand-edit it; the next run
  overwrites it.
- `docs/features/` and `docs/architecture/` are hand-written prose. Generated
  tables inside them are fenced by `<!-- gen:*:start -->` markers; edit around
  the markers, never inside them.
- Regenerate with `$docs-update`. Check for drift with
  `$docs-check`.
<!-- gen:docs-index:end -->
