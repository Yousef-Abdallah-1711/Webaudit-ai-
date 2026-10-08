# Browser Execution Contract

Per `spec.md` FR-006 through FR-015. How a `BROWSER`-class `ExecutionUnit` (009's own enum value)
actually drives a real browser, bounded and isolated, and what it is and is not responsible for
deciding.

**Closure-pass revision (2026-10-08) — navigation vs. subresource scope semantics**: the original
draft said F01's fresh `isInScope`/`isAuthorized` check applies to "every navigation, redirect,
popup, or cross-origin resource load," taken from F01's own `scope-matching-contract.md` wording
verbatim. Re-verified against F01's actual frozen text during this closure pass: that contract's
own "Redirect / cross-origin / crawl-frontier rule" section states the check runs "every single
time a browser follows a redirect, loads a cross-origin resource, or a crawler expands its
frontier to a new URL." Read fully literally, "loads a cross-origin resource" would require a
fresh scope check for **every** subresource a page loads while rendering — fonts, CSS, analytics
beacons, CDN-hosted scripts, third-party embeds — and since a `ScopeDefinition` is built around a
*target's own* domain(s), nearly every such subresource would independently resolve
`REFUSED_OUT_OF_SCOPE`. Treated as a block-on-refusal rule, this would break ordinary rendering of
almost every real website (no Google Fonts, no CDN jQuery, no embedded video, no analytics), which
is self-evidently not what F01's own authors intended — F01 predates any spec that actually
designed a rendering browser engine in detail, and its own illustrative examples (a redirect, a
crawl-frontier expansion, "the next step of a multi-step workflow") share one common thread: each
is a destination the **engine itself deliberately chooses to pursue as its own next action** — not
a resource the browser's rendering engine fetches automatically and incidentally while painting a
page it was already authorized to navigate to.

**Resolution adopted by this spec** (`research.md` R13 — a documented interpretation of F01's own
text for this spec's own consuming purposes, not a silent edit to F01's document, which remains
untouched): F01's `isAuthorized`/scope governs **engine-chosen destinations** — top-level
navigation, the actual destination of a followed redirect *of a navigation*, a crawler-frontier-
discovered candidate page, and a workflow's own `navigate` step target (`functional-workflow-
contract.md`). **Ordinary, passive page subresources** (JS/CSS/fonts/images/analytics/third-party
embeds/CDN assets) that load automatically while rendering a page the engine is already authorized
to navigate to are **not** independently re-checked against F01's scope — they are incidental
network egress, governed for every single one of them, unconditionally, by `packages/safe-net`'s
existing SSRF/private-IP/cloud-metadata-blocking proxy (FR-012), which is **never** relaxed and
applies regardless of scope. This resolution weakens neither F01 (every destination F01's own
illustrative examples actually describe still gets its fresh check) nor SSRF protection (safe-net's
own egress policy is strictly *unconditional*, a stronger guarantee for subresources than a scope
check would have been, since it blocks dangerous destinations regardless of whose domain they claim
to be). A popup/new-tab, by contrast, **is** treated as an engine-chosen destination (a user/page
action deliberately opening a new browsing context) — it keeps its own fresh scope check unchanged
(see the table below).

## `dispatchBrowserUnit` (the `BROWSER`-class specialization of 009's own
`execution-runtime-contract.md:dispatchExecutionUnit`)

```text
dispatchBrowserUnit(executionUnitId: string) -> void
```

1. Perform every step 009's own `execution-runtime-contract.md` already requires unchanged
   (re-read from Postgres, F07 `safetyCheckpoint`, child-process fork, `SIGKILL` deadline arming).
2. Inside the forked child process: construct `createBrowserPool()` (`apps/probe-pool/src/browser/
   pool.ts`, reused unchanged) and supply its `withPage` as `CodeLayerContext.options.pageProvider`
   (FR-007) — this is the one new wiring step this contract adds to 009's own sequence.
3. Check the current count of live `withPage()` contexts against this worker process's own fixed
   concurrency ceiling (FR-008); if at the ceiling, this unit is not dispatched — it remains
   `ADMITTED`, retried at the next available slot (never a silent drop, never a second queue).
4. Resolve this unit's `BrowserMatrixEntry` (from `configuration`, FR-010) and create a fresh
   `BrowserContext` with every permission denied by default (FR-012) and zero persisted state from
   any prior context (FR-013).
5. Navigate; for every top-level navigation, the destination of a followed redirect, and every
   popup/new-tab (each an **engine-chosen destination**, per this contract's own closure-pass
   resolution above): call F01's `isInScope`/`isAuthorized` fresh (F01's own contract, reused —
   see "Non-negotiable boundary rules" below). Ordinary page subresources (fonts/CSS/JS/images/
   analytics/third-party embeds) are **not** independently scope-checked — they are governed
   unconditionally by `packages/safe-net`'s own SSRF/egress policy (step 4's table), never by F01.
6. Capture Evidence via 009's own `recordEvidence` (`SCREENSHOT`, `DOM_NODE`, `CONSOLE_MESSAGE`,
   `HAR`, `ACCESSIBILITY_NODE` as applicable) as it becomes available — never batched until the
   unit's own end.
7. On the child's own clean exit or the parent's `SIGKILL` deadline firing: classify the outcome
   per FR-009 (browser-process-alive-but-hung → `TIMEOUT`; browser-process-already-gone →
   `ENGINE_DEFECT`) and call 009's own `finalizeExecutionUnit` unchanged.

## Browser-context policy (FR-012/FR-013)

| Vector | Policy |
|---|---|
| Camera / microphone / geolocation / clipboard / notifications | Denied by default, no override in this spec |
| File downloads | Denied by default; an attempted download is recorded as Evidence, never saved |
| `file://` / `data:` / `blob:` top-level navigation | Refused |
| Popup / new tab | Engine-chosen destination — subject to the identical fresh F01 scope check (step 5) as the opening page before being followed |
| Ordinary page subresources (fonts/CSS/JS/images/analytics/third-party embeds/CDN assets) | **Not** F01-scope-checked (this contract's own closure-pass resolution, `research.md` R13) — governed unconditionally by `packages/safe-net`'s SSRF/egress policy below |
| Service Worker registration | Never persists past this `BrowserContext`'s own teardown |
| Cookies / localStorage / IndexedDB / cache | Never persisted past this `BrowserContext`'s own teardown |
| HTTP(S) egress for every request this unit makes, navigation and subresource alike (SSRF/DNS-rebinding/localhost/private-IP/cloud-metadata) | Already closed by `packages/safe-net`'s existing proxy — reused unchanged, not redesigned here, and never conditioned on F01 scope |

## Non-negotiable boundary rules

1. This contract MUST NOT cache an `isAuthorized`/`isInScope` result across two different
   engine-chosen destinations (navigation/redirect-of-navigation/popup), even within the same
   `ExecutionUnit` — every one calls F01 fresh (F01's own FR-024, reused). This contract MUST NOT
   call F01 at all for an ordinary page subresource (this contract's own closure-pass resolution,
   `research.md` R13) — doing so would be both incorrect (most legitimate subresources would
   resolve out-of-scope and break normal rendering) and unnecessary (safe-net's own egress policy
   already governs every such request unconditionally).
2. This contract decides only what to capture as Evidence — it MUST NOT itself decide a Finding
   (FR-001's Engine/Domain boundary); Evidence flows to the Domain Check Registry
   (`web-check-registry-contract.md`), never to an inline finding-producing branch inside this
   dispatch path.
3. No field this contract writes to `ExecutionUnit.configuration`, a queue payload, or an Evidence
   payload may carry a raw credential/session secret (FR-047) — only an opaque
   `credentialBindingRef`.
4. A concurrency-ceiling-blocked unit (step 3) is never silently dropped or treated as `FAILED` —
   it remains eligible for a later dispatch attempt within its own `timeoutPolicyMs` budget.
5. No AI judgment may decide this contract's navigation, capture, or classification steps
   (FR-053).
