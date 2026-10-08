# Scan Architecture Evolution Options

Read-only audit, 2026-10-07. No implementation plan — this inventories what can evolve, what needs
extension, and what needs a new execution system, per the current codebase's actual shape.

## Reusable as-is

- The BullMQ queue/worker skeleton: named-queue-per-concern pattern ("give it its own queue so it
  can't be starved"), priority bands, `attempts`/stalled-count discipline tied to whether a job is
  idempotent.
- Credit reservation/debit/refund mechanics (`debit`, `refundPartial`, `refundForUndelivered`) and
  the underlying `CreditLot`/`CreditTransaction`/`CreditAllocation` ledger.
- The readiness threshold+diff+verdict machinery (`computeVerdict`, `diffAgainstBaseline`) — a
  genuinely solid, fingerprint-identity-based regression model.
- Reverify's single-check dispatch pattern (`resolveReverifyCapability` + call exactly one
  `reverify()`), including its idempotence-by-construction discipline.
- The capability-SDK contract (`AuditCapability`: `id`, `module`, `layer`, `canRun`, `runCodeLayer`,
  optional `reverify`/`getSystemPromptAddition`/`getContextData`) and its manifest-driven
  discovery/trust model (`VENDORED` vs. `INSTALLED`).
- The AI-layer's one-call-per-module assembly with labelled, never-authoritative capability
  contributions — a real and effective prompt-injection defense that should anchor any future
  AI-assisted domain, not be redesigned per-domain.
- The Prisma schema's fingerprint-based finding-identity model, which both readiness regression and
  reverify already depend on and which works well.

## Needs extension, not replacement

- `ModuleType` enum (closed union of 5) — adding a domain is mechanical (touches `AREA_COST`,
  `READINESS_THRESHOLDS`, `MODULE_LABEL` x2, `phase-modules.ts`) but is real, by-name, multi-file
  work each time, not a generic "register a new module" call.
- Pricing (`AREA_COST`) — currently a flat constant per module; needs to be rewritten to consume the
  `CapabilityExecution.costMicros` metering primitive that already exists for AI spend, so a future
  expensive/variable-cost operation can be priced accurately rather than flatly.
- The dependency-scanner's static 8-entry advisory table — swap for a live OSV/npm-audit-class feed
  call; the surrounding capability (manifest parsing, floating-specifier detection, lockfile
  presence) does not need to change.
- Staged-upload (ZIP) retention — the `UploadStorage.remove` method exists; wiring an actual call
  site (or a bucket lifecycle policy) closes a real, currently open gap.

## Needs a genuinely new execution system

1. **A real browser-pool service.** `apps/probe-pool` is a library (`createBrowserPool`) with no
   deployed server/transport and no `pageProvider` wired into the worker's `contextFactory`. Standing
   this up as an actual running service is the single highest-leverage change available — it would
   activate Core Web Vitals, render-blocking/page-weight checks, horizontal-overflow/tap-target
   checks, and blank-render detection, all of which are **already written and waiting**, with zero
   new capability code required.
2. **An active-security execution system.** Payload generation, response-diffing, target
   allowlisting/scope enforcement, DNS pinning, redirect revalidation, request/concurrency/rate
   budgets, an emergency stop, and payload-safety classification. Nothing in the current
   `AuditCapability` contract or `sandbox-runner` was designed for *sending attack payloads* — the
   entire current security surface is passive observation of one response.
3. **An untrusted-code execution sandbox.** The current sandbox-runner's threat model is "run
   Fahes's own trusted code against untrusted data," enforced at the process level (`node
   --permission`, parent-armed `SIGKILL`, V8 heap ceiling). Running the *customer's own* build/test
   scripts safely needs container- or VM-grade isolation with explicit network-egress control — a
   different, stronger threat model than what exists today.
4. **A load/capacity-generation system** decoupled from Fahes's own auth/seed-user model. The
   existing k6 harness is architecturally tied to Fahes's own `/auth/login` and scan-creation
   endpoints with 65 dedicated internal test users; pointing load generation at an arbitrary
   authorized customer target is a rewrite of that harness's assumptions, not a parameter change.
5. **An authorization/scope/environment-classification data model.** Staging-vs-production
   designation, destructive-mode consent, kill-switch, and an audit log of *scan-execution actions
   taken against a third party* (distinct from the existing `AuditLogEntry`, which covers *operator*
   actions inside Fahes's own admin console, not actions taken against a customer's infrastructure).
   The closest existing primitive, `ControlLevel`/`TargetVerification`, proves ownership; it does not
   express environment classification or explicit destructive-testing consent.

## What this means for sequencing (observation, not a plan)

Item 1 (browser-pool service) is qualitatively different from items 2-5: it unlocks value from code
that already exists, with no new safety model required, because every browser-dependent capability
already catches the "no pool configured" failure gracefully. Items 2-5 each require designing a new
safety/authorization model before any capability code is written, because each introduces a new way
the platform could cause real harm (active probing, arbitrary code execution, generated load,
destructive testing) that passive URL/source-metadata auditing never had to consider.
