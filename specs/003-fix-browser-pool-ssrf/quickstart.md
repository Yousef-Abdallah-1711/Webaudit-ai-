# Quickstart: Validating the Browser Pool SSRF Fix

## Prerequisites

- No database/Redis needed — this feature is entirely in-process.
- Playwright's Chromium browser installed for `apps/probe-pool`'s real-browser test (already a
  dependency of this monorepo via `@playwright/test`; run `npx playwright install chromium` once if
  it isn't already present on this machine).

## Scenario 1 — The proxy itself refuses disallowed addresses and enforces per-request re-validation

```bash
pnpm vitest run --project adverse packages/safe-net/tests/adverse/browser-proxy.test.ts --no-file-parallelism
```

**Expected**: navigation-equivalent CONNECT requests to loopback/private/link-local/metadata addresses
are refused before any byte is relayed; a request to a real local "allowed-for-test" server succeeds
end-to-end through the tunnel; a resolver answering with a disallowed address is refused (anti-DNS
-rebinding); a second, independent request to a disallowed target through the same proxy instance is
refused regardless of an earlier request's outcome (the "redirect" requirement, satisfied because every
redirect is an independent request at the proxy layer).

## Scenario 2 — The real browser pool actually enforces this, without breaking legitimate use

```bash
pnpm vitest run --project adverse apps/probe-pool/tests/adverse/browser-pool-ssrf.test.ts --no-file-parallelism
```

**Expected**: a real Chromium instance, launched through `createBrowserPool()` with the proxy wired in,
successfully loads a genuine public URL (no regression for the one real consumer pattern); navigation
to a well-known disallowed literal address (a metadata IP) fails visibly rather than silently; a
lightweight wiring check confirms `chromium.launch()` is actually called with a `proxy` option pointing
at the started proxy's real port.

## Scenario 3 — No regression elsewhere

```bash
pnpm test:adverse
pnpm test
pnpm run lint
pnpm run typecheck
```

**Expected**: identical pass/fail counts to the pre-fix baseline (see the originating review's Section
5 and this repo's known 7 pre-existing environmental unit failures), plus the new tests above, all
green. `packages/safe-net`'s existing SSRF suites (`ssrf.rebinding.test.ts`, `ssrf.redirect.test.ts`,
`ssrf.forms.test.ts`, `ipv6-classifier-gaps.test.ts`) and `apps/sandbox-runner`'s adverse suite remain
untouched and green — this feature does not modify `safe-fetch.ts`/`connect-guard.ts`/`resolve-guard.ts`
/`address-rules.ts` at all.

## What this quickstart deliberately does not cover

- **Wiring a live `pageProvider` into the orchestrator** — explicitly out of scope per spec.md's
  Assumptions; this feature closes the gap in `apps/probe-pool` itself, it does not make any capability
  actually reach it in production.
- **Exact added-latency numbers** are reported in `tasks.md`'s result notes once measured (spec.md
  SC-005), not fabricated here ahead of time.
