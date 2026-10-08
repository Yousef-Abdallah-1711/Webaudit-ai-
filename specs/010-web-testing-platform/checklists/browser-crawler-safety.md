# Checklist: Browser / Crawler Safety

## Scope Enforcement

- [x] CHK-BC001 Every browser navigation, redirect, popup, and cross-origin resource load calls
  F01's `isInScope`/`isAuthorized` fresh — never cached across two different destinations (FR-012,
  FR-017).
- [x] CHK-BC002 Every crawler-discovered link passes the identical fresh-check discipline before a
  child `ExecutionUnit` is created for it (FR-017) — no "same-site, so skip the check" shortcut
  exists anywhere in `crawler-contract.md`.
- [x] CHK-BC003 `robots.txt` is confirmed, by explicit FR (FR-021) and contract rule, to never
  function as a crawl boundary — only F01's own Scope does.

## Browser-Context Isolation

- [x] CHK-BC004 Every `BROWSER`-class unit receives a fresh `BrowserContext` with zero persisted
  state from any prior context (FR-013) — checked against `pool.ts`'s own existing per-call-context
  pattern, extended, not newly invented.
- [x] CHK-BC005 Camera/microphone/geolocation/clipboard/notification/download permissions are
  denied by default, with no FR or contract granting an override (FR-012).
- [x] CHK-BC006 `file://`/`data:`/`blob:` top-level navigation is refused, not merely logged
  (FR-012).
- [x] CHK-BC007 A popup/new tab is subject to the identical scope check as its opener — never
  auto-trusted (FR-012, `research.md` adversarial #3).
- [x] CHK-BC008 Service Worker registrations do not persist past their owning `BrowserContext`'s
  teardown (FR-012, `research.md` adversarial #5).

## SSRF / Network-Level Threats

- [x] CHK-BC009 `packages/safe-net`'s existing SSRF-guarding proxy is confirmed, by direct code
  read, to already cover HTTP(S) egress including localhost/private-IP/cloud-metadata destinations
  — this spec reuses it rather than re-implementing SSRF protection.
- [x] CHK-BC010 DNS-rebinding-after-initial-resolution is confirmed covered by the existing proxy's
  own design, not newly solved by this spec (`research.md` adversarial #18).

## Crawl Bounding

- [x] CHK-BC011 `discoveryBudget.maxPages` is enforced via a single atomic conditional-increment
  database statement (`CrawlBudgetCounter`), never a count-then-create sequence — re-verified
  during this spec's own closure pass after the original wording ("checked against actual
  created-unit counts") was found to name no actual atomic mechanism; `research.md` R16 now
  provides one (FR-020, crawler-contract.md rule 2).
- [x] CHK-BC012 `PageIdentity`-based deduplication uses an atomic `IdempotentClaim`
  (`scope: "crawl-discovery"`) — two concurrent discoveries of the identical identity cannot both
  win, closing the query-parameter-explosion/calendar-trap classes of crawl trap both logically
  (dedup) and race-safely (atomicity), with the hard page-count ceiling as the backstop even if
  dedup were imperfect (FR-018/FR-020, `research.md` R16, adversarial #9/#10/C14/C15).
- [x] CHK-BC021 (closure-pass addition) An unrecognized query parameter is confirmed semantic by
  default — `page-identity-contract.md`'s own exclusion list is an allow-list only, never a
  heuristic, closing the risk of two genuinely different rendered pages collapsing into one
  `PageIdentity` (`research.md` adversarial C16).
- [x] CHK-BC022 (closure-pass addition) F01's fresh scope check is confirmed scoped to
  engine-chosen destinations only (navigation, redirect-of-navigation, popups, crawl-frontier
  expansion, workflow `navigate` steps) — ordinary page subresources are confirmed, by direct
  re-verification against F01's own frozen text, to be governed by `packages/safe-net`'s
  unconditional egress policy instead, never independently scope-checked (`research.md` R13).
  This resolution is documented as an interpretation of F01's own text, not a silent edit to F01's
  document, which remains unmodified.
- [x] CHK-BC013 A fixed maximum redirect-hop count and maximum single-response size are both
  enforced before attempting to parse a response (FR-020, `research.md` adversarial #11/#13/#14).
- [x] CHK-BC014 A compression bomb is checked against the size ceiling during streaming
  decompression, never after fully buffering (`research.md` adversarial #23).
- [x] CHK-BC015 Sitemap-discovered URLs count against the same `discoveryBudget` as any other
  discovery — a large or recursive sitemap cannot bypass the page-count ceiling (FR-022,
  `research.md` adversarial #12/#13).

## Crash / Hang Recovery

- [x] CHK-BC016 A hung page and a disconnected browser process are classified distinctly
  (`TIMEOUT` vs. `ENGINE_DEFECT`, FR-009) rather than collapsed into one generic failure.
- [x] CHK-BC017 Evidence already committed before a mid-execution crash is confirmed never lost,
  because `recordEvidence` commits independently of the owning unit's finalization (009, reused;
  `research.md` adversarial #8).
- [x] CHK-BC018 An infinite popup loop and a stalling/never-resolving page are both confirmed
  bounded by the identical `SIGKILL` deadline mechanism — no new, separate timeout logic was
  invented for either (`research.md` adversarial #4/#24).

## Tenant Isolation

- [x] CHK-BC019 No two `ExecutionUnit`s, same-tenant or cross-tenant, can share live browser state
  — confirmed structurally (fresh context, zero persistence) rather than by policy alone
  (`research.md` adversarial #6).
- [x] CHK-BC020 Every new browser/crawl-related construct re-derives tenant ownership through its
  owning `Scan`/`ExecutionUnit`'s `userId` (FR-048).
