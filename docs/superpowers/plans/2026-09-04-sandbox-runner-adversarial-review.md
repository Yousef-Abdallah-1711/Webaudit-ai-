# Sandbox Runner Engineering Review — T216–T224

**Date:** 2026-09-04
**Scope:** Session 7 (spec-kit Phase 10, sandbox-runner core isolation, T216–T224) of
[the full-project remediation roadmap](2026-09-03-full-project-remediation-roadmap.md) — the first
untrusted-code execution path in the entire codebase, R1's "three nested boundaries" (service
boundary: separate deployment, no egress, no DB credentials — deferred to Session 8/T225; process
boundary: Node's `--permission` model, empty environment, OS resource limits; language boundary: a
thin harness passing only structured data).
**Method:** Two full, independent adversarial review passes run sequentially against the same code,
each dispatched with instructions to hunt specifically for an escape from the `vm.Context` sandbox and
for any resource the child process could leak or hold open. The second pass was given a detailed brief
of exactly what the first pass found and fixed, and was explicitly instructed to independently
reproduce the original proof-of-concept against the *fixed* code, attempt further novel variants, and
verify the leak fix at the OS process level rather than trust the first pass's own account.
**Status column:** ✅ Fixed in this review cycle · 🔴 Open (recorded, not fixed) · — Not applicable
(informational, or a pre-existing/deferred condition outside this review's scope).

---

## Consolidated findings, most severe first

| # | Sev | Area | Finding | Status |
|---|-----|------|---------|--------|
| 1 | **Critical** | `child-harness/load.ts` + `context.ts` | A host-realm value handed to the sandboxed capability (`console`, a data argument, a `CodeLayerContext` method) carries its own prototype chain independently of the context's own global object, reopening the classic `this.constructor.constructor('return process')()` vm escape even after the global object itself was hardened | ✅ Fixed |
| 2 | **Critical** | `host/server.ts` | `finish()` only killed the child process on the `TIMEOUT` path; every other resolution (`ok:true`, `FORBIDDEN_ACCESS`, `CONTRACT_VIOLATION`, `BUNDLE_INVALID`) left the child's IPC listener holding its event loop open forever — an unconditional per-request process leak | ✅ Fixed |
| 3 | **Critical** (same root cause as #1) | `packages/capability-sdk/src/conformance/suite.ts` | The shared `runConformanceSuite`, reused for the sandbox's `CONFORMANCE` operation, builds its own `canRun` trap `Proxy` and `reverify` probe object as host-realm values and passes them directly to the vm-native capability — a third, narrower instance of Finding 1's bug, outside `harness.ts`'s own control | ✅ Fixed |
| 4 | Minor | `packages/capability-sdk/src/contain.ts` | `describeThrown`'s `value instanceof Error` check has the identical cross-realm blind spot: an `Error` thrown inside the vm context is a real `Error`, but a different realm's `Error`, so `instanceof` against the host realm's `Error` is always false — a sandboxed capability's genuine bug in `canRun` was reported as `"canRun threw: {}"` instead of its real message | ✅ Fixed |
| 5 | Important | `host/server.ts` | `readJsonBody` had no size limit — a 20 MiB body was accepted and fully buffered before any parsing, an unbounded-memory DoS vector on the host process itself | ✅ Fixed |
| 6 | — | Windows dev environment | `fork(..., {env: {}})` still injects ~11 real OS-required env vars (`HOMEDRIVE`, `PATH`, `SYSTEMROOT`, etc.) despite an empty `env` object being passed | ✅ Resolved (2026-09-08) — verified on real Linux, does not reproduce, see below |
| 7 | — | Windows dev environment | `--allow-fs-read`/`-write` path-glob matching produced a garbled, mis-cased resource path (`\\?\c:\uSERS\...`) for certain glob forms on this machine; worked around with narrowly-scoped, `path.sep`-consistent allow-paths rather than root-caused | ✅ Resolved (2026-09-08) — verified on real Linux, does not reproduce, see below |

No findings beyond the above in either pass. Findings 1–3 share one root cause and are reported
together below as "the vm-context escape"; finding order in the table reflects genuine independent
severity, not the order they were found in.

---

## The vm-context escape (Findings 1, 3) — root cause, fix, and how it was verified

**Claimed guarantee:** SC-017 — a hostile capability's attempt to reach the host process (filesystem,
network, environment, process spawn, memory exhaustion, **or the sandbox mechanism itself**) is refused
and the host survives.

### What was actually wrong

The first implementation created the vm context with `vm.createContext({})` — a plain host-realm
object literal as the context's global object. Bare identifiers (`require`, `process`, `fetch`)
correctly resolved to nothing; a capability trying `require('fs')` got a clean `ReferenceError`. But
`{}`'s own `[[Prototype]]` still pointed at the **host realm's** `Object.prototype` even after
"contextifying" it, so `this.constructor.constructor('return process')()` — the standard `vm` escape —
walked that chain straight to the real `Function` constructor and the real `process`. Confirmed live:
this one-liner, run as a capability's `runCodeLayer`, returned the actual host `process` object.

The first fix, `Object.create(null)` for the global object, closed that specific vector —
`this.constructor.constructor(...)` at the top level now threw a genuine, in-context
`ReferenceError`, confirmed against roughly ten escape-pattern variants (`Object.getPrototypeOf(this)`,
`[].constructor.constructor`, real async/generator function constructors, `Reflect.construct`, etc.).
**This was not sufficient.** Granting `console` back into the sandbox — needed for a capability's
`logger` calls to not throw — reopened the identical escape via
`console.log.constructor.constructor(...)`, because `console` itself is a host-realm object with a
host-realm prototype chain, regardless of what the *context's own* global object's prototype is. The
same is true of any function or data value passed as an **argument** into context-evaluated code: a
plain host-realm data object (e.g. `{priorModuleResults: {}, controlLevel: 'NONE'}`) and a host-realm
function (`ctx.fetch`) each independently reached the real `process` via
`arg.constructor.constructor(...)`, confirmed live for both.

The third instance (Finding 3) was found while implementing the fix for 1: `conformance/suite.ts`'s
`checkCanRunPure` (used for the sandbox's `CONFORMANCE` operation, per FR-029's "under the same
restriction") builds its own side-effect-detection `Proxy` for the trap passed to `canRun`, and
`checkReverify` builds its own synthetic probe object — both host-realm constructions, passed directly
to a vm-native capability, entirely outside `harness.ts`'s reach since this logic lives in shared,
non-sandbox-specific code.

### The fix, in three parts

1. **`load.ts`** — the context's global object is `Object.create(null)`, and nothing — not even
   `console` — is granted onto it directly.
2. **`load.ts`'s `cloneIntoContext(context, value)`** — any JSON-serializable value crosses into the
   sandbox by round-tripping through the **target context's own** `JSON.parse` (confirmed to be a
   genuinely separate, context-scoped intrinsic, distinct from the host's `JSON`), producing a clone
   whose prototype chain is rooted in that context from the moment it's created. Confirmed the result
   is both safe (`.constructor.constructor(...)` throws `ReferenceError`) and functionally normal
   (ordinary property reads work).
3. **`context.ts`'s `buildSandboxedContext(context)`** — rewritten to construct the entire
   `CodeLayerContext` object (`fetch`, `withPage`, `readFile`, `glob`, `logger`, `signal`) via **one**
   `vm.Script` executed *inside* the target context, so every method's own `.constructor` chain is
   rooted there too, not in the host realm. `buildSandboxedCanRunTrap(context)` does the same for the
   conformance suite's `Proxy` trap.

For Finding 3 specifically, `ConformanceDeps` (`packages/capability-sdk/src/conformance/suite.ts`)
gained two **optional** fields — `buildCanRunTrap?` and `buildReverifyProbe?` — each defaulting to the
original host-realm construction (extracted, unchanged, into `defaultCanRunTrap()`), so every existing
trusted caller of `runConformanceSuite` is unaffected. `apps/sandbox-runner`'s `harness.ts` is the only
caller that supplies the sandboxed variants.

### Verification

- First pass: reproduced the original escape against the pre-fix code, then confirmed the fix blocks
  it, `console`-carried escape, and the two argument-carried variants (data object, `ctx.fetch`).
- Second pass, independently: re-reproduced the original PoC against the *fixed* code (blocked),
  attempted 11 further novel variants (`Object.getPrototypeOf(this).constructor`, generator/async
  function constructors invoked for real, `Reflect.construct`, escaping via `signal.addEventListener`'s
  own function object, via `glob`'s rejected-promise `Error` object, and others) — all blocked.
- `apps/sandbox-runner/tests/adverse/sandbox-escape.test.ts` gained a dedicated "vm-context
  prototype-chain escape" `describe` block: the `this.constructor.constructor(...)` PoC run via both
  `runCodeLayer` and `reverify`, asserting `FORBIDDEN_ACCESS` (not a silent success, not an unclassified
  crash).
- Zero regression confirmed for every other, non-sandboxed caller of `runConformanceSuite`:
  `packages/capabilities-vendored/tests/conformance.test.ts` (16/16) and
  `apps/worker/tests/adverse/capability-disable.test.ts` (44/44) both pass unchanged, since neither
  supplies the new optional deps and both exercise the (unchanged) default path.

---

## The child-process leak (Finding 2)

**Claimed guarantee:** a sandbox execution request, whatever its outcome, leaves nothing running.

`host/server.ts`'s `executeOne` forks a child per request; `finish(response)` is the single place a
result gets resolved back to the HTTP caller. Before the fix, `finish()` only called `child.kill()` on
the code path reached by `armTimeout`'s own timeout callback — every other outcome
(a normal successful result, `FORBIDDEN_ACCESS`, `CONTRACT_VIOLATION`, `BUNDLE_INVALID`) resolved the
HTTP response and returned, leaving the child's `process.on('message', ...)` IPC listener registered
and its event loop open, with nothing left to tell it to exit.

**Confirmed live** (Windows, `Win32_Process`/`tasklist` inspection): 7 sequential `POST /execute`
requests, each completing successfully, left 7 orphaned `node.exe` processes still running minutes
later — a certain, unconditional resource-exhaustion DoS against the sandbox host itself, worse under
any real load.

**Fix:** `finish()` now unconditionally calls `child.kill('SIGKILL')` before resolving, on every
path. `ChildProcess.kill()` on an already-exited child (the `MEMORY_EXCEEDED`/`CRASHED` cases, where the
child is already dead) is a documented Node no-op — confirmed safe.

**Verification:** a new "every completed request cleans up its own child process" test using
`process._getActiveHandles()` filtered for `constructor.name === 'ChildProcess'`, exercised across a
benign request, a `FORBIDDEN_ACCESS` request, and a `CONTRACT_VIOLATION` request — before/after handle
counts equal in every case. (A 300 ms settle delay was added before measuring the `before` baseline,
after an initial flaky failure traced to racing against a *prior* test's not-yet-OS-reaped child within
the same file, not a defect in the fix itself.) The second review additionally re-verified at the OS
process level across all six possible `SandboxFailure` outcomes.

---

## Minor and Important findings

**4. MINOR — `describeThrown`'s cross-realm blind spot** (`packages/capability-sdk/src/contain.ts`).
Found by the second review while re-checking diagnostic quality for sandboxed capabilities. Not a leak
— nothing crosses the boundary the wrong way — but a real capability bug thrown inside the vm context
produced `"canRun threw: {}"` (its actual message lost to `JSON.stringify` on a plain `Error`, whose
`name`/`message` are non-enumerable). **Fix:** check `.name`/`.message` as plain strings before falling
back to `instanceof Error`, the same pattern `harness.ts`'s own local `describeError` already used.
`harness.ts`'s duplicate was then deleted in favor of importing the now-fixed shared function, removing
the duplication rather than leaving two copies to drift.

**5. IMPORTANT — unbounded request body** (`host/server.ts`). `readJsonBody` had no size cap; a 20 MiB
body was accepted and fully buffered before any parsing — an easy way to pressure the sandbox host's own
memory regardless of anything the child process does. **Fix:** a 16 MiB cap, throwing a new
`RequestTooLargeError`. The first fix attempt called `req.destroy()` immediately on detecting the
overflow, which tore down the shared socket *before* a 413 response could be written, producing a raw
`ECONNRESET` on the client instead of a clean HTTP 413 — corrected by removing that call and letting the
existing `.catch()` handler write the 413 normally. A new test sends an oversized body and asserts 413.

---

## Findings 6 and 7 — resolved 2026-09-08, verified on real Linux

Both originally found through live debugging on this dev machine (Windows, Node v24.15.0) during
implementation, not during either formal review pass, and left open pending Linux verification.
That verification has now happened, using a `node:22-slim` Docker container (this project's pinned
Node 22, real Linux/glibc) rather than the live production host itself — the closest available proxy,
and sufficient here because both findings are Node/OS platform behavior, not application logic.

- **Finding 6 — empty `env` still leaks ~11 real OS variables (Windows only).** `fork(child, args,
  {env: {}})` measurably exposed `HOMEDRIVE`, `PATH`, `SYSTEMROOT`, and roughly eight others to the
  child on Windows. **Verified on Linux:** the identical call — `fork(childPath, [], { env: {},
  stdio: [...] })` — produced a child whose `Object.keys(process.env)` was `[]`. Zero leakage. This
  confirms the original assessment: Windows's `CreateProcess` loader requires several of these
  variables to start `node.exe` at all, an OS-level behavior `child_process.fork` cannot suppress on
  that platform, and it simply does not exist on Linux. No code change — `env: {}` in `host/server.ts`
  already delivers the intended guarantee on the deployment target.
- **Finding 7 — `--allow-fs-read`/`-write` glob-matching quirk (Windows only).** Certain glob forms
  (mixed-separator paths, a bare wildcard-everything pattern) produced a garbled, mis-cased
  `\\?\c:\uSERS\...` resource path in the permission-denial error on Windows. **Verified on Linux:**
  the exact invocation `host/server.ts` uses — `--permission --allow-fs-read=<dir>/*` inside a
  `fork()` with `env: {}` — cleanly permitted reading a file inside the allowed directory (exit 0, no
  stderr) with no mis-casing. Unsurprising once verified: the reported artifact (`\\?\` extended-length
  path prefix) is a Windows-only path convention with no Linux equivalent, so the quirk cannot occur
  there by construction. No code change — the shipped narrow, `path.sep`-consistent `readAllowlist` in
  `host/server.ts` already works correctly on the deployment target.

---

## Verification gate — run after all fixes

```
pnpm test apps/sandbox-runner                                    → all sandbox-runner unit tests pass
pnpm test:adverse apps/sandbox-runner/tests/adverse/sandbox-escape.test.ts
                                                                   → 11/11 (6 original SC-017 vectors +
                                                                     2 vm-context escape + 1 process-leak
                                                                     + 1 request-body-size, across 4
                                                                     describe blocks)
pnpm test:adverse apps/sandbox-runner/tests/adverse/limits.test.ts → 4/4
pnpm test packages/capabilities-vendored/tests/conformance.test.ts → 16/16 (zero regression)
pnpm test:adverse apps/worker/tests/adverse/capability-disable.test.ts → 44/44 (zero regression)
```

Full whole-branch gate re-run clean after all fixes: `pnpm test` 907/907, `pnpm test:adverse` 639/640
(1 pre-existing, unrelated skip) — see PROGRESS.md's dated Session 7 section for the exact counts and
the Open Decisions entries for Findings 6 and 7.

## Not fixed in this review (recorded, not silently dropped)

- Finding 6 (empty-env leakage on Windows) — resolved 2026-09-08; verified on real Linux via
  `node:22-slim`, does not reproduce. See "Findings 6 and 7 — resolved" above.
- Finding 7 (glob-matching quirk on Windows) — resolved 2026-09-08; verified on real Linux via
  `node:22-slim`, does not reproduce (the artifact is a Windows-only path convention). The underlying
  Node permission-model behavior on Windows itself remains unexplained, and doing so is
  outside this review's scope (a Node platform question, not a defect in this codebase).
