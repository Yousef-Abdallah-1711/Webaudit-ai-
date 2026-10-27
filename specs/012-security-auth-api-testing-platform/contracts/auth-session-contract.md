# Contract: Authenticated Session (Context C — SessionHost)

Per FR-041 through FR-052, FR-033, FR-047, FR-049, FR-090 and the activation gate SG7. Defines the execution-local session
state inside an E15 (or authenticated E14) child process: login, renewal, expiry, logout, revocation, cancellation cleanup,
crash recovery, and the teardown ordering against the broker lease and F07 lease (009 U-1 gap). Planning only.

## Status / Ownership

Owner: SPEC 012, Context C. Code home planned: `packages/security-engine/` (`SessionHost`) used by `apps/worker/src/security/`
unit hosts. Status: planning, not frozen. A session is **execution-local state**: never persisted, never serialized, never
shared across units (FR-041). Gated by SG3 (broker), SG7 (teardown behavioral self-test, `M` calibration).

## Consumers

1. E15 workflow runner (`auth-workflow-execution-contract`): login/logout/state-transition checks, authorization pairs, business-logic workflows.
2. E14 (`active-security-execution-contract`) when a probe references an identity: a credentialed crafted request runs in an E14 unit with its own lease and `SessionHost` and is checkpointed under both classes (FR-161, L2).
3. `mutation-cleanup-contract` (cleanup requests run inside a live session).
4. Engine `onUnitExpired` hook (009 U-1) and unit finalizer.
5. Evaluator checks `auth.session.*` reading `AUTH_STATE_TRANSITION` Evidence.

## Inputs

- A broker `CredentialLease` and secret envelope for one `(executionUnitId, attempt, testIdentityId)` (`credential-broker-contract.md`).
- `TestIdentity` (role, `mfaMode`), login flow descriptor from the workflow/check definition (closed form: endpoint template,
  field mapping, success oracle, logout endpoint, session-cookie/token locator) — data, no scripts.
- Unit `timeoutPolicyMs`, `hardStopMarginMs`, grant/lease/deadline liveness reads, the unit's `LocalBudget` and `securityScopeGate`.

## Outputs

- In-memory jar per identity (cookies, bearer/API-key headers, CSRF tokens) — never leaves the process.
- `AUTH_STATE_TRANSITION` Evidence: `{unitId, attempt, identityId, roleKey, from, to, atMs, cause, cookieMeta[]}` where
  `cookieMeta = {name, flags(Secure/HttpOnly/SameSite), lifetimeClass, lengthClass}` and tokens carry only `{type, lengthClass}` (FR-047).
- Durable local facts (last `AUTH_STATE_TRANSITION`, observed cookie lifetime class) from which the **parent-side finalizer** writes `SESSION_UNCONFIRMED` `CLEANUP_RECORD` entries with expected natural expiry for stopped/killed/expired units (FR-046, FR-162, L3); the unit does not write them.
- Check inputs for verdicts; flags `SEC_SESSION_NOT_SERVER_INVALIDATED`.

## Operations

```text
class SessionHost {
  open(lease, identity, flow) -> SessionHandle           // one host per (unit, attempt, identity)
  login(handle) -> LoginOutcome                          // ESTABLISHED | REJECTED | MFA_UNSUPPORTED | LOCKOUT | RATE_LIMITED | TIMEOUT
  send(handle, probeRequest) -> Response                 // attaches jar material; same gate/budget/checkpoint order as any request
  renew(handle) -> ESTABLISHED | BLOCKED                 // re-login or refresh token only
  logout(handle) -> LOGGED_OUT | NOT_OBTAINABLE
  invalidate(handle, cause) -> void                      // local drop, always allowed, no network
  dispose(handle) -> void                                // child-local; carries no proof (the parent observes the child's exit, FR-175)
}
onUnitExpired(unit) -> TERMINATED | PENDING              // registered engine hook (FR-052)
```

States (plan.md D4): `LeaseIssued -> LoggingIn -> Active | Blocked`; `Active -> Renewing -> Active`; `Active -> LoggingOut -> Destroyed`;
`Blocked -> Destroyed`; `Active -> Destroyed` on kill / crash recovery (local drop). Each transition emits one `AUTH_STATE_TRANSITION`.

### Isolation rules (FR-041, FR-042)

- Exactly one `SessionHost`/jar per `(executionUnitId, attempt, testIdentityId)`; two identities in one unit use two hosts with no shared
  object, cookie store, HTTP agent/connection pool, DNS cache entry, CSRF store or header state. Concurrent identity sessions per unit <= 4 (FR-051).
- No mixing of tenants, customer environments, roles, browser profiles or scans: a host rejects a lease whose `(userId, targetId, environment, roleKey)` differs
  from its construction tuple. There is **no browser profile** in v1 (authenticated browser testing is unsupported, FR-048, AR-2; 010 gives every `BROWSER` unit a zero-state context, so a session can never reach a browser context).
- Connection reuse across identities is forbidden: each host owns its own `SecurityHttpClient` instance configured with per-host keep-alive disabled across identities.
- Sessions never cross units: a composite test (IDOR) uses one unit per class with an `ExecutionDependency` ordering edge; each unit obtains its own lease and session (FR-062).

### Ordered steps

**Login** (`LOGIN_ATTEMPT`, category `AUTH_LOGIN`; FR-055 order): Phase A reads incl. scope gate -> Phase B `reserveAuthAttempt` (RESERVED; default failure limit 3, hard max 5; FR-191) -> Phase C `safetyCheckpoint(request:true)`
-> send login via `SecurityHttpClient` -> classify outcome: success oracle matched -> `ESTABLISHED`; credential rejected (oracle negative, 401/403 on login) ->
`REJECTED`, **one attempt, no retry** (US3 AS1); lockout signal (423, `Retry-After` on login, "account locked" body class) -> `LOCKOUT` and all further attempts for that identity in the scan blocked (FR-074);
429 -> `RATE_LIMITED`. Cookie/token values are registered with the exact-value redactor **before** the response is persisted or logged (FR-128).

**Pre-/post-login session id comparison (fixation, FR-049)**: hash comparison inside the host with a per-process random salt; only `{cookieName, changed: bool}` is recorded.

**Renewal / expiry (FR-044)**: on expiry signal (401 with session cookie, declared `expiresAt`, `Set-Cookie` expiry) the host re-logins with the identity's credential or its refresh
token only; each re-login consumes the auth-attempt allowance and a `LOGIN_ATTEMPT` checkpoint; renewal never extends beyond lease `expiresAt`, unit deadline or grant expiry.
`SESSION_FIXTURE` credentials are never renewed; expiry -> `SEC_SESSION_EXPIRED` (`BLOCKED`).

**Per-checkpoint liveness (FR-043)**: at each checkpoint (<= 5 s) the host verifies (a) F07 `PROCEED`, (b) grant active and class listed (via the checkpoint), (c) scan non-terminal, (d) plan
deadline not passed (U-1), (e) broker `leaseStatus == ISSUED`. Any failure -> `invalidate(cause)` immediately; then `logout` only if a fresh admission is still obtainable;
otherwise record the residual `SEC_SESSION_NOT_SERVER_INVALIDATED`; the parent-side finalizer writes the `SESSION_UNCONFIRMED` cleanup entry (FR-162).

**Logout** (`LOGOUT`, category `AUTH_LOGOUT`): scope gate -> checkpoint -> send logout -> drop jar regardless of response -> if the check requires it, make one post-logout re-use probe
with the old token (separate `READ`/`NEGATIVE_PROBE` request, own checkpoint) to observe server-side invalidation. Logout and cleanup run on every exit path within the unit's
`timeoutPolicyMs` budget (FR-045; 009 `execution-unit-contract` rule 6).

**Teardown ordering vs lease release (009 U-1 gap)** — identical to `credential-broker-contract.md` §`confirmLeaseDestroyed`:
1. `invalidate` + `dispose` (jar zeroized best-effort; child exits or parent kills the child process group).
2. Parent -> `confirmLeaseDestroyed(leaseId, {childExited: ParentObservedExit})` (the proof is the parent's own observation of the child's exit; no child-reported field such as `jarDisposed` is accepted, FR-175).
3. `onUnitExpired` returns `TERMINATED` **only** after the lease is `DESTROYED` and the host is confirmed gone; otherwise `PENDING` (unit non-terminal, F07 lease retained).
4. 009 finalization releases the F07 lease after `TERMINATED`. A hosting-failure backstop (parent SIGKILL group; broker lease TTL <= unit time) bounds a dead-host window within `hardStopMarginMs` (default 60 000); beyond it `TERMINATION_UNCONFIRMED` verbatim.
The host never calls F07 release itself and never reports `TERMINATED` on a best-effort guess.

**Cancellation / kill**: `USER_CANCELLATION` -> unit `CANCELLED`; stop -> `KILLED` (FR-059). On stop, admission is refused (`KILL_SWITCH_PENDING`), so server-side logout is **not** attempted;
the jar is dropped locally, residual sessions listed by the parent-side finalizer (FR-043, FR-122, FR-162); the UI warns before a user cancel that residual state may remain (FR-171). Cancellation does not reverse already-issued requests (008 FR-014 limitation).

**Crash recovery (FR-046)**: a recovered/swept unit never reuses a prior attempt's lease or session; the broker lease is revoked by the sweeper; the unit's last durable `AUTH_STATE_TRANSITION` shows whether a server session may exist,
and the parent-side finalizer writes the `SESSION_UNCONFIRMED` `CLEANUP_RECORD` with expected natural expiry (FR-162) (from observed cookie lifetime class). Because retry is `maxAttempts: 1`, a crashed unit is not re-run.

### MFA modes (FR-090, Clarification P3)

| Mode | v1 | Behavior |
|------|----|----------|
| `DISABLED_FOR_TEST` (customer-asserted) | supported | normal login; if an MFA challenge is nevertheless observed, record observation, stop -> `SEC_MFA_CHALLENGE_UNSUPPORTED` |
| `SESSION_FIXTURE_ONLY` | supported | session loaded from credential; no login; expiry never extended; expired -> `SEC_SESSION_EXPIRED` |
| TOTP seed / SMS / email OTP / human-assisted | `UNSUPPORTED` | `SEC_MFA_CHALLENGE_UNSUPPORTED` |

Challenge timeout default 120 s (polling with checkpoints, FR-056) -> `SEC_MFA_TIMEOUT`; retry limit 1; session continuity preserved only inside the unit. The platform **never** claims or attempts an MFA bypass and never reports "MFA is secure" from a blocked attempt.

## Invariants

1. A session is bound to exactly one `(executionUnitId, attempt, testIdentityId)` and is never reachable from another.
2. Cookie/token values exist only in process memory; no value is written to disk, Evidence, Artifact, log, queue, IPC log channel or AI prompt (FR-047).
3. A session never outlives its lease, grant, unit deadline, scan, or F07 `PROCEED`; the host verifies at every checkpoint (FR-043).
4. Every exit path (complete, fail, cancel, kill, deadline, crash recovery) runs `invalidate` + `dispose`, and the parent records its own observation of the child's exit as the destroy proof.
5. `onUnitExpired` returns `TERMINATED` only after `confirmLeaseDestroyed` returned `DESTROYED` and the host is gone.
6. A failed login yields exactly one attempt (no retry) and never a PASS verdict (US3 AS1).
7. Re-login/refresh consumes the same auth-attempt allowance and checkpoint as the first login.
8. Concurrent identity sessions per unit <= 4; per tenant per Target concurrency obeys the grant's `concurrencyBudget` (F07).
9. After `LOCKOUT`/`RATE_LIMITED`, no further login for that identity in the scan.
10. A recovered unit never reuses a prior session or lease.
11. Authenticated browser state injection does not exist in v1 (FR-048); no screenshots/HAR/traces of authenticated pages are captured (FR-133).
12. Every state transition emits an `AUTH_STATE_TRANSITION` with names/flags/length classes only.

## Safety & Authorization

- **F01/F07**: every `LOGIN_ATTEMPT`, `LOGOUT`, `SESSION_REFRESH` and request passes `securityScopeGate` (categories `AUTH_LOGIN`/`AUTH_LOGOUT`/`READ`...) then `safetyCheckpoint` (FR-055, FR-077). No session activity occurs without a `PROCEED`.
  Destination is always the Target's authorized host; login/logout endpoints that redirect off-origin are not followed (`SEC_REDIRECT_OUT_OF_SCOPE`).
- **Production**: no session exists for PRODUCTION/unclassified Targets (broker denial, gate); a mid-run reclassification stops via F07 `ENVIRONMENT_RECLASSIFIED` -> local drop only.
- **Recovery flows**: account-recovery structure checks only with a recovery fixture and `AUTH_RECOVERY_OBSERVE` (FR-088); no token guessing (FR-087).
- **Side effects**: login may trigger lockout or notification emails on the target; each check declares `sideEffects[]`; lockout risk gates repeated attempts (FR-074).
- **Isolation**: the child has no DB connection, no KEK; the secret arrives only over parent IPC memory (FR-033).

## Failure states

| Condition | Verdict / status | Reason |
|-----------|------------------|--------|
| Login credential rejected | `BLOCKED` | `SEC_CREDENTIAL_REJECTED` |
| Session could not be established (non-credential cause: no cookie issued, network) | `BLOCKED` | `SEC_SESSION_ESTABLISH_FAILED` |
| Session expired and not renewable | `BLOCKED` | `SEC_SESSION_EXPIRED` |
| Grant expired / revoked during session | `BLOCKED` | `SEC_SESSION_GRANT_EXPIRED`; F01 `EXPIRED`/`REVOKED` verbatim at the checkpoint |
| Lease revoked/expired | `BLOCKED` | `SEC_CREDENTIAL_REVOKED` / `SEC_CREDENTIAL_EXPIRED` |
| Lockout signal | `BLOCKED` | `SEC_ACCOUNT_LOCKOUT_RISK` |
| 429 / Retry-After | `BLOCKED` | `SEC_CREDENTIAL_RATE_LIMITED` and `SEC_RATE_LIMIT_ENCOUNTERED` |
| MFA challenge unsupported / timeout | `BLOCKED` | `SEC_MFA_CHALLENGE_UNSUPPORTED` / `SEC_MFA_TIMEOUT` |
| Auth attempts exhausted | `BLOCKED` | `SEC_BUDGET_LOCAL_AUTH_ATTEMPTS` |
| Logout impossible (stop/kill/admission refused) | FLAG on the unit result | `SEC_SESSION_NOT_SERVER_INVALIDATED` |
| Broker down when the lease is requested (after `RUNNING`, FR-195) | unit `COMPLETED` through `sec_finalize_unit`, dependent checks `BLOCKED`; no credentialed request | `SEC_BROKER_UNAVAILABLE` |
| Transport failure during login/logout | `INCONCLUSIVE` | `SEC_RESPONSE_AMBIGUOUS` (or `BLOCKED` `SEC_SAFE_NET_REFUSED`) |
| Teardown not confirmed | `onUnitExpired = PENDING`, then `FAILED`/`TRANSIENT_INFRASTRUCTURE` | `TERMINATION_UNCONFIRMED` verbatim |
| Authenticated browser requested | `UNSUPPORTED` | `SEC_UNSUPPORTED_TARGET_TYPE` (Consolidated repairs item 3) |

## Idempotency & retry

Unit `maxAttempts: 1`; no retry of login. Retry of a safe idempotent request after transport failure only if the check declares
`idempotent: true`, consuming budget and a new `idempotencyKey` (FR-057). `invalidate`, `dispose`, `confirmLeaseDestroyed` are idempotent. Evidence writes use the
fenced writer and claim `IdempotentClaim{scope:"sec-evidence-write", claimKey:"${scanPlanId}:${executionUnitId}:${attempt}:AUTH_STATE_TRANSITION:${naturalKey}"}` (FR-135);
a recovered process does not re-send a login whose `SENT` marker exists (FR-148).

## Evidence

`AUTH_STATE_TRANSITION` (above), `HTTP_TRANSACTION` (sanitized: header names, flagged values only, body shape), `CLEANUP_RECORD` for `SESSION_UNCONFIRMED`. Session artifacts (jars, tokens, cookies) are
**never** persisted as Evidence or Artifact; the exact-value redactor registers every issued token/cookie/CSRF value on receipt (FR-128). Redaction failure writes
`{"_redactionFailed": true}` (FR-129).

## Budgets/limits

**F07-authoritative**: requests (login, logout, refresh, each probe = 1 request unit incl. redirect hops) and concurrency. **LOCAL — not F07-ledgered**: auth attempts per identity 3 (hard max 5);
concurrent identity sessions per unit <= 4; per-identity requests <= 100; session lifetime <= min(lease `expiresAt` = min(unit timeout + margin, 30 min), grant expiry); MFA timeout 120 s, retry 1;
inter-request delay 500 ms for `C3`; checkpoint cadence <= 5 s; E15 `timeoutPolicyMs` 900 000, `hardStopMarginMs` 60 000, `unitBudgetMs` 1 020 000 (provisional, `M` calibration pending).

## Reverify

Fresh session each time: reverify obtains a new lease, new jar, new login (counting against that run's attempt allowance), fresh checkpoints, and compares against the finding's expected-secure outcome. It never
restores a stored session or token. A reverify whose login is blocked is `INCONCLUSIVE` with the closed reason (FR-153).

## Boundary rules (MUST NOT)

1. MUST NOT persist, serialize, log or transmit a cookie jar, token or session id outside the owning process memory.
2. MUST NOT share a jar, connection pool, HTTP agent or CSRF state between identities, units, attempts, scans or tenants.
3. MUST NOT keep a session alive past the lease, grant, deadline, scan end or a failed checkpoint.
4. MUST NOT retry a failed login, guess a password, or continue after a lockout/429 signal for that identity.
5. MUST NOT attempt out-of-band logout/cleanup after an F07 stop.
6. MUST NOT report `TERMINATED` before the broker lease is `DESTROYED`; MUST NOT release the F07 lease itself.
7. MUST NOT claim or attempt an MFA bypass, intercept OTP, or store TOTP seeds in v1.
8. MUST NOT inject a session into a browser context or capture authenticated screenshots/HAR in v1.
9. MUST NOT follow a login/logout redirect off-origin or forward credentials off-origin.
10. MUST NOT mark a check `NO_ISSUE_DETECTED` when login failed, the session expired mid-check, or logout invalidation could not be observed.
11. MUST NOT treat a 401/403 or a successful probe as `FAILED` unit status (measured result = `COMPLETED`, FR-059).

## Named limitations

- A server-side session may remain valid after a stop/kill/crash because logout needs an admission that no longer exists; it is reported (`SEC_SESSION_NOT_SERVER_INVALIDATED`, `SESSION_UNCONFIRMED` with expected expiry), not hidden.
- Memory zeroization is best-effort in Node (FR-034); the short lease TTL and the process-group kill are the real bounds.
- Between revocation and the next checkpoint (<= 5 s) one more in-flight request may complete (008 FR-014).
- Pre/post-login fixation comparison depends on the identifying cookie being named in the flow descriptor.
- Authenticated browser-based checks (DOM XSS on authenticated pages) are unsupported until AR-2 is accepted.
- Teardown timing values are provisional until the `M` calibration and SG7 self-test.

## FR traceability

FR-033 (child IPC), FR-041, FR-042, FR-043, FR-044, FR-045, FR-046, FR-047, FR-048, FR-049, FR-050, FR-051, FR-052, FR-056, FR-057 (retry), FR-074 (lockout), FR-090 (MFA); supports FR-059, FR-062, FR-128, FR-129, FR-135, FR-148; FR-161 (dual-class E14 sessions), FR-162 (finalizer-written `SESSION_UNCONFIRMED`), FR-171 (cancel warning).

## Acceptance tests required (named, deterministic, fixture-based; not executed now)

- `session.isolation.two-identities`: two identities in one unit, fixture server echoes cookie names; no cross-leak; separate connection pools (socket-id assertion).
- `session.isolation.cross-tenant-scan`: host rejects a lease with a different tenant/target/env/role tuple; no jar sharing across scans.
- `session.login.rejected-one-attempt`: bad credential -> exactly one login request, `BLOCKED` `SEC_CREDENTIAL_REJECTED`, never PASS.
- `session.login.lockout-stops`: 423 fixture -> further attempts blocked, `SEC_ACCOUNT_LOCKOUT_RISK`.
- `session.login.attempt-budget`: 4th login refused `SEC_BUDGET_LOCAL_AUTH_ATTEMPTS` before any request.
- `session.fixation.hash-compare`: id unchanged across login -> flag recorded; no value persisted.
- `session.renew.bounded`: renewal never exceeds lease/grant; session fixture expiry -> `SEC_SESSION_EXPIRED`, no refresh.
- `session.grant-expiry-invalidates`: grant expires mid-run -> next checkpoint drops jar, lease revoked, unit no PASS (US2 AS2).
- `session.logout.invalidation-observed`: post-logout reuse of old token still 200 -> `LIKELY_VULNERABILITY` (two transactions).
- `session.cancel.cleanup`: user cancel -> logout attempted if admission obtainable, jar disposed, lease `DESTROYED`.
- `session.kill.no-logout`: kill switch -> zero requests after stop, jar dropped, `SEC_SESSION_NOT_SERVER_INVALIDATED` flag, residual listed.
- `session.crash.recovery`: killed host -> no session reuse, lease revoked by sweeper, `SESSION_UNCONFIRMED` entry (written by the parent-side finalizer, FR-162) with expected expiry, no re-run.
- `session.teardown.ordering`: `onUnitExpired` = `PENDING` until `DESTROYED`; F07 lease retained until `TERMINATED`; `TERMINATION_UNCONFIRMED` after margin.
- `session.mfa.modes`: challenge fixture -> `SEC_MFA_CHALLENGE_UNSUPPORTED`; timeout fixture -> `SEC_MFA_TIMEOUT`; no bypass request ever sent.
- `session.no-artifacts`: scan Evidence/Artifact/logs/IPC logs for cookie/token values -> zero hits; redaction-failure fixture -> `{"_redactionFailed": true}`.
- `session.browser.unsupported`: authenticated browser check -> `UNSUPPORTED`, no browser unit created.

## Resolved additions

1. Lease/session lifetime: **L8 / FR-033** - lease cap min(unit timeout + margin, 30 min); budgets line updated.
2. `SESSION_UNCONFIRMED` authorship: **L3 / FR-162** - written by the parent-side finalizer from durable intents, not by the unit; Outputs, kill, crash and test rows updated.
3. Credentialed crafted requests in E14: **L2 / FR-161** - noted under Consumers.
4. Sweeper `revokeLease` and broker `leaseStatus`: both are defined operations in `credential-broker-contract.md` (FR-039, FR-052); no spec change needed.

## Open for closure

No item is open. The unsupported-browser reason and the precedence between `SEC_SESSION_GRANT_EXPIRED` and the F01 reason are decided in Consolidated repairs item 3.

## Consolidated repairs (authoritative; third repair pass, 2026-10-14)

Single normative section replacing the earlier "Analyze and adversarial repairs" and "Blocker repairs B-1..B-13" addenda: superseded items were deleted, not overridden; retained items keep their original review labels. Requirements: spec FR-161..FR-201. Nothing here claims runtime feasibility; T650 and the other feasibility gates stay open.

1. **Identity bound to the plan step (G-22, FR-041, FR-200)**: the jar lives in the child, but `SessionHost.send` decides nothing about authorization: the identity, role and action category come from the parent-held plan step, the parent runs `securityScopeGate` for every frame, and a `CREDENTIAL` slot value is accepted only if it is an exact-value-registered secret of that step's identity (another identity's secret is refused). Test `session.gate-identity-mismatch-refused` and `engine.frame.other-identity-secret-refused`.
2. **Attempt accounting (G-18)**: login and refresh attempts count in the identity's rolling window (FR-187); a rejected stored credential => `credentialSuspect`.
3. **Reason precedence**: when `SEC_SESSION_GRANT_EXPIRED` and an F01 `EXPIRED`/`REVOKED` reason both apply, the check records `SEC_SESSION_GRANT_EXPIRED` and the F01 string verbatim in the detail/audit payload. "Authenticated browser unsupported" uses `SEC_UNSUPPORTED_TARGET_TYPE` (confirmed).
4. **Parent-observed teardown (G-6, FR-175)**: the parent observes process exit itself and never accepts proof fields (`jarDisposed`, `childExited`) from the child.
5. **Restore (FR-179)**: a session/lease of an older `platformEpoch` is treated as destroyed-unconfirmed (`SESSION_UNCONFIRMED`).
6. Every login and refresh is preceded by `reserveAuthAttempt` (durable before the request) and followed by `resolveAuthAttempt` (FR-191); a failed reservation is `SEC_BUDGET_LOCAL_AUTH_ATTEMPTS`.
7. The session host and child never write to stdout/stderr (FR-194); teardown proof fields come from the parent's own observation, never the child.
