# Contract: Offline Dependency Advisory Matching

Per FR-111, FR-112, FR-156, FR-160, FR-168 (snapshot storage), FR-170 (freshness anchor), FR-164/FR-169 (reverify routing and billing), FR-165 (no AI findings), plus FR-136 to FR-139 (verdicts), FR-141 (fingerprint), FR-146 to FR-150 (registry), FR-151 to FR-154 (reverify), Constitution II (vendored; no scan-time fetch). Owns the `AdvisorySnapshot`, the deterministic matching semantics over 011 `DEPENDENCY` evidence, the `ADVISORY_MATCH` evidence shape, the verdict mapping and the relationship to the legacy `dependency-scanner`. Reason codes: closed SEC_* registry only (all 83 codes are in plan.md; unresolved questions are under Open for closure).

## Status / Ownership

- Status: planning contract, NOT frozen. Provider of the snapshot distribution mechanism: `UNKNOWN - REQUIRES INVESTIGATION` (plan.md Technical Context); this contract states requirements any mechanism must meet.
- Ownership: parent-side Advisory Matcher (no execution class, no queue, no network, no credential; plan.md "Parent-side"). 011 owns `DEPENDENCY` and `CODE_FLOW` evidence and lockfile acquisition; 012 owns the snapshot, matcher, evidence kind `ADVISORY_MATCH` and the `dep.*` checks. An operator (platform staff) owns snapshot import; customers never import or edit snapshots.
- Pattern: parent-side registry check (010/011 pattern; FR-147): `onSecurityEvidenceCommitted` over committed `DEPENDENCY` evidence; `evaluate` is pure/synchronous over committed Evidence **plus the pinned snapshot**.

## Consumers

- Security Check Evaluator (`dep.*` checks), `security-finding-contract.md` (verdicts/materialization), `security-coverage-contract.md` (advisory section), `security-reverify-contract.md` (dependency-advisory strategy), SPEC 014 (read-only), report UI. Legacy `dependency-scanner` is a neighbor, not a consumer.

## Inputs

1. 011 `DEPENDENCY` evidence of a snapshot-bound plan (tenant- and target-scoped). **Fields this contract requires.** **VERIFICATION RESULT (against 011 `contracts/static-analysis-contract.md`, `contracts/source-evidence-contract.md`, `contracts/dependency-installation-contract.md`, `data-model.md` l.193, `spec.md` FR-028/FR-068): UNVERIFIED — closure item.** 011 guarantees only the `ObservationEnvelope` (`kind: "DEPENDENCY"`, `path`, `line`, `column`, `ruleId`, `ruleVersion`, `tool`, `snapshotDigest`, `excerpt?`, `confidence`) and that static inspection emits `DEPENDENCY` observations for unpinned versions, git/tarball/file dependencies, install scripts present and dependency-confusion-shaped scoped names (static-analysis inv. 11; dependency-installation inv. 9); lockfile `resolved` + `integrity` are used for allowlist derivation (supported: npm lockfile v3, pnpm 9.0, yarn classic v1; yarn berry static-only). 011 does **not** type a `DEPENDENCY` payload anywhere and does not state that it carries `ecosystem`, `packageName`, `resolvedVersion`, `lockfilePathIdentity`, `lockfileKind`/`lockfileVersion`, `dependencyScope`, `depthClass`, `dependencyPaths`, `sourceForm`, `integrityPresent` or `workspaceKey`. The list below is therefore a **consumption assumption**, not a verified 011 guarantee; until 011 (or an upstream clarification) types these fields, any missing field makes the package `NOT_TESTED`/`SEC_VERSION_UNRESOLVED` (resolved version or source form) and may never be inferred: `ecosystem`, `packageName`, `resolvedVersion` (exact, lockfile-resolved), `lockfilePathIdentity` (workspace-relative), `lockfileKind` + `lockfileVersion`, `dependencyScope` (`PROD|DEV|OPTIONAL|PEER|UNKNOWN`), `depthClass` (`DIRECT|TRANSITIVE|UNKNOWN`), optional `dependencyPaths`, `sourceForm` (`REGISTRY|GIT|TARBALL|FILE|LINK|PRIVATE_REGISTRY|UNKNOWN`), `integrityPresent`, `workspaceKey` (for correlation, FR-099).
2. 011 `CODE_FLOW` evidence (optional, for reachability): import/call path facts with a `surfaceComplete` flag.
3. The pinned `AdvisorySnapshot` (below).
4. Registry definitions `dep.*` (check ids and versions below; names provisional).

## Outputs

`ADVISORY_MATCH` Evidence (one per matched package/advisory pair), `SECURITY_CHECK_RESULT` rows, `Issue` rows for finding verdicts (via `materializeFinding`), coverage counters (`advisory` section). No network traffic, no file write outside Evidence/Artifacts.

## AdvisorySnapshot

```text
AdvisorySnapshot = {
  snapshotId, schemaVersion: 1,
  source: "OSV",                       // v1: OSV schema import only
  osvSchemaVersion: string,            // e.g. "1.x"; unknown major => not activatable
  sourceRetrievedAt: Timestamp,        // when the operator retrieved the source dump (inside the signed manifest)
  importedAt: Timestamp, importedBy: OperatorRef,
  retrievalMethod: "OPERATOR_IMPORT",  // never a scan-time or customer-triggered fetch
  ecosystems: string[], advisoryCount: number,
  snapshotDigest: "sha256:<hex>",      // over the canonical sorted advisory records (not the compressed transport)
  provenance: { sourceUri: string /* informational, never fetched */, manifestSignature: { scheme, signerKeyId, verified: boolean } },
  payloadKey: string,                  // platform-global R2 key `advisory-snapshots/<digest>` (FR-168, L21); NOT a 009 Artifact (read-only, not customer data)
  state: "IMPORTED" | "VERIFIED" | "ACTIVE" | "SUPERSEDED" | "REVOKED"
}
```

1. **Import is an operator action outside any scan.** The importer validates size/shape bounds (<= 256 MiB artifact, <= 500 000 advisories, <= 1 MiB per record, JSON depth <= 32; PROVISIONAL), recomputes `snapshotDigest`, verifies the manifest signature (the Fahes operator signing key attests digest + `sourceRetrievedAt` + source; scheme `UNKNOWN - REQUIRES INVESTIGATION`, any scheme must give key ids and rotation), and only then moves `IMPORTED -> VERIFIED -> ACTIVE`. An unsigned or digest-mismatched snapshot never becomes `ACTIVE`. Every import and state change is audited (`AuditLogEntry`), no secret involved.
2. Snapshots are immutable; a newer one `SUPERSEDES` the previous; a corrupted/poisoned one is `REVOKED` (past results keep their recorded digest; reverify never uses a revoked snapshot). **Revocation consequence (MA-16)**: a finding whose supporting `ADVISORY_MATCH` pins a `REVOKED` snapshot digest would otherwise stay `OPEN` indefinitely as a possibly poisoned claim with nothing to tell the customer; the report, the fixes board and exports therefore annotate every such finding "advisory data revoked, reverify recommended" (derived at read time from `AdvisorySnapshot.state` through the `IssueEvidenceLink` join, no new column and no `Issue` state change), the operator `advisory.revoke` audit entry records the affected Issue count, and the finding is never auto-resolved or deleted (FR-112, FR-153; it leaves the annotated state only through a `PASSED` reverify against a non-revoked snapshot).
3. **Freshness bound (PROVISIONAL 14 days)**: a snapshot is stale when `now - sourceRetrievedAt > 14 d` (database clock). `importedAt` does not refresh it, so importing an old dump yesterday does not make data fresh.
4. **Pinning**: the matcher resolves the single newest non-revoked `ACTIVE` snapshot once at evaluation start for the plan and records its `snapshotDigest` and `sourceRetrievedAt` on every result and match; matching for one plan never mixes snapshots.
5. The snapshot is global public advisory data (not tenant-owned); there is no customer-supplied advisory path, so a tenant cannot inject or suppress advisories for another.
6. Advisory text (summary, details, references) is third-party untrusted data: stored only as bounded redacted excerpts (<= 200 chars summary), never rendered as HTML, reference URLs stored as data and never fetched, never fed to AI beyond id/severity class (FR-134, FR-144).

## Operations

```text
pinActiveSnapshot(now) -> AdvisorySnapshot | { unusable: "MISSING" | "INVALID" | "STALE" }
matchPackage(pkg: DependencyFact, snapshot) -> AdvisoryMatch[]                   // pure, deterministic
parseSemver(v: string) -> Semver | null                                         // strict SemVer 2.0.0
compareSemver(a: Semver, b: Semver) -> -1 | 0 | 1                               // SemVer 2.0.0 precedence, build metadata ignored
isAffected(version: Semver, affected: OsvAffected) -> boolean
suggestFix(version: Semver, matchedAffected: OsvAffected[]) -> { fixedVersion?: string, ambiguous: boolean }
evaluateAdvisoryCheck(deps: DependencyFact[], codeFlow?: CodeFlowFact[], snapshot) -> SecurityCheckResult[]
```

Ordered steps of `evaluateAdvisoryCheck` (after the `sec-check-execution` claim, scope `lockfilePathIdentity`):

1. `pinActiveSnapshot`. `MISSING`/`INVALID` -> `NOT_TESTED` + `SEC_ADVISORY_SNAPSHOT_UNAVAILABLE`; `STALE` -> `NOT_TESTED` + `SEC_ADVISORY_STALE`. Stop (no package is reported tested).
2. Partition packages: `ecosystem != npm` (v1) -> `UNSUPPORTED` + `SEC_ECOSYSTEM_UNSUPPORTED`; `sourceForm != REGISTRY` or `resolvedVersion` absent/not strict SemVer -> `NOT_TESTED` + `SEC_VERSION_UNRESOLVED`. These are counted, listed in coverage, never silently dropped, never matched by range.
3. For each remaining package (sorted by `lockfilePathIdentity`, `packageName`, `resolvedVersion`): lookup advisories indexed by `(ecosystem, packageName)`; skip `withdrawn` advisories; apply `isAffected` per `affected[]` entry; collapse alias clusters (below); emit `AdvisoryMatch`.
4. Reachability from `CODE_FLOW` (below). 5. Verdict mapping (below). 6. Write `ADVISORY_MATCH` evidence per match (fenced/claimed per `security-evidence-contract.md`; naturalKey in that contract), then results, then materialize via the evaluator.

## Matching semantics (deterministic, npm)

- **Subject**: the exact lockfile-resolved version of an installed package (including transitive packages, which the lockfile lists). Declared ranges in `package.json` are never matched (they do not say what is installed). No `semver.satisfies` is used for advisories; advisories carry event ranges, not npm range strings.
- **Version grammar**: strict SemVer 2.0.0 (`MAJOR.MINOR.PATCH[-pre][+build]`, no leading zeros in numeric parts). Anything else -> `SEC_VERSION_UNRESOLVED`. Precedence per SemVer 2.0.0 section 11: compare numeric core; a pre-release is lower than the release; numeric identifiers compare numerically, alphanumeric lexically in ASCII, numeric < alphanumeric, shorter identifier list is lower when all preceding are equal; build metadata ignored.
- **OSV range types**: `SEMVER` is evaluated; `ECOSYSTEM` ranges for the npm ecosystem are treated as `SEMVER`; `GIT` ranges are not evaluable from a registry version and are ignored (counted as `rangeTypeSkipped`; an advisory with only `GIT` ranges yields no match and is never reported as "not affected").
- **Event evaluation** for one `affected[].ranges[]` entry: sort events ascending by version (`"0"` is the lowest), stable tie order `introduced < fixed < last_affected`; iterate with `affected = false`: `introduced v`: if `version >= v` then `affected = true`; `fixed v`: if `version >= v` then `affected = false`; `last_affected v`: if `version > v` then `affected = false`. The version is affected iff `affected` is true after the last event. `limit` events are ignored for npm.
- **Explicit versions**: `affected[].versions` is an exact-equality alternative (SemVer-equal ignoring build metadata); a version listed there is affected.
- An advisory matches a package iff any `affected[]` entry with `package.ecosystem == "npm"` and equal `package.name` (case-sensitive, npm names as published) is affected by range or versions.
- **Alias collapse**: advisories sharing any id in `id`/`aliases` for the same `(package, version)` collapse to one match with `advisoryId` = lexicographically smallest id in the cluster and `aliases[]` listing the rest; severity class = highest among the cluster's quoted classes.
- **Determinism**: output order is sorted by `(lockfilePathIdentity, packageName, resolvedVersion, advisoryId)`; identical `(DependencyFact set, snapshotDigest)` yields byte-identical results.

## Reachability and exploitability

A vulnerable version alone is never "exploitable" (FR-111). `reachability` is one of `UNKNOWN` (default), `PACKAGE_IMPORTED` (011 `CODE_FLOW` shows an import/require path from application code to the package, with `surfaceComplete: true` for that path scope), `NOT_IMPORTED_OBSERVED` (`surfaceComplete: true` and no import path found). It is **package-level only**: Fahes never claims the vulnerable function is called. Absent `CODE_FLOW`, the value is `UNKNOWN` and the report says "reachability unknown". Transitive packages without a path stay `UNKNOWN`.

## Verdict mapping (FR-111, FR-136/138/139)

| Condition | Verdict | Severity (via `security-finding-contract.md` table) |
|---|---|---|
| Match; `dependencyScope == PROD`; exact lockfile version; `reachability == PACKAGE_IMPORTED`; no unevaluated qualifiers | `LIKELY_VULNERABILITY` | `min(advisory class, HIGH)` |
| Match; `PROD`; exact lockfile version; `reachability == UNKNOWN` | `CONFIGURATION_RISK` | `min(advisory class, HIGH)`; default MEDIUM if class unknown |
| Low-confidence match: `dependencyScope` in `DEV|OPTIONAL|PEER|UNKNOWN`, or `reachability == NOT_IMPORTED_OBSERVED`, or the matched `affected` entry carries applicability qualifiers Fahes does not evaluate (`ecosystem_specific`/`database_specific` keys such as `imports`, `functions`, `os`, `cpu`) | `INFORMATIONAL` | `INFO` |
| Scope evaluated, zero matches among resolved packages | `NO_ISSUE_DETECTED` (statement: "no advisory match among N lockfile packages in lockfile L against snapshot S of date D"; never "dependencies are safe") | - |
| Snapshot stale (`now - sourceRetrievedAt` over the bound, FR-170) | `NOT_TESTED` | `SEC_ADVISORY_STALE` |
| Version unresolved / non-registry source | `NOT_TESTED` | `SEC_VERSION_UNRESOLVED` |
| Ecosystem outside npm | `UNSUPPORTED` | `SEC_ECOSYSTEM_UNSUPPORTED` |
| No/invalid/revoked snapshot | `NOT_TESTED` | `SEC_ADVISORY_SNAPSHOT_UNAVAILABLE` |
| No `DEPENDENCY` evidence | `NOT_TESTED` | `SEC_NO_EVIDENCE` |
| 011 producer unit failed/refused | `BLOCKED` | `SEC_UPSTREAM_PRODUCER_FAILED` (or upstream reason verbatim) |

Advisory-quoted severity (`advisorySeverityClass` in `LOW|MODERATE|HIGH|CRITICAL|UNKNOWN`, read from `database_specific.severity` when present; no CVSS recomputation in v1) is recorded as a quoted attribute and is **not** a Fahes CVSS vector: the finding's `cvss` field stays absent (FR-138). `CONFIRMED_VULNERABILITY` is impossible for advisory checks (`confirmable: false`).

**Scope-level result rule**: the unit of claim and coverage is the lockfile (`scopeKey = lockfilePathIdentity`). One scope-level `SECURITY_CHECK_RESULT` is written when the outcome is not "has matches" (`NO_ISSUE_DETECTED`, `NOT_TESTED`, `UNSUPPORTED`, `BLOCKED`). When matches exist, each match gets its own result with `scopeKey = "${lockfilePathIdentity}:${packageName}@${resolvedVersion}:${advisoryId}"`, so the zero/one-Issue-per-result rule holds, and the scope counts as executed. Packages in the same lockfile that were `UNSUPPORTED`/`NOT_TESTED` are reported in `advisory` coverage counters and in a scope-level result's `reasons[]` even when other matches exist (scope coverage rule accepted, L34).

## Fingerprint and location

Parts follow FR-141 with probe family `advisory`: `[checkVersionMajor, lockfilePathIdentity, "ADVISORY", packageName, advisoryId]` (the `checkId` is not a part; `fingerprintOf` hashes the `checkId` it is given, and every check in a `rootCauseGroup` passes the group's canonical `checkId`, L6) where `advisoryId` is the canonical alias-collapsed id; the resolved **version is not part of the fingerprint** (an upgrade within the affected range keeps the same finding; leaving the range ends it) and no snapshot digest enters it. `Issue.location` = the workspace-relative lockfile path identity plus `package@version` (producing contract's location grammar; not an HTTP endpoint). `rootCauseGroup`: `dep-advisory:${advisoryId}:${packageName}` (its canonical `checkId` is the one passed to `fingerprintOf`).

## Fix-version suggestion

`suggestFix`: from every matched `affected` range that contains the resolved version, take the smallest `fixed` event greater than the resolved version. If exactly one distinct value results: `fixedVersion` = that value, `fixAmbiguous = false`. If several distinct values result (multiple release lines), choose only the one with the same major as the resolved version when exactly one such exists; otherwise omit with `fixAmbiguous = true`. No `fixed` event (`last_affected` only, or unpatched) -> omit, text "no fixed version stated by the advisory". Fahes never states that the upgrade is safe/compatible, never computes dependency-tree consequences, never suggests a version absent from the advisory.

## False positives and customer suppression

A customer may record a **suppression** `(targetId, advisoryId, packageName, lockfilePathIdentity, reason in {NOT_REACHABLE, MITIGATED_ELSEWHERE, FALSE_POSITIVE, ACCEPTED_RISK}, note <= 500 chars redacted, createdBy, expiresAt <= 90 d)` as **audit data** (`AuditLogEntry`), owner-only. It annotates the match/finding in presentation (`customerAnnotation`). It **never deletes** the Finding, never changes the verdict, matching, evidence, coverage counters or fingerprint, and never edits the snapshot. Any effect on Issue lifecycle or on the score belongs to F03/006 FR-017, not to 012. A suppression stops applying when it expires or when `advisoryId` changes (new advisory => new match).

## Relationship to the legacy `dependency-scanner`

`packages/capabilities-vendored/dependency-scanner` (namespace `dependency`; source-only manifest reader with an 7-entry hard-coded advisory table in `advisories.ts`) is split by FR-111/plan migration map:

- **REPLACE (advisory half)**: `dependency.known-vulnerable` is superseded for advisory claims by `dep.*` checks over lockfile-resolved versions and an `AdvisorySnapshot`. The 7-entry table is not extended.
- **REUSE (hygiene half)**: `dependency.no-lockfile`, `dependency.floating-range`, `dependency.deprecated-package`, `dependency.unparseable-manifest` stay unchanged.
- **Strict parallel run (FR-160)**: until the closure/migration plan retires it, legacy `dependency.known-vulnerable` keeps running; a package in both sets can yield two Findings with different fingerprints (different `checkId`). No automatic cross-dedupe in 012; the report labels the legacy finding as "legacy manifest-based, 7-entry table". Legacy reverify (`dependency-scanner.reverify`) stays for `dependency.*` ids only; `dep.*` ids use `security-reverify-contract.md`.

## Invariants

1. No code path performs a network call during snapshot pinning, matching, fix suggestion or evaluation; the matcher has no network capability (testable by a network-denying harness).
2. A snapshot is used only if `VERIFIED`/`ACTIVE`, digest-recomputed and signature-verified; otherwise no package is reported tested.
3. `now - sourceRetrievedAt > 14 d` => no advisory verdict other than `NOT_TESTED` + `SEC_ADVISORY_STALE`; a stale snapshot never yields `NO_ISSUE_DETECTED`.
4. Matching uses only the exact lockfile-resolved version; a package with an unresolved version or non-registry source is never matched and never `NO_ISSUE_DETECTED`.
5. Matching is a pure function of `(DependencyFact, snapshotDigest)`; results are byte-identical across runs and workers.
6. `compareSemver` follows SemVer 2.0.0 section 11 (conformance fixtures include pre-release ordering and build-metadata ignoring); `GIT` ranges are never evaluated.
7. Alias clusters yield one match; withdrawn advisories never match.
8. An advisory-derived verdict is never above `LIKELY_VULNERABILITY`; `LIKELY` requires `reachability == PACKAGE_IMPORTED`; no finding text claims exploitability, only "affected version in use" (template-enforced).
9. `reachability` is `UNKNOWN` unless 011 `CODE_FLOW` evidence with `surfaceComplete: true` supports it; it is never inferred from the version alone or from AI.
10. `fixedVersion` appears only when `fixAmbiguous == false` and the version is taken verbatim from the advisory data.
11. A customer suppression never alters matching output, evidence, verdict, fingerprint or counters.
12. Every `ADVISORY_MATCH` and result records `snapshotDigest` and `sourceRetrievedAt`; one plan uses exactly one snapshot.
13. Matching evidence contains no source text, no secret and no advisory body beyond a <= 200-char redacted summary and reference URLs as inert data.
14. Ecosystems other than npm are never matched, regardless of snapshot contents (`SEC_ECOSYSTEM_UNSUPPORTED`).
15. No customer-supplied advisory data enters the snapshot path.

## Safety & Authorization

Parent-side derivation over committed evidence: no F01/F07 call, no credential, no request, no execution class; production-safe. Ownership of the source (011 acquisition) is 011's concern. The matcher reads only the owning tenant's `DEPENDENCY` evidence (`(id, userId)` filter; NotFound indistinguishable). Snapshot import is operator-only and audited; no customer-triggered import, refresh or fetch exists (Constitution II).

## Failure states

| Condition | Verdict / status | Reason code |
|---|---|---|
| Snapshot older than 14 days | `NOT_TESTED` | `SEC_ADVISORY_STALE` |
| Snapshot missing / digest or signature invalid / revoked / unknown OSV major | `NOT_TESTED` (audit event) | `SEC_ADVISORY_SNAPSHOT_UNAVAILABLE` |
| Resolved version absent / not strict SemVer / non-registry source | `NOT_TESTED` per package | `SEC_VERSION_UNRESOLVED` |
| Ecosystem not npm | `UNSUPPORTED` per package | `SEC_ECOSYSTEM_UNSUPPORTED` |
| No `DEPENDENCY` evidence | `NOT_TESTED` | `SEC_NO_EVIDENCE` |
| 011 dependency producer unit not `COMPLETED` | `BLOCKED` | `SEC_UPSTREAM_PRODUCER_FAILED` |
| Advisory feature flag/gate off | `NOT_TESTED` | `SEC_ENGINE_DISABLED` |
| Package/advisory volume over analysis cap | `BLOCKED` for the excess (recorded in coverage; never dropped silently) | `SEC_ANALYSIS_BUDGET_EXHAUSTED` |
| `evaluate` throws or overruns | `BLOCKED` result recorded | `SEC_EVALUATION_ERROR` |
| Payload fails schema | rejected `ENGINE_DEFECT` | none |

## Idempotency & retry

`sec-check-execution` claim per `(scanPlanId, check.id, check.version, scopeKey)` before the readiness query; `sec-evidence-write` naturalKey `${snapshotDigest}:${advisoryId}:${packageName}@${resolvedVersion}:${lockfilePathIdentity}`. A replay on the same snapshot writes nothing new; a re-run after a newer snapshot produces new rows (different digest) and keeps old ones. `attempts` n/a (no unit). Findings idempotent per `(scanId, fingerprint)`.

## Evidence

`ADVISORY_MATCH` payload: `schemaVersion`, `snapshotDigest`, `snapshotSourceRetrievedAt`, `advisoryId`, `aliases[]`, `ecosystem`, `packageName`, `resolvedVersion`, `lockfilePathIdentity`, `lockfileKind`, `dependencyScope`, `depthClass`, `dependencyPaths[]` (<= 3 paths, <= 8 names each), `matchedRange{type: SEMVER|VERSIONS_LIST, introduced?, fixed?, lastAffected?}`, `fixedVersion?`, `fixAmbiguous`, `advisorySeverityClass`, `qualifiersUnevaluated[]`, `reachability`, `reachabilityEvidenceIds[]`, `summaryExcerpt` (<= 200 chars, redacted), `referenceCount`, `withdrawn: false`. Supporting links: the 011 `DEPENDENCY` (and `CODE_FLOW`) evidence ids.

## Budgets / limits

LOCAL (no F07 dimension consumed; no network): <= 50 000 resolved packages per plan; <= 500 advisories considered per package; <= 2 000 `ADVISORY_MATCH` rows per plan; import bounds above; Finding cap per `security-finding-contract.md` (excess matches stay as evidence, flagged, never silently dropped). All PROVISIONAL, tightenable without amendment.

## Reverify

Dependency-advisory findings reverify through `security-reverify-contract.md` (routed to the 009 REVERIFY path before the legacy resolver, FR-164; `INCONCLUSIVE` maps to Issue `UNVERIFIABLE`; billing per FR-169/P14 PROVISIONAL; `Issue.location` here is a lockfile path identity plus `package@version`, so the HTTP location binding of FR-163 does not apply): a fresh REVERIFY plan with a fresh 011 `SOURCE_STATIC` dependency observation (fresh snapshot of the source) and the matcher run on **the same snapshot or a newer non-revoked, non-stale one** (`sourceRetrievedAt >= original`); if only an older or stale snapshot is available the result is `INCONCLUSIVE` (`SEC_ADVISORY_STALE` underlying; `SEC_ADVISORY_SNAPSHOT_UNAVAILABLE` if none is usable). `PASSED` when the fresh resolved version is outside the affected range or the advisory is withdrawn/absent in a not-older snapshot (the latter noted `advisoryWithdrawn`); `FAILED` when the same fingerprint matches again; a package no longer in the lockfile is `PASSED` only if the lockfile itself was evaluated (control: the lockfile exists and parsed), else `INCONCLUSIVE`. Original evidence remains linked.

## Boundary rules (MUST NOT)

1. MUST NOT fetch advisory data or call any external service at scan, evaluation or reverify time.
2. MUST NOT accept a snapshot that is unsigned, digest-mismatched, revoked or stale for any verdict.
3. MUST NOT match declared ranges, unresolved versions or non-registry sources; MUST NOT guess versions.
4. MUST NOT claim runtime exploitability, a vulnerable function call or business impact from a version match; MUST NOT use AI to judge reachability.
5. MUST NOT suggest a fix version that the advisory data does not state unambiguously.
6. MUST NOT delete or hide a Finding because of a customer suppression; MUST NOT let suppressions alter matching.
7. MUST NOT report `NO_ISSUE_DETECTED` for a stale snapshot, unresolved packages or unsupported ecosystems; MUST NOT describe dependencies as "safe" or "up to date".
8. MUST NOT accept customer-supplied advisories or let any tenant influence the shared snapshot.
9. MUST NOT put advisory body text, source text or secrets in fingerprints or Finding text beyond the bounded redacted excerpt.
10. MUST NOT extend the legacy 7-entry table or modify the legacy scanner's hygiene checks.
11. MUST NOT mix snapshots within one plan.

## Named limitations

1. v1 supports npm lockfile-resolved versions only; other ecosystems are `UNSUPPORTED` even though OSV covers them. Yarn berry/non-registry sources are unsupported by 011 and surface here as `SEC_VERSION_UNRESOLVED`/`UNSUPPORTED`.
2. OSV advisories are as accurate and as current as the imported dump; a freshly published advisory is missed until the next operator import (bounded by the 14-day rule, which can still allow up to 14 days of lag).
3. Reachability is package-level and static; absence of an import path does not prove non-use (dynamic `require`, transitive use).
4. Advisory severity is quoted, not recomputed; many matches show default MEDIUM when the source gives no class.
5. `GIT`-range-only advisories are not evaluated; some npm advisories lack explicit ranges and are missed.
6. Alias collapse relies on advisory `aliases` quality.
7. During the parallel run, legacy and new advisory findings can both appear for the same package.
8. Snapshot signing proves operator attestation and storage integrity, not the truthfulness of the upstream data.

## FR traceability

FR-111 (snapshot, provenance, freshness, no network, no exploitability claim, fix suggestions, reachability only via CODE_FLOW), FR-112 (SEC_VERSION_UNRESOLVED, SEC_ADVISORY_STALE, suppression as audit data), FR-136/137/139 (verdict classes), FR-141/145 (fingerprint/location), FR-146 to FR-150 (registry/idempotency), FR-151 to FR-154 (reverify), FR-156 (011 consumption by contract), FR-160 (parallel run/REPLACE-REUSE), FR-168 (snapshot storage), FR-170 (freshness anchor `sourceRetrievedAt`), FR-164/FR-169 (reverify routing/billing), FR-165 (no AI findings), FR-141 (fingerprint, L6), Constitution II (vendored; operator import).

## Acceptance tests required (named, deterministic, fixture-based; not executed in planning)

| Test | Fixture | Expected |
|---|---|---|
| `advisory.no-network` | network-denying harness during full evaluation | zero network attempts; passes |
| `advisory.snapshot.verify-and-pin` | tampered digest, bad signature, unsigned, revoked | not activatable; check `NOT_TESTED` + `SEC_ADVISORY_SNAPSHOT_UNAVAILABLE` |
| `advisory.revoked-snapshot-findings-annotated` | snapshot revoked after findings were materialized | each affected finding annotated at read time; Issue state unchanged; audit lists the count; reverify still against a non-revoked snapshot only |
| `advisory.snapshot.stale` | `sourceRetrievedAt` 15 days old but `importedAt` today (FR-170) | `NOT_TESTED` + `SEC_ADVISORY_STALE`; never `NO_ISSUE_DETECTED` |
| `advisory.semver.precedence` | pre-release/build/numeric-vs-alpha fixtures | order matches SemVer 2.0.0 |
| `advisory.range.events` | introduced/fixed/last_affected combos, sorted/unsorted, `introduced:"0"`, `fixed==introduced` | affected exactly per event algorithm |
| `advisory.range.versions-list` | explicit `versions` only | affected iff equal |
| `advisory.range.git-ignored` | `GIT`-only advisory | no match, counted `rangeTypeSkipped` |
| `advisory.transitive-visible` | lockfile with transitive vulnerable package | matched with `depthClass: TRANSITIVE` |
| `advisory.unresolved-version` | range-only/git/tarball dependency | `NOT_TESTED` + `SEC_VERSION_UNRESOLVED`; not matched |
| `advisory.ecosystem-unsupported` | PyPI/Maven facts present | `UNSUPPORTED` + `SEC_ECOSYSTEM_UNSUPPORTED` |
| `advisory.alias-collapse` | GHSA + CVE for same package/version | one match, canonical id, aliases listed |
| `advisory.withdrawn-excluded` | withdrawn advisory | no match |
| `advisory.verdict.ladder` | PROD+imported, PROD+unknown, DEV, NOT_IMPORTED, unevaluated qualifiers | `LIKELY`, `CONFIGURATION_RISK`, `INFORMATIONAL`, `INFORMATIONAL`, `INFORMATIONAL` |
| `advisory.no-exploitability-claim` | matched finding text | template text contains no "exploitable"/"vulnerable function called" |
| `advisory.reachability-unknown-without-codeflow` | no `CODE_FLOW` | `UNKNOWN`; never `LIKELY` |
| `advisory.fix.unambiguous-only` | single fixed; multi-branch same-major; multi-branch none same-major; no fixed | suggestion, same-major pick, omitted+`fixAmbiguous`, omitted |
| `advisory.suppression.audit-only` | suppression recorded | Finding, evidence, verdict, counters unchanged; annotation shown |
| `advisory.determinism` | run twice, different worker order | byte-identical evidence/results |
| `advisory.idempotent-rerun` | replay same trigger | no duplicate evidence or Issue |
| `advisory.parallel-legacy` | package in legacy table | legacy finding unchanged; 012 finding separate; labeled |
| `advisory.reverify.snapshot-same-or-newer` | older snapshot offered; newer withdrawn advisory | `INCONCLUSIVE` + `SEC_ADVISORY_STALE`; `PASSED` with note |
| `advisory.tenant-isolation` | other tenant's DEPENDENCY evidence | not readable; NotFound indistinguishable |
| `advisory.text-untrusted` | advisory summary with HTML/instructions | stored as bounded redacted text; never rendered as HTML; not sent to AI |

## Resolved additions

- **A-1**: verified against 011 contracts — **UNVERIFIED — closure item** (011 types no `DEPENDENCY` payload fields; see Inputs 1).
- **A-2** -> **L11**: `SEC_ADVISORY_SNAPSHOT_UNAVAILABLE` adopted (`NOT_TESTED`) for missing/invalid/revoked snapshots.
- **A-3** -> **L34**: a lockfile scope is covered by a scope-level result or any per-match result (coverage/registry contracts).
- **A-4** -> **L11**: `SEC_ANALYSIS_BUDGET_EXHAUSTED` adopted; plan verdict is `BLOCKED` (not `INCONCLUSIVE` as first proposed).
- **A-6** -> **L21 / FR-168 / L25 / L32 / FR-170**: `AdvisorySnapshot` storage under `advisory-snapshots/<digest>`; freshness anchored on `sourceRetrievedAt`.
- Fingerprint parts -> **L6 / FR-141**; reverify -> **L5 / FR-164, L24 / FR-169**; evaluator throw -> **`SEC_EVALUATION_ERROR`**.

## Open for closure

1. Owner (011 owner / upstream clarification): type the 011 `DEPENDENCY` payload minimum fields (`ecosystem`, `packageName`, exact lockfile-`resolvedVersion`, `lockfilePathIdentity`, `lockfileKind`/`lockfileVersion`, `dependencyScope`, `depthClass`, `sourceForm`, `integrityPresent`, `workspaceKey`) or accept the degraded behavior (missing fields => `SEC_VERSION_UNRESOLVED`).
2. Owner: confirm `dep.advisory.*` check names and `reverifyBehavior: FRESH_MINIMAL_PLAN` (placeholders under the FR-146 `dep.*` family).
3. Owner: confirm quoted `database_specific.severity` is acceptable as the only severity hint (no CVSS recomputation in v1).
4. Owner: whether a suppressed advisory finding keeps deducting from the SECURITY score is left to F03/006 FR-017; confirm.
5. Owner: customer-suppression audit shape needs a data-model entry (the `AdvisorySnapshot` entry landed per L21/L25).

## Consolidated repairs (authoritative; third repair pass, 2026-10-14)

Single normative section replacing the earlier "Analyze and adversarial repairs" and "Blocker repairs B-1..B-13" addenda: superseded items were deleted, not overridden; retained items keep their original review labels. Requirements: spec FR-161..FR-201. Nothing here claims runtime feasibility; T650 and the other feasibility gates stay open.

1. **Snapshot model (F-6)**: this contract's states `IMPORTED|VERIFIED|ACTIVE|SUPERSEDED|REVOKED` and fields (`ecosystems[]`, `payloadKey`, `osvSchemaVersion`, signature) are adopted by `data-model.md` §4.9; one `ACTIVE` snapshot per source.
2. **Legacy table size (F-12)**: the legacy `dependency-scanner` table has **7** entries (verified in `advisories.ts`).
3. **Freshness (G-32, FR-170)**: `now - sourceRetrievedAt <= 14 d` **and** bounded by the newest advisory `modified` inside the payload; signature mandatory. Test `advisory.restamped-old-data-stale`.
