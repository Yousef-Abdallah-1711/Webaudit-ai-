# Evidence Envelope Contract

Per `spec.md` FR-028/FR-030/FR-031. The one write path for `Evidence` — no other code may insert a
row into this table, directly mirroring F07's own `execution-audit-contract.md`'s "one write path"
discipline.

## `recordEvidence`

```text
recordEvidence(
  executionUnitId: string,
  kind: EvidenceKind,
  payload: unknown,          // raw, pre-redaction/pre-externalization — this function decides both
) -> Evidence
```

## Required behavior

1. Read the owning `ExecutionUnit.executionUnitClass`. If it is `ACTIVE_SECURITY`/
   `AUTHENTICATED_WORKFLOW`/`SOURCE_EXECUTION`: pass `payload` through `@webaudit/redaction`
   unconditionally before any further step (FR-030) — no caller-supplied bypass flag exists.
2. Measure the (possibly-redacted) payload's serialized size. If it exceeds this platform's own
   fixed inline-size ceiling (`research.md` R7): write it to R2 via `artifact-contract.md`'s
   `createArtifact` first, then construct the `Evidence` row with `artifactId` set and
   `inlinePayload: null`. Otherwise: construct the row with `inlinePayload` set and `artifactId:
   null`.
3. Set `redacted: true` iff step 1 actually ran redaction (even if redaction found nothing to
   redact) — `redacted` records that the *mechanism* was applied, not that it found something.
4. Insert the `Evidence` row. This insert is independent of (not nested inside) the owning
   `ExecutionUnit`'s own finalization transaction — an `ExecutionUnit` may produce multiple
   `Evidence` rows over its own running lifetime, each committed as it becomes available, not
   batched until the unit finishes (so a crash after evidence is produced but before finalization
   does not lose already-gathered evidence, per `research.md`'s adversarial-review scenario #12).

## Non-negotiable boundary rules

1. This is the only write path to `Evidence` — every future engine calls this function rather than
   writing the table directly, so the redaction pass (step 1) can never be bypassed by a new call
   site forgetting to apply it (identical discipline to F07's own `execution-audit-contract.md`
   rule 1).
2. On a redaction failure (the redaction library itself throwing): the row is still written, with
   `inlinePayload` replaced by the fixed sentinel `{"_redactionFailed": true}` and `redacted: true`
   — directly reusing F07's own `execution-audit-contract.md` rule 2's identical resolution (the
   evidence's *existence* and its kind/provenance metadata are never silently lost to a redaction-
   library bug).
3. This function MUST NOT accept a caller-supplied `artifactId` for an evidence record whose
   content it has not itself seen and sized — the inline-vs-artifact decision (step 2) is always
   this function's own, never delegated to the calling engine's own judgment (`research.md` R7).
4. No AI judgment may decide what an `Evidence` record contains, whether it is redacted, or
   whether it is sufficient to support a Finding (FR-046) — this function is a pure, deterministic
   transformation of the engine's own measured `payload`.
