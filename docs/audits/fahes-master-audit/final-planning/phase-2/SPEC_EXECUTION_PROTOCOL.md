# SPEC Execution Protocol

Applies to every future implementation phase. It restates and extends `AGENTS.md` (test-first, separate test database, serial DB suites, report actual checks, preserve user changes) and `CLAUDE.md` (Claude orchestrates and reviews; implementation is delegated through `/codex-delegate`; Claude re-verifies the diff and gate commands itself and does not trust the implementer's self-report). It does not replace either.

## The ten steps (in order, every phase)
1. **Verify baseline and decisions.** Record `git rev-parse HEAD`, branch, `git status --short`, staged/unstaged diff stats, `.specify/feature.json`. List the task's prerequisite decisions from the register; each must be `EXISTING APPROVED DECISION`, `RESOLVED BY AUTHORITATIVE EXISTING CONTRACT`, or an owner answer recorded in the repo. A recommendation is not an answer. Check the entry gate of the SPEC's packet.
2. **Read the canonical SPEC and dependent contracts** (the exact sections, via the packet), not summaries; note anything the working tree changes versus HEAD (U-1, untracked 011/012).
3. **State exact scope and non-goals** in writing before coding (files expected to change; files that must not).
4. **Resolve newly discovered blockers before coding.** If a hidden coupling appears (for example the enum-drift guard for 007 T001), stop, classify it (owner decision, evidence, or implementation choice), and either resolve it inside the approved scope or ask.
5. **Implement only the approved scope**, through `/codex-delegate`, test-first: write the failing test, run it, see it fail for the intended reason, then implement.
6. **Add tests for the affected contract and its failure modes** (see rules below).
7. **Run targeted tests, then the relevant regression suites.** Shared DB/Redis suites run serially against the separate test database; never against the development database; never stop someone else's dev stack.
8. **Inspect the final diff**: only expected files, no unrelated changes, line endings preserved (some files are CRLF), no secrets, no generated output.
9. **Report each acceptance criterion individually as PASS, FAIL or UNVERIFIED**, with the exact command and its observed result. A criterion not actually executed is UNVERIFIED. Never write "tests pass" without a run in the same phase.
10. **Stop before commit** unless the owner explicitly authorizes it. The owner runs commits by default (DEC-018); stage explicit paths only, never `git add -A`.

## Specific rules
- **Migrations and compatibility.** Additive, reviewed, reversible migrations (constitution rule quoted in 007 `tasks.md` T006); review the generated SQL by hand against the data model; no destructive change; no data backfill without a plan; compatible with the legacy path (ADR-006); never edit an applied migration.
- **Feature flags and staged rollout.** New execution behaviour ships default-off; legacy passive/no-plan scans stay unchanged; a flag-off state must be tested; rollout order 007 → 008 → 009 → engines; rollback = flags off plus migration reversal on non-production.
- **Security-sensitive changes.** Re-read the relevant section of `docs/agent-domain-rules.md` first; keep SSRF checks, redaction, credential encryption, archive guards and workspace destruction; no secret, token or claim token in logs, queue payloads, snapshots, tests or reports; authorize privileged actions server-side; no weakening of a guarantee to force a test to pass.
- **Worker and lease concurrency.** Mandated shapes from the design (single-statement conditional status CAS; lease predicate in a second ordered statement; lock order unit → lease → counter unless the owner decision changes it); every race listed for the task gets a test that forces the interleaving (barriers/latches), not a sleep; deadlock freedom is never asserted without evidence.
- **Crash recovery and idempotency.** Every persisted point has a crash-before and crash-after test or an explicit UNPROVEN note; replays and redeliveries must be idempotent; finalize/release/settlement are single-transaction where the contract requires it, otherwise the residual is documented.
- **External systems.** Default to fakes with a contract suite; label every result "fake" or "real"; claims about a real provider, vendor capability or deployment setting stay UNVERIFIED until a real-provider or environment test is recorded; no external calls, live AI spend, or production access in automated tests (`AI_MODE=fixtures`).
- **Preserving unrelated changes.** Do not touch the 14 `apps/web` edits, `docs/audits/frontend-design/`, `showcase-*`, or any file outside the task scope; do not use `git reset --hard`, `git clean`, `git checkout -- .`, `git stash -u`, or blanket restores; if the working tree changes unexpectedly, stop and report.
- **Never claim an unrun test passed.** If the environment cannot run a suite (for example Docker is down), say so and mark the affected criteria UNVERIFIED.
- **Documentation upkeep.** Update `PROJECT_MAP.md` when paths/boundaries/test entry points change; put task state in `tasks.md` and handoffs in `PROGRESS.md` only as the project rules require, and only within the approved scope.

## Entry and exit gates per SPEC
Defined in `SPEC_IMPLEMENTATION_PACKETS.md`. A SPEC's exit gate is a precondition of the next SPEC's entry gate; if a later SPEC discovers a defect in an earlier SPEC's contract, work stops and the defect is routed back as a decision or contract change, not patched locally.
