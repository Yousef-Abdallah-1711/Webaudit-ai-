# Contract: The golden-path workflow the load test drives

Every k6 VU/iteration performs exactly this sequence against the real, already-running `apps/api`
(confirmed exact request/response shapes by reading the real route handlers before writing this):

1. **`POST /auth/login`** `{ email, password }` (this VU's own dedicated seeded user,
   `TEST_USERS[__VU - 1]` — research.md Decision 2, revised) → `200 { accessToken }` +
   `refresh_token` cookie. On `401`/`403`, the iteration fails immediately and is counted as an error —
   a login failure is never silently retried into a false "it worked" result.
2. **`POST /targets`** `{ inputType: 'URL', value: 'https://example.com/' }` (the same fixed URL for
   every VU — no per-VU suffix; research.md Decision 4, revised, since canonicalization discards any
   path/query down to the bare origin anyway, and per-user scoping of `Scan_one_active_per_target`
   already keeps every VU's target independent), bearer `accessToken` → `201 { target: { id,
   canonicalValue, ... } }` (confirmed by a real curl call: response is
   `{"target":{"id":...,"inputType":"URL","canonicalValue":"https://example.com","displayName":"https://example.com","controlLevel":"NONE"}}`)
   (or `200` if this VU's user already has this row from a prior run — both are success for this
   workflow's purposes).
3. **`POST /scans/quote`** `{ targetId, modules }` → `200 { quote: { credits } }`. `modules` is a fixed,
   deliberately code-layer-only set (e.g. `['SECURITY']`) — screenshot/UI capabilities are out of reach
   today (spec.md Assumptions), so requesting them would only measure "gated out," not real capability
   work.
4. **`POST /scans`** `{ targetId, modules, acceptedQuote: <exactly the quote's credits> }` → `201
   { scan: { id, state: 'QUEUED', ... } }`. A `402`/`409`/`422` here is a real error for this iteration,
   not swallowed.
5. **`GET /scans/:id`**, polled on a short fixed interval (e.g. every 2s) → `200 { scan: { state, ... } }`
   until `state` is one of `COMPLETED`/`FAILED`/`CANCELLED`/`TIMED_OUT`, or a k6-side poll timeout is
   reached (counted as a "never completed" outcome, not silently dropped).

## What this contract deliberately does not do

- It does not inspect report/finding content — this harness measures the *workflow*, not audit
  correctness (already covered elsewhere in this repo's own test suites).
- It does not attempt cancellation, the questionnaire pause, readiness passes, or any capability
  requiring a browser (`ctx.withPage`) — all out of scope per spec.md's own Assumptions.
- It does not create a new user per iteration — 65 pre-seeded users, one dedicated per VU, all sharing
  the same fixed target URL (research.md Decision 2/4, revised).
