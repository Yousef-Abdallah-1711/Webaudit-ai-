# Scan Configuration Contract

Per `spec.md` FR-001/FR-004. The shape a (future) richer `/scan` UX (U30, not designed here) or any
other caller submits to the Plan Resolver (`execution-plan-contract.md`). This is a request DTO,
not necessarily its own persisted table — `ScanPlan` (the *resolved* output) is what this spec
actually persists.

## Shape

```text
ScanConfiguration = {
  targetId: string,
  profile:
    | { kind: "NAMED", scanProfileId: string, scanProfileVersion?: number }  // omit version = latest
    | { kind: "CUSTOM", domains: ModuleType[], perDomainConfig?: Record<ModuleType, unknown> },
  requestedAuthorizationGrantIds?: string[],  // the user's intended F01 TargetAuthorization grant(s), if any domain needs one
}
```

- `profile.kind: "NAMED"` resolves `defaultDomains`/`domainExecutionClasses` from the named
  `ScanProfileVersion` (FR-002/FR-003); `perDomainConfig`, if also supplied, is validated against
  that version's own `advancedConfigSchema` and layered on top of (never replacing) the profile's
  own defaults.
- `profile.kind: "CUSTOM"` bypasses any named profile entirely — `domains` is the caller's own
  explicit domain selection, each resolved to its required execution class(es) through the same
  FR-004 mapping a named profile would have used (the three-layer domain -> class -> unit chain is
  identical either way; only the *source* of the domain list differs).
- `requestedAuthorizationGrantIds` is advisory, not authoritative — the Plan Resolver
  (`execution-plan-contract.md`) always re-derives which grant actually satisfies each class via a
  fresh F01 `isAuthorized` call (FR-007); a caller naming the "wrong" grant id here simply fails
  that fresh check with F01's own specific refusal reason, it never short-circuits the check.

## Non-negotiable boundary rules

1. This shape never carries a raw credential, session token, or secret of any kind (FR-020) — only
   ids and configuration values.
2. This shape is never itself persisted as the authority for what ran — only the `ScanPlan` FR-006
   resolves from it is. A `ScanConfiguration` that produced a `REFUSED` plan is not retried
   automatically with the same inputs (identical to F01's authorization-check-contract rule 3) —
   a retry is a fresh submission, typically after the user narrows scope or obtains a grant.
3. No AI judgment may construct, validate, or modify any field of this shape on the caller's behalf
   in a way that bypasses the user's own explicit domain/profile selection (FR-046) — an AI-assisted
   `/scan` UX, if one is ever built, must still produce an explicit `ScanConfiguration` a human
   confirmed, not one an AI silently expanded.
