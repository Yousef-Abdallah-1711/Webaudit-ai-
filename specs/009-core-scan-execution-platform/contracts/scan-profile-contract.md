# Scan Profile Contract

Per `spec.md` FR-002/FR-003. The service-layer operations for creating and versioning a
`ScanProfile`, analogous in role to F01's `grant-lifecycle-contract.md`.

## `createScanProfile` (system-defined profiles only, in this planning pass)

```text
createScanProfile(
  slug: string,
  defaultDomains: ModuleType[],
  domainExecutionClasses: Record<ModuleType, ExecutionUnitClass[]>,
  advancedConfigSchema?: JsonSchema,
) -> ScanProfile (with its first ScanProfileVersion, version = 1)
```

This planning pass does not design a customer-facing "create your own named profile" product
surface (master-prompt §8's own "do not invent business-facing profile names" instruction) — the
placeholder set (quick/standard-full/production-readiness/frontend-QA/security/authenticated-
application/load-capacity/custom) is seeded this way, by an operator/migration, not by an
end-user-facing route this spec defines.

## `publishScanProfileVersion`

```text
publishScanProfileVersion(
  scanProfileId: string,
  defaultDomains: ModuleType[],
  domainExecutionClasses: Record<ModuleType, ExecutionUnitClass[]>,
  advancedConfigSchema?: JsonSchema,
) -> ScanProfileVersion (version = previous max + 1)
```

Creates a **new** version row — never updates an existing `ScanProfileVersion` in place (FR-003's
"editing a profile MUST NOT retroactively change an already-resolved plan" guarantee is structural:
there is no update-in-place operation for a published version, the identical "immutable because no
mutation path exists" pattern F01's `ScopeDefinition` already uses).

## `resolveScanProfileVersion`

```text
resolveScanProfileVersion(scanProfileId: string, version?: number) -> ScanProfileVersion | NotFoundError
```

Called by the Plan Resolver (`execution-plan-contract.md`) at `ScanConfiguration` resolution time.
Omitting `version` resolves the current maximum (latest) — but whichever version is actually
resolved is the one snapshotted onto the resulting `ScanPlan.scanProfileVersionId` (FR-003),
**not** re-resolved later if a newer version is published afterward.

## Non-negotiable boundary rules

1. A `ScanProfileVersion`, once published, is never mutated — only superseded by a new version.
2. No AI judgment may decide a profile's default domains, execution-class mapping, or config
   schema (FR-046) — profile definitions are deliberately conservative, human-authored artifacts.
3. `domainExecutionClasses` MUST map every entry in `defaultDomains` to at least one
   `ExecutionUnitClass` — a domain with no resolvable execution class is a contract violation, not
   a silently-empty mapping (this is the concrete enforcement point for FR-004's "a domain MUST NOT
   become a queue job directly" rule — there must always be a deterministic class to resolve to).
