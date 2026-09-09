# CLAUDE.md — Agent Guidance for WebAudit AI

Guidance for coding agents working in this repository. Applies to Claude Code, Codex, and any other
agent.

> **This file is subordinate to the constitution.** Per
> [.specify/memory/constitution.md](.specify/memory/constitution.md) §Governance, agent guidance
> files MUST NOT contradict it. On any conflict, the constitution wins and this file is wrong.

---

## Read these before writing code

| Document | What it governs | Authority |
| --- | --- | --- |
| [.specify/memory/constitution.md](.specify/memory/constitution.md) | 7 principles, security and workflow constraints | **Highest.** Supersedes everything, including the architecture doc. |
| [specs/001-webaudit-mvp-baseline/spec.md](specs/001-webaudit-mvp-baseline/spec.md) | 95 requirements (+FR-025a, T232), 22 success criteria | What the product must do |
| [specs/001-webaudit-mvp-baseline/plan.md](specs/001-webaudit-mvp-baseline/plan.md) | Architecture, structure, 15-stage sequence | How we build it |
| [specs/001-webaudit-mvp-baseline/research.md](specs/001-webaudit-mvp-baseline/research.md) | 18 decisions with rationale and rejected alternatives | Why it is built that way |
| [specs/001-webaudit-mvp-baseline/data-model.md](specs/001-webaudit-mvp-baseline/data-model.md) | Physical schema | Persistence |
| [specs/001-webaudit-mvp-baseline/contracts/](specs/001-webaudit-mvp-baseline/contracts/) | Capability contract, HTTP API, realtime/AI/sandbox | Interfaces |
| [DESIGN.md](DESIGN.md) | Design system, tokens, component behaviour | UI work |
| [PRODUCT.md](PRODUCT.md) | Positioning, competitive standing, commercial model | Product judgment calls |
| `WebAuditAI_ARCHITECTURE.md` | Original design sketch | **Historical. Partly superseded — see below.** |

**`WebAuditAI_ARCHITECTURE.md` was out of date in three known places** (named `vm2`, forbidden by
research R1; awaited the questionnaire inside a job, a queue-starvation bug per R4; listed three
deployable units where there are five, per R16) — **corrected in the document itself, T233, Session 9,
2026-09-04**: a banner at the top and an inline note at each of the three points now say what's real
and point at the research.md decision that supersedes the original sketch. Do not implement from it
without checking the plan regardless — it remains historical, only these three points were wrong.

## Project state

**Read [PROGRESS.md](PROGRESS.md) first — its "Resume here" section is the handoff.** It carries the
current task, the six environment gotchas that each cost an hour, and the honest scoreboard.

Spec-driven via [Spec Kit](https://github.com/github/spec-kit). Constitution, spec, plan and tasks
are complete, and **the original 250-task plan is done** (+T236a, not in the original count) — every
phase, from Phase 1 (setup) through Phase 11 (polish), closed as of 2026-09-04. A `/speckit-converge`
pass on 2026-09-08 (Phase 12) found and closed four more real gaps against the constitution and
FR-029 — T249 (capability identity no longer hardcoded in core), T250 (admin console visual-regression
baseline), T251 (upload conformance's manifest-completeness half), T252 (capability code can no longer
read `controlLevel` at all) — and split out one genuinely new architectural question, T253 (Phase 13,
open): wiring a passing upload verdict into the registry so a real scan can dispatch the capability.
`tasks.md` is authoritative for task state; PROGRESS.md carries the honest scoreboard, the full
per-phase account, and every open decision worth knowing before touching a given area.

**All 11 adversarial gates are green**: SC-006 attribution, **SC-007 verified-fix loop** (T144, Phase
4), **SC-008 never-billed-for-a-failure** (T180, Phase 7), SC-011 capability disable, SC-012 provider
exhaustion, SC-015 workspace destruction, SC-016 redaction, **SC-017 sandbox escape** (T218, Phase
10a — the last one to go green), SC-018 SSRF, SC-021 control gate, SC-022 credits.

A real audit runs end to end (URL scans, an uploaded `.zip`, or a connected GitHub repository, across
all five areas) and is drivable by a human through the UI; the red-to-green fix loop works; a
production-readiness pass (fresh full re-audit, fingerprint regression diff, go/no-go verdict with
named blockers, shareable certificate) closes the journey; the account is billable (subscriptions,
entitlements, non-expiring purchased credits, a signature-verified idempotent billing webhook,
retention with a pre-removal warning, a self-contained HTML export); the mid-audit design-intent
questionnaire pauses and resumes without holding a worker slot; the operator admin console is live
behind `requireOperator`; and an operator-uploaded capability runs inside `sandbox-runner`'s three
nested isolation boundaries, deployed for real, with a genuine conformance verdict replacing the old
unconditional refusal. The first sellable artifact was **T135**, end of Phase 3.

**"250/250" is not "nothing left to decide."** PROGRESS.md's own "Reality check on 'production ready'"
section states every real, load-bearing exception plainly — read it before treating this as shippable
without qualification. Two worth naming here specifically: capability upload today returns a genuine
conformance verdict but does not install the capability anywhere a real scan would run it (Open
Decision #20), and `apps/worker`'s capability loader and reverify resolver hardcode capability identity
in a static table rather than routing through the registry (Open Decision #13, "made, not settled") —
a real, already-accepted tension with non-negotiable #1 below, not a hidden one.

Two rounds of defects are recorded rather than forgotten. A full engineering review of Phases 1–2B
produced 19 findings, all resolved in `f02ef48` — three Critical: a credit-ordering bug that drew
permanent credits before expiring ones, non-atomic refresh rotation, and a committed fallback signing
secret active whenever `NODE_ENV != production`. Later phases then found four more in earlier ones,
listed under "Defects found and fixed in a later phase" in PROGRESS.md. Read both sections before
touching credits, sessions, config, or scoring — each fix encodes a reason that is easy to undo by
accident.

Workflow: `/speckit-implement` one sub-phase at a time. Do not write implementation code ahead of
the task list without being asked.

## The seven non-negotiables

Every one of these is enforceable in review. Violating one is grounds for rejection on its own.

1. **Core never names a capability.** Module, orchestrator, and route code reach capabilities only
   through the registry. If your change requires editing core code to add an audit capability, the
   contract is wrong — fix the contract, not the core.
2. **Nothing is fetched from a third party at runtime.** Capability code is vendored in full under
   `packages/capabilities-vendored/`. Deleting an upstream repo must change nothing.
3. **The code layer runs first and costs zero tokens.** A code-layer capability that calls an LLM is
   a principle violation. Anything measurable gets measured; AI explains what was measured.
4. **All AI goes through `ai-executor`.** No provider SDK anywhere else. Chain spans ≥2 vendors.
   Exhaustion degrades the area — it never throws and never fails the scan.
5. **Untrusted code runs in `sandbox-runner` only.** No egress, no credentials, separate process,
   bounded, killable. `vm2` is forbidden by name. **If the sandbox is unavailable, the upload path
   returns 503 — it never falls back to unsandboxed execution.**
6. **Never charge for our failures.** Check credits before work, refund on platform fault, record
   real provider cost per capability execution.
7. **Green means verified.** `Issue.RESOLVED` has exactly one inbound edge, triggered only by a
   passing check. No user action may write it.

## Things that are easy to get wrong

These are the traps. Each has already cost a design revision.

- **Redaction is the only path to a provider.** `ai-executor` accepts `RedactedPrompt`, a type only
  `packages/redaction` can construct. Do not add an escape hatch — that type signature *is* success
  criterion SC-016.
- **Attribution is assigned by the runner, never by a capability.** Code-layer findings are
  `MEASURED`, AI-layer findings are `AI_JUDGMENT`. Letting a capability declare its own attribution
  lets a guess pose as a measurement.
- **Trust comes from the discovery root, never from a manifest.** A capability cannot declare itself
  trusted.
- **SSRF validation happens at connect time, not resolve time.** Resolve-time-only checks are
  defeated by DNS rebinding. Redirects are followed manually so every hop is re-validated.
- **Credit balances are derived, never stored.** No balance column exists. Debits allocate against
  lots ordered by expiry so expiring credits are spent first; refunds return to the originating lot.
- **`ModuleResult.score` is nullable on purpose, and DEGRADED still carries a score.** Read FR-053
  carefully: the word is *inflate*. An area that measured nothing (FAILED, NOT_APPLICABLE) scores
  null and is excluded, because any number would be invented. An area that measured findings but lost
  its interpretation (DEGRADED) **does** carry a score — excluding it makes the overall score *rise*
  when the worst area in the audit loses its AI layer, which is the inflation FR-053 forbids.
  `MODULE_STATES_SCORED` in `@webaudit/types` is the authority. A `?? 0` near `packages/scoring` or
  `module-runner/persist.ts` is a defect in the other direction.
- **Never block a worker on human input.** The questionnaire persists state and releases the slot.
  Implemented: `awaitQuestionnaire` writes the state, emits the prompt, schedules a delayed job, and
  returns. No timer, no polling, no promise held open.
- **A `RedactedPrompt` does not survive a queue.** Registry membership is per-object, so a prompt
  serialised into a job payload and revived fails `isRedactedPrompt`. Queue the *source* and assemble
  on the far side. This looks like a bug the first time it bites; it is the guarantee working.
- **Every scan-state transition is guarded on the state the caller expects.** One conditional
  `updateMany`, never read-then-write — that guard is what makes both sides of the questionnaire race
  safe, and losing the race is a no-op rather than an error. Finding C2 taught this repository the
  same lesson about refresh tokens.
- **Realtime authorises per subscription, never per connection.** A socket outlives a 15-minute
  token, and knowing who is connected says nothing about which scans they own. The room name is
  derived from the authorised scan id, never taken from the client.
- **Progress is persisted before it is published.** Reversing that is invisible in testing and breaks
  on a slow database: the client acts on an event whose row is not written yet. A publish failure
  never fails the work — Redis is transport, and the client recovers by fetching (FR-047).
- **A capability's prompt contribution is untrusted material, not an instruction.** An INSTALLED
  capability is unreviewed by definition, so `getSystemPromptAddition()` goes into `assemblePrompt`'s
  `segments`, never its `instructions`.
- **An archive is inspected before it is extracted, and `extractArchive` has no way to skip that.**
 Do not add a "already inspected" fast path — that path is how a later caller writes unchecked bytes.
 The guard needs **both** a compression ratio and an absolute uncompressed ceiling: a 50 MB archive
 expanding honestly to 5 GB shows no suspicious ratio, and a 4 KB archive expanding to 512 MB sits
 under any ceiling worth having. Zip only; a `tar` `typeflag` check is not the same code as a zip
 mode check, so a second container needs its own adverse suite before it needs an implementation.
- **The upload endpoint stages a target and neither creates a scan nor charges.** That separation is
 what makes FR-015's "refuse before charging" structural instead of a matter of statement ordering.
- **A repository is fetched as a zipball, not cloned** — so repository bytes go through the same
 guard an upload does, the token stays out of `ps`, and no `git` binary sits in an image that
 processes hostile input. `stripComponents: 1` is not cosmetic: leaving GitHub's `owner-repo-<sha>/`
 wrapper in place changes every source finding's fingerprint on every commit.
- **Scan workspaces are destroyed on every exit path** — completion, failure, timeout, cancellation.
  Four paths, four assertions.

## UI work — read this before touching any frontend file

**The design system at `design-system/` is authoritative.** Vendored from an approved Claude Design
export: 15 components, 26 screens, 97 tokens, and its own lint config. Constitution v1.1.0
"Design Adherence" governs. Routing table: [design/screen-map.md](design/screen-map.md).

1. **Port, never author.** If a component exists in `design-system/components/`, port it. Read its
   `.d.ts` for the prop contract and its **`.prompt.md` for constraints that are not visible in the
   code** — e.g. why `SeverityBadge` may never be restyled toward the brand accent.
2. **Tokens only, via `var()`.** Every colour, size, and font comes from
   `design-system/tokens/*.css`. A raw hex or raw px value fails `pnpm lint` — the design system
   ships the rules that catch it.
3. **No design, no build.** A surface absent from `design/screen-map.md` is blocked, not improvised.
   Ask; do not invent. If the user explicitly authorizes an exception (the constitution's own
   governance clause: "a documented exception... and an issue to remove it"), first re-confirm the
   gap is real by searching `design-system/` **by content**, including `_ds_manifest.json` — a stale
   "No artboard" note is not proof by itself. Then reuse every existing token and established
   interaction principle before inventing anything new, and record the exception in three places: the
   component's own module note, `design/screen-map.md`'s "Documented exceptions" table, and a
   `research.md` decision entry — not just one. T143 (annotated screenshot) went through exactly this
   process; see `research.md`'s R18 for the full record and the general steps.
4. **Both viewports.** 1440 and 390 are designed and measured. The mobile display scale halves
   (48→24px) and body tracking goes *positive* — counter-intuitive and easy to miss. A desktop-only
   build is incomplete.
5. **Two gates before a frontend task is done.** `pnpm lint` (adherence) and `pnpm test:visual`
   (≤0.5% diff at both viewports). Not one or the other.
6. **Never edit `design-system/`** and never import from it at runtime. It is read-only reference,
   like `packages/capabilities-vendored/`.

Three known deviations in the vendored export were tracked with a task each rather than copied as-is —
**all three are now done** (fonts self-hosted, T127; icons vendored, T247; mobile type tokens wired by
a media query, T126 — all three landed together at T236a, confirmed via `tasks.md`, well before this
paragraph was last checked). Nothing outstanding here; kept as a record of what "port, never author"
already closed, not a live punch list.

## Conventions

**Stack** — TypeScript 5.6 on Node 22 (the sandbox needs the permission model, so 22 is not
negotiable). pnpm + Turborepo. Next.js App Router, Express, Prisma/PostgreSQL, BullMQ/Redis, R2.

**Structure** — five deployable units under `apps/` (`web`, `api`, `worker`, `probe-pool`,
`sandbox-runner`) and shared code under `packages/`. `sandbox-runner` and `probe-pool` are separate
deployments because a security boundary is only real if it is a deployment. Do not collapse them.

**Shared types live in `packages/types`.** Duplicating a type across apps instead of importing it is
a defect.

**Money in integer micros.** Never floats.

**Validate at every boundary** with Zod — HTTP input, capability output, AI responses, queue
payloads.

## Testing

Tests come first: write the failing test, confirm it fails for the intended reason, then implement.

- `pnpm test` — unit and contract
- `pnpm test:adverse` — **all eleven hostile suites. These are the gates, not extras.**
- `pnpm lint && pnpm typecheck`

Eleven success criteria are stated adversarially and each has a dedicated hostile suite: attribution
(SC-006), verification-cannot-be-faked (SC-007, added at Phase 4), never billed for a platform failure
(SC-008, added at Phase 7), capability-disable degradation (SC-011, Phase 2G), total provider
exhaustion (SC-012, Phase 2H), workspace destruction (SC-015), secret redaction (SC-016), sandbox
escape (SC-017, added at Phase 10), SSRF (SC-018), the control gate (SC-021), and credit integrity
(SC-022) — 11 of 11 green as of Phase 10 (2026-09-04). `quickstart.md` names nine of these as numbered
scenarios (all but SC-008 and the resolution half of SC-011/SC-012's own scenario 10, which does cover
both); all eleven run in the same `pnpm test:adverse` pass regardless. See
[quickstart.md](specs/001-webaudit-mvp-baseline/quickstart.md).

**Provider calls are always stubbed.** A suite that requires live LLM spend is a broken suite. Use
`AI_MODE=fixtures`.

Every capability needs a contract test *and* a test proving its module survives it throwing.

## Working style here

- **Do not weaken a guarantee to make a feature ship.** If a guarantee blocks you, say so and stop —
  the answer is usually to defer the feature, not the guarantee. Stage 14 exists for this reason.
- **When the architecture doc and the constitution disagree, the constitution wins.** Say which you
  followed.
- **Report honestly.** If tests fail, show the output. If you skipped something, say so. This is a
  product whose entire value is telling people the truth about their software.
- **Prefer amending a document over quietly diverging from it.** Three such divergences are already
  recorded in research.md's open items; add to that list rather than leaving a silent mismatch.

## Known open items

Carried forward and not yet resolved:

1. ~~**FR-025 needs amending**~~ — **Resolved, T232 (Session 9, 2026-09-04).** FR-025 now scopes
   explicitly to platform code; a new FR-025a states the auditing browser's separate policy (may load
   whatever the target page loads, isolated from platform credentials, still subject to SSRF refusal).
2. ~~**`WebAuditAI_ARCHITECTURE.md` needs correcting**~~ — **Resolved, T233 (Session 9, 2026-09-04).**
   A banner at the top plus an inline note at each of the three points now correct the document in
   place rather than leaving readers to discover the mismatch themselves.
3. **Monetary price points** are unset; credits and entitlements are fixed.
4. ~~**CSS Modules are not covered by the design-adherence lint's raw-value rule.**~~ —
   **Resolved, 2026-09-08**, as a ratchet rather than a strict rule. `apps/web/tests/unit/
   css-adherence-lint.test.ts` now scans every `.module.css` file under `apps/web` for raw hex/px.
   The real scope, measured directly rather than assumed: 46 of 47 files carry a raw px value
   (pervasive, ported component-intrinsic sizing — button heights, font sizes — never meant to route
   through `--space-*` one literal at a time) and 8 carry a raw hex color, two of which
   (`AdminShell.module.css`, `ModuleStatus.module.css`) are pre-existing, deliberately documented
   escape hatches from the JS-side rule for a shell intentionally off the token palette. A "full
   remediation" (real tokens for all 46 files) would be a large, unrequested design-system change
   with real dark-mode/visual-regression risk. Instead: every current count is recorded in a
   `BASELINE` map, and the gate fails if any file's count goes *up*, or if a brand-new `.module.css`
   file introduces even one raw literal — real, mechanical protection against new drift, the actual
   complaint this item raised, without silently blessing the 46 files as fine or demanding a rewrite
   nobody asked for. Fixing a real instance shrinks its `BASELINE` entry; the gate only ever tightens
   from here.
