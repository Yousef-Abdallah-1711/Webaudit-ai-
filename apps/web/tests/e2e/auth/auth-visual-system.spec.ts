import { execSync } from 'node:child_process';
import { expect, test } from '@playwright/test';
import { startServer, type ServerHandle } from '../../visual/harness.js';

const REPO_ROOT = new URL('../../../../../', import.meta.url).pathname.replace(
  /^\/([A-Za-z]:)/,
  '$1',
);
const WEB_DIR = `${REPO_ROOT}apps/web`;
const PORT = 4182;
const EXTERNAL_BASE_URL = process.env.AUTH_VISUAL_BASE_URL;
const ROUTES = ['/login', '/signup'] as const;
const WIDTHS = [1440, 1024, 768, 390, 360] as const;
const LOCALES = [
  { locale: 'en', direction: 'ltr' },
  { locale: 'ar', direction: 'rtl' },
] as const;

let server: ServerHandle | undefined;

test.beforeAll(async () => {
  test.setTimeout(180_000);
  if (EXTERNAL_BASE_URL) return;
  execSync('npx next build', { cwd: WEB_DIR, stdio: 'ignore' });
  server = await startServer(WEB_DIR, PORT);
});

test.afterAll(() => server?.close());

function pageUrl(route: string): string {
  const baseUrl = EXTERNAL_BASE_URL ?? server?.url;
  if (!baseUrl) throw new Error('The auth visual-system server did not start');
  return `${baseUrl.replace(/\/$/, '')}${route}`;
}

async function hasSameComputedToken(
  locator: import('@playwright/test').Locator,
  property: 'backgroundImage' | 'backgroundColor' | 'fontFamily' | 'outlineColor',
  token: string,
): Promise<boolean> {
  return locator.evaluate(
    (element, { cssProperty, cssToken }) => {
      const propertyName = cssProperty.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
      const probe = document.createElement('i');
      probe.style.setProperty(propertyName, `var(${cssToken})`);
      document.body.append(probe);
      const expected = getComputedStyle(probe).getPropertyValue(propertyName);
      const actual = getComputedStyle(element).getPropertyValue(propertyName);
      probe.remove();
      return actual === expected;
    },
    { cssProperty: property, cssToken: token },
  );
}

test('auth form surfaces and primary actions use current Fahes tokens', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });

  for (const route of ROUTES) {
    await page.goto(pageUrl(route), { waitUntil: 'networkidle' });
    const main = page.getByRole('main');
    await expect(main.getByRole('heading').first()).toBeVisible();

    const header = page.getByRole('banner');
    await expect(header.getByRole('link').first()).toHaveAttribute('href', '/');
    await expect(header.getByRole('button')).toHaveCount(2);

    const primaryAction = main.locator('button[type="submit"]');
    await expect(primaryAction).toBeVisible();
    expect(
      await hasSameComputedToken(primaryAction, 'backgroundImage', '--gradient-cta-marketing'),
    ).toBe(true);

    const formSurface = page.locator('.formSurface');
    expect(
      await hasSameComputedToken(formSurface, 'backgroundColor', '--surface-marketing-raised'),
    ).toBe(true);
    const contextPanel = page.getByRole('complementary');
    expect(await hasSameComputedToken(contextPanel, 'backgroundColor', '--surface-hero')).toBe(
      true,
    );
    await expect(contextPanel).toContainText(/blocked/i);
    await expect(contextPanel).toContainText(/warning/i);

    expect(await hasSameComputedToken(main, 'fontFamily', '--font-marketing')).toBe(true);

    const firstField = main.locator('input').first();
    await firstField.focus();
    const focusedFieldStyle = await firstField.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        fontFamily: style.fontFamily,
        backgroundColor: style.backgroundColor,
        outlineStyle: style.outlineStyle,
        outlineWidth: style.outlineWidth,
        boxShadow: style.boxShadow,
      };
    });
    expect(await hasSameComputedToken(firstField, 'fontFamily', '--font-marketing')).toBe(true);
    expect(
      await hasSameComputedToken(firstField, 'backgroundColor', '--surface-marketing-raised'),
    ).toBe(true);
    expect(await hasSameComputedToken(firstField, 'outlineColor', '--brand-marketing')).toBe(true);
    expect(focusedFieldStyle.outlineStyle).toBe('solid');
    expect(focusedFieldStyle.outlineWidth).toBe('2px');
    expect(focusedFieldStyle.boxShadow).not.toContain('250, 112, 20');
  }
});

test('auth chrome stays focused while reusing the public footer', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });

  for (const route of ROUTES) {
    await page.goto(pageUrl(route), { waitUntil: 'networkidle' });
    const header = page.getByRole('banner');
    await expect(header.getByRole('link').first()).toHaveAttribute('href', '/');
    await expect(header.getByRole('button')).toHaveCount(2);
    await expect(
      header.getByRole('link', { name: /product|pricing|sign in|start free/i }),
    ).toHaveCount(0);
    await expect(page.getByRole('contentinfo')).toHaveCount(1);
    await expect(page.locator('footer[data-approved-section="footer"]')).toHaveCount(1);
    await expect(page.locator('[aria-controls="public-mobile-drawer"]')).toHaveCount(0);
  }
});

for (const route of ROUTES) {
  for (const locale of LOCALES) {
    test(`${route} remains usable in ${locale.locale} at the approved responsive widths`, async ({
      page,
    }) => {
      const baseUrl = pageUrl(route);
      await page.context().addCookies([{ name: 'wa-lang', value: locale.locale, url: baseUrl }]);

      for (const width of WIDTHS) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(baseUrl, { waitUntil: 'networkidle' });
        await expect(page.locator('html')).toHaveAttribute('dir', locale.direction);
        const main = page.getByRole('main');
        await expect(main.getByRole('heading').first()).toBeVisible();
        await expect(main.locator('button[type="submit"]')).toBeVisible();

        const geometry = await page.evaluate(() => ({
          viewport: document.documentElement.clientWidth,
          document: document.documentElement.scrollWidth,
          form: document.querySelector('.formSurface')?.getBoundingClientRect(),
          context: document.querySelector('aside[aria-label]')?.getBoundingClientRect(),
        }));
        expect(
          geometry.document,
          `${route} ${locale.locale} ${width}px overflow`,
        ).toBeLessThanOrEqual(geometry.viewport);
        expect(geometry.form?.width).toBeGreaterThan(0);
        if (width > 768) expect(geometry.context?.width).toBeGreaterThan(0);

        const headerBox = await page.getByRole('banner').boundingBox();
        expect(headerBox?.width).toBe(width);
      }
    });
  }
}

test('auth theme and language controls remain operable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(pageUrl('/login'), { waitUntil: 'networkidle' });
  const heading = page.getByRole('main').getByRole('heading').first();
  const englishHeading = await heading.textContent();

  await expect(page.getByRole('button', { name: 'Switch to dark mode' })).toBeVisible();
  await page.getByRole('button', { name: 'Switch to dark mode' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.getByRole('button', { name: 'Switch to light mode' })).toBeVisible();
  await page.getByRole('button', { name: 'Switch to light mode' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  const localeToggle = page.getByRole('banner').getByRole('button').first();
  await expect(localeToggle).toHaveAttribute('aria-label', /Switch to /);
  await localeToggle.click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
  await expect(heading).toBeVisible();
  await expect(heading).not.toHaveText(englishHeading ?? '');
  await page.getByRole('banner').getByRole('button').first().click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(heading).toHaveText(englishHeading ?? '');
});
