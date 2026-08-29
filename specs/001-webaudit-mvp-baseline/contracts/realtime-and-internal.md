# Contract: Realtime Events, AI Executor, Sandbox Protocol

**Feature**: [../spec.md](../spec.md) | **Research**: [../research.md](../research.md) (R1, R5, R9)

Three internal contracts that the specification's guarantees rest on.

---

## 1. Realtime progress events

Transport: WebSocket, client subscribes to a scan it owns. Server authorises per subscription —
scan ownership is re-checked on subscribe, not inferred from the connection.

Every event is **persisted before publish** (R5), so a reconnecting client reads authoritative state
from `GET /scans/:id` and then resumes the live stream without a gap (FR-047).

| Event | Payload | Requirement |
| --- | --- | --- |
| `scan:state` | `{ scanId, state, progressPercent }` | FR-044 |
| `module:started` | `{ scanId, module }` | FR-045 |
| `module:complete` | `{ scanId, module, state, score, issueCount }` | FR-033, FR-045 |
| `module:degraded` | `{ scanId, module, reason }` | FR-035 |
| `module:skipped` | `{ scanId, module, reason }` | FR-021 |
| `check:unavailable` | `{ scanId, module, checkId, requiredControlLevel }` | FR-017 |
| `questionnaire:needed` | `{ scanId, questions, deadline }` | FR-040, FR-046 |
| `scan:complete` | `{ scanId, overallScore, reportUrl }` | |
| `scan:failed` | `{ scanId, reason, creditsRefunded }` | FR-075 |
| `issue:verified` | `{ issueId, outcome, state }` | FR-060 |

Events carry no secret material and no raw target content. `module:complete` carries counts and
scores, not findings — findings are fetched over HTTP where authorisation is uniform.

---

## 2. AI executor

The only component that holds provider clients. Principle IV forbids provider SDK calls anywhere
else.

```ts
interface AiExecutor {
  run<T>(req: {
    task: string                 // "module:security" | "master-report" | …
    prompt: RedactedPrompt       // only a redacted prompt is accepted — R8
    schema: JsonSchema           // response contract, provider-agnostic
    executionId?: string         // attributes cost to a capability — Principle VI
  }): Promise<AiResult<T>>
}

type AiResult<T> =
  | { ok: true;  value: T; invocations: AiInvocationRecord[] }
  | { ok: false; reason: 'CHAIN_EXHAUSTED'; invocations: AiInvocationRecord[] }
```

**Contract guarantees:**

1. `prompt` is a `RedactedPrompt`, a type constructible only by the redaction pass. A raw string
   cannot be sent — SC-016 enforced by the type system rather than by review (R8).
2. The chain spans **at least two distinct vendors**; configuration failing that is rejected at
   startup, not at call time (FR-034).
3. A response failing `schema` is a provider failure and advances the chain. Malformed output is
   never partially accepted (FR-034).
4. Every attempt — including failures — writes an `AiInvocationRecord` with provider, model, chain
   position, token counts, latency, cost in micros, and outcome (FR-039).
5. Exhaustion returns `ok: false`, never throws. Callers degrade the area and still deliver measured
   findings (FR-035, SC-012).
6. `estimatedTokens` drift is computed from these records, surfacing over-consuming capabilities
   (FR-082).

**Prohibited:** retry loops at call sites, provider names in business logic, prompt assembly outside
the redaction pass.

---

## 3. Sandbox protocol

The interface between the platform and `sandbox-runner`, the only component permitted to load
unreviewed code (R1). The runner has **no network egress and no database credentials**.

```ts
// Platform -> sandbox-runner (single inbound channel)
interface SandboxRequest {
  requestId: string
  capabilityBundle: Uint8Array   // the uploaded capability, content-addressed
  operation: 'CONFORMANCE' | 'RUN_CODE_LAYER' | 'REVERIFY'
  input: SerializedCapabilityInput   // plain data only — no handles, no callbacks
  limits: { wallClockMs: number; memoryMb: number }
}

// sandbox-runner -> Platform
type SandboxResponse =
  | { requestId: string; ok: true;  findings: CapabilityFinding[]; durationMs: number }
  | { requestId: string; ok: false; reason: SandboxFailure; detail?: string }

type SandboxFailure =
  | 'TIMEOUT' | 'MEMORY_EXCEEDED' | 'CRASHED'
  | 'CONTRACT_VIOLATION' | 'FORBIDDEN_ACCESS' | 'BUNDLE_INVALID'
```

**Execution guarantees (each maps to a requirement):**

| Guarantee | Mechanism | Requirement |
| --- | --- | --- |
| No shared heap with platform code | Fresh child process per execution | FR-027, Principle V |
| No filesystem access | Node permission model, no `--allow-fs-*` | FR-027 |
| No network access | Service has no egress; child cannot reach a socket | FR-027 |
| No environment access | Child spawned with an empty environment | FR-027 |
| No process spawning | Permission model denies `child_process` and workers | FR-027 |
| Bounded wall clock | Parent-armed timer, `SIGKILL` on expiry | FR-028 |
| Bounded memory | OS resource limit on the child | FR-028 |
| Killable from outside | `SIGKILL`, unblockable | FR-028 |
| Verified before first use | `CONFORMANCE` runs inside the same boundary | FR-029 |

The timeout is armed by the **parent**, so a capability cannot outlive its deadline with a tight
loop — the deadline is not code the capability can starve.

**Input is plain serialised data.** No function references, no streams, no file handles cross the
boundary. `CodeLayerContext` is unavailable to untrusted capabilities: anything they would need from
the outside must be gathered by the platform beforehand and passed as data. Untrusted capabilities
are therefore pure functions over supplied evidence.

**SC-017 fixture** — a capability attempting, in order: filesystem read, filesystem write, outbound
connection, environment read, process spawn, and unbounded allocation. Every attempt must yield
`FORBIDDEN_ACCESS` or `MEMORY_EXCEEDED`, the host must survive all six, and no attempt may appear in
any log with exfiltrated content.
