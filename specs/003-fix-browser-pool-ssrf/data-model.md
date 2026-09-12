# Phase 1 Data Model: Close the Browser Pool's SSRF Gap

No persisted data model — this feature is entirely in-process, in-memory network-egress control. No
Prisma schema change, no database entity.

## Entities (in-memory, process-lifetime only)

### SafeBrowserProxy (the new mechanism)

| Field | Type | Notes |
|---|---|---|
| `port` | number | The ephemeral loopback port the proxy is listening on. Passed into `chromium.launch({ proxy: { server: 'http://127.0.0.1:<port>' } })`. |
| `close()` | `() => Promise<void>` | Stops the underlying `http.Server`; called when the owning `BrowserPool.close()` runs. |

Internal-only state (not part of the public type, per research.md Decision 3):
- `resolver: AddressResolver` — defaults to `systemResolver`; overridable only via the public
  `resolver` option.
- `policy: AddressPolicy` — always `DEFAULT_POLICY` for anything reachable from outside
  `packages/safe-net`; only the package's own tests can supply a different one, via the internal
  (non-"."-exported) implementation function directly.

### Address Decision (conceptual — spec.md's "Key Entity", not a code type)

Realized concretely as the existing `AddressVerdict` (`address-rules.ts`) produced by
`classifyAddressString`, consumed twice per real connection this feature adds:
1. **Pre-connect**: against every address `assertResolvedAddressesAllowed` resolved for the requested
   hostname (or the literal address itself, if the target was an IP literal).
2. **Post-connect**: against `socket.remoteAddress` of the connection actually opened (research.md
   Decision 2) — belt-and-suspenders, mirroring `connect-guard.ts`.

Both reuse the exact same `AddressVerdict`/`classifyAddressString` shape already defined in
`address-rules.ts` — no new type.

## Relationships

```
BrowserPool (apps/probe-pool)
  --owns (1:1, created at pool startup, closed at pool.close())--> SafeBrowserProxy (packages/safe-net)
    --launched via `chromium.launch({ proxy })`--> Chromium browser process
      --every navigation/redirect/sub-resource request--> SafeBrowserProxy's CONNECT/request handler
        --resolves + classifies (packages/safe-net's existing address-rules.ts/resolve-guard.ts)--> Address Decision
          --allowed--> real socket opened to the validated IP, re-checked post-connect, then piped
          --disallowed--> connection refused before any byte is relayed
```

One `SafeBrowserProxy` per `BrowserPool` instance (not per `withPage()` call) — matching the existing
"one browser, short-lived contexts" design `pool.ts` already uses for the browser itself.
