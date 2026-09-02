# Phases 4–7 Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close every open finding from
[2026-09-02-phases-4-7-engineering-review.md](2026-09-02-phases-4-7-engineering-review.md) except
Finding 2 (already fixed — the readiness certificate/email guard). Fourteen findings, fourteen
tasks, ordered Critical → High → Medium → Low.

**Architecture:** Each task is a small, targeted fix to the file(s) the review named — no
rewrites, no new abstractions beyond what a finding's fix genuinely requires. Three tasks touch
the Prisma schema (a migration each, additive columns only). No task changes an existing public
HTTP response shape except Task 5 (webhook failure now returns `500` instead of `200
{applied:false}` for a real application failure — a deliberate, documented behavior change, not an
accident).

**Tech Stack:** TypeScript 5.6, Prisma/PostgreSQL, Express, BullMQ, Next.js/React, Vitest +
Supertest, Zod.

**Spec:** [2026-09-02-phases-4-7-engineering-review.md](2026-09-02-phases-4-7-engineering-review.md)
(this plan implements its findings 1, 3–8, 10–16, 18) plus [CLAUDE.md](../../../CLAUDE.md)'s
non-negotiables, which each task cites where relevant.

## Global Constraints

- Money is always integer credits, never floats (CLAUDE.md, "Money in integer micros").
- Validate at every boundary with Zod — HTTP input, queue payloads (CLAUDE.md, "Validate at every
  boundary").
- Every scan-state transition is guarded on the state the caller expects — one conditional
  `updateMany`, never read-then-write (CLAUDE.md carried rule; Tasks 3 and 7 add new guarded writes
  and must follow it).
- `apps/worker` may depend on `@webaudit/api` in production only for generated artifacts, never for
  routes or Express wiring (established precedent; no task here changes this).
- `apps/api` may depend on `@webaudit/worker` in tests only, never in production code — a new
  producer (Task 7) is a raw BullMQ `Queue`, matching `scan-phase-producer.ts`/`reverify-producer.ts`.
- Every migration is additive (new nullable column or new table) — no task in this plan drops or
  renames an existing column.
- `pnpm test`, `pnpm test:adverse`, `pnpm lint`, and `pnpm -r typecheck` must stay green after every
  task. Re-run a suite alone before treating a failure as real (known DB-contamination gotcha under
  concurrent sessions, per PROGRESS.md).
- This plan was drafted without a live Postgres/Redis available for verification (same environment
  gap noted when Finding 2 was fixed) — every task's steps include the exact commands to run; running
  them and confirming green output is left to whoever executes this plan with real services up
  (`pnpm services:up && pnpm db:migrate`).

**Deliberately excluded from this plan** (see the review's own notes): **Finding 9**
(`moduleOutcomes` JSON-cast type safety) is a systemic pattern shared with `attempts.ts` elsewhere in
the codebase — fixing it project-wide is a separate, larger decision, not a targeted fix, and is left
as an open item. **Finding 17** (per-request memory ceiling not fleet-aware) is an operational/queue
capacity-planning note, not a code defect — no task fixes it.

---

### Task 1: Fix `owasp-checker`'s multi-cookie reverify bypass (Finding 1, Critical)

**Files:**
- Modify: `packages/capabilities-vendored/owasp-checker/src/index.ts`
- Test: `packages/capabilities-vendored/tests/unit/reverify.test.ts`
- Test: `packages/capabilities-vendored/owasp-checker/tests/unit/index.test.ts` (if this capability
  has its own unit suite for `runCodeLayer`/`cookieFindings`; if not, add the initial-detection case
  to `reverify.test.ts` alongside the reverify case)

**Interfaces:**
- Produces: a new internal `splitSetCookie(value: string): string[]` helper (not exported — used
  only within this file). No change to `owaspChecker`'s public shape (`canRun`/`runCodeLayer`/
  `reverify` signatures are unchanged).

- [ ] **Step 1: Write the failing tests**

Add to `packages/capabilities-vendored/tests/unit/reverify.test.ts`, inside the existing
`describe('owasp-checker.reverify', ...)` block:

```ts
  it('cookie-missing-secure FAILED when one of two cookies still lacks the flag', async () => {
    const r = await owaspChecker.reverify!(
      at('owasp.cookie-missing-secure'),
      ctxReturning(
        res({
          headers: {
            'set-cookie': 'sid=abc; Secure; HttpOnly, tracking=xyz; Path=/; Expires=Wed, 21 Oct 2026 07:28:00 GMT',
          },
        }),
      ),
    );
    expect(r.outcome).toBe('FAILED');
  });
  it('cookie-missing-secure PASSED only when every cookie carries Secure', async () => {
    const r = await owaspChecker.reverify!(
      at('owasp.cookie-missing-secure'),
      ctxReturning(
        res({
          headers: {
            'set-cookie': 'sid=abc; Secure; HttpOnly, tracking=xyz; Secure; Path=/; Expires=Wed, 21 Oct 2026 07:28:00 GMT',
          },
        }),
      ),
    );
    expect(r.outcome).toBe('PASSED');
  });
```

These two cases fix on the exact regression: a joined two-cookie header where the `Expires` comma
must not be mistaken for a cookie boundary, and where a substring match anywhere in the whole string
would wrongly report `PASSED` on the first case today.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter '@webaudit/capability-*' exec vitest run tests/unit/reverify.test.ts -t owasp`
(from `packages/capabilities-vendored/`)
Expected: the first new test fails — `owaspChecker.reverify` returns `PASSED` (the current substring
match finds `Secure` in the first cookie and stops looking), not `FAILED`.

- [ ] **Step 3: Implement `splitSetCookie` and use it in both detection and reverify**

In `packages/capabilities-vendored/owasp-checker/src/index.ts`, add the helper near the top (after
the existing constants) and rewrite `cookieFindings` and the reverify cookie branch to use it:

```ts
/**
 * Splits a Set-Cookie header value joined by safe-fetch's `headerRecord` back
 * into individual cookies. A naive `split(',')` breaks a single cookie's own
 * `Expires=Wed, 21 Oct ...` attribute apart, so this only splits on a comma
 * immediately followed by the start of a new `name=value` pair.
 */
function splitSetCookie(value: string): string[] {
  return value
    .split(/,(?=\s*[^;,=\s]+=)/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}
```

Replace `cookieFindings`'s body so each flag is checked per cookie, not against the whole joined
string:

```ts
function cookieFindings(setCookie: string, url: string): CapabilityFinding[] {
  const cookies = splitSetCookie(setCookie);
  const isHttps = new URL(url).protocol === 'https:';
  const findings: CapabilityFinding[] = [];

  if (isHttps && cookies.some((c) => !/;\s*secure\b/i.test(c))) {
    findings.push({
      checkId: 'owasp.cookie-missing-secure',
      fingerprintParts: ['secure'],
      severity: 'HIGH',
      title: 'A cookie is set without the Secure flag',
      description: 'At least one Set-Cookie entry does not carry a Secure attribute.',
      location: url,
      consequence:
        'A cookie without Secure can be sent over an unencrypted connection if one is ever ' +
        'attempted, exposing it to interception.',
      evidence: { setCookie },
      fixable: true,
    });
  }
  if (cookies.some((c) => !/;\s*httponly\b/i.test(c))) {
    findings.push({
      checkId: 'owasp.cookie-missing-httponly',
      fingerprintParts: ['httponly'],
      severity: 'MEDIUM',
      title: 'A cookie is set without the HttpOnly flag',
      description: 'At least one Set-Cookie entry does not carry an HttpOnly attribute.',
      location: url,
      consequence:
        'A cookie without HttpOnly is readable from JavaScript, so a cross-site scripting ' +
        'vulnerability elsewhere on the page can steal it.',
      evidence: { setCookie },
      fixable: true,
    });
  }
  if (cookies.some((c) => !/;\s*samesite\s*=/i.test(c))) {
    findings.push({
      checkId: 'owasp.cookie-missing-samesite',
      fingerprintParts: ['samesite'],
      severity: 'LOW',
      title: 'A cookie is set without a SameSite attribute',
      description: 'At least one Set-Cookie entry does not carry a SameSite attribute.',
      location: url,
      consequence:
        'Without SameSite, the cookie is sent on cross-site requests by default in older ' +
        'browsers, widening the surface for cross-site request forgery.',
      evidence: { setCookie },
      fixable: true,
    });
  }
  return findings;
}
```

Replace the reverify function's cookie branch (inside `reverify`, where `flagPattern` is resolved):

```ts
  const flagPattern = COOKIE_FLAG_PATTERNS[issue.checkId];
  if (flagPattern !== undefined) {
    const setCookie = response.headers['set-cookie'];
    if (setCookie === undefined) return { outcome: 'PASSED' }; // no cookie set any more
    const cookies = splitSetCookie(setCookie);
    const stillMissing = cookies.some((c) => !flagPattern.test(c));
    if (!stillMissing) return { outcome: 'PASSED' }; // every cookie now carries the flag
    return {
      outcome: 'FAILED',
      evidence: { url: response.url, setCookie, missingFlag: issue.checkId },
    };
  }
```

Update the file's top doc comment (lines 6–16) to drop the "coarser than per-cookie attribution"
claim, since it is no longer true:

```ts
 * **Cookie security flags** (OWASP A05:2021 Security Misconfiguration /
 * A07:2021 Identification and Authentication Failures). `SafeResponse.headers`
 * joins multiple `Set-Cookie` values into one comma-separated string
 * (`safe-fetch.ts`'s own `headerRecord`), and a naive split on `, ` breaks a
 * single cookie's own `Expires=Wed, 21 Oct ...` attribute apart. `splitSetCookie`
 * below splits only on a comma immediately followed by a new `name=value` pair,
 * so both the initial scan and `reverify` check every cookie individually: a
 * finding fires if *any* cookie is missing a flag, and `reverify` reports
 * PASSED only once *every* cookie carries it — matching what a fix actually
 * requires (2026-09-02 engineering review, Finding 1: the previous whole-string
 * substring match could report a still-vulnerable multi-cookie site as fixed).
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter '@webaudit/capability-*' exec vitest run tests/unit/reverify.test.ts -t owasp`
Expected: all `owasp-checker.reverify` cases pass, including the two new ones and the pre-existing
`cookie-missing-httponly FAILED when the flag is still missing` and
`cookie-missing-secure PASSED when no cookie is set now` cases (unchanged behavior for the
single-cookie and no-cookie shapes).

Also run the capability's own contract/conformance suite to confirm the initial-detection change
(now flagging on *any* missing cookie, not only when *all* are missing) doesn't break an existing
fixture expectation:

Run: `pnpm --filter '@webaudit/capability-owasp-checker' exec vitest run` (or the monorepo-wide
`pnpm --filter '@webaudit/capabilities-vendored' test` if capabilities share one test project)
Expected: all tests pass. If an existing test asserted the old coarse behavior (no finding when only
some cookies lack a flag), update that assertion to the corrected expectation — the old assertion
encoded the bug this task fixes.

- [ ] **Step 5: Commit**

```bash
git add packages/capabilities-vendored/owasp-checker/src/index.ts packages/capabilities-vendored/tests/unit/reverify.test.ts
git commit -m "fix(owasp-checker): check every cookie individually, not the whole joined header

Splits Set-Cookie on cookie boundaries (not the Expires comma) so a
finding fires when any cookie lacks a flag and reverify only reports
PASSED once every cookie carries it. Closes a bypass where a
still-vulnerable multi-cookie site could be marked fixed (SC-007)."
```

---

### Task 2: Strip credentials on a cross-origin redirect in `safe-net` (Finding 3, High)

**Files:**
- Modify: `packages/safe-net/src/safe-fetch.ts`
- Modify: `packages/safe-net/src/index.ts`
- Modify: `packages/safe-net/tests/helpers/http-fixture.ts`
- Test: `packages/safe-net/tests/adverse/ssrf.redirect.test.ts`

**Interfaces:**
- Consumes: `validateUrl`'s existing per-hop `target.hostname` (already computed in the redirect
  loop).
- Produces: `SafeFetchInit.allowedRedirectHosts?: readonly string[]` (new, optional field on the
  public options type `safeFetch` already accepts) and the same field on `GuardedFetchOptions`
  (inherited). `RecordedRequest.headers: Readonly<Record<string, string | string[] | undefined>>`
  (new field on the existing test-helper type — additive, does not break any current test that
  destructures `{ method, url, host }`).

- [ ] **Step 1: Extend the test fixture to record headers**

In `packages/safe-net/tests/helpers/http-fixture.ts`, add `headers` to `RecordedRequest` and record
it:

```ts
export interface RecordedRequest {
  readonly method: string;
  readonly url: string;
  readonly host: string | undefined;
  readonly headers: Readonly<Record<string, string | string[] | undefined>>;
}
```

```ts
    requests.push({
      method: req.method ?? '',
      url: req.url ?? '',
      host: req.headers.host,
      headers: req.headers,
    });
```

- [ ] **Step 2: Write the failing test**

Add to `packages/safe-net/tests/adverse/ssrf.redirect.test.ts`:

```ts
  it('drops the Authorization header on a redirect to a different origin', async () => {
    const dest = await fixture(ok('DEST'));
    const first = await fixture(redirectTo(`${dest.origin}/end`));

    await guardedFetch(`${first.origin}/start`, {
      policy: HOPS_ON_LOOPBACK,
      headers: { authorization: 'Bearer secret-token' },
    });

    expect(first.requests[0]?.headers['authorization']).toBe('Bearer secret-token');
    expect(dest.requests[0]?.headers['authorization']).toBeUndefined();
  });

  it('keeps the Authorization header when allowedRedirectHosts names the destination', async () => {
    const dest = await fixture(ok('DEST'));
    const first = await fixture(redirectTo(`${dest.origin}/end`));
    const destHost = new URL(dest.origin).hostname;

    await guardedFetch(`${first.origin}/start`, {
      policy: HOPS_ON_LOOPBACK,
      headers: { authorization: 'Bearer secret-token' },
      allowedRedirectHosts: [destHost],
    });

    expect(dest.requests[0]?.headers['authorization']).toBe('Bearer secret-token');
  });
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm --filter @webaudit/safe-net exec vitest run tests/adverse/ssrf.redirect.test.ts -t Authorization`
Expected: both new tests fail — the first because `dest.requests[0].headers['authorization']` is
currently the forwarded secret, not `undefined`; the second passes today (there's no stripping yet)
but must keep passing once stripping exists.

- [ ] **Step 4: Implement header scoping on redirect**

In `packages/safe-net/src/safe-fetch.ts`, add the option and a small helper, then use it in the loop:

```ts
export interface SafeFetchInit {
  readonly method?: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly body?: string | Uint8Array;
  readonly signal?: AbortSignal;
  readonly maxRedirects?: number;
  readonly timeoutMs?: number;
  readonly maxResponseBytes?: number;
  /**
   * Hostnames a sensitive header (Authorization, Cookie, Proxy-Authorization)
   * may still be sent to after a cross-origin redirect. Same-origin hops
   * always keep their headers; this only widens what counts as "same enough"
   * for a caller that knows its own redirect chain (e.g. GitHub's API
   * redirecting to its CDN host).
   */
  readonly allowedRedirectHosts?: readonly string[];
}
```

```ts
const SENSITIVE_HEADERS = new Set(['authorization', 'cookie', 'proxy-authorization']);

/**
 * Hop 0 always gets every header — it's the caller's own request. After a
 * redirect, a sensitive header only survives to a hop whose full `host`
 * (hostname *and* port) matches the previous hop — a same-origin redirect —
 * or whose bare hostname is explicitly allowlisted; every other header
 * passes through unchanged. `host`, not `hostname`, is what decides "same
 * enough": two different ports on the same loopback address are different
 * origins for this purpose (and are how the adverse suite can actually
 * construct a "different destination" without a second real hostname).
 * `allowedRedirectHosts` matches on the bare hostname, since a caller
 * naming an allowed destination (e.g. GitHub's own CDN host) does not
 * usually know or care which port fronts it.
 */
function headersForHop(
  headers: Readonly<Record<string, string>> | undefined,
  hop: number,
  hostname: string,
  host: string,
  previousHost: string | undefined,
  allowedRedirectHosts: readonly string[] | undefined,
): Record<string, string> | undefined {
  if (headers === undefined) return undefined;
  if (hop === 0 || host === previousHost || (allowedRedirectHosts?.includes(hostname) ?? false)) {
    return { ...headers };
  }
  const scoped: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (!SENSITIVE_HEADERS.has(key.toLowerCase())) scoped[key] = value;
  }
  return scoped;
}
```

In `guardedFetch`, track the previous hop's full host and use `headersForHop` instead of forwarding
`options.headers` unconditionally:

```ts
  const redirects: string[] = [];
  let currentUrl = url;
  let method = (options.method ?? 'GET').toUpperCase();
  let body = options.body;
  let previousHost: string | undefined;

  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    const target = validateUrl(currentUrl, policy, hop);
    redirects.push(target.url.href);
    const hopHeaders = headersForHop(
      options.headers,
      hop,
      target.hostname,
      target.url.host,
      previousHost,
      options.allowedRedirectHosts,
    );
    previousHost = target.url.host;
```

...and change the `request()` call's header spread from `options.headers` to `hopHeaders`:

```ts
      const response = await request(target.url, {
        dispatcher,
        method,
        signal,
        ...(hopHeaders === undefined ? {} : { headers: hopHeaders }),
        ...(body === undefined || method === 'GET' || method === 'HEAD' ? {} : { body }),
      });
```

In `packages/safe-net/src/index.ts`, add `allowedRedirectHosts` to the explicit field-by-field copy
in `safeFetch` (the comment there already explains why every field must be named individually):

```ts
    ...(init.maxResponseBytes === undefined ? {} : { maxResponseBytes: init.maxResponseBytes }),
    ...(init.allowedRedirectHosts === undefined ? {} : { allowedRedirectHosts: init.allowedRedirectHosts }),
    ...(policy === undefined ? {} : { policy }),
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @webaudit/safe-net exec vitest run`
Expected: all tests pass, including the full pre-existing `ssrf.redirect.test.ts` suite. Its first
test (`'follows an allowed chain...'`) passes no `headers` option at all, so `headersForHop` returns
`undefined` at every hop regardless of host-matching — unaffected by this change. The two new tests
are the only ones in the file that exercise the header-scoping logic itself.

- [ ] **Step 6: Wire the fix into the actual caller — `repo-clone.ts`**

In `apps/worker/src/intake/repo-clone.ts`, where the GitHub zipball is fetched with the bearer
token (around the `authorization: \`Bearer ${options.token}\`` line), add the allowlist so the real
GitHub API → CDN redirect keeps working exactly as before, while any other redirect target now has
the token stripped:

```ts
  const response = await fetchImpl(zipballUrl, {
    headers: { authorization: `Bearer ${options.token}` },
    allowedRedirectHosts: ['api.github.com', 'codeload.github.com'],
    ...
  });
```

(Match this into whatever the existing call's option object already contains — do not remove any
existing field.)

- [ ] **Step 7: Run the worker's repo-clone tests**

Run: `pnpm --filter @webaudit/worker exec vitest run tests -t repo-clone`
Expected: unchanged, all green — this step doesn't change repo-clone's behavior against GitHub's
real redirect chain, only closes the gap for any other destination.

- [ ] **Step 8: Commit**

```bash
git add packages/safe-net/src/safe-fetch.ts packages/safe-net/src/index.ts packages/safe-net/tests/helpers/http-fixture.ts packages/safe-net/tests/adverse/ssrf.redirect.test.ts apps/worker/src/intake/repo-clone.ts
git commit -m "fix(safe-net): stop forwarding Authorization/Cookie across a cross-origin redirect

A credential header now only survives a redirect hop that stays on the
same host, or one explicitly named in allowedRedirectHosts. repo-clone.ts
opts the real GitHub API -> CDN hop back in; every other destination no
longer receives the bearer token by accident."
```

---

### Task 3: Enforce the FR-079 concurrent-scan limit (Finding 4, High)

**Files:**
- Modify: `apps/api/src/services/intake/create-scan.ts`
- Modify: `apps/api/src/routes/scans.routes.ts`
- Test: `apps/api/tests/contract/entitlements.test.ts` (or a new
  `apps/api/tests/contract/concurrency-limit.test.ts` if that file is scoped to a different route)

**Interfaces:**
- Consumes: `assertConcurrencyHeadroom(db, userId): Promise<EffectivePlan>` and
  `EntitlementError` (both already exported from `apps/api/src/services/billing/entitlements.js`,
  unchanged).
- Produces: no new exports — `createScan` now throws `EntitlementError` (feature `'CONCURRENCY'`)
  as one more of its existing thrown-error cases; `scans.routes.ts` gains one new `catch` branch.

- [ ] **Step 1: Write the failing test**

Add to `apps/api/tests/contract/entitlements.test.ts`, reusing this file's own `makeUser()` helper
(a free-tier user — `concurrentScanLimit: 1` per `packages/config/src/plans.ts`, so no subscription
setup is needed) and its inline `testDb.target.create` pattern. **Use two different targets**, not
one: `create-scan.ts` refuses a second scan on the *same* target with FR-018's own
`409 DUPLICATE_SCAN` before the new concurrency check ever runs, so a same-target retry would test
the wrong guard and pass for the wrong reason.

```ts
  it('refuses a second concurrent scan on a different target once the plan limit is reached', async () => {
    const userId = await makeUser();
    const res = await request(app).post('/auth/login').send(CREDS).expect(200);
    const token = (res.body as { accessToken: string }).accessToken;
    const auth = { Authorization: `Bearer ${token}` };

    const targetA = await testDb.target.create({
      data: { userId, inputType: 'URL', canonicalValue: 'https://concurrency-a.example.com', displayName: 'a' },
    });
    const targetB = await testDb.target.create({
      data: { userId, inputType: 'URL', canonicalValue: 'https://concurrency-b.example.com', displayName: 'b' },
    });
    const quote = (
      await request(app).post('/scans/quote').set(auth).send({ targetId: targetA.id, modules: ['SECURITY'] })
    ).body as { quote: { credits: number } };

    await request(app)
      .post('/scans')
      .set(auth)
      .send({ targetId: targetA.id, modules: ['SECURITY'], acceptedQuote: quote.quote.credits })
      .expect(201);

    const before = await testDb.creditTransaction.count({ where: { userId, type: 'DEBIT' } });

    const second = await request(app)
      .post('/scans')
      .set(auth)
      .send({ targetId: targetB.id, modules: ['SECURITY'], acceptedQuote: quote.quote.credits })
      .expect(403);
    expect((second.body as { error: { code: string } }).error.code).toBe('CONCURRENT_LIMIT_REACHED');

    const after = await testDb.creditTransaction.count({ where: { userId, type: 'DEBIT' } });
    expect(after).toBe(before);
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @webaudit/api exec vitest run tests/contract/entitlements.test.ts -t "concurrent scan"`
Expected: the second `POST /scans` returns `201`, not `403` — nothing enforces the limit yet.

- [ ] **Step 3: Call `assertConcurrencyHeadroom` in `createScan`**

In `apps/api/src/services/intake/create-scan.ts`, right after the existing FR-016 input-type block
(after the `if (!plan.allowedInputTypes.includes(...))` block closes, before the T171 repository
check), add:

```ts
  // FR-079: refuse before any debit once the plan's concurrent-scan limit is
  // already reached. `assertConcurrencyHeadroom` re-resolves the effective
  // plan itself (a fresh, small query) rather than reusing the narrower
  // `plan` shape fetched above, which only selected the fields FR-016 needs.
  await assertConcurrencyHeadroom(db, input.userId);
```

Add the import at the top of the file:

```ts
import { assertConcurrencyHeadroom } from '../billing/entitlements.js';
```

- [ ] **Step 4: Catch `EntitlementError` in the route**

In `apps/api/src/routes/scans.routes.ts`, add the import and a new `catch` branch in the `POST /`
handler, placed after the existing `PlanUpgradeRequiredError` branch (same `403` family, distinct
code):

```ts
import { EntitlementError } from '../services/billing/entitlements.js';
```

```ts
      if (error instanceof EntitlementError) {
        res.status(403).json({
          error: {
            code: error.feature === 'CONCURRENCY' ? 'CONCURRENT_LIMIT_REACHED' : 'PLAN_UPGRADE_REQUIRED',
            message: error.message,
            details: { feature: error.feature, current: error.currentTier, requiredTier: error.requiredTier },
          },
        });
        return;
      }
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @webaudit/api exec vitest run tests/contract/entitlements.test.ts`
Expected: the new test passes; every pre-existing test in the file still passes (this adds one more
query per scan creation, no behavior change for a user under their limit).

- [ ] **Step 6: Run the wider scan-creation suite for regressions**

Run: `pnpm --filter @webaudit/api exec vitest run tests/contract/scans.* tests/integration/*scan*`
Expected: all green — no existing test creates more concurrent scans than any seeded plan's
`concurrentScanLimit` permits (if one does, that test's fixture needs a higher-tier plan or a
terminal scan between creates, not a change to this fix).

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/services/intake/create-scan.ts apps/api/src/routes/scans.routes.ts apps/api/tests/contract/entitlements.test.ts
git commit -m "fix(billing): enforce FR-079's concurrent-scan limit on scan creation

assertConcurrencyHeadroom existed but nothing called it. A user at
their plan's concurrent-audit limit is now refused 403
CONCURRENT_LIMIT_REACHED before any debit, matching the entitlement
middleware's already-tested response shape."
```

---

### Task 4: Deduplicate the "cheapest permitting tier" query (Finding 5, High)

**Files:**
- Modify: `apps/api/src/services/billing/entitlements.ts`
- Modify: `apps/api/src/services/intake/create-scan.ts`
- Modify: `apps/api/src/services/readiness/create.ts`
- Test: `apps/api/tests/unit/entitlements.test.ts` (new, or add to the existing contract test file
  if this repo keeps pure-function tests alongside route tests for this service)

**Interfaces:**
- Produces: `cheapestActiveTierId(db: PrismaClient, where: Prisma.PlanWhereInput): Promise<string |
  null>`, exported from `entitlements.ts`.
- Consumes (unchanged): `PlanUpgradeRequiredError`, `ReadinessNotOnPlanError` — their constructors,
  fields, and the routes' response shapes for them are untouched by this task. Only the *query* that
  computes their `requiredTier` argument moves into the shared helper.

This is a DRY fix, not a behavior change: `create-scan.ts` and `readiness/create.ts` each currently
hand-roll an identical `db.plan.findMany({ where: {...}, orderBy: { monthlyCredits: 'asc' }, select:
{ id: true } })` query to find the cheapest active tier permitting a feature. A third, differently-
scoped version of the same idea already exists in `entitlements.ts` (`permittingTierFor`), but it
reads the static `PLAN_TIERS` config rather than the live `Plan` table's `isActive` flag — so it
cannot be reused as-is without silently recommending a deactivated plan. The fix is a new DB-backed
helper both real call sites can share, leaving `permittingTierFor` (and its callers) untouched.

- [ ] **Step 1: Write the failing test**

Create `apps/api/tests/unit/entitlements.test.ts`:

```ts
import { describe, expect, it, beforeEach } from 'vitest';
import { closeDb, resetDb, testDb } from '../helpers/db.js';
import { cheapestActiveTierId } from '../../src/services/billing/entitlements.js';

beforeEach(resetDb);

describe('cheapestActiveTierId', () => {
  it('returns the cheapest active plan matching the where clause', async () => {
    await testDb.plan.createMany({
      data: [
        { id: 'free', name: 'Free', monthlyCredits: 0, creditsRecur: false, isActive: true, allowedInputTypes: ['URL'], allowLoadGeneration: false, allowReadinessPass: false, allowCreditPurchase: false, allowCustomCapability: false, concurrentScanLimit: 1, queuePriority: 0, retentionDays: 7 },
        { id: 'starter', name: 'Starter', monthlyCredits: 500, creditsRecur: true, isActive: true, allowedInputTypes: ['URL', 'ARCHIVE'], allowLoadGeneration: false, allowReadinessPass: false, allowCreditPurchase: true, allowCustomCapability: false, concurrentScanLimit: 1, queuePriority: 1, retentionDays: 30 },
        { id: 'pro', name: 'Pro', monthlyCredits: 2000, creditsRecur: true, isActive: true, allowedInputTypes: ['URL', 'ARCHIVE', 'REPOSITORY'], allowLoadGeneration: true, allowReadinessPass: true, allowCreditPurchase: true, allowCustomCapability: false, concurrentScanLimit: 3, queuePriority: 2, retentionDays: 90 },
      ],
    });
    const id = await cheapestActiveTierId(testDb, { allowedInputTypes: { has: 'ARCHIVE' } });
    expect(id).toBe('starter');
  });

  it('ignores a deactivated plan even if it would otherwise be cheapest', async () => {
    await testDb.plan.createMany({
      data: [
        { id: 'starter', name: 'Starter', monthlyCredits: 500, creditsRecur: true, isActive: false, allowedInputTypes: ['ARCHIVE'], allowLoadGeneration: false, allowReadinessPass: false, allowCreditPurchase: true, allowCustomCapability: false, concurrentScanLimit: 1, queuePriority: 1, retentionDays: 30 },
        { id: 'pro', name: 'Pro', monthlyCredits: 2000, creditsRecur: true, isActive: true, allowedInputTypes: ['ARCHIVE'], allowLoadGeneration: true, allowReadinessPass: true, allowCreditPurchase: true, allowCustomCapability: false, concurrentScanLimit: 3, queuePriority: 2, retentionDays: 90 },
      ],
    });
    const id = await cheapestActiveTierId(testDb, { allowedInputTypes: { has: 'ARCHIVE' } });
    expect(id).toBe('pro');
  });

  it('returns null when no active plan matches', async () => {
    const id = await cheapestActiveTierId(testDb, { allowReadinessPass: true });
    expect(id).toBeNull();
  });
});
```

(Adjust the `Plan.create` field list if the schema has additional required columns — check
`schema.prisma`'s `model Plan` before running; the test above lists every field visible in
`entitlements.ts`'s own `EffectivePlan` interface.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @webaudit/api exec vitest run tests/unit/entitlements.test.ts`
Expected: fails with "cheapestActiveTierId is not a function" — it doesn't exist yet.

- [ ] **Step 3: Implement the shared helper**

In `apps/api/src/services/billing/entitlements.ts`, add (needs `Prisma` imported from the generated
client for the `where` type):

```ts
import type { Prisma, PrismaClient } from '../../../prisma/generated/client/index.js';
```

```ts
/**
 * The cheapest currently-active plan matching `where`, or null if none do.
 * Shared by every "requires the X plan or higher" refusal so there is exactly
 * one place that decides what "cheapest" and "active" mean — `create-scan.ts`
 * and `readiness/create.ts` used to each write this query by hand (2026-09-02
 * engineering review, Finding 5).
 */
export async function cheapestActiveTierId(
  db: PrismaClient,
  where: Prisma.PlanWhereInput,
): Promise<string | null> {
  const permitting = await db.plan.findMany({
    where: { ...where, isActive: true },
    orderBy: { monthlyCredits: 'asc' },
    select: { id: true },
    take: 1,
  });
  return permitting[0]?.id ?? null;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @webaudit/api exec vitest run tests/unit/entitlements.test.ts`
Expected: all three cases pass.

- [ ] **Step 5: Call it from `create-scan.ts` and `readiness/create.ts`**

In `apps/api/src/services/intake/create-scan.ts`, replace:

```ts
  if (!plan.allowedInputTypes.includes(target.inputType)) {
    const permitting = await db.plan.findMany({
      where: { isActive: true, allowedInputTypes: { has: target.inputType } },
      orderBy: { monthlyCredits: 'asc' },
      select: { id: true },
    });
    throw new PlanUpgradeRequiredError(target.inputType, permitting[0]?.id ?? null);
  }
```

with:

```ts
  if (!plan.allowedInputTypes.includes(target.inputType)) {
    const requiredTier = await cheapestActiveTierId(db, { allowedInputTypes: { has: target.inputType } });
    throw new PlanUpgradeRequiredError(target.inputType, requiredTier);
  }
```

and add the import:

```ts
import { cheapestActiveTierId } from '../billing/entitlements.js';
```

In `apps/api/src/services/readiness/create.ts`, replace:

```ts
  if (!plan.allowReadinessPass) {
    const permitting = await db.plan.findMany({
      where: { isActive: true, allowReadinessPass: true },
      orderBy: { monthlyCredits: 'asc' },
      select: { id: true },
    });
    throw new ReadinessNotOnPlanError(permitting[0]?.id ?? null);
  }
```

with:

```ts
  if (!plan.allowReadinessPass) {
    const requiredTier = await cheapestActiveTierId(db, { allowReadinessPass: true });
    throw new ReadinessNotOnPlanError(requiredTier);
  }
```

and the matching import.

- [ ] **Step 6: Run both services' existing test suites for regressions**

Run: `pnpm --filter @webaudit/api exec vitest run tests -t "PLAN_UPGRADE_REQUIRED" && pnpm --filter @webaudit/api exec vitest run tests/contract/readiness.premature.test.ts`
Expected: unchanged — same status codes, same `requiredTier` values, since the query logic is
identical, just deduplicated.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/services/billing/entitlements.ts apps/api/src/services/intake/create-scan.ts apps/api/src/services/readiness/create.ts apps/api/tests/unit/entitlements.test.ts
git commit -m "refactor(billing): share the 'cheapest active tier' query via cheapestActiveTierId

create-scan.ts and readiness/create.ts each hand-rolled the same
findMany query for their PLAN_UPGRADE_REQUIRED / ReadinessNotOnPlan
error's requiredTier. No behavior change — same query, one place."
```

---

### Task 5: Make the billing webhook safely retryable on a transient failure (Finding 6, High)

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/20260902140000_billing_event_applied_at/migration.sql`
- Modify: `apps/api/src/routes/webhooks.routes.ts`
- Modify: `apps/api/tests/contract/billing-webhook.test.ts`

**Interfaces:**
- Produces: `BillingEvent.appliedAt: DateTime | null` (new nullable column). No change to any
  exported function signature.
- Behavior change (documented): an effect-application failure now responds `500` (was `200
  {applied:false}`), so the provider retries. The idempotency check now distinguishes "received" from
  "applied" — a retry of an event that was received but never applied re-attempts the effect instead
  of silently no-op'ing.

- [ ] **Step 1: Add the migration**

In `apps/api/prisma/schema.prisma`, in `model BillingEvent`, add:

```prisma
model BillingEvent {
  /// The provider's event id, verbatim. Not a cuid.
  id         String   @id
  type       String
  receivedAt DateTime @default(now())
  /// Set only once the event's effect (subscribe/renew/purchase/...) has
  /// actually applied. Null means "received but not yet applied" — a retry
  /// of such an event re-attempts the effect rather than treating the row's
  /// mere existence as "handled" (2026-09-02 review, Finding 6).
  appliedAt  DateTime?
  /// The verified payload, for an operator reconciling a disputed charge.
  payload    Json?

  @@index([type, receivedAt])
}
```

Create `apps/api/prisma/migrations/20260902140000_billing_event_applied_at/migration.sql`:

```sql
-- Fixes a real bug (Phase 7 engineering review, 2026-09-02, Finding 6): the
-- webhook's idempotency INSERT and its effect application were two separate
-- steps, and a transient failure in the second step got permanently and
-- silently swallowed by the first, because "the row exists" was treated as
-- "handled" on every subsequent retry from the provider.
--
-- appliedAt distinguishes "received" from "applied": a retry of a
-- received-but-not-applied event now re-attempts the effect.
ALTER TABLE "BillingEvent" ADD COLUMN "appliedAt" TIMESTAMP(3);
```

Run: `pnpm run db:generate`
Expected: Prisma client regenerates cleanly with the new field on `BillingEvent`.

- [ ] **Step 2: Write the failing tests**

Add to `apps/api/tests/contract/billing-webhook.test.ts`:

```ts
  it('retries the effect on a re-delivery when the first attempt never applied it', async () => {
    const userId = await makeUser('wh4@example.com');
    await testDb.subscription.create({
      data: { userId, planId: 'pro', status: 'ACTIVE', periodStart: new Date(), periodEnd: new Date(Date.now() + 30 * 86_400_000) },
    });
    // Simulate a prior attempt that inserted the event row but crashed before
    // the effect ran: appliedAt is null, no credits were granted.
    await testDb.billingEvent.create({ data: { id: 'evt_retry_1', type: 'credits.purchased' } });

    const { raw, sig } = sign({ id: 'evt_retry_1', type: 'credits.purchased', data: { userId, credits: 500 } });
    const res = await request(app)
      .post('/webhooks/billing')
      .set('content-type', 'application/json')
      .set('x-webhook-signature', sig)
      .send(raw)
      .expect(200);
    expect((res.body as { applied: boolean }).applied).toBe(true);
    expect((await balanceOf(testDb, userId)).purchased).toBe(500);
  });

  it('responds 500 (not 200) when the effect throws, so the provider retries', async () => {
    // No such user id -> subscribe() throws.
    const { raw, sig } = sign({ id: 'evt_fail_1', type: 'subscription.activated', data: { userId: 'does-not-exist', planId: 'pro' } });
    await request(app)
      .post('/webhooks/billing')
      .set('content-type', 'application/json')
      .set('x-webhook-signature', sig)
      .send(raw)
      .expect(500);

    const event = await testDb.billingEvent.findUniqueOrThrow({ where: { id: 'evt_fail_1' } });
    expect(event.appliedAt).toBeNull();
  });
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm --filter @webaudit/api exec vitest run tests/contract/billing-webhook.test.ts -t retries`
Expected: the first new test fails (the existing P2002-duplicate branch returns `200
{duplicate:true}` immediately, without ever running `purchaseCredits`, so the balance stays 0). The
second fails because today's handler returns `200 {applied:false}`, not `500`.

- [ ] **Step 4: Rework the idempotency + apply logic**

In `apps/api/src/routes/webhooks.routes.ts`, replace the idempotency-claim block and the effect
`try`/`catch`:

```ts
      // Idempotency: a row that already exists AND was already applied is a
      // genuine duplicate delivery — no-op. A row that exists but was never
      // applied (a prior attempt's effect failed) is retried below rather
      // than treated as handled.
      try {
        await db.billingEvent.create({
          data: { id: event.id, type: event.type, payload: parsedBody as Prisma.InputJsonValue },
        });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          const existing = await db.billingEvent.findUniqueOrThrow({ where: { id: event.id } });
          if (existing.appliedAt !== null) {
            res.status(200).json({ received: true, duplicate: true });
            return;
          }
          // Fall through: received but never applied, retry the effect now.
        } else {
          throw error;
        }
      }

      const { userId, planId, credits, external } = event.data;
      try {
        switch (event.type) {
          case 'subscription.activated':
          case 'subscription.created':
            if (userId && planId) await subscribe(db, { userId, planId, ...(external ? { external } : {}) });
            break;
          case 'subscription.renewed':
          case 'invoice.paid':
            if (userId) await renewSubscription(db, { userId });
            break;
          case 'subscription.updated':
            if (userId && planId) await changePlan(db, { userId, planId });
            break;
          case 'subscription.canceled':
            if (userId) await cancelSubscription(db, { userId });
            break;
          case 'subscription.expired':
            if (userId) await renewSubscription(db, { userId });
            break;
          case 'credits.purchased':
            if (userId && credits) await purchaseCredits(db, { userId, credits });
            break;
          default:
            // Acknowledged, ignored — still counts as applied.
            break;
        }
        await db.billingEvent.update({ where: { id: event.id }, data: { appliedAt: new Date() } });
      } catch (error) {
        // Unlike before: this is a 500, not a 200. The row exists with
        // appliedAt still null, so the provider's retry re-enters this same
        // branch and tries the effect again — safe, because every effect
        // function here is itself idempotent per its own event id / target
        // state (subscribe/renew/purchase all key off userId + plan/credits,
        // not off this event row).
        console.error(`[webhook] ${event.type} (${event.id}) failed to apply:`, error);
        res.status(500).json({ error: { code: 'WEBHOOK_APPLY_FAILED', message: 'Failed to apply webhook effect.' } });
        return;
      }

      res.status(200).json({ received: true, applied: true });
```

This removes the old single `try { await db.billingEvent.create(...) } catch { ... duplicate ... }`
block and the old effect `try`/`catch` that ended in `200 {applied:false}` — replace both in one
edit, keeping everything above them (signature verification, payload parsing) unchanged.

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @webaudit/api exec vitest run tests/contract/billing-webhook.test.ts`
Expected: all tests pass, including the pre-existing idempotency test (a *fully applied* duplicate
still short-circuits to `200 {duplicate:true}` without re-granting credits) and the two new ones.

- [ ] **Step 6: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations/20260902140000_billing_event_applied_at apps/api/src/routes/webhooks.routes.ts apps/api/tests/contract/billing-webhook.test.ts
git commit -m "fix(billing): retry a webhook effect that failed instead of silently dropping it

BillingEvent.appliedAt now distinguishes 'received' from 'applied'. A
transient failure applying subscribe/renew/purchase responds 500 (was
200 applied:false) so the provider retries, and the retry re-attempts
the effect instead of being swallowed as a false duplicate."
```

---

### Task 6: Batch the Fixes board's failing-evidence lookup (Finding 7, Medium)

**Files:**
- Modify: `apps/api/src/services/issues/attempts.ts`
- Modify: `apps/api/src/routes/issues.routes.ts`
- Modify: `apps/web/lib/api.ts`
- Modify: `apps/web/app/(dashboard)/fixes/page.tsx`
- Test: `apps/api/tests/integration/attempts-batch.test.ts` (new)

**Interfaces:**
- Produces: `listFailingEvidenceForScan(db: PrismaClient, scanId: string): Promise<Record<string,
  unknown>>` (new export from `attempts.ts`); `GET /scans/:id/issues/failing-evidence` (new route);
  `getFailingEvidence(scanId: string): Promise<{ evidence: Record<string, unknown> }>` (new export
  from `apps/web/lib/api.ts`).
- Consumes: nothing new — reuses the existing `VerificationAttempt` model and the existing scan
  ownership check pattern already used by `GET /issues/:id/attempts`.

- [ ] **Step 1: Write the failing test**

Create `apps/api/tests/integration/attempts-batch.test.ts` (follow this repo's existing helper
imports — `testDb`, `resetDb` — and whatever fixture helper the neighboring `recurrence.test.ts` or
`verification.test.ts` uses to seed a scan with issues and attempts, rather than reinventing one):

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { resetDb, testDb } from '../helpers/db.js';
import { listFailingEvidenceForScan } from '../../src/services/issues/attempts.js';

beforeEach(resetDb);

describe('listFailingEvidenceForScan', () => {
  it('returns the last FAILED attempt per issue, in one query', async () => {
    const user = await testDb.user.create({ data: { email: 'batch@example.com', emailVerifiedAt: new Date() } });
    const target = await testDb.target.create({ data: { userId: user.id, inputType: 'URL', canonicalValue: 'https://batch.example.com', displayName: 'batch' } });
    const scan = await testDb.scan.create({ data: { userId: user.id, targetId: target.id, kind: 'INITIAL', requestedModules: ['SECURITY'], capabilitySnapshot: {}, quotedCredits: 10, chargedCredits: 10, state: 'COMPLETED' } });
    const mr = await testDb.moduleResult.create({ data: { scanId: scan.id, module: 'SECURITY', state: 'COMPLETE', score: 50 } });
    const issue = await testDb.issue.create({ data: { scanId: scan.id, moduleResultId: mr.id, fingerprint: 'fp-1', checkId: 'headers.csp-missing', severity: 'HIGH', title: 't', explanation: 'e', consequence: 'c', attribution: 'MEASURED', fixPrompt: 'f', state: 'ASSERTED_FIXED' } });
    await testDb.verificationAttempt.create({ data: { issueId: issue.id, outcome: 'FAILED', evidence: { first: true }, creditsCharged: 3, durationMs: 10 } });
    await testDb.verificationAttempt.create({ data: { issueId: issue.id, outcome: 'FAILED', evidence: { second: true }, creditsCharged: 3, durationMs: 10 } });

    const evidence = await listFailingEvidenceForScan(testDb, scan.id);
    expect(evidence[issue.id]).toEqual({ second: true }); // the most recent FAILED wins
  });

  it('omits an issue with no FAILED attempt', async () => {
    const evidence = await listFailingEvidenceForScan(testDb, 'no-such-scan');
    expect(evidence).toEqual({});
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @webaudit/api exec vitest run tests/integration/attempts-batch.test.ts`
Expected: fails — `listFailingEvidenceForScan` doesn't exist yet.

- [ ] **Step 3: Implement the batched query**

In `apps/api/src/services/issues/attempts.ts`, add (near `listVerificationAttempts`):

```ts
/**
 * The last FAILED attempt's evidence per issue in one scan, in a single
 * query — the batched counterpart to `listVerificationAttempts`, for a
 * caller (the Fixes board) that previously issued one request per issue
 * (2026-09-02 review, Finding 7).
 */
export async function listFailingEvidenceForScan(
  db: PrismaClient,
  scanId: string,
): Promise<Record<string, unknown>> {
  const attempts = await db.verificationAttempt.findMany({
    where: { outcome: 'FAILED', issue: { scanId } },
    orderBy: { createdAt: 'asc' },
    select: { issueId: true, evidence: true },
  });
  const out: Record<string, unknown> = {};
  for (const attempt of attempts) out[attempt.issueId] = attempt.evidence;
  return out;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @webaudit/api exec vitest run tests/integration/attempts-batch.test.ts`
Expected: both cases pass.

- [ ] **Step 5: Add the route**

In `apps/api/src/routes/issues.routes.ts`, import the new function and add a route (placed before
`GET /issues/:id/attempts` since it has a different path shape and ownership check):

```ts
import { listVerificationAttempts, listFailingEvidenceForScan } from '../services/issues/attempts.js';
```

```ts
  router.get('/scans/:id/issues/failing-evidence', async (req: AuthedRequest, res: Response) => {
    const userId = req.auth!.userId;
    const scan = await db.scan.findFirst({ where: { id: pathId(req), userId }, select: { id: true } });
    if (scan === null) {
      res.status(404).json(NOT_FOUND);
      return;
    }
    const evidence = await listFailingEvidenceForScan(db, scan.id);
    res.status(200).json({ evidence });
  });
```

(`pathId` already reads `req.params['id']`; this route is mounted on the same router as
`GET /issues/:id/attempts`, so it needs no new mount point — just confirm it doesn't collide with
`GET /scans/:id/issues` from a different router; if it's on a different router than the one holding
`/scans/:id/issues`, add it there instead, next to that route, and import
`listFailingEvidenceForScan` there.)

- [ ] **Step 6: Update the frontend to call the batched endpoint**

In `apps/web/lib/api.ts`, add near `getIssueAttempts`:

```ts
export function getFailingEvidence(scanId: string): Promise<{ evidence: Record<string, unknown> }> {
  return request(`/scans/${scanId}/issues/failing-evidence`);
}
```

In `apps/web/app/(dashboard)/fixes/page.tsx`, replace the whole `loadFailingEvidence` function and
its import with a direct call to the new endpoint:

```ts
import {
  assertIssueFixed,
  getFailingEvidence,
  getIssues,
  type FixesIssue,
} from '../../../lib/api';
```

(remove `getIssueAttempts` from this import if nothing else in the file uses it — check first)

Delete the `loadFailingEvidence` function entirely, and change `refresh`:

```ts
  const refresh = useCallback(async () => {
    if (scanId === '') return;
    try {
      const [{ issues: fetched }, { evidence }] = await Promise.all([
        getIssues(scanId),
        getFailingEvidence(scanId),
      ]);
      setIssues(fetched);
      setFailingEvidence(evidence);
    } catch {
      setError('This audit could not be loaded.');
    }
  }, [scanId]);
```

- [ ] **Step 7: Run the frontend unit tests**

Run: `pnpm --filter @webaudit/web exec vitest run tests/unit/fixes-board.test.ts`
Expected: unchanged and green — `FixesBoard`/`IssueRow` consume `failingEvidence` exactly as before,
only how the page populates it changed.

- [ ] **Step 8: Typecheck and build**

Run: `pnpm --filter @webaudit/web exec tsc --noEmit && pnpm --filter @webaudit/web exec next build`
Expected: clean.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/services/issues/attempts.ts apps/api/src/routes/issues.routes.ts apps/web/lib/api.ts apps/web/app/(dashboard)/fixes/page.tsx apps/api/tests/integration/attempts-batch.test.ts
git commit -m "perf(fixes): batch the failing-evidence lookup into one request

The Fixes board issued one GET /issues/:id/attempts per issue needing
evidence, refired on every realtime event. GET
/scans/:id/issues/failing-evidence now answers all of them in one
query."
```

---

### Task 7: Destroy a source-bearing workspace synchronously on cancellation (Finding 10, Medium)

**Files:**
- Modify: `apps/worker/src/queue/workers.ts`
- Modify: `apps/worker/src/index.ts`
- Create: `apps/api/src/services/queue/teardown-producer.ts`
- Modify: `apps/api/src/routes/scans.routes.ts`
- Test: `apps/worker/tests/integration/workspace-teardown-job.test.ts` (new)

**Interfaces:**
- Produces: `JOB_NAMES.workspaceTeardown = 'workspace-teardown'`; `workspaceTeardownJobSchema`;
  `JobHandlers.workspaceTeardown?: (data: { scanId: string }, job: JobRef) => Promise<void>`;
  `TeardownProducer` with `enqueueTeardown(input: { scanId: string }): Promise<{ jobId: string }>`
  and `close(): Promise<void>`, exported from the new `teardown-producer.ts`.
- Consumes: `destroyScanWorkspace` (already exported from `apps/worker/src/workspace/teardown.js`),
  `QUEUE_NAMES`/`DEFAULT_JOB_OPTIONS` (already exported from `@webaudit/config`).

- [ ] **Step 1: Write the failing test for job routing**

Create `apps/worker/tests/integration/workspace-teardown-job.test.ts` (model its shape on
`apps/worker/tests/integration/orchestrator-capability-enabled.test.ts` or another file already
calling `dispatch` directly — follow whichever convention this repo uses for a unit-level `dispatch`
test rather than a full BullMQ round-trip):

```ts
import { describe, expect, it, vi } from 'vitest';
import { dispatch, JOB_NAMES } from '../../src/queue/workers.js';

describe('workspace-teardown job', () => {
  it('routes to the workspaceTeardown handler with the scan id', async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    await dispatch(
      { name: JOB_NAMES.workspaceTeardown, queueName: 'maintenance', data: { scanId: 'scan_1' } },
      { workspaceTeardown: handler },
    );
    expect(handler).toHaveBeenCalledWith({ scanId: 'scan_1' }, expect.objectContaining({ name: 'workspace-teardown' }));
  });

  it('throws JobNotImplementedError when no handler is wired', async () => {
    const { JobNotImplementedError } = await import('../../src/queue/workers.js');
    await expect(
      dispatch({ name: JOB_NAMES.workspaceTeardown, queueName: 'maintenance', data: { scanId: 'scan_1' } }, {}),
    ).rejects.toThrow(JobNotImplementedError);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @webaudit/worker exec vitest run tests/integration/workspace-teardown-job.test.ts`
Expected: fails — `JOB_NAMES.workspaceTeardown` is `undefined`, so `dispatch` falls into the
`default: throw new UnknownJobError(job)` branch instead.

- [ ] **Step 3: Add the job name, schema, handler slot, and dispatch case**

In `apps/worker/src/queue/workers.ts`, add to `JOB_NAMES`:

```ts
  /** `apps/api`'s `teardown-producer.ts` -> `maintenanceQueue.add('workspace-teardown', ...)`. */
  workspaceTeardown: 'workspace-teardown',
```

Add a schema near the other job schemas (e.g. beside `timeoutSweepJobSchema`):

```ts
const workspaceTeardownJobSchema = z.object({ scanId: z.string().min(1).max(64) }).strict();
```

Add to `JobHandlers`:

```ts
  /** A cancelled scan's workspace, torn down out-of-band from apps/api (T104 gap fix). */
  readonly workspaceTeardown?: (data: { scanId: string }, job: JobRef) => Promise<void>;
```

Add a case in `dispatch`, alongside the other maintenance-queue cases:

```ts
    case JOB_NAMES.workspaceTeardown: {
      const data = workspaceTeardownJobSchema.parse(job.data);
      const handler = handlers.workspaceTeardown;
      if (handler === undefined) {
        throw new JobNotImplementedError(job, 'this task', 'Cancellation-triggered workspace teardown');
      }
      await handler(data, job);
      return;
    }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @webaudit/worker exec vitest run tests/integration/workspace-teardown-job.test.ts`
Expected: both cases pass.

- [ ] **Step 5: Wire the real handler at worker boot**

In `apps/worker/src/index.ts`, inside the `handlers` object built in the lazy-init block (where
`timeoutSweep: createTimeoutSweepHandler(...)` already sits), add:

```ts
        workspaceTeardown: async (data) => {
          await destroyScanWorkspace({
            baseDir: workspaceBaseDir,
            scanId: data.scanId,
            db,
            owner: processCleanupOwner,
          });
        },
```

Add the two new imports at the top of the file (`destroyScanWorkspace` and `processCleanupOwner`
are both already exported from `./workspace/teardown.js`, which this file already imports
`installTerminalTeardown` from — add them to that same import line):

```ts
import { installTerminalTeardown, destroyScanWorkspace, processCleanupOwner } from './workspace/teardown.js';
```

- [ ] **Step 6: Create the API-side producer**

Create `apps/api/src/services/queue/teardown-producer.ts`, mirroring
`apps/api/src/services/queue/reverify-producer.ts`'s shape exactly:

```ts
/**
 * The third job `apps/api` enqueues in production: tearing down a cancelled
 * scan's workspace out-of-band, since `/scans/:id/cancel` writes CANCELLED
 * directly and never goes through `apps/worker`'s `transition()` (T104's
 * documented gap; 2026-09-02 review, Finding 10).
 *
 * Same shape as `scan-phase-producer.ts` / `reverify-producer.ts`: a raw
 * BullMQ `Queue` on the maintenance queue, not `@webaudit/worker`'s helpers.
 */

import { Queue, type ConnectionOptions } from 'bullmq';
import { DEFAULT_JOB_OPTIONS, QUEUE_NAMES } from '@webaudit/config';

export interface TeardownProducer {
  enqueueTeardown(input: { readonly scanId: string }): Promise<{ readonly jobId: string }>;
  close(): Promise<void>;
}

function connectionFromEnv(): ConnectionOptions {
  return { url: process.env['REDIS_URL'] ?? 'redis://localhost:6389', maxRetriesPerRequest: null };
}

export function createTeardownProducer(
  connection: ConnectionOptions = connectionFromEnv(),
): TeardownProducer {
  const queue = new Queue(QUEUE_NAMES.maintenance, { connection, defaultJobOptions: DEFAULT_JOB_OPTIONS });

  return {
    async enqueueTeardown(input): Promise<{ readonly jobId: string }> {
      const jobId = `workspace-teardown:${input.scanId}`;
      await queue.add('workspace-teardown', { scanId: input.scanId }, { jobId });
      return { jobId };
    },
    close: () => queue.close(),
  };
}
```

- [ ] **Step 7: Enqueue teardown from the cancel route**

In `apps/api/src/routes/scans.routes.ts`, add `teardownProducer` to `ScanRoutesDeps` and default it:

```ts
import { createTeardownProducer, type TeardownProducer } from '../services/queue/teardown-producer.js';
```

```ts
export interface ScanRoutesDeps {
  probe?: ControlProbe;
  producer?: ScanPhaseProducer;
  teardownProducer?: TeardownProducer;
  resolveRequiredControlLevel?: (moduleType: string) => ControlLevel | Promise<ControlLevel>;
  checkRepositoryConnection?: (db: PrismaClient, userId: string) => Promise<void>;
}
```

```ts
  const teardownProducer = deps.teardownProducer ?? createTeardownProducer();
```

In the cancel handler, right after the successful `updateMany` (`if (result.count === 0) { ... }
return;` block ends, before the refund `try`), add a fire-and-forget enqueue that never blocks or
fails the response, matching the refund block's own "log and continue" rule:

```ts
    // FR-090/SC-015's fourth exit path: cancellation never reaches apps/worker's
    // transition() (see this route's own module note), so the workspace
    // teardown observer registered there never fires. Enqueue it directly,
    // out-of-band — a failure here must not undo the cancellation that already
    // committed above.
    try {
      await teardownProducer.enqueueTeardown({ scanId: pathId(req) });
    } catch (error) {
      console.error(`[scans.cancel] teardown enqueue failed for scan ${pathId(req)}:`, error);
    }
```

- [ ] **Step 8: Run the scans route tests for regressions**

Run: `pnpm --filter @webaudit/api exec vitest run tests -t cancel`
Expected: pre-existing cancel tests still pass; if any of them constructs `scansRoutes`/`createApp`
without a `teardownProducer` override and asserts on real Redis calls, add a fake
`teardownProducer` (matching the existing `fakeProducer` convention already used for
`ScanPhaseProducer` in these tests) to keep the suite from touching a real queue.

- [ ] **Step 9: Commit**

```bash
git add apps/worker/src/queue/workers.ts apps/worker/src/index.ts apps/api/src/services/queue/teardown-producer.ts apps/api/src/routes/scans.routes.ts apps/worker/tests/integration/workspace-teardown-job.test.ts apps/api/tests
git commit -m "fix(workspace): tear down a cancelled scan's workspace out-of-band

/scans/:id/cancel writes CANCELLED directly in apps/api's process and
never fires apps/worker's terminal-teardown observer. It now enqueues
a workspace-teardown job on the maintenance queue, closing the fourth
of FR-090's four exit paths for source-bearing scans."
```

---

### Task 8: Add coverage for the webhook's fail-closed 503 (Finding 11, Medium)

**Files:**
- Modify: `apps/api/tests/contract/billing-webhook.test.ts`

**Interfaces:** none — test-only, no production code changes.

- [ ] **Step 1: Write the test**

Add to `apps/api/tests/contract/billing-webhook.test.ts`:

```ts
  it('fails closed with 503 when no webhook secret is configured', async () => {
    const unconfigured = createApp({ db: testDb, mailer, webhooks: { secret: '' } });
    const { raw, sig } = sign({ id: 'evt_unconfigured', type: 'credits.purchased', data: {} });

    const res = await request(unconfigured)
      .post('/webhooks/billing')
      .set('content-type', 'application/json')
      .set('x-webhook-signature', sig)
      .send(raw)
      .expect(503);
    expect((res.body as { error: { code: string } }).error.code).toBe('WEBHOOK_NOT_CONFIGURED');
    expect(await testDb.billingEvent.count({ where: { id: 'evt_unconfigured' } })).toBe(0);
  });
```

(Passing `webhooks: { secret: '' }` explicitly, rather than omitting the option, is deliberate — it
proves the empty-string branch specifically, independent of whatever `process.env` happens to hold
in the test runner, matching how `webhooks.routes.ts`'s own `deps.secret ?? process.env[...] ?? ''`
falls through.)

- [ ] **Step 2: Run the test**

Run: `pnpm --filter @webaudit/api exec vitest run tests/contract/billing-webhook.test.ts -t "fails closed"`
Expected: passes immediately — this is coverage for existing, already-correct behavior (confirmed
by direct code reading during the review: `secret === '' ` returns `503` before any signature check
runs). If it fails, that is a real regression to investigate, not a flaky test to retry.

- [ ] **Step 3: Commit**

```bash
git add apps/api/tests/contract/billing-webhook.test.ts
git commit -m "test(billing): cover the webhook's fail-closed 503 when unconfigured

No production change — this behavior was already correct but
unverified by CI, which is exactly the class of bug this repo has
shipped as Critical before (the fallback signing secret finding)."
```

---

### Task 9: Correct `tasks.md`'s T153 wording (Finding 12, Low)

**Files:**
- Modify: `specs/001-webaudit-mvp-baseline/tasks.md`

**Interfaces:** none — documentation only.

- [ ] **Step 1: Edit the T153 line**

In `specs/001-webaudit-mvp-baseline/tasks.md`, find the T153 line (searchable by
`Add \`reverify\` implementations to the six first-slice capabilities`) and append a clause noting
the multi-cookie fix, so the task's own record matches what Task 1 of this plan actually verified:

```
- [X] T153 [US2] Add `reverify` implementations to the six first-slice capabilities in `packages/capabilities-vendored/*/src/index.ts`. Each fetches the recorded URL once and re-runs exactly the one check its `checkId` names — never the others — returning PASSED / FAILED{evidence} / UNVERIFIABLE, checked per-cookie for `owasp-checker`'s two cookie-flag checks (2026-09-02 review, Finding 1: a whole-string substring match could wrongly PASS a still-vulnerable multi-cookie site — fixed). `data-leak-scanner` is URL-only + kind-granular at re-check time (documented: never PASSED while any matching credential remains). `packages/capabilities-vendored/tests/unit/reverify.test.ts` — 16 tests, +2 for the multi-cookie fix.
```

- [ ] **Step 2: Commit**

```bash
git add specs/001-webaudit-mvp-baseline/tasks.md
git commit -m "docs(tasks): note the multi-cookie reverify fix on T153's own record"
```

(No test step — this is a prose correction to an already-completed task's description, not a
behavior change. Task 1 already proved the underlying code change with real tests.)

---

### Task 10: Fix the inaccurate "You were not charged" message (Finding 13, Low)

**Files:**
- Modify: `apps/web/app/(dashboard)/fixes/page.tsx`
- Test: `apps/web/tests/unit/fixes-board.test.ts` (or a new page-level test if this file only covers
  `FixesBoard`/`IssueRow` and not `FixesPage` itself — check before adding)

**Interfaces:** none new — `onAssertFixed`'s existing `catch` block gains a status check using the
already-exported `ApiError` class from `apps/web/lib/api.ts`.

- [ ] **Step 1: Write the failing test**

If `apps/web/tests/unit/fixes-board.test.ts` (or wherever this page's behavior is tested) has a
render harness for `FixesPage`/`FixesPageContent`, add:

```ts
  it('does not claim "not charged" when assertIssueFixed fails for an unknown reason', async () => {
    vi.mocked(assertIssueFixed).mockRejectedValueOnce(new Error('network error'));
    // ... render FixesPageContent, trigger onAssertFixed for one issue ...
    expect(screen.queryByText(/you were not charged/i)).not.toBeInTheDocument();
    expect(screen.getByText(/refresh to see your current balance/i)).toBeInTheDocument();
  });
```

(Match this repo's actual existing render/mock setup in that file rather than inventing a different
one — if `FixesPage` isn't rendered anywhere in the current test file, add this case to whatever
harness already imports and exercises it, or skip this step and rely on Step 4's manual/typecheck
verification if no such harness exists yet; do not build a new render harness just for this one
low-severity fix.)

- [ ] **Step 2: Run the test to verify it fails** (if Step 1 applied)

Run: `pnpm --filter @webaudit/web exec vitest run tests/unit/fixes-board.test.ts -t "not charged"`
Expected: fails — the current code always shows "You were not charged." regardless of the error.

- [ ] **Step 3: Fix the message**

In `apps/web/app/(dashboard)/fixes/page.tsx`, import `ApiError` and adjust `onAssertFixed`:

```ts
import { assertIssueFixed, getFailingEvidence, getIssues, ApiError, type FixesIssue } from '../../../lib/api';
```

```ts
      try {
        await assertIssueFixed(issueId);
      } catch (err) {
        setError(
          err instanceof ApiError && (err.status === 402 || err.status === 409)
            ? 'That re-check could not be started. You were not charged.'
            : 'That re-check could not be started. Refresh to see your current balance.',
        );
        void refresh();
      }
```

- [ ] **Step 4: Run the test to verify it passes** (if Step 1 applied), otherwise typecheck

Run: `pnpm --filter @webaudit/web exec vitest run tests/unit/fixes-board.test.ts` (or, if no test was
added: `pnpm --filter @webaudit/web exec tsc --noEmit`)
Expected: green / clean.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/\(dashboard\)/fixes/page.tsx
git commit -m "fix(fixes): stop claiming 'not charged' for a non-billing failure

A lost-in-transit success response (charge succeeded, response never
arrived) previously showed the same message as a real 402/409
refusal. Only a genuine pre-charge refusal claims 'not charged' now."
```

---

### Task 11: Distinguish a generating certificate from a missing one (Finding 14, Low)

**Files:**
- Modify: `apps/api/src/routes/readiness.routes.ts`
- Test: `apps/api/tests/contract/readiness.certificate-email-guard.test.ts` (extend the file added
  when Finding 2 was fixed)

**Interfaces:** none new — the existing `GET /scans/:id/readiness/certificate` route gains one more
`if` branch before its current 404 fallback.

- [ ] **Step 1: Write the failing test**

Add to `apps/api/tests/contract/readiness.certificate-email-guard.test.ts`:

```ts
  it('returns 202 GENERATING for the certificate while it is mid-claim, not a plain 404', async () => {
    const puts: { key: string }[] = [];
    // A storage whose putObject never resolves during this test's own request,
    // so the claim placeholder ('') is still in place when /certificate is hit.
    const stallingStorage: ReportStorage = {
      putObject: () => new Promise(() => {}),
      getObject: () => Promise.reject(new Error('not used')),
      deleteScanObjects: () => Promise.resolve(0),
    };
    const { mailer } = flakyMailer(-1);
    const app = createApp({ db: testDb, mailer, readiness: { storage: stallingStorage, producer: fakeProducer } });
    const { token, userId } = await signIn(app);
    const { scanId } = await seedGoVerdict(userId);

    void request(app).get(`/scans/${scanId}/readiness`).set(auth(token)); // triggers the claim, don't await
    await new Promise((r) => setTimeout(r, 50)); // let the claim's updateMany land

    const res = await request(app).get(`/scans/${scanId}/readiness/certificate`).set(auth(token));
    expect(res.status).toBe(202);
    expect((res.body as { error: { code: string } }).error.code).toBe('CERTIFICATE_GENERATING');
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @webaudit/api exec vitest run tests/contract/readiness.certificate-email-guard.test.ts -t GENERATING`
Expected: fails with `404`, not `202` — the route can't currently tell "claimed but not yet
committed" (`certificateKey === ''`) apart from "no certificate at all" (`certificateKey === null`).

- [ ] **Step 3: Add the distinguishing branch**

In `apps/api/src/routes/readiness.routes.ts`, in the `GET /scans/:id/readiness/certificate` route,
change the `select` to also read the placeholder state and branch on it before the existing null
check:

```ts
  router.get('/scans/:id/readiness/certificate', async (req: AuthedRequest, res: Response) => {
    const userId = req.auth!.userId;
    const scan = await db.scan.findFirst({
      where: { id: pathId(req), userId },
      select: { id: true, verdict: { select: { certificateKey: true } } },
    });
    if (scan === null || scan.verdict === null || scan.verdict.certificateKey === null) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'No certificate for this scan.' } });
      return;
    }
    if (scan.verdict.certificateKey === '') {
      res.status(202).json({ error: { code: 'CERTIFICATE_GENERATING', message: 'The certificate is being generated; try again shortly.' } });
      return;
    }
    if (storage === null) {
      res.status(503).json({ error: { code: 'STORAGE_UNAVAILABLE', message: 'Certificate storage is not configured.' } });
      return;
    }
    try {
      const bytes = await storage.getObject(scan.id, READINESS_CERTIFICATE_KEY);
      res.status(200).type('text/html; charset=utf-8').send(Buffer.from(bytes));
    } catch {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'No certificate for this scan.' } });
    }
  });
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @webaudit/api exec vitest run tests/contract/readiness.certificate-email-guard.test.ts`
Expected: all tests pass, including the pre-existing ones from Finding 2's fix (unaffected — they
never observe the mid-claim window).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/readiness.routes.ts apps/api/tests/contract/readiness.certificate-email-guard.test.ts
git commit -m "fix(readiness): distinguish a generating certificate from a missing one

GET .../certificate now answers 202 CERTIFICATE_GENERATING during the
sub-second claim window instead of an indistinguishable 404."
```

---

### Task 12: Replace raw px/font-size values with design tokens (Finding 15, Low)

**Files:**
- Modify: `apps/web/components/report/ReadinessVerdict.module.css`
- Modify: `apps/web/app/(dashboard)/billing/page.module.css`
- Modify: `design-system/screen-map.md` or `research.md` (record the lint blind spot as an open item
  — see Step 3)

**Interfaces:** none — CSS-only value substitutions, no class name or markup changes.

- [ ] **Step 1: Replace matching raw values in `ReadinessVerdict.module.css`**

Open the file and replace every literal `px` value that has a direct token equivalent in
`design-system/tokens/*.css` (spacing scale, type scale) with the matching `var(--space-N)` /
`var(--type-*)` token — read `design-system/tokens/spacing.css` and `typography.css` first to find
the exact token names for each value flagged in the review (lines 19, 33, 60, 64-69, 86, 93-94).
Leave any value with no token equivalent as-is (do not invent a new token in this task).

- [ ] **Step 2: Replace matching raw values in `apps/web/app/(dashboard)/billing/page.module.css`**

Same process: replace `320px`/`20px` (→ `--space-5` if that is the 20px token; confirm by reading
`spacing.css` rather than assuming), `16px` (→ `--space-4`), and the raw `font-size` values (12px,
11px, 13px, 15px, 14px) with their `--type-*` equivalents. The `11px` value the review noted as
having no token equivalent should stay as a raw value with a one-line comment explaining why it's
excepted, not silently left unexplained.

- [ ] **Step 3: Record the CSS-Modules lint blind spot**

Add one line to `specs/001-webaudit-mvp-baseline/research.md`'s open-items list (matching the
existing style of "Open decision recorded" notes elsewhere in that file and PROGRESS.md's "Carried
Correction" sections):

```
- **CSS Modules are not covered by the design-adherence lint's raw-value rule.** `_adherence.oxlintrc.json`'s `no-restricted-syntax` matches JS/JSX `Literal` AST nodes only, so a `.module.css` file with a raw `px` value passes `pnpm lint` today even though CLAUDE.md states "a raw hex or raw px value fails `pnpm lint`." Two known instances fixed by hand (2026-09-02 review, Finding 15); the rule itself is not yet extended to `.css` files. Needs either a CSS-aware lint rule or a documented exception.
```

- [ ] **Step 4: Run the visual regression gate**

Run: `pnpm --filter @webaudit/web run test:visual`
Expected: both touched screens (`/readiness` if it has a reference artboard, `/billing`) stay within
the 0.5% diff bar — a token swap should be visually identical to the raw value it replaced, since
the token's own value equals what was hardcoded. If either screen has no reference artboard (as the
review noted for `/billing`), this step is `it.todo` for that screen already and stays so.

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/report/ReadinessVerdict.module.css apps/web/app/\(dashboard\)/billing/page.module.css specs/001-webaudit-mvp-baseline/research.md
git commit -m "style: replace raw px/font-size values with design tokens in two CSS modules

Also records the underlying gap in research.md: the adherence lint's
raw-value rule doesn't inspect .module.css files at all, so this class
of drift isn't caught by pnpm lint today."
```

---

### Task 13: Explicitly reject a Zip64 sentinel field without its locator (Finding 16, Low)

**Files:**
- Modify: `packages/safe-archive/src/zip.ts`
- Test: `packages/safe-archive/tests/adverse/zip-bomb.test.ts` (or wherever the existing
  `UNSUPPORTED_FORMAT`/`MALFORMED_ARCHIVE` cases for this file already live — add alongside them)

**Interfaces:** none new — `readCentralDirectory` gains one more refusal branch inside its existing
per-entry loop; no signature change.

- [ ] **Step 1: Write the failing test**

Add a test that builds a minimal central-directory entry with `compressedBytes` set to the Zip64
sentinel `0xFFFFFFFF` but no Zip64 locator present (match the existing test file's convention for
constructing a synthetic zip buffer byte-by-byte, rather than inventing a new builder):

```ts
  it('refuses an entry carrying the Zip64 sentinel size with no Zip64 locator', () => {
    const buffer = buildMinimalZipWithEntry({ compressedBytes: 0xffffffff }); // use this file's existing entry-builder helper
    expect(() => readCentralDirectory(buffer)).toThrow(/Zip64 sentinel/);
  });
```

(If this test file has no existing raw-buffer-building helper for a central directory entry, check
`packages/safe-archive/tests/unit/zip.test.ts` first — that is the more likely home for a
parser-level test like this one, since `zip-bomb.test.ts` tests end-to-end extraction behavior, not
`readCentralDirectory` directly. Put the test wherever `readCentralDirectory` is already unit-tested
in isolation.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @webaudit/safe-archive exec vitest run -t "Zip64 sentinel"`
Expected: fails — today this entry passes through `readCentralDirectory` and is caught later (if at
all) by the unrelated `UNCOMPRESSED_TOO_LARGE` check, with a less precise error message, or not
caught here at all if the test's synthetic entry doesn't also trip that limit.

- [ ] **Step 3: Add the explicit check**

In `packages/safe-archive/src/zip.ts`, in `readCentralDirectory`'s per-entry loop, right after
reading `compressedBytes`, `uncompressedBytes`, and `localHeaderOffset` (before they're pushed into
`entries`), add:

```ts
    if (
      compressedBytes === 0xffffffff ||
      uncompressedBytes === 0xffffffff ||
      localHeaderOffset === 0xffffffff
    ) {
      throw malformed(
        `central directory entry ${String(index)} carries a Zip64 sentinel value with no Zip64 ` +
          'locator present; this is not a well-formed 32-bit zip entry',
      );
    }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @webaudit/safe-archive exec vitest run -t "Zip64 sentinel"`
Expected: passes, with the precise `MALFORMED_ARCHIVE` reason instead of falling through to a
different limit's refusal (or none).

- [ ] **Step 5: Run the full safe-archive adverse suite for regressions**

Run: `pnpm --filter @webaudit/safe-archive exec vitest run`
Expected: all green — this check only fires on the specific sentinel value, which no legitimate
32-bit zip entry ever carries.

- [ ] **Step 6: Commit**

```bash
git add packages/safe-archive/src/zip.ts packages/safe-archive/tests
git commit -m "fix(safe-archive): explicitly reject a Zip64 sentinel field with no locator

Previously fell through to whichever size/offset check happened to
catch the 0xFFFFFFFF value, with a misleading refusal reason. No
security property changes — this was already refused, just imprecisely."
```

---

### Task 14: Fix the retention boundary to strictly-after expiry (Finding 18, Low)

**Files:**
- Modify: `apps/api/src/services/storage/retention.ts`
- Test: `apps/api/tests/integration/retention.test.ts` (the existing suite — add alongside its three
  current cases)

**Interfaces:** none — one comparison operator changes; no signature change.

- [ ] **Step 1: Write the failing test**

Add to `apps/api/tests/integration/retention.test.ts`, inside the existing
`describe('enforceRetention', ...)` block. The file's own `completedScan(email, completedDaysAgo)`
helper derives `completedAt` from the live `Date.now()`, which can't hit an exact millisecond
boundary reliably — so this test seeds `completedAt` directly and derives the boundary `now` from
it, then calls `enforceRetention` with that `now` as its third argument (the file's other tests all
omit it and rely on the real clock):

```ts
  it('does not remove a report at the exact expiry instant, only strictly after it', async () => {
    const completedAt = new Date('2026-08-01T00:00:00.000Z');
    const user = await testDb.user.create({ data: { email: 'ret-boundary@example.com', emailVerifiedAt: new Date() } });
    const target = await testDb.target.create({
      data: { userId: user.id, inputType: 'URL', canonicalValue: 'https://ret-boundary.example.com', displayName: 'ret' },
    });
    await testDb.scan.create({
      data: {
        userId: user.id,
        targetId: target.id,
        requestedModules: ['SECURITY'],
        capabilitySnapshot: {},
        quotedCredits: 20,
        chargedCredits: 20,
        state: 'COMPLETED',
        overallScore: 70,
        completedAt,
      },
    });

    const exactExpiry = new Date(completedAt.getTime() + 7 * DAY); // free tier: retentionDays 7
    const result = await enforceRetention(testDb, deps, exactExpiry);
    expect(result.removed).toBe(0);
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @webaudit/api exec vitest run tests/integration/retention.test.ts -t "exact expiry"`
Expected: fails — `expiry <= now` currently removes it (`result.removed` is `1`, not `0`).

- [ ] **Step 3: Fix the comparison**

In `apps/api/src/services/storage/retention.ts`, change:

```ts
    if (expiry <= now) {
```

to:

```ts
    if (expiry < now) {
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @webaudit/api exec vitest run tests/integration/retention.test.ts`
Expected: all four cases pass — the new one and the three pre-existing ones (the "removes a report
past its retention period" case uses `completedDaysAgo: 10` against a 7-day window, well past the
boundary, so `expiry < now` is still true there).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/storage/retention.ts apps/api/tests/integration/retention.test.ts
git commit -m "fix(retention): keep a report through the exact expiry instant, not just past it

expiry <= now removed a report at the boundary millisecond itself;
FR-092's 'past the window' reads as strictly-after."
```

---

## Final verification (after all 14 tasks)

- [ ] `pnpm run format:check && pnpm run lint && pnpm run lint:adherence`
- [ ] `pnpm -r typecheck`
- [ ] `pnpm run test` — full unit suite, isolated (no concurrent session touching the same test DB)
- [ ] `pnpm run test:adverse` — full adverse suite, isolated; specifically re-confirm the SSRF suite
  (Task 2) and the credit/billing adverse suites (Tasks 3–6) stay fully green, not just the new tests
- [ ] `pnpm run test:visual` — confirm Task 12's token swaps stayed within the 0.5% bar
- [ ] `next build` (apps/web) — clean
- [ ] Update [PROGRESS.md](../../../PROGRESS.md): add a dated entry recording this remediation pass,
  matching the style of the existing "Phase N engineering review — findings fixed" sections, and
  update [2026-09-02-phases-4-7-engineering-review.md](2026-09-02-phases-4-7-engineering-review.md)'s
  status table to mark Findings 1, 3–8, 10–16, 18 as ✅ Fixed, leaving 9 and 17 noted as deliberately
  excluded (see this plan's Global Constraints).
