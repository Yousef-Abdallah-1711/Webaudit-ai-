/**
 * T229 — verifies zero third-party runtime requests from `apps/web`, for the
 * same six standalone pages `accessibility.spec.ts` (T227) covers and for
 * the same reason: no backend, no auth session, no database needed, so a
 * real built-and-started app is the only thing this suite depends on. See
 * that file's own module note for why the dashboard/admin surface (needs a
 * real logged-in session plus a real API+worker+DB boot) is out of scope
 * here too.
 *
 * quickstart.md's Scenario 11 states the bar plainly: "Zero runtime requests
 * to font, icon, or asset CDNs from any page we serve." CLAUDE.md names two
 * already-closed deviations that make a clean zero *plausible* rather than
 * assumed — `apps/web/app/layout.tsx` self-hosts both fonts via
 * `next/font/google` (T127/T236a: downloaded at build time, served from this
 * app's own origin, nothing fetched from Google at runtime) and
 * `apps/web/components/ui/icons/` vendors every icon as an inline
 * `<svg><path>` with a de-duplicated path table (T247) — its own module note
 * records that an exhaustive `grep -rli lucide design-system/` found the
 * unpkg CDN reference lived only in the design system's own live-preview
 * scaffolding, never in anything this repo ships. Both are read, not just
 * cited, before this suite makes its assertion: this is what turns "should
 * be zero" into "confirmed zero, for real, on every page tested."
 *
 * **Real result: zero *third-party* requests on all six pages** — one
 * legitimate exclusion, not zero requests outright. `AuthProvider`
 * (`app/layout.tsx` wraps every page with it, unconditionally) always calls
 * `GET /auth/me` on mount, on every page, precisely so the header can show
 * "Sign in" vs a signed-in identity — that is a call to this app's own
 * configured backend, not a CDN or tracker, so it is excluded by origin
 * below the same way `data:`/`blob:` URLs are: from the *foreign-host*
 * check, never from whether a request happened at all. Two real gaps found
 * running this file for real (Phase 10), both fixed here: (1) this suite
 * never set `NEXT_PUBLIC_API_URL` itself, so whether the assertion passed
 * depended on whichever *other* spec file happened to run earlier in the
 * same shared Playwright process (`workers: 1` runs every file in one Node
 * process, and `support/stack.ts`'s own `startStack()` sets this env var
 * for its own build but never unsets it) — a real, order-dependent flake,
 * the same class of bug the project's DB-test-concurrency lesson already
 * warns about, just for env vars instead of database rows. (2) the
 * necessary exclusion for the app's own backend origin did not exist at
 * all. Google Fonts/icon-CDN traffic is still the thing this test actually
 * guards, and still fails for real if either regresses — nothing about
 * that guarantee is weakened by excluding a first-party origin this
 * explicitly, by exact value, rather than by a broad heuristic.
 */
import { execSync } from 'node:child_process';
import { test, expect } from '@playwright/test';
import { startServer, type ServerHandle } from '../visual/harness.js';

const REPO_ROOT = new URL('../../../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const WEB_DIR = `${REPO_ROOT}apps/web`;
const PORT = 4181;

const PAGES: readonly { readonly name: string; readonly path: string }[] = [
  { name: 'Home page', path: '/' },
  { name: 'Sign in', path: '/login' },
  { name: 'Create account', path: '/signup' },
  { name: 'Verify email', path: '/verify-email' },
  { name: 'Forgot password', path: '/forgot-password' },
  { name: 'Reset password', path: '/reset-password' },
];

let server: ServerHandle;
// Explicit, not inherited — this build must not depend on whatever another
// spec file left in `process.env` earlier in this same shared Playwright
// process (see the module note above). `lib/api.ts`'s own hardcoded
// fallback, made explicit here so it is a known value this file controls
// and can exclude below, rather than an implicit default.
const API_ORIGIN = 'http://localhost:3001';

test.beforeAll(async () => {
  // See accessibility.spec.ts's own beforeAll for why this is
  // `test.setTimeout` rather than a second argument to `beforeAll` itself.
  test.setTimeout(180_000);
  execSync('npx next build', {
    cwd: WEB_DIR,
    stdio: 'ignore',
    env: { ...process.env, NEXT_PUBLIC_API_URL: API_ORIGIN },
  });
  server = await startServer(WEB_DIR, PORT);
});

test.afterAll(() => {
  server.close();
});

for (const { name, path: route } of PAGES) {
  test(`${name} issues no third-party runtime requests`, async ({ page }) => {
    const requestUrls: string[] = [];
    page.on('request', (request) => {
      requestUrls.push(request.url());
    });

    await page.goto(`${server.url}${route}`, { waitUntil: 'networkidle' });

    const ownOrigin = new URL(server.url).origin;
    // data:/blob: URLs are not network requests to any host at all (inlined
    // or client-synthesized), so they are not third-party traffic either —
    // excluded from the "foreign host" check the same way, never from
    // whether a request happened. `API_ORIGIN` is this app's own configured
    // backend (`AuthProvider`'s unconditional `GET /auth/me` on every page,
    // `app/layout.tsx`), not a CDN or tracker — excluded by this exact,
    // explicit value, not a broad heuristic, so a real third-party host
    // still fails this test.
    const foreignRequests = requestUrls.filter((url) => {
      if (url.startsWith('data:') || url.startsWith('blob:')) return false;
      const origin = new URL(url).origin;
      return origin !== ownOrigin && origin !== API_ORIGIN;
    });

    expect(foreignRequests, JSON.stringify(foreignRequests, null, 2)).toEqual([]);
  });
}
