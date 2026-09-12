# Feature Specification: Close the Browser Pool's SSRF Gap

**Feature Branch**: `003-fix-browser-pool-ssrf`

**Created**: 2026-09-11

**Status**: Draft

**Input**: User description: "Fix P2-SSRF-1, a confirmed security gap documented in
docs/reviews/FULL-WORKFLOW-SECURITY-PERFORMANCE-CREDIT-REVIEW.md (Section 6): the browser automation
pool used by screenshot/CWV/Lighthouse-style audit capabilities navigates to target-controlled URLs
with zero SSRF protection, unlike every other outbound path in this codebase. Currently inert in
production (nothing wires a page provider into the orchestrator yet), but a real, live gap in
already-shipped code that must close before that wiring lands, not after. Required outcome: browser
navigation must get equivalent protection to what the existing fetch-based guard already provides —
URL-form validation, DNS-resolution-based address validation, connect-time re-validation (anti-DNS
-rebinding), and per-hop redirect re-validation — applied to every request a page in this pool makes,
not just the initial navigation URL. Constraints: reuse the existing address-classification/policy
logic rather than duplicating it; no change to the existing fetch-based guard; do not defer the fix
just because the path is currently unreachable; measure any added navigation latency rather than
guessing; a legitimate public target must keep working exactly as before; needs a dedicated regression
test covering a disallowed address, a redirect to a disallowed address, and a legitimate page still
loading successfully."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A capability's browser page can never be driven to an internal or private address (Priority: P1)

An audit capability asks the platform to load a target page in a real browser (for a screenshot,
a Core Web Vitals measurement, or a Lighthouse-style check). The address that page is actually
allowed to reach must be restricted exactly as strictly as every other outbound path in this platform
already is — no internal service, cloud metadata endpoint, or private network address may ever be
reached this way, no matter what URL, redirect, or embedded resource the target page tries to point the
browser at.

**Why this priority**: This is the one remaining confirmed gap in an otherwise-comprehensive SSRF
defense that a full security review already found. It is not yet reachable in production, but the
review that found it explicitly requires it be closed before it becomes reachable, not after — closing
it now is what keeps this a "found and fixed" item rather than a "found and later exploited" one.

**Independent Test**: Ask a real browser page (via this pool) to navigate to a disallowed address
(loopback, a private-network address, and a cloud metadata address); confirm the navigation is refused
and no response body from that address is ever exposed to the caller. Separately, ask it to navigate to
an address that is allowed at first request but redirects to a disallowed one; confirm the redirect
itself is refused, not just the first hop.

**Acceptance Scenarios**:

1. **Given** a capability asks the browser pool to load an internal, loopback, private-network, or
   cloud-metadata address, **When** the navigation is attempted, **Then** it is refused before any
   response content from that address reaches the capability.
2. **Given** a capability asks the browser pool to load an address that is allowed, and that address's
   server responds with a redirect to a disallowed address, **When** the browser follows that redirect,
   **Then** the redirect destination is independently checked and refused — the initial address being
   allowed does not grant the redirect target a pass.
3. **Given** a capability asks the browser pool to load a genuinely public, legitimate address,
   **When** the navigation happens, **Then** the page loads successfully and the capability receives
   its content exactly as it does today — this protection introduces no failure or behavior change for
   ordinary, legitimate use.
4. **Given** an address that resolves to an allowed location at the moment of an earlier check but
   would resolve to a disallowed location by the time the actual connection is made (a "DNS rebinding"
   attempt), **When** the browser actually connects, **Then** the connection is refused based on where
   it is actually about to go, not based on a check that already went stale.

### Edge Cases

- What happens when a page the browser has already loaded tries to load additional embedded resources
  (images, scripts, stylesheets) from a disallowed address after the main page itself was allowed?
  Every such sub-resource request must be checked independently — a page being allowed to load does not
  grant every resource it subsequently requests a pass.
- What happens when the address-checking mechanism itself is unavailable or fails unexpectedly for a
  request? The request must be refused, not silently allowed through — the same fail-closed posture
  this platform's existing outbound-request protection already uses.
- What happens to a capability's screenshot/measurement result when a navigation is refused for this
  reason? It must fail cleanly and visibly (the same way any other capability failure is contained and
  reported today), never silently return an empty or misleading result.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST refuse browser navigation to loopback, private-network, link-local, and
  cloud-metadata addresses, matching the address forms this platform's existing outbound-request
  protection already refuses.
- **FR-002**: The system MUST independently check every redirect a browser navigation follows, not only
  the address originally requested — an allowed starting address must never grant a disallowed redirect
  destination a pass.
- **FR-003**: The system MUST independently check every sub-resource request a loaded page makes (for
  example embedded images, scripts, or stylesheets), not only the top-level navigation.
- **FR-004**: The system MUST base its allow/refuse decision on the address a connection is actually
  about to be made to at the moment of connecting, not solely on an earlier, potentially-stale check —
  closing the same "DNS rebinding" gap this platform's existing outbound-request protection already
  closes for its other outbound path.
- **FR-005**: The system MUST reuse this platform's existing address-classification rules for what
  counts as an allowed or disallowed address, rather than introducing a second, separately-maintained
  set of rules that could drift out of sync.
- **FR-006**: A refused navigation MUST be reported to the calling capability as a clean, visible
  failure — never a silent empty result and never a crash of the browser pool itself.
- **FR-007**: A legitimate, publicly-reachable target address MUST continue to load successfully with
  no behavior change visible to a capability using this pool in the ordinary case.
- **FR-008**: If the address-checking mechanism itself cannot make a decision for any reason, the
  system MUST refuse the request rather than allow it through by default.
- **FR-009**: This protection MUST NOT modify or weaken the platform's existing, separate outbound-
  request protection used for non-browser requests — it is an additional, independent layer for browser
  traffic specifically.
- **FR-010**: The fix MUST be completed and verified before any capability is wired to actually use this
  browser pool in production — it must not be deferred on the grounds that nothing reaches it yet.
- **FR-011**: A dedicated automated test MUST prove: a disallowed address is refused, a redirect to a
  disallowed address is refused at the redirect (not only the first request), and a legitimate address
  still loads successfully end to end.

### Key Entities

- **Browser Page / Navigation**: A single instance of a real browser loading a target-controlled
  address on behalf of a capability, plus every redirect and sub-resource request that navigation
  produces.
- **Address Decision**: The allow/refuse determination made for one specific network destination at the
  moment a real connection to it is about to be made — the unit this feature's guarantee is expressed
  in terms of.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of navigation attempts to loopback, private-network, link-local, and cloud-metadata
  addresses are refused, verified across every address form this platform's existing protection already
  covers.
- **SC-002**: 100% of redirect chains that start at an allowed address and redirect to a disallowed one
  are caught at the redirect, not only at the first request, verified by a dedicated test.
- **SC-003**: 100% of legitimate, publicly-reachable target loads continue to succeed with no observable
  change in outcome for the existing capability-facing interface.
- **SC-004**: Zero instances of a disallowed address's response content ever reaching a capability,
  across repeated test runs.
- **SC-005**: Any added latency introduced to an ordinary, legitimate page load is measured and
  reported as part of this work, not assumed or omitted.

## Assumptions

- This feature closes the gap in the browser pool itself (`apps/probe-pool`); it does not include
  wiring a live page provider into the orchestrator for any capability to actually use in production —
  that remains separate, not-yet-scheduled work, exactly as it is today. Closing this gap is what makes
  that future wiring safe to do, not a signal to do it now.
- The existing fetch-based outbound-request protection (used by non-browser requests) is not modified
  by this feature; it is treated as a working reference implementation of the same guarantee, applied
  here through a different, browser-appropriate mechanism.
- "Every sub-resource request" includes normal page assets (images, scripts, stylesheets, fonts, XHR/
  fetch calls made by page script) — anything the browser itself initiates as part of rendering or
  running the page, not only the address typed into the navigation itself.
- No new capability-facing interface change is required — `ctx.withPage()`'s existing contract stays
  the same; this feature changes only what happens underneath it when a page is driven to a
  disallowed address.
