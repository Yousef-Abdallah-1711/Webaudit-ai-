# Contract: Audit Capability Plugin

**Feature**: [../spec.md](../spec.md) | **Research**: [../research.md](../research.md) (R10, R13)

This is the contract Constitution Principle I calls "the capability contract". It is the only
coupling point between the core and any audit capability. Core code depends on this file; it never
depends on a concrete capability.

---

## Manifest

Every capability directory contains `capability.manifest.json`:

```jsonc
{
  "id": "headers-checker",              // stable, unique, immutable
  "name": "Security Headers Checker",
  "version": "1.0.0",
  "module": "SECURITY",                 // ModuleType
  "layer": "CODE",                      // CODE | AI | BOTH
  "entrypoint": "dist/index.js",
  "requiresCode": false,
  "requiresScreenshot": false,
  "requiredControlLevel": "NONE",       // NONE | ATTESTED | VERIFIED
  "estimatedTokens": 0,
  "originalSource": "https://github.com/…",  // vendored only
  "license": "MIT",
  "vendoredAt": "2026-08-23"
}
```

**Trust is not a manifest field.** It is derived from which root the capability was discovered in —
`packages/capabilities-vendored/` is `VENDORED`, the installed-capability store is `INSTALLED`. A
manifest claiming trust is ignored. (R10, FR-027.)

---

## Interface

```ts
export interface AuditCapability {
  readonly id: string
  readonly module: ModuleType
  readonly layer: CapabilityLayer

  /** Preconditions. False => skipped and reported NOT_APPLICABLE, never failed. FR-021. */
  canRun(input: CapabilityInput): boolean

  /** Code layer. MUST NOT call an LLM. Zero tokens. Principle III, FR-030. */
  runCodeLayer?(input: CapabilityInput, ctx: CodeLayerContext): Promise<CapabilityFinding[]>

  /** AI layer. Contributes to a prompt; MUST NOT call a provider directly. Principle IV. */
  getSystemPromptAddition?(): string
  getContextData?(codeFindings: CapabilityFinding[], input: CapabilityInput): string

  /** Targeted re-verification. Absent => issues from this capability are UNVERIFIABLE. FR-063. */
  reverify?(issue: ReverifyRequest, ctx: CodeLayerContext): Promise<ReverifyResult>
}
```

### Input

```ts
interface CapabilityInput {
  readonly targetUrl?: string
  readonly code?: CodeTree          // present only when source is attached
  readonly screenshot?: ImageRef
  readonly screenshotMobile?: ImageRef
  readonly designIntent?: DesignIntent
  readonly priorModuleResults: Readonly<Record<ModuleType, ModuleSummary>>
  readonly controlLevel: ControlLevel
}
```

`priorModuleResults` is frozen. A capability cannot mutate another area's result.

### Context — the capability's only door to the outside

```ts
interface CodeLayerContext {
  /** SSRF-guarded fetch. Every redirect re-validated. Direct HTTP clients are unavailable. R6. */
  fetch(url: string, init?: SafeFetchInit): Promise<SafeResponse>
  /** Browser page in the probe pool. Never in the API process. */
  withPage<T>(fn: (page: Page) => Promise<T>): Promise<T>
  /** Read-only, confined to this scan's workspace. Escapes rejected. */
  readFile(relPath: string): Promise<Buffer>
  glob(pattern: string): Promise<string[]>
  logger: Logger                    // redacted sink; secrets never reach it
  signal: AbortSignal               // cancellation and timeout
}
```

No `net`, `fs`, `child_process`, or provider client is reachable from a capability. Everything a
capability may do to the outside world goes through this object, which is how FR-025's platform
egress restriction and FR-090's workspace confinement are enforced rather than requested.

### Finding

```ts
interface CapabilityFinding {
  /** Which check produced this. Routes re-verification. FR-059. */
  checkId: string
  /** Deterministic identity, computed by the capability. R3, FR-064. */
  fingerprintParts: string[]
  severity: Severity
  title: string
  description: string
  location?: string
  evidence?: Json
  consequence?: string
  fixable: boolean
}
```

A capability does **not** set `attribution`. The runner assigns `MEASURED` to code-layer findings and
`AI_JUDGMENT` to AI-layer findings, so a capability cannot label a guess as a measurement
(FR-032, SC-006).

### Re-verification

```ts
interface ReverifyRequest { checkId: string; location?: string; evidence?: Json }
type ReverifyResult =
  | { outcome: 'PASSED' }
  | { outcome: 'FAILED';       evidence: Json }   // FR-061: evidence is mandatory on failure
  | { outcome: 'UNVERIFIABLE'; reason: string }   // FR-063
```

---

## Runner guarantees to the capability

1. `canRun` is called before any work; false means skipped, never failed (FR-021).
2. Code layer completes for the whole module before any AI layer runs (FR-030).
3. A rejection or timeout is contained: the module continues and the capability is recorded failed
   (FR-022, SC-011).
4. A capability whose `requiredControlLevel` exceeds the target's level is not invoked, and the
   check is reported unavailable-pending-verification (FR-017, US1 scenario 8).
5. Nothing a capability returns reaches a provider un-redacted (R8, FR-056, SC-016).

## Capability obligations

1. `runCodeLayer` performs no LLM call and no direct network access outside `ctx`.
2. `fingerprintParts` are stable across runs for the same underlying problem, and exclude volatile
   values — query strings, cache-busting hashes, timestamps, absolute paths (R3).
3. `estimatedTokens` is honest. Persistent overshoot surfaces the capability for correction or
   disablement (FR-082).
4. `reverify` re-checks one issue only. It must not re-audit.
5. Honour `ctx.signal`. Work continuing past abort is a defect.

## Conformance suite

Every capability must pass the shared suite before registration (FR-029), and an installed
capability runs that suite **inside the sandbox** (R1):

- Contract shape and manifest validity.
- `canRun` false ⇒ zero side effects.
- Throwing from `runCodeLayer` leaves the module `DEGRADED`, not `FAILED`.
- No LLM call from the code layer (asserted by a poisoned provider client that throws if touched).
- Fingerprint stability across two runs over identical input.
- `reverify` on an unchanged failing target returns `FAILED` with evidence.
- Abort within the grace period after `ctx.signal` fires.
