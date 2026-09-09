/**
 * Found via manual testing (Playwright MCP against a real dev stack) at the
 * 390px mobile viewport: `design-system/ui_kits/marketing/Public.jsx`'s
 * header has no mobile treatment at all — the nav links pushed the sign-in/
 * start-free actions off-screen, causing real horizontal overflow (the page
 * scrolled sideways, with a large dead gap on the right). The rest of the
 * homepage adapted correctly; only the header component was affected.
 *
 * Reuses `no-external-requests.spec.ts`/`accessibility.spec.ts`'s own
 * `startServer` + real `next build` pattern — same six pages that render
 * standalone with no backend.
 */
import { execSync } from 'node:child_process';
import { test, expect } from '@playwright/test';
import { startServer, type ServerHandle } from '../visual/harness.js';

const REPO_ROOT = new URL('../../../../', import.meta.url).pathname.replace(
  /^\/([A-Za-z]:)/,
  '$1',
);
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
  test.setTimeout(180_000);
  execSync('npx next build', { cwd: WEB_DIR, stdio: 'ignore' });
  server = await startServer(WEB_DIR, PORT);
});

test.afterAll(() => {
  server.close();
});

test.use({ viewport: { width: 390, height: 844 } });

for (const { name, path: route } of PAGES) {
  test(`${name} has no horizontal overflow at 390px`, async ({ page }) => {
    await page.goto(`${server.url}${route}`, { waitUntil: 'networkidle' });
    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
  });
}
