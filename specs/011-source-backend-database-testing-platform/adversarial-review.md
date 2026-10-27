# Independent Adversarial Review: SPEC 011

## Reviewer independence note

I did not author SPEC 011 and owe it nothing. This review is read-only against the repository: no repo code was
executed, nothing was installed, no state-changing git was run. This file is the only thing written.

What I read, in full unless noted:

- `spec.md` (FR-001..FR-153, clarifications, SC-001..SC-010), `plan.md` (all 963 lines), `data-model.md` (to the
  reason-code registry), `quickstart.md` (fixtures 1-62, I1-I24, flag matrix), `research.md` (R1 excerpt, R4/R5, the
  proxy section, R16, R29-R36 and the surrounding text), `tasks.md` (task index T001-T288, all US1/US2/US3 fixture and
  implementation tasks), and all 19 `contracts/*.md` (untrusted-execution, isolation-policy, dependency-installation,
  source-acquisition, command-policy, automated-test, source-evidence, source-snapshot, static-analysis,
  execution-fixture, source-reverify, migration-testing, backend-contract-testing, build-typecheck, coverage,
  source-correlation, language-toolchain-detection fully; database-schema and source-rule-registry only skimmed by grep).
- Reality checks (read-only): `apps/worker/src/intake/repo-clone.ts`; `packages/safe-archive/src/{guard,zip,paths}.ts`;
  `packages/redaction/src/{detect,assemble,index}.ts`; `packages/scoring/src/{aggregate,fingerprint}.ts`;
  `packages/types/src/domain.ts` (`MODULE_STATES_SCORED`); `apps/worker/src/orchestrator/{timeout,timeout-scheduler}.ts`;
  `apps/worker/src/queue/queues.ts` (`CONCURRENCY`); `infrastructure/docker-compose.production.yml`;
  `apps/sandbox-runner` (layout only); `packages/safe-net` (layout and redirect handling only).
- Upstream: 008 `safety-admission-contract`, `safety-checkpoint-contract`, `kill-switch-contract`,
  `execution-audit-contract`, `data-model.md` (KillSwitchReason, ExecutionAuditEventType, AdmissionLease); 009
  `execution-runtime-contract`, `artifact-contract`, `evidence-envelope-contract`, plan section on the 15-minute sweep;
  010 `IdempotentClaim` model and `web-check-registry-contract` claim/release rules; 007 scope-matching.

Limits of this review: I did not read `database-schema-contract.md`, `source-rule-registry-contract.md` or the eight
`checklists/*` in depth; scenarios that turn on them are marked accordingly. Claims about third-party behavior (GitHub
zipball, pnpm/yarn lockfile formats, BullMQ stalled-job handling, Node release schedule, Firecracker pid accounting) come
from my own knowledge, not from files in this repo, and are labelled "verify" where they carry weight.

## Summary

Counts: **HOLDS 27, WEAK 19, GAP 4** (50 scenarios).

| # | Scenario | Verdict |
|---|----------|---------|
| 1 | Repository changes between branch resolution and acquisition | HOLDS |
| 2 | Malicious Git submodule | HOLDS |
| 3 | Archive path traversal | HOLDS |
| 4 | Symlink escaping the workspace | HOLDS |
| 5 | Zip bomb | HOLDS |
| 6 | Huge monorepo | GAP |
| 7 | Git LFS oversized payload | HOLDS |
| 8 | Malicious npm postinstall | HOLDS |
| 9 | Malicious ESLint plugin | WEAK |
| 10 | Malicious test runner configuration | WEAK |
| 11 | Test executes a fork bomb | HOLDS |
| 12 | Test exhausts memory | HOLDS |
| 13 | Test fills disk | HOLDS |
| 14 | Test attempts host filesystem access | HOLDS |
| 15 | Test attempts Docker socket access | HOLDS |
| 16 | Test attempts cloud metadata access | HOLDS |
| 17 | Test attempts internal Redis/Postgres access | HOLDS |
| 18 | Test attempts cross-tenant filesystem access | HOLDS |
| 19 | Test attempts outbound data exfiltration | WEAK |
| 20 | Test hangs forever | GAP |
| 21 | Worker crashes during execution | WEAK |
| 22 | Cancellation arrives during dependency installation | HOLDS |
| 23 | Kill switch arrives during a migration test | WEAK |
| 24 | Isolated runtime fails cleanup | HOLDS |
| 25 | Artifact upload succeeds but metadata write fails | HOLDS |
| 26 | Stale execution attempts to commit evidence | WEAK |
| 27 | Source contains real API keys | WEAK |
| 28 | Build logs expose credentials | WEAK |
| 29 | AI receives prompt injection in README | HOLDS |
| 30 | Test suite has zero tests | HOLDS |
| 31 | Test suite is entirely skipped | WEAK |
| 32 | Test runner exits zero without executing tests | WEAK |
| 33 | Tests require unavailable external services | WEAK |
| 34 | Database fixture accidentally points to production | HOLDS |
| 35 | Migration partially applies | WEAK |
| 36 | Integration fixture retains tenant data | HOLDS |
| 37 | Two identical execution jobs run concurrently | WEAK |
| 38 | Retry repeats a state-mutating test | HOLDS |
| 39 | Reverify uses an outdated source snapshot | WEAK |
| 40 | Unsupported framework receives PASS | GAP |
| 41 | Toolchain version changes between runs | WEAK |
| 42 | Test coverage excludes most files | HOLDS |
| 43 | Source fingerprint changes after line insertion | HOLDS |
| 44 | Cross-domain finding duplication | WEAK |
| 45 | Runtime image contains a vulnerable dependency | WEAK |
| 46 | Container isolation is insufficient for hostile code | HOLDS |
| 47 | F07 kill switch cannot terminate escaped descendants | HOLDS |
| 48 | Execution evidence contains proprietary source | WEAK |
| 49 | Partial results are misreported as complete | GAP |
| 50 | SPEC 012 later needs the source/API surface evidence | WEAK |

Reading the HOLDS: most HOLDS are isolation scenarios that hold **by design and only once an Execution Plane that
passes the IAB exists**. Nothing in this repo today can execute them (no KVM CI, no provider, no guest agent). They hold
as contracts; they are not demonstrated. Every HOLDS still lists residual limitations and, where useful, an advisory
repair that is not required for freeze.

## Cross-cutting findings

### C0. Is an upstream amendment required? Yes. SC-010 ("zero amendments to SPEC 006-010") is false.

I found genuine contradictions with frozen upstream, each evidenced by upstream text or code:

1. **008 audit enum is closed; 011 invents an event type.** `execution-audit-contract.md` rule 3: `eventType` "MUST be one
   of the bounded `ExecutionAuditEventType` enum values ... never a free-text action string". The 12-value enum in 008
   `data-model.md` (`ADMISSION_GRANTED` .. `SAFETY_VIOLATION`) has no `SOURCE_SENT_TO_EXECUTION_PLANE`. 011 FR-147,
   untrusted-execution invariant 12 and plan F07 table all require it ("No audit event, no Guest"). The plan's touch list
   (T1-T5) edits only `ModuleType`/`EvidenceKind`. **Amendment needed**: add one additive `ExecutionAuditEventType` value
   to 008 (and to the 011 touch list), or 011 must drop the claim and pick an existing type with a stated payload
   convention (none of the 12 fits "source sent").
2. **008 forbids SYSTEM triggers at PLATFORM scope and forbids new automatic trigger conditions.** `kill-switch-contract.md`
   precondition 3: `SYSTEM` triggers "are always scoped to `GRANT` or `EXECUTION`"; boundary rule 3: "a future spec that needs
   a new automatic trigger condition names it explicitly as an amendment to this contract's `SYSTEM` precondition".
   011 FR-143 / isolation-policy "Attestation lifecycle" / T260-T261 specify an automatic "F07 PLATFORM-scope
   operator/system stop (`SYSTEM_SAFETY_POLICY`)" on attestation revocation. That is both (a) a new automatic trigger and
   (b) the wrong scope. Worse, `KillSwitchState` has no execution-class dimension: `safetyCheckpoint` step 1 refuses on any
   `REQUESTED`/`ACKNOWLEDGED` row among six scope keys including `(PLATFORM, "platform")`, so a PLATFORM stop would
   refuse admission for **every** safety-gated class platform-wide (BROWSER, CRAWLER, ACTIVE_SECURITY of 010/012), not just
   SOURCE_EXECUTION, and 008 defines no clear-down for it. **Amendment or redesign needed**: the supervisor already re-reads
   attestation status on its 5 s loop (untrusted-execution invariant 2). Make that loop the mechanism (destroy the Guest,
   record outcome), and for the F07 reason record use per-execution `triggerStop(EXECUTION, unitId, SYSTEM, SYSTEM_SAFETY_POLICY)`
   which requires a one-line additive amendment naming "IAB attestation revocation" as a third SYSTEM trigger condition.
   Remove PLATFORM scope from 011 entirely.
3. **The 15-minute scan-wide timeout sweep is not "UNKNOWN"; its behavior is determinable now and breaks 011.** Verified
   in `apps/worker/src/orchestrator/timeout-scheduler.ts` (`DEFAULT_MAX_DURATION_MS = 15 * 60_000`, env `SCAN_TIMEOUT_MS`,
   compose default `900000`) and `timeout.ts` (`sweepTimedOutScans` selects scans by `state in (...)` and
   `startedAt < cutoff`, with no look at unit class, then terminates the scan and refunds undelivered areas). A single
   `SOURCE_EXECUTION` unit may run 25 min plus provisioning and teardown; four serialized partitions up to ~100 min. The
   sweep will mark the scan terminal while the Guest is alive and the supervisor is still writing evidence. 011 FR-139 /
   G4 defers this to "implementation start" and states SC-010 as if resolved. **Amendment needed now** to 009's runtime
   (or to the existing sweep, which 009 preserved): per-class or per-plan scan deadline (a scan containing
   `SOURCE_EXECUTION` units must carry a plan-level `maxDurationMs` >= sum of unit timeouts) and an explicit rule that the sweep
   must not terminate a scan with a live `SOURCE_EXECUTION` lease without first stopping its units through F07.
4. **009 dispatch makes a concurrency refusal terminal; 011 assumes it waits.** 009 `execution-runtime-contract` step 3:
   checkpoint `STOP` -> `transitionStatus(..., REFUSED or KILLED)`, no process forked. The queue is `attempts: 1`.
   011 untrusted-execution invariant 13 and R35 say partitions are serialized "through F07 (a refused lease means the unit
   is redelivered later, never run in parallel)". Nothing redelivers: partitions 2-4 become `REFUSED`. Either 011 serializes
   with plan-level dependency edges (needs a 009 fan-in rule that proceeds after a terminal-but-not-successful predecessor;
   currently a failed dependency blocks dependents, per R16's own text) or 009 needs a delay-on-concurrency-refusal rule.
   Borderline: clarification-level amendment to 009.
5. **009 `createArtifact` has one fixed per-object and one per-scan budget; 011 wants a snapshot exempt from its own 20/50 MiB.**
   `artifact-contract.md` steps 2-3: "Check `sizeBytes` against the fixed per-object budget ... per-scan cumulative budget".
   No content-type parameter. FR-119 and source-snapshot-contract say the snapshot (up to the 512 MiB extracted limit) is not
   governed by the 20/50 MiB budgets. Either 009 budgets become content-type-keyed (clarification/amendment) or the
   snapshot is refused by the same function. 009 left the numeric values to implementation (spec line ~741), so this may be
   resolvable by a clarification rather than a rewrite, but the 011 text must say which.

Two further claims in 011 rest on upstream behavior that does not exist (no amendment needed, but 011 text is wrong):

- FR-055 / untrusted-execution invariant 8 say "009's terminal-write rejection applies" to evidence. 009
  `evidence-envelope-contract.md` `recordEvidence(executionUnitId, kind, payload)` has **no** lease token parameter and no
  unit/scan terminal-state check; the only terminal-unit rejection is in `progress-event-contract.md`. Fencing of
  evidence writes is therefore entirely 011's own wrapper (T037), and a check-then-write is not atomic (see #26).
- Plan "F07 Integration" says the supervisor calls `safetyCheckpoint` every 5 s "with `consumes {request: true,
  concurrency: true}`" (dispatch) and that "each pass also renews the lease". 008 `safety-admission-contract` step 3 re-checks
  `activeConcurrency + 1 <= concurrencyBudget` on every call that sets `consumes.concurrency`; with the per-tenant budget of 1
  that 011 assumes, the unit's own held lease makes its second call `REFUSED BUDGET_EXHAUSTED_CONCURRENCY` (step 3 precedes the
  step-4 idempotent no-op). The periodic call must be `consumes {request:false, concurrency:false}` (or the lighter sub-check
  of checkpoint rule 4) plus a separate lease renewal; 011 never says so.

### C1. Timing races and clock arithmetic

- **Dead-man 30 s equals F07 lease TTL 30 s.** 008 `data-model.md`: `expiresAt = now()+30s`, reclaimed "within 30s of last
  renewal". EP dead-man (FR-052): 30 s without heartbeat. A stalled supervisor (event-loop block, GC, partition) loses the
  lease at about the same moment the EP starts destroying, and destroy takes up to 30 s (phase 10) + 60 s (phase 11). Between
  lease reclaim and `DESTROYED`, F07 will admit another unit for the same grant while the first Guest still lives. The
  per-tenant "1 Guest" guarantee then rests only on the EP scheduler, whose behavior on a second `provision` (refuse? queue?)
  is unspecified. Fix: dead-man <= 15 s with a 5 s heartbeat (three missed beats), AND state the EP's refusal semantics, AND
  keep admission and EP concurrency independent.
- **"Unit timeout" for `SOURCE_EXECUTION` is never given a value.** FR-052, R29 and data-model use "unit timeout + 5 min" for the
  hard TTL, and research.md lines 278-281 say the 5-minute margin covers provisioning/teardown "that the unit timeout itself does
  not include". 009 arms an unconditional SIGKILL at `timeoutPolicyMs + fixed margin` (`execution-runtime-contract` step 5), and 011
  says the supervisor never extends it. If `timeoutPolicyMs` = the 25 min run envelope, a run that legitimately uses its envelope is
  SIGKILLed while still in persist/teardown (phases 8-13) and ends `FAILED/TIMEOUT` with evidence half-written. The unit timeout must
  be defined as provisioning (120 s) + run envelope + persist (120 s) + teardown/wipe (90 s) + finalize (40 s), about 33 min 50 s, and the
  run envelope clock must start at `READY`.
- **Run wall vs scan timeout**: see C0.3.
- **Lost wake-up in the check dispatcher.** plan "Check registry dispatch" step 4-5 and 010's inherited rule: claim first, then read
  readiness, release if not ready. Interleaving: unit A's commit claims and reads readiness before unit B's row commits; B commits and
  its trigger loses the claim (A still holds it); A sees "not ready", releases, and stops. No later trigger exists. The sweep then records
  `NOT_TESTED` ("precondition never satisfied") although the precondition was in fact satisfied. Likely for checks needing evidence from
  two units (static `discover.tests` plus execution `TEST_RESULT`). Fix: the sweep re-attempts claim + readiness + evaluate for every
  unresolved check before assigning `NOT_TESTED`/`BLOCKED`.
- **Supervisor loop starvation.** The 5 s checkpoint, EP heartbeat and attestation re-read all live in the same per-unit child that also
  validates and redacts Guest output synchronously (see C5). Any synchronous stall > 30 s kills the Guest via dead-man and drops the lease.

### C2. Document defects inside the package

- `plan.md` is spliced: line 80 (the "Timeout / retry / cancellation" cell of the Principle XIV table) runs on into an `## Execution
  Lifecycle (13 phases)` table; line 102 is a heading `## Hostile-Code Isolation Model\`), egress default-deny ...` followed by duplicated
  Constitution rows (lines 102-107), then "Post-design re-check" and the Principle XIV table appear a second time (109-129). There are two
  lifecycle tables (lines 84-98 and 283-297) with different numbers: phase 1 timeout 30 s vs 60 s, phase 2 30 s vs 60 s, phase 3 10 s vs 30 s,
  phase 13 10 s vs 30 s; phase 1 failure class `ENGINE_DEFECT` vs `INVALID_CONFIGURATION`. The first table claims to reproduce the contract
  "verbatim"; the second is the one under its own heading. A reviewer cannot tell which is normative.
- Fixture 22 expects `INCONCLUSIVE FK_APPLICABILITY_UNKNOWN`; task T177 expects `INCONCLUSIVE RULE_APPLICABILITY_UNPROVEN`.
- Fixture 47 / T280 expect "no MIGRATION_RESULT ... coverage shows NOT_RUN"; migration-testing-contract invariant 7 and data-model say the scenario is
  recorded `STOPPED`.
- T137 describes the proxy as having an "integrity-keyed cache"; dependency-installation-contract 4f, research (cache removed) and R29 say no cache of any kind. T273
  later "aligns", but the task text still reads as a cache.
- data-model "Tenant isolation" row for staged ZIP says delete "on acquire completion or failure"; ZIP reverify (source-reverify-contract, fixtures 48-49) requires the
  original upload to be retained; T070 deletes "when the Target is terminal". Three different retention rules.
- SOURCE_MANIFEST (data-model) has no field recording that the source form is a GitHub export archive although R1/R29 say "the manifest records the fact".

### C3. Result integrity inside the Guest (false PASS from forged output)

Every verdict is parsed from structured reporter output that customer code can write: Jest `--json`/Vitest `--reporter=json` print JSON to stdout of a
process that also runs the tests (`--runInBand` makes it literally the same process), node:test TAP is parsed from child stdout, ESLint `-f json` runs
the repo's own plugins in-process, `tsc` runs from the customer's lockfile. A test, config or plugin can print a well-formed forged report. The count
reconciliation (automated-test-contract invariant 2) only catches inconsistent forgeries. There is also no stated in-Guest privilege split: nothing says
the Guest agent runs as a different uid from customer processes, that the vsock device is root-only, or that the host accepts exactly one agent connection
per run. `vsock-abuse` (I22) tests oversize/malformed traffic, not a well-formed forged event stream from a non-agent process. Consequence: `PASS` means
"the customer's own process said so", which the coverage statement never says. Repairs below (run reporters/agent under a separate uid and namespace,
single exclusive vsock session, new `vsock-forge` and `reporter-forge` fixtures, PASS wording "runner-reported").

### C4. Existing scoring turns "nothing measured" into 100 (false PASS through the legacy path)

`packages/scoring/src/aggregate.ts`: `scoreFromFindings` returns `100 - deductions`; `overallScore` averages modules whose `ModuleState` is in
`MODULE_STATES_SCORED = ['COMPLETE','DEGRADED']` (`packages/types/src/domain.ts:84`). 011 defines no mapping from `SOURCE_CHECK_RESULT` verdicts to
`ModuleResult.state` for `SOURCE_QUALITY`/`BACKEND`/`DATABASE`/`AUTOMATED_TESTS` (grep of spec/plan/research/data-model finds none; the touch list names only
`AREA_COST`, `ALL_AREAS` and exhaustive switches). A module whose checks are all `UNSUPPORTED`/`NOT_TESTED`/`BLOCKED`/`INCONCLUSIVE` has zero findings; if the orchestrator
sets it `COMPLETE`, the legacy report shows 100/100. That is exactly "unsupported reads as pass", through code 011 promised not to touch. See #40, #49.

### C5. Redaction is a trusted-side parser of attacker bytes, with a DoS and coverage gaps (verified in `packages/redaction/src/detect.ts`)

- `SECRET_NAME` (`[A-Za-z0-9_.\[\]'"-]*(?:secret|passwd|...)[A-Za-z0-9_.\[\]'"-]*`) is the unanchored prefix of the quoted-assignment rule with flags `gi`.
  On a long identifier-like run with no keyword (for example `"a".repeat(n)` printed by a test), each start offset scans to the end: O(n^2). 10 MiB of output
  (the per-step log cap) is effectively a hang of a synchronous call.
- `detectSecrets` accepts matches with `accepted.some(overlap)` per candidate and `benign.some(overlap)` per entropy candidate: O(n*m). A log that is ~400k
  25-character high-entropy tokens fits in 10 MiB and costs ~10^10 comparisons.
- FR-117/FR-150 put this on the critical path in the supervisor child (phase 8, "60 s" timeout, but a synchronous JS call cannot be interrupted by a timer),
  starving the 5 s checkpoint, the heartbeat and the lease (C1). A hostile repo can therefore force every run to `FAILED` (dead-man + SIGKILL), or stall a
  worker process shared with other work.
- Coverage gaps: lowercase-hex-only secrets (32-64 hex chars are in `BENIGN_SPANS` as "git object name"), tokens > 200 chars, values without a recognizable name or shape,
  AWS secret access keys unless they happen to pass the mixed-case/digit/entropy gate.

### C6. Lockfile and proxy assumptions (verify against real lockfiles before freeze)

dependency-installation-contract 4a derives the allowlist from lockfile `resolved` + integrity and treats a missing `resolved` as `UNSUPPORTED_DEPENDENCY_SOURCE`.
As I know the formats: npm v2/v3 lockfiles carry `resolved` and `integrity`; yarn classic `resolved` carries a `#sha1` fragment and older lockfiles lack `integrity`
(-> `MISSING_INTEGRITY`); **pnpm-lock v9 and yarn berry lockfiles normally contain no tarball URL for registry packages** (pnpm records `resolution: {integrity}` and omits
`tarball` when it matches the registry convention; berry records `resolution: "pkg@npm:x"` and a `checksum` over Yarn's own repacked archive, not the registry tarball
hash). If true, pnpm and berry packages are all "no `resolved`" (unsupported), and the supervisor's recompute-and-compare integrity check (4.8) is impossible for berry. Tier 1
claims pnpm and yarn berry. Also unspecified: how an HTTPS exact-URL policy is enforced at all. A CONNECT/SNI allowlist cannot see paths; exact-URL needs a TLS-terminating reverse
mirror with a per-run CA and Guest DNS pinned to the proxy. pnpm and yarn use lockfile URLs literally; npm rewrites the host only for `registry.npmjs.org`.

### C7. psql is both a shell and a different migration engine

command-policy `db.migrate.sql` = `psql -v ON_ERROR_STOP=1 -f <file>` over customer SQL. psql interprets backslash meta-commands in the file (`\!` runs a shell command, `\o |cmd`,
`\i`, `\connect`), which contradicts FR-072/command-policy invariant 1 ("no shell, no string evaluation ... in the Guest") and the claim that customer strings are
only ever exec'd as argv. Contained by the Guest, but the invariant as written is false for this template. Separately, psql runs statement-by-statement (autocommit), whereas
Prisma's migrator sends each `migration.sql` as one multi-statement request; atomicity, `CREATE INDEX CONCURRENTLY` and transactional-failure behavior differ, so "PASS" here is not
"`prisma migrate deploy` would succeed". See #35.

### C8. GitHub zipball and archive-guard behavior the plan leans on

- The zipball is `git archive` output. It honors `.gitattributes` `export-ignore` (files absent) and `export-subst` (content substituted). R1 admits "UNKNOWN - REQUIRES
  INVESTIGATION" and R29 prices it "Low/Low"; it is neither. The snapshot is not the tree of the commit the report names, so a seller can hide files from every check and a
  report says "commit X" (due-diligence use). No manifest field, no flag, no fixture.
- The guard decodes entry names as Latin-1 (`zip.ts`, deliberately) and never reads the UTF-8 flag, so non-ASCII file names are mojibake in the snapshot; relative imports to them fail,
  producing false `tests.typecheck.error`/`tests.run.failed` FINDINGS for correct code.
- The guard refuses any symlink entry; git archive stores symlinks. A repository with one committed symlink (very common) is `ARCHIVE_GUARD_REFUSED` as a whole.
- The guard rejects NUL, `..`, absolute paths, but not tab/newline/other control characters, and 011's NFC normalization can merge distinct raw names; the digest manifest line
  `<path>\t<size>\t<sha256>\n` is ambiguous for such names (two different trees, one digest).
- 50 MiB `maxResponseBytes` on the zipball is all-or-nothing. Repos above it cannot be scanned and there is no registry reason code for it.
- `REPO_PATTERN` (`^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$`, verified in `repo-clone.ts`) accepts `.` and `..`; FR-151 reuses it, so `owner=..` builds a URL that WHATWG URL normalization collapses
  (`/repos/../x/zipball/<sha>` -> `/x/zipball/<sha>`) while carrying the user's bearer token. Blast radius is small (fixed suffix, GET, api.github.com) but trivial to close.

### C9. Worker memory arithmetic

compose: `worker` has `memory: 2g` and `cpus: 2`. `CONCURRENCY.scanPhase = 4`. FR-026/plan give each E12 child a 1 GiB AST budget. Four concurrent source scans can ask for 4 GiB inside a 2 GiB
container, and E12 shares the worker with every other tenant's legacy scans. The result of OOM is a container kill, not a contained `INCONCLUSIVE`. R29 says "Worker unaffected" for parser DoS;
that holds only if the budget is shrunk or E12 gets its own concurrency pool.

### C10. Identity grammar ambiguity (frozen at 011 freeze, then consumed by 012-014)

- `SourceIdentity = "src:" wsPath ":" relPath ["#" symbol]` has no escaping; paths may contain `:` and `#` on Linux, so `src:a:b:c` is ambiguous.
- `RouteIdentity = "route:" METHOD " " pattern` and the route fingerprint `[METHOD, normalizedRoutePattern, operationId?, checkId]` contain no workspace/service component. Two backends in one monorepo that both
  expose `GET /health` get the same RouteIdentity and the same fingerprint (`fingerprintOf` also keys only on targetId, module, checkId, parts): their findings merge into one Issue, violating FR-120's "unrelated failures
  never merge". SPEC 012 joining runtime URLs to a RouteIdentity without a service key is ambiguous in any multi-service repo.

### C11. Execution-image currency

Image catalog is Node 20 and 22 (plan Technical Context, T139). By the published Node schedule Node 20 reached end-of-life on 2026-04-30 and Node 24 is the current LTS (verify). On the review date (2026-10-09)
the catalog bakes an unsupported runtime and rejects projects declaring Node 24 as `UNSUPPORTED_VERSION`. IAB item 6 gates host kernel/VMM patching with an SLA but says nothing about Guest userland (Node, npm, pnpm, yarn, PostgreSQL)
or what scan severity blocks an image.

### C12. Credential concentration in the parser of untrusted bytes

The supervisor (the 009 per-unit child) holds the EP mTLS client credential and also receives, schema-validates and redacts untrusted Guest output (C5). A memory-safety or logic bug in that parsing path
hands an attacker the EP credential (the run-scoped bearer limits it to one `runId`, but the mTLS identity is broader: "scoped client cert" is never scoped in the contract). The E12 child pattern (credential-less child
does the parsing, parent holds the credentials) is the right shape and should be reused for Guest output.

### C13. Provider-capability assumptions

IAB items 3, 4, 8 and the dead-man all say "enforced outside the Guest" and assume a provider that exposes: per-tap host firewalling, per-run rate limiters, destroy confirmation with scratch wipe, a host-resident dead-man,
vsock, no memory balloon. A managed Firecracker-class service may expose none of these (R5 leaves vendor choice open), and self-managed Firecracker needs bare metal or nested virtualization that typical cloud VMs do not
offer. "pids cap enforced ... by the VMM" is not a thing Firecracker can do (the VMM sees host threads, not guest pids); the real bound on a guest fork bomb is guest memory and vCPU, which is fine for the host but means the guest agent
must be shielded from starvation or a fork bomb reads as "agent tamper" (abort + `SAFETY_VIOLATION`) instead of a measured result. The plan acknowledges the vendor as UNKNOWN; the repair is to turn the five capabilities into an explicit
provider-selection checklist that precedes IAB.

### C14. Residual register omissions (R29)

Missing rows: guest-agent/vsock result forgery (C3); synchronous redaction DoS (C5); `export-ignore` source hiding (C8, currently priced Low/Low); psql meta-commands and migrator infidelity (C7); header-based covert channel through the allowed registry
requests; Node/EOL userland (C11); reporter spoofing as the basis of `PASS`; the 15-minute sweep (C0.3).

## Scenarios 1-50

### 1. Repository changes between branch resolution and acquisition

- **Threat**: Between the F01 scope check on the requested branch, the ref lookup, and the zipball download, the branch is force-pushed or advanced; or two refs share a short name (branch `v1`, tag `v1`). Analysis or execution then covers content that was neither authorized nor reported.
- **Prevention/containment**: Resolve-then-fetch-by-SHA (FR-002; source-acquisition-contract Invariant 1, Non-negotiable 1-2); F01 judges the requested ref, the resolved SHA is the only executed identity (FR-004, Safety 3); one resolution per claim, retries reuse the recorded SHA (Idempotency 3); content digest recorded and verified at every consumption (source-snapshot-contract Invariants 3, Non-negotiable 1).
- **Owning contract**: source-acquisition-contract.md; source-snapshot-contract.md.
- **Proving test**: T054 (branch advances mid-flight; digest identical on repeat). No numbered quickstart fixture (maps only to US1 Acceptance 1).
- **Residual limitation**: (a) the zipball is `git archive` output, so `export-ignore`/`export-subst` make the snapshot differ from the commit tree (C8); (b) a SHA that became unreachable after a force-push can 404 and is reported as `TARGET_UNAVAILABLE` (misleading, "connection revoked"); (c) ambiguous short names are not resolved to a fully qualified ref and the ref kind is not recorded; (d) FR-151 inherits a `REPO_PATTERN` that accepts `.`/`..`.
- **Verdict**: HOLDS. Advisory: resolve as `refs/heads/<x>` then `refs/tags/<x>` and record the kind in `SOURCE_MANIFEST`; tighten FR-151 to reject `.`/`..` segments and a trailing `.git`; add the export-archive field and a fixture (C8).

### 2. Malicious Git submodule

- **Threat**: `.gitmodules` points at an internal or attacker URL so that a clone-and-update fetches it (SSRF, hook or filter execution), or gitlink content is smuggled in.
- **Prevention/containment**: No git binary, no clone, no hooks (FR-005, Non-negotiable 3); zipball carries no submodule content; `.gitmodules` is recorded `SUBMODULE_NOT_FETCHED` and dependents are `NOT_TESTED` (FR-006; Invariant 4; Non-negotiable 6). Git-URL dependencies in manifests are separately refused (`UNSUPPORTED_DEPENDENCY_SOURCE`, fixture 43).
- **Owning contract**: source-acquisition-contract.md; dependency-installation-contract.md (5).
- **Proving test**: Fixture 39 / T250 (Fake).
- **Residual limitation**: Submodule-dependent builds are unverifiable (honest `NOT_TESTED`). Which checks "depend on submodule content" is not enumerated, so failing tests that import a submodule path can surface as `FINDING`.
- **Verdict**: HOLDS.

### 3. Archive path traversal

- **Threat**: ZIP (upload, or a hostile zipball) with `../`, absolute, backslash or NUL paths escaping the extraction root.
- **Prevention/containment**: `inspectArchive` before any write; `normaliseEntryPath` normalizes backslashes before the traversal check and refuses `..`, absolute, drive-letter and NUL; `destinationFor` re-checks the resolved path (verified in `packages/safe-archive/src/{paths,guard}.ts`); per-scan temp path deleted on every exit path (FR-008, FR-012; Invariants 5-6).
- **Owning contract**: source-acquisition-contract.md (reuses safe-archive as-is, plan map row 3).
- **Proving test**: Fixture 8 / T051, plus the existing `packages/safe-archive/tests/adverse/extraction.test.ts`.
- **Residual limitation**: The guard does not refuse tab/newline/other control characters and decodes names as Latin-1 (C8); 011's NFC normalization and digest manifest then have an ambiguity (C10/C8) that traversal tests do not cover.
- **Verdict**: HOLDS (traversal itself). Advisory repair for the name-charset issue is in the consolidated list (source-snapshot-contract).

### 4. Symlink escaping the workspace

- **Threat**: A symlink or hardlink entry pointing outside the workspace, followed later by E12, the normalizer or a Guest unpack.
- **Prevention/containment**: `assertRegular` refuses any non-regular Unix mode (symlink, device, socket, FIFO) before write (verified `guard.ts`); nothing in extraction creates a link; normalization drops/rejects links (source-snapshot-contract Invariant 1c); snapshot is injected read-only into a Guest with no host mounts (FR-042).
- **Owning contract**: source-acquisition-contract.md; source-snapshot-contract.md.
- **Proving test**: Fixture 9 / T052 (Fake).
- **Residual limitation**: Availability: git archive stores symlinks, so any repository with one committed symlink is refused whole as `ARCHIVE_GUARD_REFUSED`, which conflates hostile and benign (C8). Zips without Unix mode bits carry no symlinks, so absence of a mode is correctly treated as regular.
- **Verdict**: HOLDS. Advisory: for GitHub-origin archives, define a pre-filter that drops link entries with a recorded `SYMLINK_DROPPED` skip instead of refusing the archive (needs a new FLAG code and guard option; the guard itself stays unchanged).

### 5. Zip bomb

- **Threat**: Small archive expanding to disk/memory exhaustion, via declared-size lies, overlapping entries, Zip64, or 20k+ entries.
- **Prevention/containment**: `uncompressedBudget = min(archiveBytes * ratio, 512 MiB)` checked on declared sizes; streaming `ByteBudget` aborts mid-entry on `DECLARED_SIZE_MISMATCH` and deletes the partial file; entry cap 20,000; Zip64 refused; 50 MiB transport cap (`maxResponseBytes`) on the zipball (verified `guard.ts`, `zip.ts`, `repo-clone.ts`); FR-008; plan budget table rows 1-3.
- **Owning contract**: source-acquisition-contract.md (reuse of safe-archive).
- **Proving test**: existing `packages/safe-archive/tests/adverse/extraction.test.ts` and T257 (cap test). **No numbered 011 fixture exists** for a bomb, contrary to FR-141's "each fixture names a contract and verdict".
- **Residual limitation**: Up to 512 MiB written to the worker volume per scan, times scan-phase concurrency 4 (C9). In-Guest tarball bombs during P1 are bounded by the 8 GiB scratch, not by a ratio.
- **Verdict**: HOLDS. Advisory: add a quickstart fixture "Zip bomb (ratio, declared-size lie, 20,001 entries)" mapped to the existing suite.

### 6. Huge monorepo

- **Threat**: A very large monorepo, or many Tier-1 workspaces, exhausts transport, disk, worker memory, run time or the F07 concurrency budget; partial results are read as complete.
- **Prevention/containment**: 50 MiB/512 MiB/20k limits (FR-008/124), per-file caps, E12 budgets with `ANALYSIS_BUDGET_EXHAUSTED` partials (FR-027), 4-partition cap with `WORKSPACE_CAP_EXCEEDED` (FR-152), run envelope 25 min (untrusted-execution invariant 9), `complete:false` rules in coverage (coverage-contract Invariant 9).
- **Owning contract**: source-acquisition-contract.md; untrusted-execution-contract.md (Invariant 13); coverage-contract.md.
- **Proving test**: Fixture 52 / T268 (Fake: 5 workspaces, cap of 4). Nothing exercises an over-50 MiB repo, partition serialization, or the sweep.
- **Residual limitation**: (1) the zipball is all-or-nothing: >50 MiB repositories cannot be scanned at all and the failure has no registry reason code (the guard's `ARCHIVE_TOO_LARGE` is internal; plan says `INVALID_CONFIGURATION`, which blames the customer); the edge case "workspace selection and budgets bound the work" never applies because acquisition fails first; (2) serialization is contradicted by 009 (C0.4): partitions 2-4 become `REFUSED`, not queued; (3) 4 x 25 min vs the 15-minute scan sweep (C0.3); (4) E12 1 GiB x concurrency 4 in a 2 GiB worker (C9).
- **Verdict**: GAP.
- **Required repair**: (a) source-acquisition-contract.md Failure table: add reason code `SOURCE_TOO_LARGE` (verdict `BLOCKED`) in source-evidence-contract.md registry and map transport/guard size refusals to it with a customer-facing explanation; state that repositories whose GitHub zipball exceeds 50 MiB are unsupported in v1. (b) untrusted-execution-contract.md Invariant 13 and plan.md "Monorepo" row: replace "refused lease means redelivered later" with an explicit mechanism (plan-level dependency chain run(k+1) after run(k) with a fan-in rule that proceeds after any terminal predecessor, or a 009 delay-on-concurrency-refusal rule), and record it as a 009 clarification. (c) plan.md Resource Budget Table: set E12 AST budget so that `CONCURRENCY.scanPhase x AST budget` fits the worker limit (for example 256-384 MiB with compose `memory` raised, or a dedicated E12 pool with concurrency 1); fix R29's "worker unaffected". (d) add quickstart fixtures: "Repository over 50 MiB" and "Four partitions end to end with sweep enabled". (e) C0.3 amendment.

### 7. Git LFS oversized payload

- **Threat**: An LFS pointer declares a very large object so a fetcher downloads it, or pointer text masquerades as source.
- **Prevention/containment**: Pointers are detected by signature and never resolved (FR-007; source-acquisition-contract Non-negotiable 6); GitHub zipballs do not include LFS objects (verify); recorded `LFS_POINTER_UNRESOLVED`.
- **Owning contract**: source-acquisition-contract.md.
- **Proving test**: Fixture 40 / T250.
- **Residual limitation**: Tests or builds that read an LFS-tracked file fail on pointer text; build-typecheck maps this to `MISSING_BUILD_INPUT`, but there is no equivalent mapping for test failures, so those can surface as `FINDING`.
- **Verdict**: HOLDS. Advisory: in automated-test-contract, a failing case that reads a path listed in `skipped[]` with `LFS_POINTER_UNRESOLVED` is `INCONCLUSIVE`, not `FINDING`.

### 8. Malicious npm postinstall

- **Threat**: Lifecycle scripts (or manager hooks/config) run at install and read host files, steal env, or beacon out.
- **Prevention/containment**: Scripts never run in v1 (`--ignore-scripts` / `YARN_ENABLE_SCRIPTS=false`; FR-067, FR-062; dependency-installation-contract Invariants 3, 6 and neutralization table); repo `.npmrc`/`.yarnrc*` removed from the snapshot (FR-009/153) and platform config forced; pnpmfile/yarnPath ignored; P1 egress only via the exact-URL proxy; P3/P4 network cut; whole thing inside a one-shot microVM with no Fahes secrets (FR-035/037/045).
- **Owning contract**: dependency-installation-contract.md; command-policy-contract.md; isolation-policy-contract.md.
- **Proving test**: Fixture 10 / T113 (Real harness for the forced run; Fake for policy).
- **Residual limitation**: Packages that need scripts become `NOT_TESTED`; the "forced run" harness is a test-only path that enables scripts and must not be reachable by configuration; the proxy design itself is under-specified (see #19, C6).
- **Verdict**: HOLDS.

### 9. Malicious ESLint plugin

- **Threat**: A plugin or shared config in the customer's lockfile runs code during `eslint`, reads env/FS, attempts network, kills the run, or prints forged ESLint JSON so lint reads clean.
- **Prevention/containment**: E12 never evaluates executable config (FR-019); repo ESLint config and plugins run only in the Guest after P1 with the network cut (build-typecheck-contract Invariants 5-6; command-policy `lint.eslint`, Invariant 11); the baseline config is used only when the repo has none.
- **Owning contract**: build-typecheck-contract.md; command-policy-contract.md.
- **Proving test**: Fixture 4 / T112 proves a lint violation is found and that static analysis records `EXECUTABLE_CONFIG_PRESENT`. **No fixture runs a hostile plugin.** Containment rests on the generic I-series.
- **Residual limitation**: Forged output (C3): a plugin can emit `[]` or fabricated messages and exit 0; lint "PASS" is not attested.
- **Verdict**: WEAK.
- **Required repair**: quickstart.md + tasks.md: add Real-provider fixture `hostile-eslint-plugin` (plugin reads env, `/proc`, home, tries sockets and DNS, writes forged `eslint -f json` and `process.exit(0)`): expected containment per IAB 5/3, forged output cannot exceed the template's schema, and `tests.lint.*` PASS text reads "ESLint reported zero violations (runner-reported)". build-typecheck-contract.md: add that lint/tsc output is runner-reported, not independently attested (C3).

### 10. Malicious test runner configuration

- **Threat**: `jest.config.js`, `vitest.config.ts`, setup/globalSetup files execute code, narrow `testMatch`/`coverage.include`, call `process.exit(0)`, change `reporters`, or point `rootDir` elsewhere in the Guest.
- **Prevention/containment**: Executable configs are never evaluated outside the Guest (FR-019; automated-test-contract Inputs); templates fix argv (`--ci`, `--runInBand`, `--reporter=json`, no `-u`/`--watch`; command-policy Invariant 9); reconciliation of executed vs discovered counts (automated-test-contract Invariant 2); `COVERAGE_EXCLUDES_MOST_FILES` for narrowed coverage (coverage-contract Invariant 5); network none in P3/P4.
- **Owning contract**: automated-test-contract.md; command-policy-contract.md; coverage-contract.md.
- **Proving test**: Fixtures 4, 18 (variant: runner exit 0 with files discovered), 36; T122. No fixture uses a hostile config.
- **Residual limitation**: Reconciliation catches inconsistent output only; a consistent forgery passes (C3). A legitimate custom `testMatch` produces a count delta and thus `INCONCLUSIVE` (safe direction, noisy).
- **Verdict**: WEAK.
- **Required repair**: tasks.md/quickstart.md: add fixtures `hostile-jest-config` and `hostile-vitest-config` (globalSetup that exits 0, forged JSON, reporter override attempt, `rootDir` escape). automated-test-contract.md: state that Jest runs without `--runInBand` where possible so the reporter lives in the parent while tests run in workers, and that the reporter output is read from a file written by the Guest agent's own reporter module under a uid the tests cannot write (see C3 repair in untrusted-execution-contract.md).

### 11. Test executes a fork bomb

- **Threat**: Unbounded forking exhausts pids, memory and CPU, starves the Guest agent, and tries to outlive the step.
- **Prevention/containment**: Pid limit 1,024 in Guest limits, vCPU/memory caps from the VMM, step and run wall clocks, destroy of the whole VM kills every descendant (FR-044, FR-051; isolation-policy matrix "Processes"; IAB 4); contained result `RESOURCE_LIMIT_EXCEEDED`, three kills in a run abort (invariant 14).
- **Owning contract**: isolation-policy-contract.md; untrusted-execution-contract.md.
- **Proving test**: Fixture 12 / I8 / T115, T277 (Real only).
- **Residual limitation**: The pid cap is a guest-side limit (a VMM cannot count guest pids; C13); the real host-side bound is guest memory/vCPU. If the agent is starved, the unresponsive channel can be classified as "agent tamper" (`CONTAINMENT_ABORT`, `FAILED`, `SAFETY_VIOLATION`) rather than a measured cap hit; fixture 12 accepts either outcome, so the classification is untested.
- **Verdict**: HOLDS. Advisory: reserve agent CPU/pids in a protected cgroup and define "channel silent" distinctly from "protocol violation".

### 12. Test exhausts memory

- **Threat**: Allocation until the Guest, the in-Guest PostgreSQL, or the agent is killed; attempts to pressure the host.
- **Prevention/containment**: VMM memory size fixed (4 GiB), balloon off (isolation matrix "Memory"); Guest OOM is a measured `RESOURCE_LIMIT_EXCEEDED` (FR-044/056); destroy at end.
- **Owning contract**: isolation-policy-contract.md.
- **Proving test**: Fixture 13 / I9 / T116 (Real only).
- **Residual limitation**: The Postgres datadir is on guest tmpfs (execution-fixture inv. 1), so test data competes with RAM; an OOM may kill Postgres or the agent, again blurring "tamper" vs "cap".
- **Verdict**: HOLDS.

### 13. Test fills disk

- **Threat**: Fill scratch/tmpfs to starve the Guest and, if scratch is sparse and oversubscribed, the host disk.
- **Prevention/containment**: Size-capped scratch device (8 GiB) and IOPS/bandwidth limiters at the VMM (isolation matrix "Disk"; FR-044); wiped at destroy; no shared caches.
- **Owning contract**: isolation-policy-contract.md.
- **Proving test**: I10 `disk-fill`, I19 `iops-hammer` (T277, T278; Real only). No numbered quickstart row besides the I-series.
- **Residual limitation**: Host-side provisioning of scratch (sparse vs preallocated, host quota) is unspecified; thin provisioning could let several runs exhaust the host.
- **Verdict**: HOLDS. Advisory: require preallocated or quota-bounded scratch in the EP host spec (T135).

### 14. Test attempts host filesystem access

- **Threat**: Read host paths, other runs' files or images via a mount, device or the VMM.
- **Prevention/containment**: Read-only signed rootfs, snapshot injected read-only then copied to scratch, no host mounts, only block devices and a byte-capped vsock (FR-042; isolation-policy matrix "Filesystem" and "IPC"); IAB 1, 2, 5; jailer, dedicated unprivileged VMM user, seccomp.
- **Owning contract**: isolation-policy-contract.md.
- **Proving test**: Fixture 14, I16 `host-fs-read`, I1 `kernel-share` / T117, T278 (Real only).
- **Residual limitation**: VMM/kernel zero-day class (R29, accepted); nothing exists to run these yet.
- **Verdict**: HOLDS.

### 15. Test attempts Docker socket access

- **Threat**: Reach `/var/run/docker.sock` to spawn privileged containers.
- **Prevention/containment**: No Docker, no host socket anywhere in the Execution Plane path; IPC is vsock only (isolation matrix "IPC"; FR-035); no container is the boundary (FR-037).
- **Owning contract**: isolation-policy-contract.md.
- **Proving test**: I23 `docker-sock` / T279 (Real only).
- **Residual limitation**: Largely vacuous by construction (nothing to find); the test mainly guards image drift.
- **Verdict**: HOLDS.

### 16. Test attempts cloud metadata access

- **Threat**: Reach 169.254.169.254 (and v6/other-cloud equivalents) for instance credentials of the Execution Plane host.
- **Prevention/containment**: Default-deny egress enforced on the host tap outside the Guest, no route to link-local/metadata/management ranges (FR-043; IAB 3); P3/P4 network fully cut and probe-verified (dependency-installation-contract Invariant 10); the Guest has no DNS.
- **Owning contract**: isolation-policy-contract.md; dependency-installation-contract.md.
- **Proving test**: Fixture 15, I3 `metadata-169.254` / T118, T276 (Real only).
- **Residual limitation**: Only the IPv4 literal is named; IPv6 link-local/ULA, `100.64.0.0/10`, and provider-specific names/addresses must be in `rfc1918-sweep`. The EP-edge proxy is outside safe-net and has no stated resolved-address guard.
- **Verdict**: HOLDS. Advisory: extend I4 to v6/ULA/CGNAT/cloud-specific ranges; require the proxy to refuse non-public resolved addresses (reuse safe-net address rules).

### 17. Test attempts internal Redis/Postgres access

- **Threat**: Reach Fahes Redis (6379), Postgres (5432), pgbouncer or the worker network from a Guest.
- **Prevention/containment**: Execution Plane is a separate deployment with no route inward; app-plane `backend` network is `internal: true` in compose; Guest egress default-deny (IAB 3); the EP holds no Fahes secrets (FR-039/045).
- **Owning contract**: isolation-policy-contract.md.
- **Proving test**: Fixture 16, I4 `rfc1918-sweep`, I5 `ep-mgmt-probe`, I7 `redis-5432-6379` / T119, T276 (Real only).
- **Residual limitation**: Depends on EP network placement being truly separate (a deployment fact, not testable from this repo); the mTLS path from worker to EP is the only intended hole and its client credential sits in the parsing child (C12).
- **Verdict**: HOLDS.

### 18. Test attempts cross-tenant filesystem access

- **Threat**: Read another tenant's snapshot, scratch, logs, node_modules or package cache from the same host.
- **Prevention/containment**: One Guest per run never reused, no shared writable state or caches (FR-042/046; IAB 2); per-run scoped credentials (FR-146); tenant-scoped keys and `(id, userId)` reads with indistinguishable NotFound (FR-145); wipe at teardown.
- **Owning contract**: isolation-policy-contract.md; source-snapshot-contract.md.
- **Proving test**: Fixture 25, 56, 60; I2 `residue-writer`, I17 `cache-poison`, I24 `cross-tenant-read`, I20 `url-reuse` / T053, T278, T264.
- **Residual limitation**: Microarchitectural side channels accepted (R29); "wipe" is undefined (zero-fill vs file delete vs key destruction), though I2 reads raw scratch devices of the next run.
- **Verdict**: HOLDS.

### 19. Test attempts outbound data exfiltration

- **Threat**: Customer code sends data out through any path: direct sockets, DNS, the P1 registry proxy (URL path, headers, method, smuggling, domain fronting), covert timing, or via the evidence channel.
- **Prevention/containment**: Egress none in P3/P4, probe-verified before customer code (FR-063; Invariant 10); P1 egress only through a deny-by-default exact-URL proxy, GET only, redirects revalidated, 1 GiB cap, no cache (dependency-installation-contract 4a-4f); P1 runs no customer code with scripts off (FR-067); the Guest holds no Fahes secret, so only the customer's own source is at risk (R29).
- **Owning contract**: dependency-installation-contract.md; isolation-policy-contract.md.
- **Proving test**: I3-I7 (`dns-exfil` is the only exfil-specific fixture) and T272 (exact URL, redirect, no metadata exception, no cache). **No fixture attempts to bypass the proxy** (CONNECT, SNI/Host mismatch, absolute-URI request line, request smuggling, userinfo, percent-encoded or case-variant paths, query strings, IPv6 host literals, header-carried data).
- **Residual limitation**: The contract never states how URL-level policy is enforced for HTTPS (C6). If implemented as a CONNECT/host allowlist, the "exact URL" claim is false and domain fronting through a CDN-hosted registry is possible. Headers on an allowed GET are unconstrained. Covert channels are accepted in R29, but only the URL/timing channel is listed.
- **Verdict**: WEAK.
- **Required repair**: dependency-installation-contract.md 4: specify the proxy as a TLS-terminating reverse mirror with a per-run CA installed in the signed image trust store, Guest DNS resolving only the allowlisted registry hostnames to the proxy address, no CONNECT, HTTP/1.x GET only, request line/Host/SNI must agree and match the allowlist, headers rewritten to a fixed set, request size and count caps, per-run credential-free. Add the C6 lockfile derivation table (URL derivation for pnpm/berry from registry convention, integrity source per format). Add Real fixture `proxy-bypass-matrix` (above variants) to quickstart.md/tasks.md; extend R29 with the header channel.

### 20. Test hangs forever

- **Threat**: A test (or build, migration, probe) never returns, holding a Guest, a lease and a worker slot.
- **Prevention/containment**: Per-step walls clamped to the remaining run envelope (FR-087; untrusted-execution Invariant 9), supervisor-side timers independent of the Guest, destroy of the whole VM (FR-051), EP hard TTL (FR-052), step result `TIMED_OUT` -> `INCONCLUSIVE`, unit `COMPLETED`.
- **Owning contract**: untrusted-execution-contract.md; automated-test-contract.md (Invariant 7).
- **Proving test**: Fixture 11 / T114; Fixture 55 / T270 (Fake and Real).
- **Residual limitation**: The bound exists at the step and run level but the platform around it does not honor it: (1) the existing scan sweep terminates the scan at 15 minutes (C0.3) while the run envelope is 25; (2) "unit timeout" is undefined and 009's unconditional SIGKILL arrives before persist/teardown if it equals the run envelope (C1); (3) jest/vitest `--json` reporters write at the end, so "reporter output parsed before the timeout is preserved" (automated-test-contract Invariant 7) is false for them: a hang loses all suites, not only the hung one; (4) a hang inside a customer-spawned child that survives the test process is handled only by whole-Guest destroy, which is correct.
- **Verdict**: GAP.
- **Required repair**: (a) untrusted-execution-contract.md: define `timeoutPolicyMs` for `SOURCE_EXECUTION` = provisioning 120 s + run envelope + persist 120 s + teardown 90 s + finalize 40 s (~33 min 50 s), start the run-envelope clock at `READY`, state that 009's SIGKILL margin must exceed phases 8-13; (b) C0.3 amendment so a scan holding a live `SOURCE_EXECUTION` lease is exempt from, or has a longer, scan deadline and so the sweep cannot refund and terminate under a running Guest; (c) automated-test-contract.md Invariant 7: either require a streaming reporter (per-file JSON via the Guest agent's reporter module) or delete the "parsed before the timeout is preserved" sentence for jest/vitest; (d) add Fixture "Hang at minute 14 of a 25 minute envelope with the sweep enabled".

### 21. Worker crashes during execution

- **Threat**: The worker (or supervisor child) dies mid-run, leaving a Guest, a lease and a RUNNING unit.
- **Prevention/containment**: Dead-man 30 s destroys a supervisor-less Guest and hard TTL backstops (FR-052); deterministic `runId`, `getRun` on restart, no auto-retry once a customer step started, surviving Guest destroyed and classified `TRANSIENT_INFRASTRUCTURE` (FR-054); F07 lease reclamation; orphan reconciler lists EP runs with no live unit (FR-057); `evidence-write` claims prevent duplicates.
- **Owning contract**: untrusted-execution-contract.md; plan.md "Upstream Compatibility" G3.
- **Proving test**: Fixture 27 / T126 (Fake and Real).
- **Residual limitation**: Guest cleanup is solid. Unit and check closure is not: the reconciler is one-directional (EP run -> destroy); nothing finalizes the RUNNING `ExecutionUnit` row. The path relies on BullMQ stalled-job redelivery of an `attempts: 1` job (not declared anywhere in the package; BullMQ's default allows one stalled redelivery, verify; the worker's `index.ts` already comments on stalled reclaim) and on 009's dispatch re-run of a non-terminal unit. If the worker stays down, or stalls twice, the unit stays RUNNING, `sweepUnresolvedSourceChecks` ("once, after every unit terminal") never fires, and checks end with no outcome (unconditional blocker 4 in quickstart Part C). The scan-wide sweep eventually kills the scan, not the unit or the checks.
- **Verdict**: WEAK.
- **Required repair**: untrusted-execution-contract.md + plan.md: add a maintenance sweep `finalizeStuckSourceExecutionUnits` (unit RUNNING, lease expired/reclaimed, EP run DESTROYED/NOT_FOUND/QUARANTINED) that finalizes `FAILED/TRANSIENT_INFRASTRUCTURE` and then triggers `sweepUnresolvedSourceChecks`; make the sweep also run on scan-level timeout; state the dependency on stalled-job redelivery and set `maxStalledCount` explicitly. Add task and a Fake test "worker down for 20 minutes".

### 22. Cancellation arrives during dependency installation

- **Threat**: User cancel or kill switch during P1 while the proxy allowlist is live and the manager is mid-extraction; late bytes are trusted or the allowlist lingers.
- **Prevention/containment**: Supervisor sees the F07 stop within the 5 s checkpoint cadence (or parent escalation at 5 s), issues `destroy(runId)`, `STOPPED` only after `DESTROYED` and wipe (FR-050/051); proxy entries and presigned URLs removed at teardown (FR-057); late output discarded (untrusted-execution Non-negotiable 4); `CANCELLED` vs `KILLED` preserved (FR-053).
- **Owning contract**: untrusted-execution-contract.md.
- **Proving test**: Fixture 26 / T125 (Fake and Real) is generic cancellation; install-specific timing is not separately tested.
- **Residual limitation**: Stop latency is measured at `destroy` issuance; actual termination can take up to 30 s + 60 s (phases 10-11). During P1 bytes keep flowing to the manager until destroy completes.
- **Verdict**: HOLDS. Advisory: parameterize Fixture 26 over phases P1, P3, P4.

### 23. Kill switch arrives during a migration test

- **Threat**: Stop mid-transaction; partial migration state is recorded as a completed or failed migration, or the stopped Guest's later output is trusted.
- **Prevention/containment**: Guest destroyed, database disappears with it (FR-107; execution-fixture Invariant 10; migration-testing Invariant 7); a stopped execution is never a migration result.
- **Owning contract**: migration-testing-contract.md; untrusted-execution-contract.md.
- **Proving test**: Fixture 47 / T280, T180 (Fake and Real).
- **Residual limitation**: The package contradicts itself on what is recorded: migration-testing-contract Invariant 7 and data-model say the scenario is recorded `status: STOPPED`; Fixture 47/T280 say no `MIGRATION_RESULT` exists and coverage shows `NOT_RUN`; untrusted-execution phase 8/9 say after a stop "persist nothing new" and require a live lease token, which a stopped unit no longer holds, so writing a `STOPPED` row has no legal path. The sweep would otherwise produce `BLOCKED`.
- **Verdict**: WEAK.
- **Required repair**: migration-testing-contract.md Invariant 7 and data-model.md `MIGRATION_RESULT`: delete `STOPPED` from the `status` enum (or restrict it to a row the supervisor wrote before the stop was observed) and state that after a stop no row is written; checks end `BLOCKED` via the sweep and coverage reports `NOT_RUN`; align Fixture 47/T280 and the 11-scenario enum text.

### 24. Isolated runtime fails cleanup

- **Threat**: Destroy or scratch wipe cannot be confirmed; a Guest, device or tap remains and a later tenant is placed on a dirty host.
- **Prevention/containment**: Run goes `QUARANTINED`, host takes no new tenant work, operator alert, `STOPPED` never recorded (FR-051/057; EP states table); `destroy` idempotent and repeated; orphan reconciler lists runs older than TTL; teardown audit by `runId`; dead-man and TTL.
- **Owning contract**: untrusted-execution-contract.md; isolation-policy-contract.md (IAB 8).
- **Proving test**: I15 `teardown-audit` (after destroy, kills in phases 4/6/10, dead-man) / T109, T141, T279 (Real only).
- **Residual limitation**: If the EP control process itself hangs, nothing in the package destroys the Guest (dead-man and TTL live in that process); host-level watchdog/quarantine escalation to a human is the only backstop.
- **Verdict**: HOLDS.

### 25. Artifact upload succeeds but metadata write fails

- **Threat**: R2 object written, row insert fails; an orphan persists or a check reads as passed.
- **Prevention/containment**: 009 `createArtifact` uploads first, inserts after, and `reclaimOrphanedArtifacts` deletes orphans (artifact-contract steps 3-5); 011 maps the failure to `TRANSIENT_INFRASTRUCTURE` and the dependent check `BLOCKED` (source-evidence-contract Failure behavior; source-snapshot-contract Failure behavior); `evidence-write` claim makes retries idempotent.
- **Owning contract**: source-evidence-contract.md; source-snapshot-contract.md.
- **Proving test**: Fixture 29 / T029 (Fake).
- **Residual limitation**: `attempts: 1` on the scan-phase queue means a transient acquire failure is not retried by the queue; "transient fetch faults retried within acquisition only" does not cover the metadata write. Orphan bytes (up to 512 MiB) persist until the reclaim grace period.
- **Verdict**: HOLDS.

### 26. Stale execution attempts to commit evidence

- **Threat**: A superseded or zombie supervisor (lost lease) writes evidence or finding rows.
- **Prevention/containment**: `holderToken` fencing; renewal with a stale token returns zero rows and is treated as stop (FR-050/055; plan F07 "Lease and fencing"); `evidence-write` claim key per `{scanPlanId}:{executionUnitId}:{attempt}:{kind}:{naturalKey}`; a redelivered worker destroys any surviving Guest rather than driving it (FR-054).
- **Owning contract**: source-evidence-contract.md; untrusted-execution-contract.md (Invariant 8).
- **Proving test**: Fixture 28 / T028; Fixture 51 / T243 (Fake).
- **Residual limitation**: The stated mechanism is "009's terminal-write rejection applies"; verified false (C0). `recordEvidence` takes no token and checks no state. The lease check in 011's wrapper (T037) and the insert are separate operations, so a zombie that passes the check can still write; with a first-writer-wins claim, a zombie's data can become the recorded row. Realistic exposure is small (one Guest, the new worker destroys it), but the guarantee as written is stronger than anything that exists.
- **Verdict**: WEAK.
- **Required repair**: spec.md FR-055 and untrusted-execution-contract.md Invariant 8: remove the sentence citing 009 terminal-write rejection; state that fencing is a 011 wrapper that (1) reads the lease in the same call as the insert, (2) records `holderToken` epoch inside the Evidence payload envelope, and (3) makes consumers (checks, coverage, Findings) ignore evidence whose producing unit reached a terminal state before the row's `createdAt`. Add the TOCTOU as a named residual.

### 27. Source contains real API keys

- **Threat**: Secrets inline in source or fixtures reach evidence excerpts, Finding text, AI prompts, the EP, or the Guest.
- **Prevention/containment**: Credential-denylist files excluded by path only (FR-009/153); excerpts <= 7 lines/600 chars and never from denylist files (FR-118); `@webaudit/redaction` before storage and before `materializeFinding` (FR-117, FR-150); Guest receives only synthetic env (FR-045/096); snapshot disclosed to the EP (FR-147).
- **Owning contract**: source-snapshot-contract.md; source-evidence-contract.md.
- **Proving test**: Fixture 53 / T255 (denylist), Fixture 57 / T247 (planted secret in Finding text), T023 (evidence writer).
- **Residual limitation**: The detector is conservative by design (C5): lowercase-hex secrets are treated as "benign git hashes", names/shapes the rules do not know are missed, tokens > 200 chars are skipped. The same tokens in excerpts, test names, stack traces, logs and AI prompts then pass through. The snapshot itself (with inline keys) is stored in R2 and copied to a separate Execution Plane. The Guest sees them (intended, they are the customer's own).
- **Verdict**: WEAK.
- **Required repair**: source-evidence-contract.md invariant 1 and source-snapshot-contract.md: at acquisition, run the detector once over the whole snapshot and keep the exact secret values in trusted memory for the run (never persisted); every Guest-originated string, excerpt, Finding text and AI segment is additionally scrubbed by exact-value match (plus base64/URL-encoded variants) before storage. This removes dependence on pattern coverage for secrets that exist in the source. Add a fixture with hex-only, lowercase and > 200-char secrets printed by a test.

### 28. Build logs expose credentials

- **Threat**: Build/test/install logs (10 MiB per step, stored as Artifacts) leak secrets printed by customer code, tool output or stack traces; or the redaction pass itself is turned into a DoS.
- **Prevention/containment**: Synthetic env only (command-policy Invariant 4); host-side byte caps and head+tail (plan budget table); validate-then-redact on the trusted side (FR-039, FR-117; phase 8); logs are Artifacts under tenant scope; operators cannot read payloads (FR-144).
- **Owning contract**: untrusted-execution-contract.md (phase 8); source-evidence-contract.md.
- **Proving test**: T108 (output capture), T023, T247; Fixture 33 is log-line *injection*, not credential leakage. I12 `output-flood` tests caps, not redaction cost.
- **Residual limitation**: Same coverage gaps as #27, plus verified algorithmic DoS in `detect.ts`: O(n^2) `SECRET_NAME` scan on long identifier-like runs and O(n*m) overlap filters, executed synchronously in the supervisor child on up to 10 MiB per step (C5). A hostile log forces `FAILED` runs, and stalls the checkpoint/heartbeat loop.
- **Verdict**: WEAK.
- **Required repair**: untrusted-execution-contract.md phase 8 and source-evidence-contract.md: redact in bounded windows (<= 64 KiB, line length cap 8 KiB with `TRUNCATED_LINE`), in a credential-less worker thread/child with a kill deadline, never inline in the supervisor loop; require ReDoS-safe patterns (anchored or bounded quantifiers, linear overlap sweep after sorting). Note: `packages/redaction` is "REUSE AS-IS" (plan map row 25); either add a linear-time `redactBounded` sibling in 011 code or raise a package change. Add fixtures `log-redos` (5 MiB of `a`) and `log-token-flood` (400k high-entropy tokens) with a latency assertion, and the exact-value scrub of #27.

### 29. AI receives prompt injection in README

- **Threat**: Repository text, comments, test names or logs instruct the model to change verdicts or exfiltrate.
- **Prevention/containment**: Deterministic layer first; AI after, with no tools, "treat as data" preamble, labeled segments, excerpt caps, output carries no verdict/coverage/version fields and is labelled `AI_JUDGMENT` (FR-128/129/137); no AI in verdict, fingerprint, scope or safety.
- **Owning contract**: source-evidence-contract.md; plan.md (Constitution III/IV).
- **Proving test**: Fixtures 30, 31, 32, 33 / T219-T222 (Fake + AI stub).
- **Residual limitation**: The model can still write misleading explanations next to deterministic results; the label is the only control. Excerpts go to a third-party model provider and the consent covers only the EP (see #48).
- **Verdict**: HOLDS.

### 30. Test suite has zero tests

- **Threat**: No tests, or tests the platform cannot see, read as a pass.
- **Prevention/containment**: `NO_TESTS_FOUND` is a `FINDING` only at HIGH discovery confidence, else `INCONCLUSIVE` `LOW_DETECTION_CONFIDENCE`; discovery cap 5,000 (`DISCOVERY_CAPPED`); zero discovered is never `PASS` (FR-079/080; automated-test-contract table and Invariant 2).
- **Owning contract**: automated-test-contract.md.
- **Proving test**: Fixture 18 / T121 (Fake).
- **Residual limitation**: "HIGH discovery confidence" is not defined anywhere (detection confidence is `HIGH|MEDIUM|LOW`, but what makes test discovery HIGH is not stated). `export-ignore` can hide the tests dir and produce a false `FINDING` (C8).
- **Verdict**: HOLDS. Advisory: define the discovery-confidence rule in automated-test-contract.md (for example HIGH iff a recognized runner config or dependency is present, discovery patterns for that runner ran, and no `export-ignore` attribute is present).

### 31. Test suite is entirely skipped

- **Threat**: Every test is skipped (`.skip`, `skipIf(CI)`, missing env), or one passing test hides hundreds of skips; the workspace reads green.
- **Prevention/containment**: A fully skipped suite is `INCONCLUSIVE` `ALL_TESTS_SKIPPED`; skipped counts and identities recorded and surfaced in coverage (FR-079; automated-test-contract table, Invariant 4); `CI=1` and `TZ=UTC` are fixed so env-based skips are visible.
- **Owning contract**: automated-test-contract.md; coverage-contract.md.
- **Proving test**: Fixture 19 / T123 (Fake).
- **Residual limitation**: Roll-up is undefined. The contract's verdicts are per `SuiteResult`; the check records one `SOURCE_CHECK_RESULT` per check execution per workspace. Nothing says how 49 `INCONCLUSIVE` suites and 1 `PASS` suite combine (worst-of? any-pass?). A mixed suite with one pass and many skips is `PASS` by rule. A `PASS` over a 98% skipped workspace is therefore possible.
- **Verdict**: WEAK.
- **Required repair**: automated-test-contract.md: add a roll-up rule: workspace check verdict = `FINDING` if any failing case, else `INCONCLUSIVE` if any in-scope suite is not `EXECUTED_PASSED` or if skipped/executed ratio > 0.5, else `PASS`; the `PASS` text must show "N of M suites executed, K cases skipped". Add a fixture "one passing test, 999 skips".

### 32. Test runner exits zero without executing tests

- **Threat**: Misconfigured or malicious runner exits 0 with no tests run, or prints a forged success report.
- **Prevention/containment**: Exit 0 is never proof; executed count reconciled with static discovery; zero reporter cases with discovered files -> `RUNNER_REPORTED_ZERO_TESTS`; lower count -> `INCONCLUSIVE` naming the delta; unparseable reporter -> `RUNNER_OUTPUT_UNPARSEABLE` (FR-079; automated-test-contract Invariant 2; command-policy Invariant 6).
- **Owning contract**: automated-test-contract.md; command-policy-contract.md.
- **Proving test**: T122 (unnumbered "runner exits 0 without running tests"), Fixture 18 variant (Fake). No fixture with a forged report.
- **Residual limitation**: Reporter output is produced by processes the customer controls (C3). A consistent forgery (right counts, all passed) is indistinguishable. No in-Guest uid split, no single-session vsock rule is stated.
- **Verdict**: WEAK.
- **Required repair**: untrusted-execution-contract.md and isolation-policy-contract.md: customer processes run as a dedicated unprivileged uid in separate pid/mount namespaces; the Guest agent runs as root, owns the only vsock session (host accepts exactly one connection per run; second connection is a `CONTAINMENT_ABORT`), and the vsock device is root-only; reporters are Fahes-owned modules loaded via the template (not customer reporters) writing to a file only the agent can read. Add Real fixtures `vsock-forge` and `reporter-forge`. automated-test-contract.md: `PASS` copy states "runner-reported".

### 33. Tests require unavailable external services

- **Threat**: Tests need a database/API/queue; with egress cut they fail, and either blame the customer or hide real failures.
- **Prevention/containment**: Static classification `REQUIRES_EXTERNAL_SERVICE`/`REQUIRES_SECRETS` (FR-077); egress none; in-Guest doubles only when named in the `FixtureSpec`; blocked attempts annotate results and coverage, never `PASS` (FR-082; automated-test-contract Invariant 9; execution-fixture Invariants 1-2).
- **Owning contract**: automated-test-contract.md; execution-fixture-contract.md.
- **Proving test**: Fixtures 15/16 (dependent test `NOT_TESTED NETWORK_BLOCKED_BY_POLICY`) and 24 (fixture startup). No fixture where a test fails because its outbound call was blocked.
- **Residual limitation**: Attribution is undefined. `networkBlockedAttempts` is a per-run or per-step host counter (egress-deny telemetry), not per case; with parallel workers, a failing case cannot be tied to a blocked attempt. Two bad outcomes: a test failing only because the network is gone becomes a `FINDING` (`tests.run.failed`, MEDIUM) against the customer, or any run with a blocked attempt demotes genuine failures to `NOT_TESTED`. The contract says both ("annotated" and "`NOT_TESTED`").
- **Verdict**: WEAK.
- **Required repair**: automated-test-contract.md Invariant 9: when a suite's step recorded `networkBlockedAttempts > 0`, every failing case in that suite is `INCONCLUSIVE` with `NETWORK_BLOCKED_BY_POLICY` (never `FINDING`, never `NOT_TESTED`); passing cases stay `PASS`. Define the counter's granularity (per Step) and require the EP deny log to be keyed by `runId` + step window. Add a fixture "test fails with ECONNREFUSED/ENETUNREACH after a blocked call".

### 34. Database fixture accidentally points to production

- **Threat**: A `DATABASE_URL` or hard-coded host in source or migration SQL reaches a real database.
- **Prevention/containment**: Only the in-Guest PostgreSQL is ever used; any non-disposable reference is ignored, never echoed, recorded `NON_DISPOSABLE_DATABASE_REFERENCE` (FR-100, FR-106; execution-fixture Invariant 6; migration-testing Invariant 1); platform sets all DB-style env vars to the fixture (FR-096, aliases listed); `.env*` files are excluded from the snapshot; egress none in P3/P4; no customer code runs in P1.
- **Owning contract**: execution-fixture-contract.md; migration-testing-contract.md.
- **Proving test**: T180 (disposable-database safety test) and T189; I3/I4 for the network layer. No numbered quickstart fixture.
- **Residual limitation**: A hard-coded production host in code is stopped only by the network cut (correct and sufficient); `\connect` in a migration is likewise blocked by network.
- **Verdict**: HOLDS. Advisory: promote T180 to a numbered fixture with a Real run asserting the connection attempt appears as an egress-deny hit.

### 35. Migration partially applies

- **Threat**: A migration fails midway; partial state is misreported; or the harness's semantics differ from the customer's real migration tool so "PASS" does not mean deployable.
- **Prevention/containment**: `ON_ERROR_STOP`, status `PARTIAL` never presented as `APPLIED`, later migrations `NOT_RUN`, failing migration identity and SQLSTATE recorded, catalog state observed (migration-testing Invariant 6, MIGRATION_RESULT payload); Guest disposable.
- **Owning contract**: migration-testing-contract.md.
- **Proving test**: Fixture 21 / T176; Fixture 23 / T178 (Fake and Real).
- **Residual limitation**: C7: `psql -f` is autocommit per statement, whereas Prisma applies each `migration.sql` as one multi-statement request; the partial state recorded may not occur in the customer's real deploy, and `CREATE INDEX CONCURRENTLY` or other transaction-sensitive statements pass here and fail there. psql also interprets meta-commands (`\!` executes a shell) in customer files, contradicting FR-072. `appliedVia` is not recorded in evidence.
- **Verdict**: WEAK.
- **Required repair**: command-policy-contract.md and migration-testing-contract.md: replace `psql -f` with a Fahes in-Guest tool `fahes-db-apply` that sends each migration file as a single simple-protocol request (matching Prisma) over libpq, with no meta-command interpretation (add a static E12 check that refuses `\`-lines as `UNSAFE_TO_EXECUTE`); run migrations as a non-superuser owner role where extensions allow, document `COPY ... PROGRAM` containment as VM-only; record `MIGRATION_RESULT.appliedVia` and word verdicts "SQL applies on PostgreSQL 16", not "migration tool succeeds". Add fixtures `psql-meta-shell` and `create-index-concurrently`.

### 36. Integration fixture retains tenant data

- **Threat**: Postgres data, service-double state, or scratch from tenant A is visible to tenant B or persists.
- **Prevention/containment**: Fixture lives in the Guest (tmpfs datadir), destroyed with it; one Guest per run, no shared storage/caches, wipe confirmed before `STOPPED` (FR-083/046; execution-fixture Invariants 3, 10; IAB 2, 8).
- **Owning contract**: execution-fixture-contract.md; isolation-policy-contract.md.
- **Proving test**: I2 `residue-writer`, I17 `cache-poison`, I24, I15; Fixture 25 (Fake logic, Real EP) / T278, T109.
- **Residual limitation**: "Wipe" has no definition; correct only if I2's raw-device read is performed against the exact host provisioning used in production.
- **Verdict**: HOLDS.

### 37. Two identical execution jobs run concurrently

- **Threat**: BullMQ duplicate/stalled redelivery or a double enqueue starts two supervisors for the same `(executionUnitId, attempt)`.
- **Prevention/containment**: Deterministic `runId`, `provision` create-or-get, `ep-run-start` claim, one unit = one run (FR-049/054/055/135); F07 idempotent admission and `holderToken` fencing; redelivered worker destroys a Guest whose steps already started (phase 4 recovery).
- **Owning contract**: untrusted-execution-contract.md (Invariant 11, Idempotency).
- **Proving test**: Fixture 28 / T028, T100, T150 (Fake).
- **Residual limitation**: The F07 interaction is under-specified and partly self-defeating. With per-tenant concurrency budget 1, the second worker's dispatch checkpoint hits admission step 3 (`activeConcurrency + 1 <= 1` false) and is `REFUSED`, which in 009's dispatch (step 3) transitions the unit to `REFUSED` while the first worker is RUNNING it (C0, periodic-call point). If duplicate returns the original `holderToken`, fencing does not distinguish the two. Neither case is tested. Outcome is safe for the Guest (one Guest, destroy wins) but can corrupt unit status.
- **Verdict**: WEAK.
- **Required repair**: untrusted-execution-contract.md and plan.md F07 table: specify that a dispatch for a unit already `RUNNING` (or `DISPATCHED`) is a no-op that never calls `safetyCheckpoint` consumption and never transitions status; specify exactly which F07 call each periodic pass makes (`consumes: {request:false, concurrency:false}` or lighter sub-check, plus `renewLease(holderToken)`). Add a Fake fixture "second dispatch of a RUNNING unit" asserting unit status unchanged and zero extra Guests.

### 38. Retry repeats a state-mutating test

- **Threat**: Automatic or customer-visible retry reruns a test with side effects, or retries until green hiding the failure.
- **Prevention/containment**: `attempts: 1`; no customer-step retry across attempts (FR-054); reruns only failed cases, <= 2, only `rerunSafe` unit-test steps that start no fixtures; all integration steps never rerun; failure never hidden, original preserved, `FLAKY_SUSPECTED` (FR-086; automated-test-contract Invariant 6; command-policy Invariant 7).
- **Owning contract**: automated-test-contract.md; command-policy-contract.md.
- **Proving test**: Fixture 20 / T124 (Fake and Real).
- **Residual limitation**: "Unit test that starts no fixture" can still mutate Guest state (files, globals); a rerun in the same process/Guest sees residue; harmless to the host, and the original failure is retained.
- **Verdict**: HOLDS.

### 39. Reverify uses an outdated source snapshot

- **Threat**: Reverify reuses the old snapshot/grant/evidence and reports "fixed" or "still failing" against stale content, or runs a new commit under the old authorization.
- **Prevention/containment**: REVERIFY goes through 009 `resolvePlan`; ref re-resolved to a fresh SHA, fresh snapshot, fresh F01, minimal steps; never reuse a prior snapshot, grant or evidence as proof (source-reverify-contract Invariants 2-3, Non-negotiable 1-2); rename guard; `UNVERIFIABLE` never `RESOLVED`.
- **Owning contract**: source-reverify-contract.md.
- **Proving test**: Fixtures 34, 48, 49, 50, 62 / T216, T217, T284 (Fake).
- **Residual limitation**: ZIP-origin reverify contradicts the package's own retention rules (C2): data-model says the staged upload is deleted on acquire completion/failure, T070 deletes when the Target is terminal, source-reverify-contract says it is retained within retention. If the first holds, every ARCHIVE finding is permanently `UNVERIFIABLE`. Also "never reuse a previous snapshot" vs "re-run on the retained upload": the contract should say the retained upload is re-acquired fresh, not the old snapshot Artifact.
- **Verdict**: WEAK.
- **Required repair**: data-model.md "Tenant isolation" row (staged ZIP), plan.md map row 6, tasks T070: pick one rule: staged ZIP retained until the Target is terminal or report retention ends, whichever is first, and deleted by the T070 sweep; source-reverify-contract.md: state that ZIP reverify re-runs acquisition on the retained upload (new snapshot, new digest equal to the old) and a digest mismatch is `UNVERIFIABLE`.

### 40. Unsupported framework receives PASS

- **Threat**: A language or framework outside Tier 1/2 (Go, Svelte, Angular, other ORMs) yields a green report, either at check level or through the legacy score.
- **Prevention/containment**: Per-(workspace, capability) support decisions from a versioned matrix; `UNSUPPORTED_LANGUAGE`/`UNSUPPORTED_FRAMEWORK`/`UNSUPPORTED_RUNNER`/`UNSUPPORTED_DATABASE` -> verdict `UNSUPPORTED`, never `PASS`; sweep guarantees an outcome per check (FR-014/113; language-toolchain-detection-contract Invariant 6; coverage-contract Invariant 10).
- **Owning contract**: language-toolchain-detection-contract.md; coverage-contract.md.
- **Proving test**: Fixture 6 / T049 (Go, Fake). No fixture for an unsupported framework within supported JS, or for the score path.
- **Residual limitation**: **Legacy scoring** (C4). `scoreFromFindings` = `100 - deductions`, `overallScore` averages modules in `COMPLETE`/`DEGRADED`. 011 does not say what `ModuleResult.state` its four modules get. A Go repo or a Svelte app whose checks are all `UNSUPPORTED` has no findings and, if the module is `COMPLETE`, scores 100. Even with correct check verdicts the customer-visible number says "perfect". Also, generic checks (`src.*`, `tests.*`) on the supported JS part of an unsupported-framework repo still `PASS`.
- **Verdict**: GAP.
- **Required repair**: plan.md (new section "ModuleResult mapping") and data-model.md: define `ModuleResult.state` for the four modules from check verdicts: `COMPLETE` only if every applicable check in the module is `PASS`/`FINDING`; `DEGRADED` if any `NOT_TESTED`/`INCONCLUSIVE`/`BLOCKED` but at least one measured; `NOT_APPLICABLE` or an unscored state if everything is `UNSUPPORTED`; and require `scoreFromFindings` not to be called for a module whose measured-check ratio is below a stated floor. Add it to the touch list (T5) with a regression test; add fixtures "Svelte project" and "all UNSUPPORTED module scores null". Quickstart A3 must verify the mapping.

### 41. Toolchain version changes between runs

- **Threat**: Image/Node/pm/tool versions differ between scans of the same commit; results are compared as if equivalent, or fingerprints churn.
- **Prevention/containment**: Image id/digest, `toolVersions`, per-step versions recorded in evidence; `TOOLCHAIN_CHANGED`/`TOOLCHAIN_SUBSTITUTED` flags; fingerprints exclude tool versions; coverage `toolchainDrift` (FR-015/120; language-toolchain-detection-contract Invariants 7, 10; coverage-contract Invariant 7); `REVERIFY_UNVERIFIABLE` when support changed (source-reverify Invariant 7).
- **Owning contract**: coverage-contract.md; language-toolchain-detection-contract.md.
- **Proving test**: Fixture 58 / T286 tests only the tenant filter of the lookup. **No test asserts positive drift detection** (same tenant, same target, image change -> `TOOLCHAIN_CHANGED` and `driftDetected: true`); T174 and T287 are implementation tasks.
- **Residual limitation**: Image currency (C11): Node 20 EOL and no Node 24 mean version drift is likely and unsupported-version refusals common.
- **Verdict**: WEAK.
- **Required repair**: quickstart.md/tasks.md: add fixture "Image changed between two scans of one commit" (flags set, fingerprints identical, coverage drift true, reverify `UNVERIFIABLE` when original check now unsupported). plan.md Technical Context: refresh the Node set (see #45).

### 42. Test coverage excludes most files

- **Threat**: High percentages over a tiny measured subset, or percentages inferred from counts, read as application coverage.
- **Prevention/containment**: Coverage only from real instrumentation with tool, version, exclusions, files measured, `filesInSnapshot` denominator; flagged `COVERAGE_EXCLUDES_MOST_FILES` below 0.5; check `INCONCLUSIVE`, never a Finding; no cross-tool aggregate, no test-count inference (FR-088/089/090; coverage-contract Invariants 3-5).
- **Owning contract**: coverage-contract.md.
- **Proving test**: Fixture 36 / T127 (Fake and Real).
- **Residual limitation**: Coverage tools measure only loaded files by default, so many ordinary repos will flag; the counts come from a tool that the customer's own config (include/exclude) controls.
- **Verdict**: HOLDS.

### 43. Source fingerprint changes after line insertion

- **Threat**: Findings churn (resolved + reopened) when unrelated lines move.
- **Prevention/containment**: Fingerprint parts exclude line numbers and tool versions and use path, symbol/anchor, occurrence-in-declaration (FR-120; source-evidence-contract "Fingerprint parts"); unchanged 009/`fingerprintOf` (length-prefixed encoding, verified in `packages/scoring/src/fingerprint.ts`).
- **Owning contract**: source-evidence-contract.md.
- **Proving test**: Fixture 5 / T048; T024 (Fake).
- **Residual limitation**: Rename changes the fingerprint (accepted, with the reverify rename guard). The occurrence index shifts if a same-shaped statement is inserted earlier in the same declaration. Identity strings in correlation are ambiguous for `:`/`#` paths and route fingerprints lack a workspace (C10).
- **Verdict**: HOLDS (for line insertion). The identity defects are repaired under #50.

### 44. Cross-domain finding duplication

- **Threat**: One root cause yields many Findings across domains and per test case: a syntax error produces `src.parse.syntax-error`, `tests.typecheck.error`, `tests.build.failure` and every test in every suite that imports the file; one import error becomes 100 `tests.run.failed` Findings and an aggregate that hides distinct failures.
- **Prevention/containment**: Fingerprints per family and checkId; per-plan cap of 100 with `FINDINGS_CAPPED` aggregate (FR-120, automated-test-contract Invariant 5); research R2 accepts overlap "de-duplicated by fingerprint family".
- **Owning contract**: source-evidence-contract.md; automated-test-contract.md.
- **Proving test**: NONE. T024 proves non-merging of unrelated failures, the opposite requirement.
- **Residual limitation**: Different families cannot dedupe by fingerprint, so the stated dedupe cannot happen. The cap shrinks the visible Findings and spends it on one cause; distinct failures fall into the aggregate. Also `src.*` consuming lint `TOOL_DIAGNOSTIC` re-reports `tests.lint.*`.
- **Verdict**: WEAK.
- **Required repair**: automated-test-contract.md: a suite that fails to load/compile (zero cases executed, suite-level error) is one suite-level Finding, not N case Findings; group failing cases by normalized first-error signature (one Finding with a case list in Evidence). source-evidence-contract.md: add `rootCauseKey` (file + diagnostic code) carried on Findings from `src.*`, `tests.typecheck.*`, `tests.build.*`, `tests.run.*`, and rule that a lower-tier Finding with the same `rootCauseKey` as a higher-tier one is attached as supporting evidence instead of a separate Finding; count the 100 cap on root-cause groups. Add fixture "single syntax error in a shared module".

### 45. Runtime image contains a vulnerable dependency

- **Threat**: The Guest image (Node, npm, pnpm, yarn, PostgreSQL, baseline ESLint, Fahes in-Guest tools, guest agent) carries a known CVE that hostile customer input can trigger (tar/zip extraction in a package manager, parser bugs), or is EOL.
- **Prevention/containment**: Signed, digest-pinned, SBOM-bearing, vulnerability-scanned images; `image-gate`; critical <= 7 d / high <= 30 d patch SLA; re-attestation on image change (FR-047; IAB 6, 7; isolation-policy Provenance). The VM boundary still contains exploitation.
- **Owning contract**: isolation-policy-contract.md.
- **Proving test**: I14 `image-gate` (rejects unsigned/tag-only/digest-mismatch) / T279. Nothing tests "image with a critical CVE is refused".
- **Residual limitation**: IAB 6 requires a scan to exist, not a pass threshold; the SLA text names "host kernel and VMM", and the "critical-CVE age check" is not tied to Guest userland. No EOL policy: Node 20 EOL on 2026-04-30 (verify) is in the catalog, Node 24 absent (C11). Exploit of a hostile tarball against the image's package manager yields code execution in the Guest during P1, where the proxy path is open.
- **Verdict**: WEAK.
- **Required repair**: isolation-policy-contract.md IAB 6 and image catalog (data-model `ExecutionImage`): add `vulnScanResult` with a blocking rule (no unwaived critical/high with a fix available at attestation; rebuild cadence at least weekly and on every critical advisory for Node/npm/pnpm/yarn/Postgres), an EOL rule (no runtime past upstream EOL), and apply the SLA to all image layers; extend `image-gate` with `critical-cve-image`. plan.md Technical Context: replace "Node LTS 20 and 22" with the currently supported LTS set (22, 24) and update FR-047/Tier-1 text.

### 46. Container isolation is insufficient for hostile code

- **Threat**: A shared-kernel container (or the existing `node:vm`/`--permission` sandbox) is used as the boundary and is escaped.
- **Prevention/containment**: Per-run hardware-virtualized microVM on a separate Execution Plane; containers allowed only inside the Guest as depth; no `LocalProcessProvider` in any build; `DisabledProvider` default; no fallback to the sandbox-runner (FR-035/037/038/058/040); IAB items 1-10 with named fixtures; external review before activation; Linux-only CI (R5, plan Principle XI).
- **Owning contract**: isolation-policy-contract.md; untrusted-execution-contract.md.
- **Proving test**: I1-I24 and Fixtures 14-16, 44, 45 / T098-T099, T130, T142, T276-T279 (Real only, except T099 guard test and Fake provider tests).
- **Residual limitation**: Everything is paper until a provider exists: no KVM CI exists today (research R4: no `.github`), and conformance cannot prove absence of VMM/kernel zero-days (R29 accepted). Provider capabilities the IAB assumes (C13) are unverified; in-Guest agent/customer separation (C3) is unspecified and is a result-integrity matter, not a host-boundary one. Production activation is correctly gated.
- **Verdict**: HOLDS (as a gated design). Advisory: add the provider-capability checklist (C13) as an IAB pre-condition.

### 47. F07 kill switch cannot terminate escaped descendants

- **Threat**: Descendants survive a process-level kill (daemonized, re-parented, in another namespace) after stop, timeout or abort.
- **Prevention/containment**: The termination primitive is destruction of the whole Guest (FR-051); `STOPPED` only after `DESTROYED` and wipe; escalation = parent calls EP `destroy` directly at 5 s (plan F07 "Escalation"); EP dead-man and TTL; no reliance on process-tree kill (answers 009's descendant gap, plan G1).
- **Owning contract**: untrusted-execution-contract.md (Invariants 4-7).
- **Proving test**: I18 `orphan-daemon`, I15; Fixtures 26, 27 / T125, T126, T278 (Real).
- **Residual limitation**: "Stop latency <= 5 s" is measured at `destroy` issuance (Invariant 7); actual termination is up to ~90 s. An EP control-plane hang defeats `destroy`, dead-man and TTL together (see #24). An attestation revocation intended to stop runs rides a mechanism with an upstream conflict (C0.2).
- **Verdict**: HOLDS.

### 48. Execution evidence contains proprietary source

- **Threat**: Customer source leaks through excerpts, build/test logs (code frames, diffs, printed files), stack traces, schema/SQL, AI prompts, shared reports, operators, or the Execution Plane.
- **Prevention/containment**: Excerpts <= 7 lines/600 chars and never from denylist files; the full source exists only as the access-controlled snapshot; reports never carry source (FR-118); `(id, userId)` reads with indistinguishable NotFound (FR-145); operators see metadata only (FR-144); EP gets a presigned single-object snapshot, disclosure audit and consent copy (FR-146/147); AI prompts are excerpt-capped.
- **Owning contract**: source-evidence-contract.md; source-snapshot-contract.md.
- **Proving test**: Fixtures 56, 59, 57 / T245, T262; none targets log content.
- **Residual limitation**: The 7-line/600-char control applies to excerpts. Log Artifacts (10 MiB per step, 50 MiB per run) are raw tool/test output and routinely contain code frames or whole printed files; a test can print any file. If reports can be shared or exported (not stated), logs expose source. The consent copy covers the EP but not the AI provider receiving excerpts. Snapshot is retained at report-data parity (full source at rest in R2 for the retention period).
- **Verdict**: WEAK.
- **Required repair**: source-evidence-contract.md: classify log, schema and migration Artifacts as `TENANT_PRIVATE_SENSITIVE` (never in any share/export route, never fed to AI beyond the capped, redacted excerpt assembler), require the report API to omit them unless the owner opens them, and cap code-frame/diff lines in parsed diagnostics. spec.md FR-147: extend consent copy to AI-provider transmission of excerpts. source-snapshot-contract.md: state snapshot retention separately and offer delete-on-completion where no reverify is expected.

### 49. Partial results are misreported as complete

- **Threat**: Some units, checks or partitions did not run or finished partially, yet the scan, module score or report reads as complete or perfect.
- **Prevention/containment**: Four-section coverage with `complete:false` for any exhausted budget, non-COMPLETED unit, unexecuted partition or missing check outcome (FR-090/113/126/127; coverage-contract Invariants 8-9); sweep `sweepUnresolvedSourceChecks` records `BLOCKED`/`NOT_TESTED`; completed units' findings reach the report (FR-126); `PASS` limited as above.
- **Owning contract**: coverage-contract.md; source-evidence-contract.md.
- **Proving test**: Fixtures 52, 55 / T268, T270, T026 (Fake).
- **Residual limitation**: Four independent holes (each verified above): (1) the legacy score/`ModuleResult` mapping (C4) can print 100 for a module that measured nothing; (2) the sweep fires only "after every unit terminal", but a crashed or stuck `SOURCE_EXECUTION` unit never becomes terminal (#21) and the 15-minute scan sweep marks the scan terminal without running it (C0.3); (3) the dispatcher's lost wake-up leaves a satisfied check unevaluated and the sweep then labels it `NOT_TESTED` (C1); (4) workspace roll-up of suite verdicts is undefined (#31). `scanSourceCoverageSummary` is only as honest as the evidence rows that exist.
- **Verdict**: GAP.
- **Required repair**: (a) C4/#40 ModuleResult mapping (plan.md, data-model.md); (b) #21 stuck-unit finalizer, and run `sweepUnresolvedSourceChecks` on scan-level termination as well; (c) C1 sweep re-evaluates before recording `NOT_TESTED`; (d) #31 roll-up rule; (e) coverage-contract.md Invariant 9: add `complete:false` when the scan was terminated by the scan-wide sweep or when any unit was non-terminal at read time; (f) add a Fake end-to-end fixture "unit killed, scan swept, module state/score not 100".

### 50. SPEC 012 later needs the source/API surface evidence

- **Threat**: Future specs cannot reliably join source routes/files to runtime URLs, builds and commits, or get a polluted/merged surface; they invent private paths.
- **Prevention/containment**: `SOURCE_SURFACE` evidence per workspace with `schemaVersion`; correlation grammars (`SourceIdentity`, `RouteIdentity`, `BuildArtifactIdentity`, `commit:<sha>`) frozen with the spec; `SOURCE_MANIFEST` carries `correlationGrammarVersion`; downstream freeze (spec header) and tenant+target filtered lookups (FR-131/149; source-correlation-contract Invariants 1-8).
- **Owning contract**: source-correlation-contract.md; backend-contract-testing-contract.md (hand-off 10).
- **Proving test**: Fixture 35 / T218 (identity stability on re-acquire); no fixture for a monorepo with duplicate routes.
- **Residual limitation**: C10: `RouteIdentity` and the route fingerprint have no workspace/service component, so two services' `GET /health` collide and merge into one Issue (and any 012 join to a runtime URL is ambiguous); `SourceIdentity` has no escaping for `:`/`#`; dynamic routes are omitted (`DYNAMIC_ROUTE_UNRESOLVED`), so 012 sees a partial inventory with no machine-readable completeness flag on the `SOURCE_SURFACE` itself; no runtime-URL base mapping (global prefix `prefixUnknown`) is part of the identity. Once frozen, the grammar can only change by upstream amendment.
- **Verdict**: WEAK.
- **Required repair**: source-correlation-contract.md: `RouteIdentity = "route:" wsPath ":" METHOD " " pattern` (or `service:<id>`), percent-encode `:`, `#` and control characters in `wsPath`/`relPath`/`symbolPath`, and add `surfaceComplete: boolean` plus `unresolvedRouteCount` on `SOURCE_SURFACE`; source-evidence-contract.md route/contract fingerprint parts: prepend `workspacePath`. Add Fixture "two services exposing GET /health" proving distinct identities and Findings. Fix before the freeze: afterward it is an amendment.

## Required repairs (consolidated)

### Upstream (amendment requests to raise now, before 011 freeze)

1. **008 `execution-audit-contract.md` / `data-model.md`**: add additive `ExecutionAuditEventType.SOURCE_SENT_TO_EXECUTION_PLANE` (or 011 drops FR-147's event). (C0.1)
2. **008 `kill-switch-contract.md`**: add "IAB attestation revocation" as a third `SYSTEM` trigger condition at `EXECUTION` scope (reason `SYSTEM_SAFETY_POLICY`); 011 removes all PLATFORM-scope usage. (C0.2)
3. **009 runtime / existing `sweepTimedOutScans`**: plan-level scan deadline that covers `SOURCE_EXECUTION` unit timeouts and a rule that the sweep never terminates a scan under a live execution lease without stopping units through F07; also clarify "concurrency refusal is terminal" vs serialization (delay or dependency chain). (C0.3, C0.4; #6, #20)
4. **009 `artifact-contract.md`**: clarify content-type-keyed (or snapshot-exempt) budgets for `createArtifact`. (C0.5)

### spec.md

5. FR-055: delete "009's terminal-write rejection applies"; describe the 011 fence (#26).
6. FR-143: replace PLATFORM-scope stop with supervisor-local revocation check plus per-execution F07 stop (C0.2).
7. FR-139 and SC-010: state that the sweep conflict is determinable and requires the amendment in item 3; replace "zero amendments" with the real list (C0).
8. FR-151: reject `.`/`..` segments and a trailing `.git` in `repositoryFullName` (C8).
9. FR-147: extend consent copy to AI-provider transmission (#48).
10. FR-009/FR-153 and Assumptions: record GitHub export-archive semantics (`export-ignore`/`export-subst`) as a known limit (C8).

### plan.md

11. Repair the splice at lines 80-129 and delete the duplicate lifecycle table; keep one table equal to the contract (C2).
12. Add section "ModuleResult mapping" and touch-list item for scoring/readiness behavior (C4; #40, #49).
13. Resource Budget Table: E12 AST budget vs worker limit and `CONCURRENCY.scanPhase`; dedicated E12 pool or smaller budget (C9; #6).
14. F07 table: periodic checkpoint uses `consumes {false,false}` plus `renewLease`; dispatch of an already RUNNING unit is a no-op; dead-man <= 15 s; EP refusal semantics for a second tenant run (C0, C1; #37).
15. Technical Context: Node set 22/24 (drop EOL 20); image currency rules (C11; #45).
16. Monorepo row: explicit serialization mechanism (C0.4; #6).
17. Add `finalizeStuckSourceExecutionUnits` sweep and run `sweepUnresolvedSourceChecks` on scan-level termination; sweep re-evaluates before `NOT_TESTED` (C1; #21, #49).

### data-model.md

18. `SOURCE_MANIFEST`: add `sourceForm: "GITHUB_EXPORT_ARCHIVE"|"ZIP_UPLOAD"`, `exportAttributesPresent: bool` (C2, C8).
19. `MIGRATION_RESULT`: remove or restrict `STOPPED`; add `appliedVia` (#23, #35).
20. Staged ZIP retention row: one consistent rule (#39).
21. `ExecutionImage`: `vulnScanResult`, EOL fields, catalog Node set (#45).
22. Digest manifest: percent-encode `\t`, `\n`, control characters in path (or length-prefix each field) and reject names the guard cannot represent (C8, C10).

### contracts/untrusted-execution-contract.md

23. Define `timeoutPolicyMs` for `SOURCE_EXECUTION` (~33 min 50 s) and run-envelope clock start at `READY` (#20).
24. Invariant 13: serialization mechanism; Invariant 8: fencing wording (#6, #26).
25. In-Guest privilege split, exclusive vsock session, reporter module under agent-only uid, new fixtures `vsock-forge`/`reporter-forge` (C3; #32).
26. Phase 8: bounded-window redaction in a credential-less worker with kill deadline; split parsing from mTLS credentials (C5, C12; #28).
27. Dead-man vs lease arithmetic (C1).

### contracts/isolation-policy-contract.md

28. Provider-capability pre-conditions (C13); image vulnerability/EOL gate and `critical-cve-image` fixture (#45); extend `metadata`/`rfc1918-sweep` to IPv6/ULA/CGNAT/cloud-specific; remove the PLATFORM stop text in "Attestation lifecycle" (C0.2).

### contracts/dependency-installation-contract.md

29. Specify proxy as TLS-terminating reverse mirror, header normalization, no CONNECT, Guest DNS pinned; lockfile URL/integrity derivation table per format; add `proxy-bypass-matrix` fixture; refuse non-public resolved addresses (C6; #19).

### contracts/command-policy-contract.md and migration-testing-contract.md

30. Replace `psql -f` with a meta-command-free single-request applier; static refusal of backslash meta-commands; non-superuser owner role; record `appliedVia` (C7; #35).

### contracts/automated-test-contract.md

31. Roll-up rule and ratio (#31); network-blocked attribution rule (#33); suite-load-failure grouping and root-cause grouping (#44); streaming-reporter requirement or delete the preserved-before-timeout sentence (#20); LFS-dependent failures `INCONCLUSIVE` (#7); define discovery-confidence HIGH (#30); "runner-reported" PASS wording (#9, #10, #32).

### contracts/build-typecheck-contract.md

32. Lint/tsc output "runner-reported" wording; hostile-plugin fixture reference (#9).

### contracts/source-evidence-contract.md

33. Exact-value secret scrub from snapshot-wide detection (#27); log Artifacts as tenant-private sensitive (#48); `rootCauseKey` (#44); route fingerprint parts add `workspacePath` (#50); add reason codes `SOURCE_TOO_LARGE` (BLOCKED) (#6).

### contracts/source-correlation-contract.md

34. `RouteIdentity` with workspace/service; percent-encoding for `:`/`#`; `surfaceComplete` (#50, C10).

### contracts/source-acquisition-contract.md / source-snapshot-contract.md

35. Record `sourceForm` and `.gitattributes` export filters; resolve refs as fully qualified and record ref kind; `SOURCE_TOO_LARGE` failure row (#1, #6, C8).
36. For GitHub archives, link entries dropped with a recorded skip instead of whole-archive refusal (advisory, #4).

### contracts/coverage-contract.md and source-reverify-contract.md

37. `complete:false` on sweep termination and non-terminal units (#49); ZIP reverify re-acquires the retained upload (#39).

### quickstart.md and tasks.md

38. Add fixtures: zip bomb (#5), repo > 50 MiB and 4-partition end to end with sweep (#6), hostile ESLint plugin and hostile jest/vitest config (#9, #10), `vsock-forge`, `reporter-forge`, `log-redos`, `log-token-flood`, `proxy-bypass-matrix`, `psql-meta-shell`, `create-index-concurrently`, hang at minute 14, one pass + 999 skips, test fails after blocked network call, second dispatch of a RUNNING unit, image drift positive case, image with critical CVE, Svelte project / all-UNSUPPORTED module score, single shared-module syntax error, two services with `GET /health`, worker down 20 min, export-ignore repo.
39. Reconcile Fixture 22 vs T177 reason code; Fixture 47 vs STOPPED; T137 "integrity-keyed cache" wording (C2).

## Residual risks accepted

These are accepted because no planning-level repair removes them. Each must be written into the R29 register and signed at activation.

- VMM/guest-kernel zero-day escape; co-resident tenant side channels (already in R29).
- Customer-process control of reporter output inside the Guest even after the uid/vsock split: `PASS` always means "runner-reported", never independently attested (new row).
- Covert timing/URL channel during P1 in addition to the header channel (R29 already lists the URL/timing channel; add headers).
- GitHub export-archive semantics: files hidden by the repository owner via `export-ignore` are invisible to every check and cannot be detected (new row, replaces the "Low/Low" pricing).
- Migration PASS is for SQL on PostgreSQL 16 under a Fahes applier, not for the customer's actual migration tool or database version.
- A malicious or accidental package from an allowed registry runs inside the Guest after P1 (already in R29).
- Source leaves the application plane for a separate deployment and, as excerpts, to the AI provider; the consent surface is deferred to U30 (FR-147).
- Stop latency is measured at `destroy` issuance; real termination takes up to ~90 s, and an EP control-plane hang defeats destroy, dead-man and TTL together (operator quarantine is the only backstop).
- Repos whose zipball exceeds 50 MiB, or that contain a committed symlink, cannot be scanned in v1 (explicit `SOURCE_TOO_LARGE` / `ARCHIVE_GUARD_REFUSED`).
- Provider and vendor availability and capabilities (C13): activation waits on a provider that passes the IAB; nothing here is demonstrated before then.

## Post-review disposition (lead, 2026-10-10) — NOT an independent re-review

The verdict counts above are the reviewer's original counts and have not been re-scored by an independent reviewer. The consolidated repairs were applied by the lead; each GAP scenario and the cross-cutting findings map as follows. A future independent re-review should re-score these.

| Item | Disposition |
|---|---|
| C0.1 audit enum closed | Resolved locally: disclosure event is an `AuditLogEntry` action (FR-147). |
| C0.2 PLATFORM scope / new automatic trigger | Resolved locally: no PLATFORM-scope stop anywhere; supervisor-local attestation re-check plus optional per-execution operator stops (FR-143). |
| C0.3 15-minute scan sweep (#6, #20) | NOT resolvable locally: raised as upstream amendment request **U-1** (`upstream-amendment-requests.md`); SOURCE_EXECUTION activation blocked; `timeoutPolicyMs` defined (FR-158). |
| C0.4 concurrency refusal is terminal (#6) | Resolved locally: partitions chained by plan-level `ExecutionDependency` edges (FR-152). |
| C0.5 artifact budgets vs snapshot | Clarification **U-2**; snapshot ceilings set (128 MiB per object / 256 MiB per scan, provisional). |
| FR-055 evidence fencing; F07 call shape | Resolved locally: evidence wrapper with locked transaction (FR-055); periodic checkpoint consumes nothing (FR-050). |
| C1 timing races; lost wake-up | Dead-man 15 s with 5 s heartbeat, `timeoutPolicyMs` 33 min 50 s, run clock from `READY` (FR-052, FR-158); sweep re-attempts before `NOT_TESTED`/`BLOCKED`; `finalizeStuckSourceExecutionUnits`. |
| C2 document defects | plan.md splice repaired; one lifecycle table; fixture/task text conflicts fixed. |
| C3 result forgery | Privilege split, exclusive vsock session, "runner-reported" labelling, new fixtures (FR-155). |
| C4 scoring turns "nothing measured" into 100 (#40, #49) | Additive `ModuleResult` mapping, legacy scoring untouched, guard fixture 77 (FR-154). |
| C5 redaction DoS | Credential-less redaction worker, bounded windows, 60 s kill, additive detector hardening (FR-156, touch item T7). |
| C6 lockfile/proxy | Reverse-mirror proxy, per-format derivation, yarn berry analysis-only (FR-066). |
| C7 psql | Fahes applier `db.apply.sql`, `SQL_META_COMMAND_REFUSED`, `appliedVia`. |
| C8 export-archive / archive guard | Manifest fields, residual risk, additive safe-archive options (touch item T6), percent-encoded digest manifest, `SOURCE_TOO_LARGE`, ref grammar. |
| C9 worker memory | AST 512 MiB per child and `FAHES_E12_MAX_CONCURRENT` semaphore. |
| C10 identity grammar | Percent-encoded `SourceIdentity`, workspace-scoped `RouteIdentity`, `surfaceComplete`. |
| C11 image currency | Node 22/24 only, vuln/EOL gate, fixture `critical-cve-image`. |
| C12 credential concentration | Parsing of Guest output moved out of the credential-holding supervisor. |
| C13 provider capability assumptions | Provider-selection preconditions before IAB (FR-157); pids limit is a guest cgroup limit. |
| C14 residual register | Rows added in `research.md` R29. |
| #40 unsupported framework gets PASS | Guard fixture 77 plus ModuleResult mapping. |
| #49 partial reported as complete | `complete: false` on sweep/scan-level termination; `RUN_BUDGET_EXHAUSTED`. |
