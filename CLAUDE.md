# Claude Code entry point

Follow [AGENTS.md](AGENTS.md), the shared project rules, then read
[PROJECT_MAP.md](PROJECT_MAP.md) first for project context.

Do **not** read the entire repository or all documentation at startup. Use the map to identify the
task's domain, search that area, and read detailed files only when the task needs them. An explicitly
exhaustive audit/search must still cover its full requested scope.

Startup: global instructions -> shared project rules -> compact map -> current domain ->
relevant source/docs -> work and test. AGENTS.md owns the rules; this file intentionally does not
duplicate project documentation.

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
