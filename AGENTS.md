# Project rules - WebAudit AI

Shared instructions for Claude Code, Codex, and other coding agents. Keep rules here,
navigation in [PROJECT_MAP.md](PROJECT_MAP.md), and implementation detail in the linked documents.

## Context layers and startup

GLOBAL RULES (provided by the agent runtime or user-level instruction files)
-> PROJECT RULES (this file; Claude enters through CLAUDE.md)
-> PROJECT MAP
-> identify the current task/domain
-> DETAILED DOCUMENTATION and source for that domain only
-> work and test.

1. Read [PROJECT_MAP.md](PROJECT_MAP.md) first for project context. Do **not** read the entire
   repository, all docs/specs, or all of PROGRESS.md at session startup.
2. Select the relevant map row. Read its source entry points and only the documentation sections
   needed for the task. Check for additional directory-scoped instructions along the affected path.
   Expand to callers, dependencies, and adjacent domains when evidence requires it.
3. Use targeted `rg --files <area>` and `rg -n "<symbol>" <area>`; inspect matching sections before
   opening large files. Do not scan dependency trees, generated output, runtime data, or unrelated
   showcase apps by default. Never load every skill just because it is installed.
4. For a handoff or task-status question, search PROGRESS.md for "Resume here", the task ID, or
   domain; read that section and the relevant feature's tasks.md. Do not copy historical pass counts
   into a new completion claim.
5. **Exhaustive tasks are the exception:** when the user requests a whole-project audit, all docs,
   or an exhaustive search, cover that scope fully. These efficiency rules never justify omissions.
6. Honor higher-priority runtime/user instructions. Within project documentation, the
   [constitution](.specify/memory/constitution.md) governs; then the applicable spec, plan, research,
   data model and contracts. Read the relevant governing sections before changing behavior.
   The map describes the checkout, not permission to weaken a requirement.
7. Implement the requested scope. For Spec Kit work, follow the selected feature's tasks and
   sub-phase; a historical plan is not a standing instruction to execute unrelated work.
   Preserve existing user changes.

## Engineering rules

- Capabilities are discovered through the registry; core must not name concrete capabilities.
  Capability code lives locally: no runtime download/install of executable capability code.
  This does **not** prohibit guarded audit-target requests or configured provider calls.
- Run deterministic checks before AI; code-layer checks consume zero LLM tokens. The runner assigns
  attribution. All AI goes through ai-executor with redacted prompts and a chain spanning at least
  two vendors; exhaustion degrades rather than destroys measured results.
- Untrusted installed code executes only in the separate, bounded, killable sandbox, without
  credentials or egress. No vm2 and no unsandboxed fallback; unavailable upload dispatch returns 503.
  Keep browser and sandbox deployment boundaries separate from the API/worker.
- Never bill for platform failures. Derive balances from lots, spend expiring credits first,
  refund to the originating lot, and record costs in integer micros. Green means a passing narrow
  verification check; a user's assertion never writes RESOLVED.
- Share domain types through packages/types. Validate HTTP, queue, capability and AI boundaries.
  Keep PostgreSQL authoritative; persist progress before publishing it. Authorize privileged
  actions server-side and realtime access per subscription.
- Preserve SSRF checks on every hop/connection, redaction, credential encryption, archive guards,
  and workspace destruction on completion, failure, timeout and cancellation.
- Before touching one of these areas, read **only its section** in
  [domain safeguards](docs/agent-domain-rules.md), located through the map.
- For UI work, port the approved design, use tokens, and keep design-system read-only with no runtime
  imports. Read the map's UI references and safeguards before editing a frontend surface.

## Verification and maintenance

- Features/bugfixes are test-first: confirm the relevant test fails for the intended reason, then
  implement. Boundary changes need integration coverage; capabilities need contract and failure
  containment tests. Use `AI_MODE=fixtures`, never live provider spend in automated tests.
- Run appropriate checks from the map. Required frontend gates remain adherence and visual
  comparison at 1440/390 (<=0.5%). A skipped/todo comparison does not establish fidelity.
- Use the separate test database. Run shared DB/Redis suites serially; do not overlap them with
  competing workers on the same queues. Never stop somebody else's dev stack without authorization.
- Report actual checks, failures and unverified scope. Do not weaken guarantees to force a pass.
  PRs explain affected principles, compliance and added complexity; constitutional deviations need
  the documented exception and follow-up issue required by governance.
- Update the map when paths, boundaries, domains or test entry points change; validate references.
  Put rationale in the relevant detailed document, task state in tasks.md, and handoffs in PROGRESS.md.
  Keep CLAUDE.md a thin entry point and avoid duplicating rules or status across these files.
  Never place secrets, credential values, live tokens or sensitive environment values in the map.

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
