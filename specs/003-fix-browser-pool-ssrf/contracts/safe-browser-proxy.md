# Contract: `createSafeBrowserProxy` (packages/safe-net public export)

The one new public interface this feature introduces. Internal to the backend — never reachable from
`apps/web`, never a network-facing HTTP endpoint of its own beyond the loopback proxy port itself.

## Public signature (exported from `packages/safe-net/src/index.ts`)

```ts
export interface SafeBrowserProxy {
  readonly port: number;
  close(): Promise<void>;
}

export interface CreateSafeBrowserProxyOptions {
  /**
   * Overrides DNS resolution for testing (e.g. from a different workspace
   * package's test suite, which cannot reach this package's internal
   * allowLoopback option — see research.md Decision 3). Does NOT weaken
   * enforcement: whatever address a resolver returns is still fully
   * classified before any connection is made.
   */
  readonly resolver?: AddressResolver;
}

export function createSafeBrowserProxy(
  options?: CreateSafeBrowserProxyOptions,
): Promise<SafeBrowserProxy>;
```

**Deliberately absent from this public type**: `policy`/`allowLoopback`, or any other option that could
directly declare an otherwise-disallowed address class as allowed. This matches
`packages/safe-net/src/policy.ts`'s and `index.ts`'s existing, explicit discipline for the fetch guard —
extended here rather than broken for this feature's convenience.

## Behavioral contract

- Binds to `127.0.0.1` only, on an ephemeral port chosen by the OS. Never externally reachable.
- For every `CONNECT` request (the common case — virtually all real traffic is HTTPS):
  1. Parses `host`/`port` from the request.
  2. Resolves `host` via the configured resolver (default: the OS resolver, same as the rest of
     `packages/safe-net`) and classifies every answer via the existing `classifyAddressString`. Refuses
     (closes the client socket, no connection ever opened) if resolution fails or any/every answer is
     disallowed.
  3. Opens a real `net.Socket` directly to the validated literal IP (never re-resolving the hostname).
  4. Re-classifies `socket.remoteAddress` once connected (belt-and-suspenders, research.md Decision 2);
     refuses (destroys the socket, no bytes relayed) on a mismatch.
  5. On success, responds `HTTP/1.1 200 Connection Established` and pipes the client and destination
     sockets bidirectionally until either side closes.
- For plain (non-`CONNECT`) HTTP requests, the same resolve→classify→connect→re-classify sequence runs
  before the request is forwarded, with the original `Host` header preserved.
- A refused request never causes the proxy process itself to crash or hang — the client (Chromium)
  simply sees a failed connection for that one request/navigation, which surfaces to the calling
  capability as an ordinary navigation failure (spec.md FR-006).
- `close()` stops accepting new connections and closes the listening socket; in-flight tunnels are not
  forcibly torn down (mirrors `Browser.close()`'s own graceful-enough semantics in `pool.ts` today —
  no stronger guarantee is claimed than what the browser shutdown path already provides).

## Consumer contract (`apps/probe-pool/src/browser/pool.ts`)

- `createBrowserPool()` calls `createSafeBrowserProxy()` once per pool (not per `withPage()` call),
  passes `proxy: { server: \`http://127.0.0.1:${proxy.port}\` }` into `chromium.launch({...})`, and
  calls the proxy's `close()` inside the pool's own `close()`, alongside `browser.close()`.
- `CreatePoolOptions` gains one new optional field, `resolver?: AddressResolver`, threaded straight
  through to `createSafeBrowserProxy` — test-only, mirroring the existing `launch` injection seam's own
  stated rationale ("Injected so a test can supply a fake ... without needing real infrastructure").
- No change to `BrowserPool`'s or `AuditPage`'s existing public shape — `ctx.withPage()`'s contract is
  unchanged, per spec.md's own Assumptions.
