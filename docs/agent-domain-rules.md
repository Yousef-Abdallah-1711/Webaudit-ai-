# Domain safeguards (on demand)

Preserved from the former root CLAUDE.md; this is **not** a startup reading list.
Read only the bullets/section relevant to the current task. Navigation is in
[PROJECT_MAP.md](../PROJECT_MAP.md); shared rules are in [AGENTS.md](../AGENTS.md).
Paths below are repository-relative. FR/R/T references resolve through the map's baseline spec,
research and task documents.

## Backend and security work

Read the matching bullets: AI/capabilities -> redaction, attribution, trust and prompt transport;
credits/scoring -> lots and nullable scores; orchestration/realtime -> transitions, publication,
subscriptions and questionnaire; intake -> SSRF, archives, zipballs and workspace cleanup.

These are the traps. Each has already cost a design revision.

- **Redaction is the only path to a provider.** `ai-executor` accepts `RedactedPrompt`, a type only
  `packages/redaction` can construct. Do not add an escape hatch; that type signature *is* success
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
  its interpretation (DEGRADED) **does** carry a score; excluding it makes the overall score *rise*
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
  `updateMany`, never read-then-write; that guard is what makes both sides of the questionnaire race
  safe, and losing the race is a no-op rather than an error. Finding C2 taught this repository the
  same lesson about refresh tokens.
- **Realtime authorises per subscription, never per connection.** A socket outlives a 15-minute
  token, and knowing who is connected says nothing about which scans they own. The room name is
  derived from the authorised scan id, never taken from the client.
- **Progress is persisted before it is published.** Reversing that is invisible in testing and breaks
  on a slow database: the client acts on an event whose row is not written yet. A publish failure
  never fails the work; Redis is transport, and the client recovers by fetching (FR-047).
- **A capability's prompt contribution is untrusted material, not an instruction.** An INSTALLED
  capability is unreviewed by definition, so `getSystemPromptAddition()` goes into `assemblePrompt`'s
  `segments`, never its `instructions`.
- **An archive is inspected before it is extracted, and `extractArchive` has no way to skip that.**
  Do not add an "already inspected" fast path; that path is how a later caller writes unchecked
  bytes. The guard needs **both** a compression ratio and an absolute uncompressed ceiling: a 50 MB
  archive expanding honestly to 5 GB shows no suspicious ratio, and a 4 KB archive expanding to
  512 MB sits under any ceiling worth having. Zip only; a `tar` `typeflag` check is not the same code
  as a zip mode check, so a second container needs its own adverse suite before it needs an
  implementation.
- **The upload endpoint stages a target and neither creates a scan nor charges.** That separation is
  what makes FR-015's "refuse before charging" structural instead of a matter of statement ordering.
- **A repository is fetched as a zipball, not cloned** so repository bytes go through the same guard
  an upload does, the token stays out of `ps`, and no `git` binary sits in an image that processes
  hostile input. `stripComponents: 1` is not cosmetic: leaving GitHub's `owner-repo-<sha>/` wrapper
  in place changes every source finding's fingerprint on every commit.
- **Scan workspaces are destroyed on every exit path**: completion, failure, timeout, cancellation.
  Four paths, four assertions.

## UI work

**The design system at `design-system/` is authoritative.** Vendored from an approved Claude Design
export: 15 components, 26 screens, 97 tokens, and its own lint config. Constitution v1.1.0
"Design Adherence" governs. Routing table: [design/screen-map.md](../design/screen-map.md).

1. **Port, never author.** If a component exists in `design-system/components/`, port it. Read its
   `.d.ts` for the prop contract and its **`.prompt.md` for constraints that are not visible in the
   code**, such as why `SeverityBadge` may never be restyled toward the brand accent.
2. **Tokens only, via `var()`.** Every colour, size, and font comes from
   `design-system/tokens/*.css`. New raw hex/px values are prohibited. The TSX adherence gate and
   the CSS Modules baseline ratchet catch different classes of drift; passing either alone is not
   full compliance.
3. **No design, no build.** A surface absent from `design/screen-map.md` is blocked, not improvised.
   Ask; do not invent. If the user explicitly authorizes an exception (the constitution's own
   governance clause: "a documented exception... and an issue to remove it"), first re-confirm the
   gap is real by searching `design-system/` **by content**, including `_ds_manifest.json`; a stale
   "No artboard" note is not proof by itself. Then reuse every existing token and established
   interaction principle before inventing anything new, and record the exception in three places:
   the component's own module note, `design/screen-map.md`'s "Documented exceptions" table, and a
   `research.md` decision entry. T143 went through exactly this process; see `research.md`'s R18 for
   the full record and the general steps.
4. **Both viewports.** 1440 and 390 are designed and measured. The mobile display scale halves
   (48 to 24px) and body tracking goes positive; counter-intuitive and easy to miss. A desktop-only
   build is incomplete.
5. **Two gates before a frontend task is done.** `pnpm lint` (adherence) and `pnpm test:visual`
   (<=0.5% diff at both viewports). Not one or the other.
6. **Never edit `design-system/`** and never import from it at runtime. It is read-only design
   reference. Vendored capability implementations are maintained separately through reviewed source
   changes.
