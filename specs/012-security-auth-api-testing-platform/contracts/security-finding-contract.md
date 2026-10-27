# Contract: Security Finding, Confidence, Severity and Materialization

Per FR-136 through FR-145, FR-064, FR-106, FR-123, FR-140, FR-144, FR-146 through FR-150, FR-163, FR-164, FR-165. Owns the confidence taxonomy, the mapping to SPEC 010's six verdicts, the rules by which a `SECURITY_CHECK_RESULT` becomes (or does not become) an `Issue`, the deterministic severity derivation, fingerprint parts, location grammar and the AI boundary. Reason codes: closed SEC_* registry (plan.md) or upstream verbatim.

## Status / Ownership

- Status: planning contract, NOT frozen.
- Ownership: Context J (Finding and Reverify Integration) for materialization; Context D-I for check evaluation. 009 owns `materializeFinding`, `fingerprintOf`, `Issue`, `IssueEvidenceLink` and attribution; `packages/scoring` owns the product score; 012 owns confidence, severity derivation and the registry that decides what is materialized.
- Pattern: mirrors 011 `source-evidence-contract.md` §"Finding materialization rules" and 010 `coverage-contract.md` (six-value taxonomy). 012 uses its own kind/scope strings and does not widen 010 `CHECK_RESULT` (FR-136).

## Consumers

- 009 `materializeFinding` (called by the Security Check Evaluator, the only caller); `apps/worker/src/module-runner/persist.ts` `persistModuleResult` pathway semantics (`Issue.attribution`, unique `(scanId, fingerprint)`).
- `packages/scoring` (`scoreFromFindings`, `overallScore`) as read-only consumer of `Issue.severity`.
- `security-coverage-contract.md`, `security-reverify-contract.md`, report API/UI, `ai-executor` (explanations), SPEC 014 (rootCauseGroup).

## Inputs

- A committed `SECURITY_CHECK_RESULT` verdict candidate: `(check definition id+version, scopeKey, supporting evidence ids, oracle outcome, counts, cleanup state)`.
- The check's registry entry: `severityGuidance{default, cap}`, `confirmable`, `rootCauseGroup`, `cwe[]`, `owasp[]`, `exploitPrerequisites[]`, `cvssDerivation`, `devDefaultSensitive`, `classification`.
- Target environment at check time (FR-014), customer-declared `assetCriticalityHint` (optional data; Fahes never infers it, FR-138).

## Outputs

`SECURITY_CHECK_RESULT` Evidence (always); for the four finding verdicts, additionally one `Issue` (via `materializeFinding`) with `IssueEvidenceLink` rows to the supporting evidence **and** to the `SECURITY_CHECK_RESULT` (so confidence is retrievable without an `Issue` column).

## Operations

```text
type Confidence = "CONFIRMED_VULNERABILITY" | "LIKELY_VULNERABILITY" | "CONFIGURATION_RISK" | "INFORMATIONAL"
type NonFinding  = "NO_ISSUE_DETECTED" | "INCONCLUSIVE" | "NOT_TESTED" | "BLOCKED" | "UNSUPPORTED"
type SecurityVerdict = Confidence | NonFinding
toCheckVerdict(v: SecurityVerdict) -> CheckVerdict010     // NO_ISSUE_DETECTED->PASS; four Confidence->FINDING; others identical

deriveSeverity(input: SeverityInput, table: SeverityTable /* versioned data */) -> Severity   // pure, deterministic
deriveCvss(def: CheckDef, evidence: SanitizedEvidence[]) -> CvssVector | undefined             // only if all base metrics determinable
buildFindingShape(result, severity) -> { severity, title, explanation, consequence, location, fixPrompt, fixable }
fingerprintPartsOf(result) -> string[]
canonicalLocation(method, apiIdentity|url) -> string       // "GET https://host/path/{}" form
materializeSecurityFinding(result) -> Issue | null         // null for the five non-finding verdicts
```

Ordered steps of `materializeSecurityFinding` (called once per committed result, after the `sec-check-execution` claim is won):

1. Read verdict. If it is one of the five non-finding verdicts: return `null` (coverage only, FR-139).
2. Verify the preconditions of the verdict (rules M1-M6 below); a violated precondition downgrades the verdict deterministically (never upgrades) and records the downgrade reason, then continues from step 1.
3. `severity = deriveSeverity(...)`; `cvss = deriveCvss(...)`.
4. Build title/explanation/consequence/fixPrompt from **static templates** keyed by `(checkId, major version, verdict)` filled with evidence-derived non-secret parameters; pass every text field through `@webaudit/redaction` `redactText` before `materializeFinding` (Finding text never carries a value; FR-127).
5. `fingerprintParts = fingerprintPartsOf(result)`; `location = canonicalLocation(...)`.
6. `materializeFinding(anchorUnitId, fingerprintParts, findingShape, supportingEvidenceIds + [securityCheckResultEvidenceId])`. `anchorUnitId` = the unit that produced the primary supporting evidence (lowest `executionUnitId` by creation order among producers; for passive-only checks the passive producer unit). The runner, not the evaluator, assigns attribution (`MEASURED`), exactly as `persist.ts` requires (FR-064).
7. Return the `Issue`.

## Confidence taxonomy and mapping

| Verdict | Class | 010 verdict | Materializes `Issue`? | Meaning |
|---|---|---|---|---|
| `CONFIRMED_VULNERABILITY` | Confidence | FINDING | yes | Confirmable check + fixture-confined oracle proof (FR-140) |
| `LIKELY_VULNERABILITY` | Confidence | FINDING | yes | Evidence-backed indicator without oracle proof; also the ceiling for every weak signal |
| `CONFIGURATION_RISK` | Confidence | FINDING | yes | Misconfiguration/advisory match; no exploitability claim |
| `INFORMATIONAL` | Confidence | FINDING | yes (severity `INFO`) | Observation worth reporting, not a defect |
| `NO_ISSUE_DETECTED` | Non-finding | PASS | no | The executed probes saw no issue; scoped statement only (FR-137) |
| `INCONCLUSIVE` | Non-finding | INCONCLUSIVE | no | Evidence insufficient/ambiguous |
| `NOT_TESTED` | Non-finding | NOT_TESTED | no | Precondition false / no evidence / fixture absent |
| `BLOCKED` | Non-finding | BLOCKED | no | Authorization, scope, credential, budget or upstream refusal |
| `UNSUPPORTED` | Non-finding | UNSUPPORTED | no | Capability or target type outside v1 |

Confidence is **not** an `Issue` column (FR-136): it lives in `SECURITY_CHECK_RESULT` and is joined for display. Confidence is not severity (FR-138).

## Materialization rules

- **M1**: Only `CONFIRMED_VULNERABILITY`, `LIKELY_VULNERABILITY`, `CONFIGURATION_RISK`, `INFORMATIONAL` call `materializeFinding`. Any other verdict never creates an `Issue` (FR-139).
- **M2**: A weak signal is never above `LIKELY`. A generic 500, an ambiguous error page or an unmatched banner is `INCONCLUSIVE` + `SEC_SIGNAL_WEAK`, not a finding. A high-severity hypothesis is never `CONFIRMED` (FR-139).
- **M3**: `CONFIRMED_VULNERABILITY` requires **both** (a) the check's registry entry declares `confirmable: true`, and (b) the check's oracle observed fixture-confined, customer-registered proof (a marker of another identity's fixture returned or modified), never from status code alone, never from AI (FR-140). If (a) or (b) fails the verdict is downgraded to `LIKELY_VULNERABILITY` when an indicator exists, else `INCONCLUSIVE`.
- **M4**: Injection/XSS/SQL-error indicator families are `confirmable: false` by registry construction (FR-106); their ceiling is `LIKELY_VULNERABILITY` and they carry `confirmationLimitation` and `SEC_CONFIRMATION_REQUIRES_UNSAFE_ACTIVITY` as a FLAG annotation on the result.
- **M5**: A `CONFIRMED` or `LIKELY` result whose required cleanup failed or is unverified is **kept**, with the cleanup state attached; a `NO_ISSUE_DETECTED` in the same situation is converted to `INCONCLUSIVE` + `SEC_CLEANUP_FAILED`/`SEC_CLEANUP_UNVERIFIED` (FR-123).
- **M6**: Configuration observations without exploit proof are `CONFIGURATION_RISK` (or `INFORMATIONAL`), never `CONFIRMED`. Token absence for CSRF is `CONFIGURATION_RISK`/`INFORMATIONAL`, never "exploitable CSRF" (FR-108). Vulnerable-version-only advisory matches are `CONFIGURATION_RISK`/`LIKELY` and never claim runtime exploitability (FR-111).
- **M7**: Findings from `COMPLETED` units reach the report even when sibling units failed, were cancelled or were killed (009 materialization rule 2, FR-038).
- **M8**: No Issue is materialized for an observation that exists only in AI-layer output (FR-144; see AI boundary).

## Severity derivation (FR-138)

`Severity` order: `INFO < LOW < MEDIUM < HIGH < CRITICAL`. Inputs: `checkDefault` and `checkCap` (registry `severityGuidance`), `confidence`, `environment` (`PRODUCTION|STAGING|DEVELOPMENT` at check time), `exploitPrerequisites[]` (closed registry set: `VICTIM_INTERACTION_REQUIRED`, `NON_DEFAULT_CONFIGURATION_REQUIRED`, `PRIOR_FOOTHOLD_REQUIRED`), `assetCriticalityHint` (`LOW|MEDIUM|HIGH|UNSET`, customer data). The table is versioned data (`severityTableVersion` recorded on the result); numeric steps S3-S5 stay PROVISIONAL pending owner confirmation at closure (L35; see Open for closure).

| Step | Rule |
|---|---|
| S0 | `INFORMATIONAL` => `INFO`; stop. |
| S1 | `base = checkDefault`. |
| S2 | Confidence ceiling: `CONFIGURATION_RISK` => `min(checkCap, HIGH)` (most checks cap at MEDIUM); `LIKELY_VULNERABILITY` => `min(checkCap, HIGH)`; `CONFIRMED_VULNERABILITY` => `checkCap` (CRITICAL reachable only here). |
| S3 | Prerequisite step-down: -1 level per declared prerequisite, at most -2, floor `LOW`. |
| S4 | Environment: if `environment == DEVELOPMENT` and the check declares `devDefaultSensitive`, -1 level (floor `LOW`); otherwise no change. Non-production is never an upgrade reason. |
| S5 | Asset hint: if `assetCriticalityHint == HIGH` and confidence is `CONFIRMED_VULNERABILITY`, +1 level; otherwise no change. `LOW`/`UNSET` never lower or raise. Fahes never infers business impact or asset criticality. |
| S6 | Clamp to the S2 ceiling after S3-S5. Result is the issue severity. |

CVSS (FR-138): `deriveCvss` returns a vector only when **every** base metric is determinable by rule from the check definition (`cvssDerivation` per metric: `FIXED | FROM_EVIDENCE | UNDETERMINABLE`) and the evidence; if any metric is `UNDETERMINABLE` the vector is omitted entirely, never partially filled or guessed. CVSS version is recorded with the vector (3.1 PROVISIONAL). Availability impact is never determinable from 012 evidence (no DoS-shaped testing), so most checks will omit CVSS; that is intended. CWE and OWASP-category tags are static per check, copied from the registry, never inferred.

Product score: separate (FR-142). 012 changes no weight in `packages/scoring/src/aggregate.ts` (`SEVERITY_WEIGHT`: CRITICAL 25, HIGH 12, MEDIUM 5, LOW 2, INFO 0; verified against the working tree, L36; the `Severity` enum including `INFO` is verified in `apps/api/prisma/schema.prisma` and `packages/types/src/domain.ts`). Because `MODULE_STATES_SCORED` includes `DEGRADED`, a `DEGRADED` SECURITY result is scored from its findings and carries the mandatory `coverageComplete: false` marker plus the coverage summary; no consumer may present it as complete or as a security pass; `NOT_APPLICABLE` has a `null` score; no numeric cap (L1, FR-142, P13 OWNER-APPROVED). `INFORMATIONAL` findings (INFO) and all non-finding verdicts do not deduct. Confidence does not change the deduction: a `LIKELY` HIGH deducts the same as a `CONFIRMED` HIGH (named limitation).

## Fingerprint, rootCauseGroup and location (FR-141, FR-145)

- Parts (order is significant): `[checkVersionMajor, normalizedPathTemplate(apiIdentity), METHOD, identityRole?, parameterName?, probeFamily]` (L6/FR-141: `checkId` is NOT in the parts; `fingerprintOf` already hashes the `checkId` it is given). No line numbers, timestamps, tokens, cookie values, response values, resource ids or fixture identifiers. `fingerprintOf` (`packages/scoring/src/fingerprint.ts`) is used unchanged: `FingerprintInput{targetId, module, checkId, parts}` with length-prefixed encoding (verified in the working tree, L36).
- `normalizedPathTemplate`: scheme+host lowercased, query and fragment dropped, trailing slash removed, parameter segments in any grammar (`{id}`, `:id`, `[id]`, `<id>`) rewritten to `{}`; `apiIdentity` from `API_SURFACE` is authoritative and 012 does not redefine 011 identity grammars (FR-099).
- `identityRole?` is the `TestRole.key`, never the identity id or username. Only the **major** check version enters the fingerprint (FR-150).
- `rootCauseGroup`: checks that observe the same root cause on the same endpoint (e.g. missing auth on a write operation seen by `api.*` static and `authz.*` active) declare the same group; **every check in the group passes the group's canonical `checkId` to `fingerprintOf` (and `Issue.checkId` is that canonical id)**, so one `Issue` is produced and the sibling evidence links to it (`materializeFinding` link step is idempotent). Cross-domain `rootCauseKey` dedupe is SPEC 014's (FR-157).
- `Issue.location` is `"<METHOD> <origin><pathTemplate>"` (one space; e.g. `GET https://staging.example.com/api/orders/{}`), canonical, no query, no fragment, no value (FR-145). Reverify parses it back with `parseSecurityLocation` and binds a concrete in-scope destination `{host, path, scheme, port}` (method ignored; FR-163); an unbindable location is reverify `INCONCLUSIVE` `SEC_REVERIFY_UNVERIFIABLE` (`security-reverify-contract.md`). Findings with no HTTP endpoint (dependency advisories) use the producing contract's location grammar (workspace-relative lockfile path identity).

## AI boundary (FR-144)

1. AI runs only **after** the verdict, confidence, severity, scope and fingerprint are committed, only through `ai-executor`, only on `assemblePrompt`-sealed redacted inputs.
2. AI MAY explain, prioritize and phrase remediation. AI MUST NOT: decide a verdict, confidence, severity, scope, authorization, whether a probe runs, create an `Issue`, create a Finding in the SECURITY module, add a check result, or alter a fingerprint.
3. AI text is labeled `AI_JUDGMENT` (existing attribution) and cannot upgrade a verdict. A disagreement between AI text and the verdict is resolved in favor of the verdict; the AI text is dropped.
4. AI inputs are class-level only: check id/title, verdict, confidence, severity, CWE/OWASP, counts, header/field *names*, shape classes. Never credentials, tokens, cookies, response bodies, identities, fixture identifiers or URL query values (see `security-evidence-contract.md`).
5. Hallucination guard: every sentence of a rendered explanation that asserts a defect must be traceable to a template parameter or a supporting evidence id; an AI explanation that names a vulnerability class not present in the check's CWE/OWASP tags is rejected by a deterministic validator and replaced by the static template text.
6. The module-runner's generic AI layer (`persist.ts` records `findings` with `layer === 'AI'`) MUST NOT emit findings (`layer: 'AI'`) for any 012 check namespace once 012 is active; for the SECURITY module AI output is explanation/prioritization only (FR-165, L7). Implementation task plus an SG6 conformance test.

## Invariants

1. Exactly one `SECURITY_CHECK_RESULT` per `(scanPlanId, checkId, checkVersion, scopeKey)`; exactly zero or one `Issue` per result.
2. `toCheckVerdict` is total and matches the table above (testable by enumeration).
3. `materializeSecurityFinding` returns `null` for every non-finding verdict and never calls `materializeFinding` for them.
4. No result has verdict `CONFIRMED_VULNERABILITY` unless `confirmable == true` and the oracle proof evidence id is present.
5. Severity is a pure function of `(table version, inputs)`: same inputs yield the same severity on any worker; `LIKELY` never exceeds `HIGH`; `CONFIGURATION_RISK` never exceeds `min(checkCap, HIGH)`; `INFORMATIONAL` is always `INFO`.
6. Asset hint can raise severity only for `CONFIRMED` and never past the check cap; it never lowers.
7. CVSS appears only when all eight base metrics are determinable; otherwise the field is absent.
8. Fingerprint parts contain no value from a response, no secret, no fixture identifier and only the major check version; two scans of the same unfixed defect produce the same fingerprint.
9. Two checks in one `rootCauseGroup` on the same endpoint produce one `Issue` per scan with the union of supporting evidence links.
10. `Issue.location` matches `^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS) https://[^ ?#]+$` for HTTP findings.
11. `NO_ISSUE_DETECTED` is never rendered as "secure", "passed" or a bare PASS; its statement is built from `statementTemplateId` with `N` probes, check id+version, `E` endpoints and `I` identities (FR-137).
12. Finding text contains no secret value and no AI-authored claim of a defect; title/explanation come from static templates (AI text is separate, labeled).
13. No verdict, confidence, severity or fingerprint is influenced by AI output.
14. Check evaluation `evaluate` is pure/synchronous over committed Evidence; a thrown `evaluate` is recorded as a `BLOCKED` result with `SEC_EVALUATION_ERROR`, never propagated (FR-147).

## Safety & Authorization

Materialization performs no network call and no authorization decision. It runs only for verdicts whose producing actions already passed `securityScopeGate`, F01 and F07 (FR-003, FR-004). It never reveals the existence of out-of-tenant data: `materializeFinding` filters by owning tenant. An `Issue.location` is derived from authorized, in-scope endpoints only.

## Failure states

| Condition | Verdict / status | Reason code |
|---|---|---|
| No producing evidence for a check | `NOT_TESTED` | `SEC_NO_EVIDENCE` |
| Producer unit not `COMPLETED` | `BLOCKED` | `SEC_UPSTREAM_PRODUCER_FAILED` |
| Weak/ambiguous signal | `INCONCLUSIVE` | `SEC_SIGNAL_WEAK` |
| Transport error / ambiguous outcome | `INCONCLUSIVE` | `SEC_RESPONSE_AMBIGUOUS` |
| Confirmation would need unsafe activity | verdict stays `LIKELY`/`INCONCLUSIVE`; FLAG attached | `SEC_CONFIRMATION_REQUIRES_UNSAFE_ACTIVITY` |
| Fixture/identity insufficient | `INCONCLUSIVE` | `SEC_FIXTURE_LIMITATION` |
| Required cleanup failed/unverified | no `NO_ISSUE_DETECTED`; `INCONCLUSIVE` | `SEC_CLEANUP_FAILED` / `SEC_CLEANUP_UNVERIFIED` |
| Check precondition false | `NOT_TESTED` | `SEC_PRECONDITION_UNMET` |
| Engine/flag disabled | `NOT_TESTED` | `SEC_ENGINE_DISABLED` |
| Active/authenticated class refused | `BLOCKED` | F01 reason verbatim or `SEC_PRODUCTION_PROHIBITED`/`SEC_ENVIRONMENT_UNCLASSIFIED` |
| `evaluate` throws or overruns | `BLOCKED` result recorded | `SEC_EVALUATION_ERROR` |
| Per-plan findings cap reached | remaining finding verdicts summarized as evidence; no further `Issue` | FLAG `SEC_FINDINGS_CAPPED` |
| `materializeFinding` fails transiently | retried per 009; result already recorded | none (`TRANSIENT_INFRASTRUCTURE`) |
| Severity table / registry entry missing | registry load rejected (`ENGINE_DEFECT`), check not registered | none |

## Idempotency & retry

The evaluator claims `IdempotentClaim{scope:"sec-check-execution", claimKey:"${scanPlanId}:${check.id}:${check.version}:${scopeKey}"}` **before** the readiness query (FR-147); a lost claim does nothing. `materializeFinding` is idempotent per 009 (first-writer-wins on `(scanId, fingerprint)`, link-skip; 012 relies on no update-on-conflict). A retried materialization with the same inputs yields the same `Issue`. Severity and fingerprint are deterministic so a replay cannot create a second row.

## Evidence

Every `Issue` links to its supporting `HTTP_TRANSACTION`/`PERMISSION_COMPARISON`/`API_SURFACE`/`AUTH_STATE_TRANSITION`/`ADVISORY_MATCH` evidence and to the `SECURITY_CHECK_RESULT`; `CONFIRMED` additionally links one `SECURITY_REPRODUCTION` (redacted minimal record). Payloads: `security-evidence-contract.md`.

## Budgets / limits

LOCAL (not F07-ledgered): finding cap per scan plan 100 root-cause findings (provisional, mirrors 011; beyond it no further `Issue` is created: the remainder is summarized as evidence in the `SECURITY_CHECK_RESULT` payload (`capped: true`, counts per `(checkId, host)`) and carries the FLAG `SEC_FINDINGS_CAPPED` per plan.md; nothing is silently dropped); title <= 200 chars, explanation <= 2 000 chars. F07: none consumed.

## Reverify

Reverify uses the finding's `checkId` + `reverifyBehavior` and the fingerprint comparison in `security-reverify-contract.md`: same fingerprint re-emitted as a finding => `FAILED`; executed check returning `NO_ISSUE_DETECTED` => `PASSED`; cannot execute => `INCONCLUSIVE`, which maps to the existing Issue state `UNVERIFIABLE` (FR-164, L5; Issue state machine unchanged; the 012 namespaces `sec|auth|authz|api|logic|dep` route to the 009 REVERIFY path before the legacy resolver). Severity is re-derived from fresh evidence; the original `Issue` keeps its history.

## Boundary rules (MUST NOT)

1. MUST NOT materialize `INCONCLUSIVE`, `NOT_TESTED`, `BLOCKED`, `UNSUPPORTED` or `NO_ISSUE_DETECTED` as an `Issue`.
2. MUST NOT mark a weak signal above `LIKELY`, or any high-severity hypothesis `CONFIRMED`.
3. MUST NOT derive `CONFIRMED` from a status code alone, from a version alone, or from AI.
4. MUST NOT infer CVSS metrics, business impact or asset criticality.
5. MUST NOT treat confidence as severity or severity as confidence; MUST NOT change `packages/scoring` weights.
6. MUST NOT put values, tokens, ids of fixtures or line numbers in fingerprints.
7. MUST NOT let AI decide or alter anything listed in "AI boundary" rule 2, nor feed it credentials/bodies.
8. MUST NOT render "no findings" as "secure" or "passed".
9. MUST NOT add a column to `Issue` for confidence (FR-136).
10. MUST NOT call `materializeFinding` from an engine; only the registry evaluator calls it.
11. MUST NOT invent a vulnerability class not tagged on the check definition.

## Named limitations

1. Severity numeric steps (S3-S5) stay PROVISIONAL (L35) and the 100-finding cap is PROVISIONAL.
2. Confidence does not affect the product score deduction; a `LIKELY` and a `CONFIRMED` of equal severity score alike.
3. A `LIKELY` finding can be a false positive; the report must show confidence beside severity.
4. CVSS is omitted for most checks; consumers must not expect it.
5. Fingerprints survive path-template renames only if `apiIdentity` normalizes identically; an endpoint rename is a new identity (reverify rename guard in the reverify contract).
6. `INFORMATIONAL` findings materialize as `Issue` rows with severity `INFO`; they appear on the fixes board unless the UI filters by confidence (UI is out of scope).
7. During strict parallel run (FR-160) legacy `headers.*`/`owasp.*`/`ssl.*` findings and new `sec.cfg.*` findings may describe the same observation under different fingerprints; cross-reduction is not performed in 012.

## FR traceability

FR-064, FR-106, FR-123, FR-127 (finding text redaction), FR-136, FR-137, FR-138, FR-139, FR-140, FR-141, FR-142, FR-144, FR-145, FR-146/147 (registry evaluator), FR-149, FR-150, FR-157 (rootCauseGroup handoff), FR-160, FR-163 (location binding), FR-164 (INCONCLUSIVE to Issue UNVERIFIABLE; reverify routing), FR-165 (AI explanation only).

## Acceptance tests required (named, deterministic, fixture-based; not executed in planning)

| Test | Fixture | Expected |
|---|---|---|
| `finding.verdict-mapping.total` | all nine verdicts | mapping to 010 six verdicts exactly as table |
| `finding.materialize.only-four` | one result per verdict | `materializeFinding` called exactly for the four finding verdicts |
| `finding.weak-signal.cap-likely` | reflected canary / SQL-error banner fixtures | `LIKELY_VULNERABILITY`, never `CONFIRMED`; `confirmationLimitation` set |
| `finding.generic-500.inconclusive` | benign 500 page | `INCONCLUSIVE` + `SEC_SIGNAL_WEAK`, no Issue |
| `finding.confirmed.requires-oracle` | BOLA fixture with and without marker proof | with marker + `confirmable` => `CONFIRMED`; status-only => `LIKELY` |
| `finding.confirmed.not-from-ai` | AI stub claims confirmation | verdict unchanged |
| `finding.severity.table` | enumerated input grid | outputs match table; `LIKELY<=HIGH`, CONFIG_RISK<=cap, INFO fixed |
| `finding.severity.asset-hint` | hint HIGH/LOW/UNSET x confidence | raises only CONFIRMED, within cap |
| `finding.cvss.omitted-when-undeterminable` | check with one `UNDETERMINABLE` metric | no vector |
| `finding.fingerprint.stable-under-noise` | same defect, different tokens/ids/line/patch version | identical fingerprint |
| `finding.fingerprint.rootcause-dedupe` | two checks same group, same endpoint | one Issue (both pass the canonical group `checkId`), merged evidence links |
| `finding.location.canonical` | endpoints with query/fragment/param grammars | location matches regex, no query |
| `finding.no-issue-detected.statement` | executed-pass result | statement built from template with N/E/I, never "secure" |
| `finding.cleanup-failed.no-pass` | failed cleanup + clean probe | `INCONCLUSIVE` + `SEC_CLEANUP_FAILED` |
| `finding.score.unchanged` | INFO + non-findings present | `scoreFromFindings` deduction unchanged; INFO deducts 0 |
| `finding.text.redacted` | evidence containing secret-shaped value | Finding text has no value |
| `finding.ai.explain-only` | AI stub emits new vulnerability | no Issue created; text dropped; labeled `AI_JUDGMENT` otherwise |
| `finding.ai.no-credentials-in-prompt` | prompt assembly spy | no cookie/token/body/identity in sealed prompt |
| `finding.sibling-unit-failed.kept` | one unit failed, one completed | completed unit's findings materialize (M7) |
| `finding.materialize.idempotent` | duplicate trigger | one Issue, no duplicate links |

## Resolved additions

- F-1 (fingerprint/checkId gap) -> L6/FR-141: `checkId` leaves the parts; every check in a `rootCauseGroup` passes the group's canonical `checkId`. Applied in "Fingerprint, rootCauseGroup and location". (Which member is canonical is not named by the log: see Open for closure.)
- F-2 (location is not an F01 destination) -> L4/FR-163: `parseSecurityLocation` plus concrete destination binding; unbindable => `SEC_REVERIFY_UNVERIFIABLE`. Applied.
- F-3 (evaluate threw) -> L11: `SEC_EVALUATION_ERROR` (replaces the earlier proposed evaluator-threw code). Applied in Failure states and invariant 14.
- F-4 (AI layer) -> L7/FR-165: AI explanation only; no `layer: 'AI'` findings for 012 namespaces. Applied in AI boundary rule 6.
- F-5 (severity table) -> L35: S3-S5 stay PROVISIONAL (owner confirmation at closure).
- F-8 (finding cap flag) -> L11: `SEC_FINDINGS_CAPPED` (FLAG), remainder summarized as evidence per plan.md. Applied in Budgets and Failure states; the earlier "aggregate Finding" alternative is dropped to conform to plan.md.
- F-9 (multi-match scope) -> L34: lockfile scope is covered by any per-match result (coverage/registry contracts).
- L1 (DEGRADED scoring) and L5/FR-164 (INCONCLUSIVE to Issue UNVERIFIABLE) applied in Product score and Reverify.
- L36 verified: `Severity` includes `INFO` (schema.prisma, `packages/types/src/domain.ts`); `SEVERITY_WEIGHT` INFO 0 (`packages/scoring/src/aggregate.ts`); `fingerprintOf` signature as stated.

## Open for closure

- Which check is the canonical member of a `rootCauseGroup` (working rule: lexicographically first member; its `reverifyBehavior` MUST cover the group). Owner: spec editor to state the rule in FR-141.
- F-5: owner confirmation of the severity steps S3-S5 (PRODUCT DECISION, PROVISIONAL per L35) and the 100-finding cap value.
- F-6: anchor-unit rule for `materializeFinding` on multi-unit checks (lowest `executionUnitId` by creation order) is not ruled in the log. Owner: confirm.
- F-7: `Issue.location` grammar for non-HTTP (dependency-advisory) findings is deferred to the producing contract (advisory-matching). Owner: confirm FR-145 is extended.

## Consolidated repairs (authoritative; third repair pass, 2026-10-14)

Single normative section replacing the earlier "Analyze and adversarial repairs" and "Blocker repairs B-1..B-13" addenda: superseded items were deleted, not overridden; retained items keep their original review labels. Requirements: spec FR-161..FR-201. Nothing here claims runtime feasibility; T650 and the other feasibility gates stay open.

1. **AI layer (G-20, FR-165)**: for `ModuleType.SECURITY` any `layer:'AI'` finding is dropped regardless of `checkId`; explanation text is validated against the committed verdict and replaced by a static template on mismatch; the AI input assembler accepts only a closed schema of enums and numbers (G-19). Tests `ai-layer.security-module-any-checkid-dropped`, `finding.ai-input-closed-schema`.
2. **Deterministic merge (G-33, FR-141)**: canonical group member = lexicographically first `checkId`; the group Finding is materialized once by the finalizer barrier with the winner chosen before the call (highest confidence rank, then highest severity, then lexicographically first `checkId`; see the group-barrier item below); there is no upsert-on-conflict and no legacy duplicate suppression (009 materialization is first-writer-wins). Test `finding.merge-deterministic-order`.
3. **Findings cap**: the per-plan cap (provisional 100) is also stated in plan Budgets; the remainder is summarized as evidence with `SEC_FINDINGS_CAPPED`; no "aggregate Finding" alternative.
4. **Copy lint (G-34g)**: "exploitable" appears only in `CONFIRMED_VULNERABILITY` text. Severity steps S3-S5 remain PROVISIONAL (owner confirmation at closure).
5. **Group barrier (B-9, FR-141).** Members of a `rootCauseGroup` record `SECURITY_CHECK_RESULT` as they resolve (with `groupMaterialization: true` in the registry) but do **not** call `materializeFinding`; the finalizer/sweep materializes the group's Finding once after all members **scheduled in this plan** resolved (in a REVERIFY plan only the scheduled members are awaited, never unscheduled registry members; FR-141, N2-9); test `finding.reverify-barrier-scheduled-members-only`. The winner is chosen **before** the call: highest confidence rank, then highest severity, then lexicographically first `checkId`; losing members carry `mergedInto`; `IssueEvidenceLink` rows cover all supporting evidence. No update-on-conflict is assumed (009 materialization is first-writer-wins). The earlier "wins by upsert" and "legacy duplicate suppression" statements are withdrawn: legacy and 012 findings for one root cause are both visible during the parallel run until the legacy checks are retired. Tests: `finding.group-barrier-order-independent` (any member resolution order yields the same Finding), `finding.group-winner-deterministic`.
