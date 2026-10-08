# Quickstart: Validating a Future Engine Spec (E10-E17) or Product Spec (SPEC 2-6) Against This
Platform

This feature produces no running system, so there is no "run the app" quickstart. This is the
validation guide a future engine spec's author or reviewer runs against this platform's package —
extending, not replacing, 006's own eight-step child-spec checklist
(`specs/006-scan-architecture-v2/quickstart.md`), since every future Engine spec now consumes
*this* spec's concrete contracts, not only 006's placeholders.

## Part A — 006's own eight steps, re-run against this spec specifically

1-8. Run 006's own eight validation steps (execution-class contract check, reuse/extend/new
consistency, authorization-is-not-ownership, untrusted-code-isolation, tenant-isolation,
migration/backward-compatibility, metering-scope, observability-without-leakage) exactly as 006's
own `quickstart.md` defines them, substituting this spec's `plan.md`/`data-model.md`/`contracts/`
wherever that document says "the master architecture's own." **Expected outcome**: identical
pass/fail semantics; this spec does not redefine any of the eight checks, only supplies more
concrete content to check against.

## Part B — This platform's own eight steps (new, specific to F02+F03+F04's consolidated scope)

1. **Execution Unit completeness check.** Does the engine spec's own declared `ExecutionUnit`
   instance (via `contracts/execution-unit-contract.md`) fill every field, including
   `requiresSafetyCheckpoint` (computed, never self-declared) and `evidenceContractRef`? **Expected
   outcome**: zero blanks, zero self-declared computed fields.
2. **Queue placement check.** Does the engine spec name which of this platform's dedicated queues
   (`plan.md`'s Runtime/Queue Topology) its execution class dispatches onto, or does it propose
   sharing an existing short-job queue? **Expected outcome**: a FAIL on "proposes sharing a
   short-job queue for a long-running class" blocks the spec unconditionally (Constitution
   Principle XII).
3. **Process-isolation check.** Does the engine spec's own dispatch wrapper use this platform's
   `execution-runtime-contract.md` fork-and-SIGKILL pattern (FR-019), or does it propose a
   different, unproven mechanism? **Expected outcome**: a FAIL here (a bespoke mechanism with no
   proven precedent) blocks the spec unconditionally — this is the mechanism that resolves F07's
   own named open dependency, and a second, unproven mechanism would reopen it.
4. **Safety-checkpoint integration check.** Does every safety-sensitive action the engine spec
   defines call `execution-runtime-contract.md`'s own checkpoint sequence (which itself calls F07),
   with no direct F01/F07 call bypassing it? **Expected outcome**: a FAIL here blocks the spec
   unconditionally (Constitution Principle VIII; this is the same severity F01's own check 3/4
   carry).
5. **Evidence/Artifact check.** Does every evidence kind the engine spec produces map to an
   existing `EvidenceKind` value or justify a new one, and does any large-content evidence kind
   correctly externalize to `Artifact` rather than growing `inlinePayload` unboundedly? **Expected
   outcome**: pass/fail per evidence kind, zero unjustified new kinds, zero unbounded inline growth.
6. **Failure-classification check.** Does the engine spec's own child spec declare, for each of
   its own failure modes, which `FailureClass` value applies — in particular, correctly
   distinguishing a measured/adversarial result (`DETERMINISTIC_FINDING`, never persisted as a
   failure) from a genuine infrastructure/engine fault? **Expected outcome**: pass/fail per named
   failure mode.
7. **Reverify-compatibility check.** Does the engine spec's own reverify strategy (if it has
   findings that can be reverified) resolve a fresh, minimal plan per `contracts/execution-plan-
   contract.md`'s own `REVERIFY`-kind rule, rather than inventing a bespoke recheck path? **Expected
   outcome**: pass/fail, with a FAIL blocking only if the engine spec claims reverify support at
   all (an engine with no reverify story yet is not blocked by this check).
8. **Progress-honesty check.** Does the engine spec's own progress reporting set
   `progressIndeterminate: true` whenever its own total work is genuinely unknown in advance (e.g.
   a frontier-driven class), rather than fabricating a percentage? **Expected outcome**: pass/fail.

## Dry-run validation note (2026-10-07)

As this spec's own `tasks.md` T014, Part B's eight steps were run against this spec's own
`plan.md`/`data-model.md`/`contracts/` as a self-referential sanity check (there is no concrete
engine spec yet to run them against for real — the same caveat 006's own dry-run note states for
an identical reason). Result: all eight pass by inspection — step 3 and step 4 are trivially
satisfied because this spec's own contracts *are* the mechanism being checked for, not a derivative
of it; steps 1, 2, 5, 6, 7, 8 each pass against concrete content already present in
`data-model.md`/`contracts/`/`research.md` R9a. No fix was required as a *result* of this dry run
specifically (the fixes recorded in this spec's own checklists were found during the checklist
review that preceded this dry run, not during the dry run itself).

## Expected overall outcome

An engine spec (E10-E17) or product spec (SPEC 2-6) that passes 006's own eight steps (Part A) and
this platform's own eight steps (Part B) is ready for its own `/speckit-tasks`. A spec that fails
Part B step 3 or step 4 is blocked unconditionally regardless of how complete the rest of its
planning is — these two checks encode the two highest-severity obligations this platform exists to
enforce (the resolved force-termination mechanism, and F01/F07's safety contracts never being
bypassed).
