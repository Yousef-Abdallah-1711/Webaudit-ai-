# Phase 0 Research: WebAudit AI — MVP Baseline

**Feature**: [spec.md](./spec.md) | **Date**: 2026-08-23 | **Constitution**: v1.0.0

Every decision below is traced to the requirement or principle that forced it. Two of these
(R1, R2) resolve TODOs the specification and constitution deliberately deferred.

---

## R1. Untrusted capability isolation — resolves `TODO(SANDBOX_MECHANISM)`

**Forced by**: FR-027, FR-028, FR-029, SC-017, Constitution Principle V (which forbids `vm2` by
name).

**Requirement restated**: an operator-uploaded capability must not reach stored data, credentials,
the network, the filesystem, or other running work. It must be bounded by time and memory, killable
from outside, and contract-verified inside the same boundary. SC-017 tests this by installing a
capability that deliberately attempts each prohibited access.

### Decision

**Three nested boundaries, not one.** Untrusted capabilities execute in a dedicated
`sandbox-runner` service, which is the only component permitted to load unreviewed code:

1. **Service boundary** — `sandbox-runner` is deployed as its own service with **no network egress
   and no database credentials**. It holds no secrets to steal and has nowhere to send them. It
   receives work and returns results over a single inbound channel (see
   [contracts/sandbox-protocol.md](./contracts/sandbox-protocol.md)); it never dials out.
2. **Process boundary** — each execution is a fresh short-lived Node child process started with the
   **Node permission model** (`--permission`, with no `--allow-fs-read`, no `--allow-fs-write`, no
   `--allow-child-process`, no `--allow-worker`), an empty environment, an empty working directory,
   and OS resource limits. Separate process means a separate heap (Principle V's explicit
   requirement) and `SIGKILL` as an unconditional stop.
3. **Language boundary** — the capability is invoked through a thin harness that passes input as
   structured data and returns findings as structured data. No module resolution is exposed to the
   capability beyond an allowlisted shim.

Timeout is enforced by the parent, not by the child: the parent arms a timer and `SIGKILL`s on
expiry, so a capability cannot defeat its own deadline with a tight loop. Memory is capped at the
OS level so an allocation bomb kills the child, not the service.

### Rationale

The property the constitution actually demands — "cannot reach the network" — is not something an
in-process JavaScript sandbox can deliver, because the *host* process has network access. Any
in-process solution is one escape away from full reach. Putting the untrusted code in a service that
has no egress and no credentials means an escape yields access to nothing worth having. The process
and language boundaries then make escape itself hard, and the OS makes the resource bounds real.

This also isolates the blast radius of the mechanism's own failure. If the sandbox proves inadequate,
the damage is contained to a service that, by construction, holds nothing.

### Alternatives considered

| Alternative | Rejected because |
| --- | --- |
| `vm2` | Forbidden by Constitution Principle V. Deprecated with published sandbox-escape CVEs. |
| `isolated-vm` alone, in the API process | Genuine heap separation and a real memory cap, but it lives inside a process that holds database credentials, provider keys, and network access. One native-boundary bug is total compromise. Also a native addon, adding build fragility across deploy targets. Reconsider only if in-process latency ever matters — it does not for an operator-triggered path. |
| `node:vm` in the API process | Not a security boundary at all; trivially escaped via prototype access to host constructors. |
| Container per execution (Docker/gVisor) | Strongest isolation on paper, and the honest first choice if the platform allowed it. Rejected on deployability: the target host runs application containers and does not offer privileged container spawning, so this needs a dedicated VM plus an orchestrator — real infrastructure work for a P7 feature. The service-level boundary gets most of the guarantee at a fraction of the cost. Revisit if custom capabilities become a significant product surface. |
| WebAssembly compilation of capabilities | Excellent isolation properties, but it dictates how third parties must author capabilities and rules out the existing vendored JavaScript ecosystem the product depends on. |
| Not supporting uploads in the MVP | Tempting — this is a P7, Business-tier-only path. But FR-027/028/029 are MUSTs and US7 scenario 5 requires it, so it stays in scope, sequenced late. |

### Consequence for sequencing

`sandbox-runner` is the last service built. Until it exists, the capability registry loads **only**
reviewed vendored capabilities, and the upload path returns "not yet available" rather than falling
back to unsafe execution. This is the one place where a missing feature must never degrade into a
weaker guarantee.

---

## R2. Credit ledger with two lifetimes — resolves `TODO(DATA_MODEL)` (billing portion)

**Forced by**: FR-073 through FR-082, SC-008, SC-022, Constitution Principle VI.

**Requirement restated**: plan credits expire at renewal; purchased credits never expire; expiring
credits are consumed first; failed operations are refunded; every movement is visible; margin is
attributable per capability.

### Decision

**Lot-based ledger, not a balance column.** Three tables:

- `CreditLot` — one row per grant. Holds `kind` (`PLAN` | `PURCHASED`), `amountGranted`,
  `amountRemaining`, `expiresAt` (null for purchased), and its source.
- `CreditTransaction` — one row per movement (`GRANT`, `DEBIT`, `REFUND`, `EXPIRE`), tied to the
  operation responsible.
- `CreditAllocation` — the join: which lots a debit drew from, and how much from each.

Consumption sorts candidate lots by `expiresAt` ascending with nulls last, so expiring plan credits
are always spent before permanent purchased ones (FR-078). Because a debit records exactly which
lots it drew, a refund returns credits **to the lots they came from**, which is the only way a
refund can be correct when the two kinds have different lifetimes.

A user's balance is derived: `SUM(amountRemaining)` over unexpired lots, reported per kind. There is
no independently writable balance column anywhere — Principle VI's "the balance is the sum of
movements" is enforced structurally rather than by convention.

Debit is a single serializable transaction: select candidate lots `FOR UPDATE`, decrement, insert
transaction and allocations, all or nothing. Concurrent audits therefore cannot double-spend the
same lot.

### Rationale

A single integer balance cannot express "expire these 40 but not those 60", cannot refund correctly,
and cannot answer "what am I about to lose at renewal" (FR-078's warning requirement). Lot
accounting is the standard solution to exactly this problem and makes SC-022 — zero purchased
credits lost, zero drawn while plan credits remain — a query rather than a hope.

### Alternatives considered

| Alternative | Rejected because |
| --- | --- |
| Two integer columns (`planCredits`, `purchasedCredits`) | Simpler, and handles consumption order. But a refund cannot know which column to return to once several operations have interleaved, and there is no audit trail, violating FR-076. |
| Single balance plus an expiry sweep job | Cannot distinguish which credits expire. Would destroy purchased credits at renewal, failing SC-022. |
| Event-sourced balance, recomputed on read | Correct but recomputes an unbounded history on every credit check, which sits in the hot path of every audit start. |

---

## R3. Stable issue identity across audits

**Forced by**: FR-059, FR-063, FR-064, FR-068, FR-069, and the Issue entity's requirement for "a
stable identifier that survives re-auditing".

### Decision

Every issue carries a deterministic **fingerprint**: a hash over `(targetId, moduleType, checkId,
normalizedLocation, discriminator)`, where `normalizedLocation` strips volatile parts (query
strings, cache-busting hashes, line numbers that shift with unrelated edits) and `discriminator`
distinguishes several instances of the same check on one page.

The fingerprint is what makes three separate requirements work at once: targeted re-verification
knows which check to re-run (FR-059), recurrence detection recognises a returning problem
(FR-064), and the readiness pass can diff fresh findings against the original audit to name
regressions (FR-069).

Fingerprint computation belongs to the check that produced the finding, not to a central mapper —
only the check knows what is volatile about its own location.

### Rationale

Without a stable identity, "mark this fixed and re-verify it" has nothing to re-verify, and
regression detection degrades to comparing scores. Deriving identity from content rather than
assigning it at insert time means it survives across audits with no cross-audit bookkeeping.

### Alternatives considered

- **Database id per issue, matched by title similarity across audits** — brittle, and AI-authored
  titles vary between runs.
- **Match on (module, severity, title)** — collides on repeated instances and breaks the moment
  prompt wording changes.

---

## R4. Questionnaire pause without holding a worker

**Forced by**: FR-040, FR-041, FR-043, US6.

### Decision

**Split the audit into resumable jobs; never block on human input.** The orchestrator persists a
scan state machine and enqueues a *new* job per phase. When the design phase needs intent, the
Phase 2 job:

1. writes `AWAITING_QUESTIONNAIRE` with a deadline,
2. emits the prompt event,
3. **returns**, releasing its worker slot,
4. and schedules a delayed job at the deadline.

Whichever arrives first — the user's answers or the delayed timeout job — transitions the state once
under an optimistic guard and enqueues the resume job. The loser of that race is a no-op.

### Rationale

The architecture document's sketch awaits the answer inside the job for up to ten minutes. At the
published concurrency limits that means a small number of pending questionnaires can starve every
paid audit in the queue. Persisting the wait as state costs one extra table column and removes an
entire class of capacity outage.

FR-043 (other areas must not block) follows for free: Phase 1 areas already completed, and nothing
else is waiting on Phase 2.

### Alternatives considered

- **Await in-job with a timeout** — the architecture doc's approach. Rejected above.
- **Ask all questions before the audit starts** — kinder to the queue, but the spec deliberately
  asks mid-audit, when the user has already seen real findings and is invested.

---

## R5. Live progress from a separate worker process

**Forced by**: FR-044 through FR-047, Constitution ("Live scan state reaches the client over
WebSocket; polling is not acceptable" and "Redis is cache, queue and rate-limit state only, never a
system of record").

### Decision

Worker publishes progress to a Redis pub/sub channel; the API service subscribes and fans out to
the sockets in that user's room. Every event is **also** persisted as scan state before publishing.

Persist-then-publish is what makes FR-047 work: a user returning after being away is served current
state from the database, then receives live events from the socket. Redis carries only transient
fan-out, so it remains a transport and not a record — the constitution's line holds.

### Alternatives considered

- **Worker holds sockets directly** — workers scale independently and are not addressable by
  browsers.
- **Client polling** — explicitly forbidden by the constitution.
- **Redis as the progress store** — would make Redis a system of record.

---

## R6. SSRF-safe target fetching

**Forced by**: FR-014, SC-018 (100% refusal including "via redirect and via address forms designed
to evade checks").

### Decision

Four layers, because each defeats a different bypass:

1. **Parse and reject by form** — non-HTTP(S) schemes, credentials in the URL, and literal private,
   loopback, link-local, unique-local, or metadata addresses in any notation (decimal, octal, hex,
   IPv6-mapped, IPv6 abbreviated).
2. **Resolve and check every answer** — refuse if *any* resolved address is disallowed, not just
   the first.
3. **Validate at connect time, not resolve time** — a custom socket-level check inspects the actual
   remote address of the established connection. This is the layer that defeats DNS rebinding, where
   a name resolves to a public address during validation and a private one microseconds later.
4. **Follow redirects manually** — automatic redirect following is disabled; every hop is re-run
   through layers 1–3. FR-014 requires re-validation on *every* redirect, which automatic following
   structurally cannot provide.

### Egress policy, and a conflict worth naming

FR-025 restricts audit network access to "the audit target and the platform's configured providers".
Taken literally this breaks the product: a real page loads fonts, scripts, and images from many
third-party hosts, and refusing them would measure a page no visitor ever sees.

Resolution — **two distinct egress policies**:

- **Platform code** (capability logic, provider calls, storage) is allowlisted, per FR-025.
- **The auditing browser** may load whatever the target page loads, because that *is* the
  measurement. It runs in the browser-pool service, isolated from platform credentials, and remains
  subject to the private-address refusal in layers 1–3 so a page cannot use the auditor as a
  gateway into the platform's own network.

This distinction is not in the specification and should be reflected back into FR-025 when it is
next amended.

### Alternatives considered

- **Allowlist-only outbound** — cannot express "whatever this page happens to load".
- **Blocklist at resolve time only** — defeated by rebinding.
- **An off-the-shelf SSRF library** — most validate the URL and not the connection, missing layer 3.

---

## R7. Archive extraction safety

**Forced by**: FR-015 ("exceed size, unsupported format, expand beyond a bounded ratio, or contain
paths that escape the extraction target — in every case before extracting content and before
charging").

### Decision

Stream every entry through a guard that enforces, per entry and cumulatively: compressed size,
uncompressed size, entry count, path normalisation against the extraction root, refusal of absolute
paths and traversal segments, refusal of symlinks and hardlinks and any non-regular entry, and a
maximum compression ratio. The stream aborts on first violation, before the offending bytes reach
disk.

Extraction targets a per-scan directory that is registered with a cleanup owner at creation, so
FR-090's destruction obligation is discharged by the owner regardless of how the scan ends.

### Rationale

FR-015 says "before extracting content", which rules out extract-then-inspect. A streaming guard is
the only shape that satisfies it. Symlink refusal matters specifically because a symlink is how an
archive escapes a directory that path checks alone would protect.

---

## R8. Secret redaction before any provider call

**Forced by**: FR-056, FR-091, SC-016 (adversarially tested with planted credentials).

### Decision

Redaction is a **mandatory transform at the prompt-assembly boundary**, not a step a capability may
remember to call. Nothing reaches a provider except through an assembler whose input type is
"unredacted" and whose output type is "redacted"; the provider client accepts only the latter. A
capability that tries to build its own prompt string cannot get it sent.

Detection combines known credential patterns with high-entropy string heuristics. A detected secret
becomes a finding reported to the user with its location, while the value itself is replaced by a
stable placeholder token so the AI can still reason about "a credential appears here".

### Rationale

Making redaction the only path to a provider turns SC-016 from a discipline problem into a type
error. The alternative — asking every capability to redact — fails the first time someone forgets,
and the failure is silent and unrecoverable, because the secret is already at a third party.

---

## R9. AI executor: fallback and cost attribution

**Forced by**: FR-034, FR-035, FR-039, FR-081, FR-082, SC-012, Constitution Principle IV.

### Decision

A single executor is the only component holding provider clients. It takes a provider-agnostic
prompt plus a response schema, walks an ordered chain spanning at least two vendors, and validates
every response against the schema — a schema failure is a provider failure and advances the chain.

Every attempt writes an `AiInvocation` row (provider, model, token counts, latency, computed cost,
outcome, chain position) linked to the `CapabilityExecution` that requested it. Because cost is
recorded per capability execution rather than per scan, FR-082 and SC-009 become straightforward
aggregations rather than estimates.

Chain exhaustion returns a typed degradation, not an exception, so the module runner can mark the
area `DEGRADED` and still deliver measured findings (FR-035, SC-012).

### Alternatives considered

- **Provider SDK calls at call sites** — forbidden by Principle IV; also makes cost unattributable.
- **A third-party LLM gateway** — would own the fallback and cost data the constitution requires
  us to record ourselves, and adds a dependency in the hot path.

---

## R10. Capability packaging, contract, and registry loading

**Forced by**: FR-019 through FR-026, FR-086, SC-010, SC-011, Constitution Principles I and II.

### Decision

A capability is a directory with a manifest and an entry module implementing the contract in
[contracts/capability-contract.md](./contracts/capability-contract.md). The registry discovers
capabilities from two roots at startup — vendored (reviewed, trusted) and installed (unreviewed,
untrusted) — reconciles what it finds against database enablement state, and exposes lookup **only**
by module and layer. No core code may name a capability.

Trust level comes from which root a capability was found in, never from its own manifest. A
capability cannot declare itself trusted.

Enablement changes take effect without a deploy (SC-010) by versioning the registry snapshot: each
scan resolves its capability set once at start and holds it for the scan's duration, so an operator
toggling a capability mid-scan cannot produce a half-configured audit.

### Rationale

Discovery by directory root is what makes trust unforgeable. Snapshotting per scan is what makes
"no product release" (FR-086) safe rather than merely possible.

---

## R11. Two-level target control gate

**Forced by**: FR-017, SC-021.

### Decision

`Target` carries a control level. Attestation records who affirmed authorisation and when. Verified
control requires the user to publish a system-issued token, either at a system-specified path on the
target or as a DNS TXT record; verification is re-confirmed immediately before each load-generating
check, and a removed token demotes the target.

Every check declares the level it requires. The runner refuses a check above the target's level
before charging, and reports it as unavailable-pending-verification rather than failed — which is
what US1 scenario 8 describes.

Level 1 probing is rate-limited by the platform regardless of attestation, so a false attestation
cannot itself cause harm.

### Rationale

Re-confirming at execution time rather than trusting a stored flag is what makes SC-021's third
bypass attempt — a target verified once and since changed hands — actually fail.

---

## R12. Load generation execution

**Forced by**: the performance area's load testing, FR-017 Level 2, plan entitlements.

### Decision

Load generation runs in the browser/probe pool service, never in the API service, under a hard cap
on concurrency and duration derived from the plan tier. It is gated on Level 2 verification, and a
single global limiter bounds total outbound load across all customers so the platform cannot be used
as an amplifier even by verified users.

---

## R13. Two-layer module runner and partial-failure semantics

**Forced by**: FR-021, FR-022, FR-030, FR-031, FR-032, FR-053, SC-011, Constitution Principle III.

### Decision

The runner executes in strict order: resolve applicable capabilities → run all code-layer
capabilities concurrently, each isolated so one rejection cannot fail the batch → merge findings →
assemble a single prompt from the code-layer output and the AI-layer capabilities' contributions →
one AI call per module → attribute and persist.

Every finding carries `attribution` (`MEASURED` | `AI_JUDGMENT`), assigned by the runner from which
layer produced it rather than self-declared, which makes FR-032 and SC-006 mechanical. An area
reports `COMPLETE`, `DEGRADED`, `FAILED`, or `NOT_APPLICABLE`, and a non-complete area is excluded
from the overall score rather than counted as zero or silently dropped (FR-053).

---

## R14. Targeted re-verification

**Forced by**: FR-059 through FR-065, SC-004, SC-005, SC-007.

### Decision

Each check registers a re-verification entry point keyed by `checkId`. Re-verification resolves the
issue's fingerprint to its check, runs **only** that check against the recorded location, and
compares the outcome. There is no path by which a user assertion alone changes state — the state
machine's transition to `RESOLVED` takes a passing check result as its only input, which is how
SC-007 becomes structurally true rather than a matter of care.

A check with no registered re-verification entry point yields `UNVERIFIABLE` (FR-063), never
`RESOLVED`.

---

## R15. Testing strategy for the adversarial criteria

**Forced by**: SC-006, SC-007, SC-015, SC-016, SC-017, SC-018, SC-021, SC-022, Constitution
"Development Workflow and Quality Gates".

### Decision

Eight success criteria are stated adversarially, so each gets a dedicated hostile test suite rather
than a happy-path assertion. These are the gates, not extras:

| Criterion | Test approach |
| --- | --- |
| SC-006 (no unattributed issues) | Property test over generated module results: every persisted finding has an attribution. |
| SC-007 (nothing turns green unearned) | Assert every issue fixed with nothing changed; assert bulk-mark-all; assert a check that throws. None may reach `RESOLVED`. |
| SC-015 (no source retained) | Inspect the scan directory after completion, failure, timeout, and cancellation. Four cases, four assertions. |
| SC-016 (no secrets to providers) | Plant credentials in fixture source and markup; intercept the provider client; assert no planted value appears in any outbound payload. |
| SC-017 (sandbox holds) | A fixture capability that attempts filesystem read, filesystem write, network connect, environment read, process spawn, and an allocation bomb. Each must fail; the host must survive. |
| SC-018 (SSRF refused) | Table-driven: private/loopback/link-local/metadata addresses in decimal, octal, hex, and IPv6 forms; redirect chains ending private; a rebinding server that flips its answer between resolve and connect. |
| SC-021 (control gate holds) | Load-generating check against attested-only, token-removed-after-issue, and verified-by-another-account targets. |
| SC-022 (credit integrity) | Property test: random grant/debit/refund/renewal sequences must never lose a purchased credit nor draw one while plan credits remain. |

Provider calls are stubbed in all suites — Principle IV's "a suite that requires live LLM spend is
a broken suite".

---

## R16. Monorepo layout and deployment topology

**Forced by**: Constitution "Technology and Security Constraints", R1's service boundary.

### Decision

Five deployable units, not the three the architecture document describes. R1 adds `sandbox-runner`
(no egress, no credentials) and R6/R12 add `probe-pool` (browser automation and load generation,
isolated from platform credentials). Both exist because a boundary is only real if it is a separate
deployment.

Full layout in [plan.md](./plan.md) under Project Structure.

---

## R17. Report storage and retention

**Forced by**: FR-055, FR-092, FR-093, plan retention entitlements.

### Decision

Structured findings live in the database, because the fixes board queries them. Rendered report
artifacts and captured screenshots live in object storage under a per-scan prefix, so retention
enforcement is a prefix deletion plus a row update rather than a cascade. A scheduled job warns
before removal (FR-092) and deletes on expiry per the plan tier held at audit completion time.

Export (FR-093) generates a self-contained artifact so a report can outlive retention, which is
also what makes an aggressive free-tier retention window acceptable.

---

## R18. An original design for T143's annotated screenshot — a documented exception, not a precedent

**Forced by**: Constitution Design Adherence ("A surface with no entry in `design/screen-map.md` has
no approved design. It MUST NOT be invented — request a design instead") colliding with T143's task
text, which requires implementing exactly that surface.

### Decision

Before writing any code, `design-system/` was searched by content (not filename) — every component,
screen, reference page, and the machine-generated `_ds_manifest.json` component inventory — and
confirmed to contain nothing resembling a screenshot with findings marked on it. `design/
screen-map.md`'s own "No artboard" note for this row was corroborated, not assumed. The user was
then asked directly, via the constitution's own governance clause for this situation ("deviating from
a principle requires a documented exception in the PR and an issue to remove it. Undocumented
deviation is a defect regardless of whether the code works") — and authorized an original design for
this one surface.

`apps/web/components/report/AnnotatedScreenshot.tsx` was built accordingly: no new colour, radius, or
type token invented — it reuses `--sev-*`/`--sev-*-bg` and `SeverityBadge` exactly as `IssueCard`
(T133) does, and follows the same "never hide meaningful content behind hover" rule `IssueCard.
prompt.md` and `AttributionMark.prompt.md` both state explicitly for their own surfaces: every
annotation renders in an always-visible legend below the image, never only as a pin tooltip.

It is **not wired into the live report page**. No scan produces a screenshot today
(`screenshot-capture`'s own module note, T139: the captured bytes are taken and discarded, never
stored) and no finding carries a coordinate (`CapabilityFinding.location` is free text). Wiring it in
belongs with whatever task eventually builds the screenshot capture → storage → report pipeline —
inventing that pipeline now, just to have something to wire this component into, would be exactly the
ahead-of-signal work this project has declined to do everywhere else a similar gap appeared (T116's
browser-pool transport is the clearest precedent).

### Rationale

The constitution's rule exists to stop a surface quietly diverging from a decision record while
looking finished — an *unauthorized* invention. It provides its own release valve for exactly this
case: a documented exception with a stated path to remove it. Silently building the surface would
violate the rule; silently refusing to build a task the user explicitly authorized is not honouring it
either. The record — this entry, `design/screen-map.md`'s new "Documented exceptions" table, and the
component's own module note — is what makes the exception visible rather than a quiet mismatch.

### The general process, for the next task like this

1. Confirm the gap is real: search `design-system/` by content, not filename, including
   `_ds_manifest.json`. A missing artboard is common enough that it is worth re-confirming rather than
   trusting a stale note.
2. Ask the user directly — do not default to inventing, and do not default to refusing outright either.
3. If authorized: reuse every existing token and established interaction principle before inventing
   anything new. Reusing `SeverityBadge` here rather than a bespoke colour scale is the concrete form
   of that rule.
4. Record the exception in three places: the component's own module note, `design/screen-map.md`'s
   exceptions table, and a research.md entry like this one — not just one of the three.
5. Skip `pnpm test:visual` explicitly and say why (no artboard means no reference to diff against),
   rather than leaving its absence unexplained.

---

## Open items carried into planning

Three items are recorded rather than resolved. The first two are amendments to documents this
command must not silently rewrite; the third is a product decision engineering has defaulted rather
than made:

1. **FR-025 needs amending** to distinguish platform egress from auditing-browser egress (R6). As
   written it is unsatisfiable without breaking realistic page measurement.
2. **`WebAuditAI_ARCHITECTURE.md` conflicts with this plan** in three places: it names `vm2`
   (superseded by R1), it awaits the questionnaire in-job (superseded by R4), and it lists three
   deployable units (superseded by R16). Constitution Governance says the architecture document
   must be corrected to match.
3. **FR-017's "published request rate" has no number.** The requirement says Level 1 probing "MUST
   be bounded to a published request rate regardless of attestation" but the specification never
   states the rate, and neither does PRODUCT.md. Implemented at T056 with engineering defaults —
   **4 requests/second sustained, burst 12, per target** — published as `CONTROL_GATE.level1ProbeRate`
   in `packages/config/src/constants.ts` so it is a stated figure rather than a magic number inside
   the limiter. The mechanism is correct and adversarially tested; the *value* needs product
   sign-off, and it is a number customers and audited third parties can both read, so it is not
   purely internal. Raising or lowering it is a one-line change with no code impact.
