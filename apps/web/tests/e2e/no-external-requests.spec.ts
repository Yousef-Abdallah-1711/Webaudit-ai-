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
 * **Real result: zero third-party requests on all six pages.** Every
 * request `page.on('request', ...)` observed during a full `networkidle`
 * load resolved to the test server's own origin
 * (`http://localhost:<PORT>`) — no Google Fonts, no icon CDN, no other host.
 * Nothing here needed silent exclusion; if a future regression reintroduces
 * a CDN reference (a font import reverting to a `<link>` tag, an icon swap
 * back to a hosted SVG sprite, a new dependency that phones home), this
 * suite fails for real rather than passing on an assumption.
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

test.beforeAll(async () => {
  // See accessibility.spec.ts's own beforeAll for why this is
  // `test.setTimeout` rather than a second argument to `beforeAll` itself.
  test.setTimeout(180_000);
  execSync('npx next build', { cwd: WEB_DIR, stdio: 'ignore' });
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
    // whether a request happened.
    const foreignRequests = requestUrls.filter((url) => {
      if (url.startsWith('data:') || url.startsWith('blob:')) return false;
      return new URL(url).origin !== ownOrigin;
    });

    expect(foreignRequests, JSON.stringify(foreignRequests, null, 2)).toEqual([]);
  });
}
