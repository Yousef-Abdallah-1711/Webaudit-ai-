/**
 * Verifies the public locale-prefixed routes through a real production
 * Next.js server. These pages are unauthenticated and need no API/database
 * stack, so this follows the lightweight real-build pattern used by the
 * neighboring public-page E2E specs.
 */
import { execSync } from 'node:child_process';
import { test, expect } from '@playwright/test';
import { startServer, type ServerHandle } from '../visual/harness.js';

const REPO_ROOT = new URL('../../../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const WEB_DIR = `${REPO_ROOT}apps/web`;
const PORT = 4182;

const ENGLISH_HERO_LEAD = 'Think your site is ready?';
const ARABIC_HERO_LEAD =
  '\u062a\u0638\u0646 \u0623\u0646 \u0645\u0648\u0642\u0639\u0643 \u062c\u0627\u0647\u0632\u061f';
const ENGLISH_PRICING_HEADING = 'Credits, not seats.';

test.use({ locale: 'en-US' });

let server: ServerHandle | undefined;

test.beforeAll(async () => {
  test.setTimeout(180_000);
  execSync('npx next build', { cwd: WEB_DIR, stdio: 'ignore' });
  server = await startServer(WEB_DIR, PORT);
});

test.afterAll(() => {
  server?.close();
});

async function expectRoute(page: import('@playwright/test').Page, path: string): Promise<void> {
  const runningServer = server;
  if (!runningServer) throw new Error('The public routes server did not start');

  const response = await page.goto(`${runningServer.url}${path}`, { waitUntil: 'networkidle' });

  expect(response?.status()).toBe(200);
  // Assert the requested URL survives navigation exactly as entered: no
  // locale redirect to or from the default-locale unprefixed routes.
  await expect(page).toHaveURL(new URL(path, runningServer.url).href);
}

async function expectLocale(page: import('@playwright/test').Page, locale: 'en' | 'ar') {
  const html = page.locator('html');
  await expect(html).toHaveAttribute('lang', locale);
  // dir is applied by RootLayout's synchronous ThemeScript before paint.
  // Read the browser DOM after navigation so this also covers that script.
  await expect(html).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');
}

async function expectCanonical(page: import('@playwright/test').Page, path: string): Promise<void> {
  const canonical = page.locator('head link[rel="canonical"]');
  await expect(canonical).toHaveCount(1);
  const href = await canonical.getAttribute('href');
  expect(href).not.toBeNull();
  expect(new URL(href!, page.url()).pathname).toBe(path);
}

test('GET / renders English home copy and public metadata without redirecting', async ({
  page,
}) => {
  await expectRoute(page, '/');
  await expectLocale(page, 'en');
  await expect(page.getByText(ENGLISH_HERO_LEAD)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Switch to dark mode' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Switch to العربية' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Dismiss' })).toBeVisible();
  const hero = page.locator('[data-landing-section="hero"]');
  for (const value of ['50', '5', '3']) await expect(hero).toContainText(value);
  await expectCanonical(page, '/');
  await expect(page.locator('head link[rel="alternate"][hreflang="ar"]')).toHaveCount(1);
});

test('home and pricing render the complete public marketing shell', async ({ page }) => {
  for (const route of ['/', '/pricing']) {
    await page.goto(`${server!.url}${route}`, { waitUntil: 'networkidle' });

    const header = page.getByRole('banner');
    await expect(
      header.getByRole('link', { name: 'Product', exact: true }).first(),
    ).toHaveAttribute('href', '/');
    await expect(
      header.getByRole('link', { name: 'Pricing', exact: true }).first(),
    ).toHaveAttribute('href', '/pricing');

    const footer = page.getByRole('contentinfo');
    await expect(footer).toContainText('Measured before inferred. Green means verified.');
    await expect(footer.getByRole('link', { name: 'Product', exact: true })).toHaveAttribute(
      'href',
      '/',
    );
    await expect(footer.getByRole('link', { name: 'Pricing', exact: true })).toHaveAttribute(
      'href',
      '/pricing',
    );
  }
});

test('every auth route renders only the minimal auth header and no public shell', async ({
  page,
}) => {
  for (const route of [
    '/login',
    '/signup',
    '/forgot-password',
    '/reset-password',
    '/verify-email',
  ]) {
    await page.goto(`${server!.url}${route}`, { waitUntil: 'networkidle' });

    const header = page.getByRole('banner');
    await expect(header.getByRole('link').first()).toHaveAttribute('href', '/');
    await expect(header.getByRole('button')).toHaveCount(2);
    await expect(header.getByRole('button').nth(0)).toHaveAttribute('aria-label', /^Switch to /);
    await expect(header.getByRole('button').nth(1)).toHaveAttribute(
      'aria-label',
      'Switch to dark mode',
    );
    await expect(page.getByRole('link', { name: 'Product', exact: true })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Pricing', exact: true })).toHaveCount(0);
    await expect(header.getByRole('link', { name: 'Sign in', exact: true })).toHaveCount(0);
    await expect(header.getByRole('link', { name: 'Start free', exact: true })).toHaveCount(0);
    await expect(page.locator('[aria-controls="public-mobile-drawer"]')).toHaveCount(0);
    await expect(page.locator('#public-mobile-drawer')).toHaveCount(0);
    await expect(page.getByRole('contentinfo')).toHaveCount(0);
  }
});

test('Arabic login keeps the context panel on the right and the form on the left', async ({
  page,
}) => {
  const runningServer = server;
  if (!runningServer) throw new Error('The public routes server did not start');
  await page.context().addCookies([{ name: 'wa-lang', value: 'ar', url: runningServer.url }]);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`${runningServer.url}/login`, { waitUntil: 'networkidle' });

  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  const contextPanel = page.getByRole('complementary');
  const formPanel = page.getByRole('heading', { name: /sign in|تسجيل الدخول/i }).locator('..');
  const contextBox = await contextPanel.boundingBox();
  const formBox = await formPanel.boundingBox();
  expect(contextBox).not.toBeNull();
  expect(formBox).not.toBeNull();
  expect(contextBox!.x).toBeGreaterThan(formBox!.x);
});

test('Arabic accessible labels follow wa-lang on public and auth routes', async ({ page }) => {
  const runningServer = server;
  if (!runningServer) throw new Error('The public routes server did not start');
  await page.context().addCookies([{ name: 'wa-lang', value: 'ar', url: runningServer.url }]);

  await page.goto(`${runningServer.url}/ar`, { waitUntil: 'networkidle' });
  await expect(page.getByRole('button', { name: 'التبديل إلى الوضع الداكن' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'التبديل إلى English' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'إغلاق' })).toBeVisible();

  await page.goto(`${runningServer.url}/login`, { waitUntil: 'networkidle' });
  await expect(page.getByRole('button', { name: 'التبديل إلى الوضع الداكن' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'التبديل إلى English' })).toBeVisible();
});

test('GET /ar renders Arabic home copy and public metadata without redirecting', async ({
  page,
}) => {
  await expectRoute(page, '/ar');
  await expectLocale(page, 'ar');
  await expect(page.getByText(ARABIC_HERO_LEAD)).toBeVisible();
  await expectCanonical(page, '/ar');
  await expect(page.locator('head link[rel="alternate"][hreflang="en"]')).toHaveCount(1);
});

test('GET /pricing renders English pricing copy without redirecting', async ({ page }) => {
  await expectRoute(page, '/pricing');
  await expectLocale(page, 'en');
  await expect(page.getByRole('heading', { name: ENGLISH_PRICING_HEADING })).toBeVisible();
  const pricing = page.locator('main');
  for (const credits of ['50', '300', '1,200', '4,000']) {
    await expect(pricing).toContainText(credits);
  }
  for (const cost of ['10–25 cr', '80 cr', '3 cr', '60 cr']) {
    await expect(pricing).toContainText(cost);
  }
});

test('GET /ar/pricing renders Arabic pricing copy without redirecting', async ({ page }) => {
  await expectRoute(page, '/ar/pricing');
  await expectLocale(page, 'ar');
  // Require Arabic text in the pricing page body itself, rather than passing
  // on the translated shared navigation while the pricing content stays English.
  await expect(page.locator('main')).toContainText(/[\u0600-\u06FF]/);
});
