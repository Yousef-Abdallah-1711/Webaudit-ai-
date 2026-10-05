import { execSync } from 'node:child_process';
import { test, expect } from '@playwright/test';
import { startServer, type ServerHandle } from '../visual/harness.js';

const REPO_ROOT = new URL('../../../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const WEB_DIR = `${REPO_ROOT}apps/web`;
const PORT = 4186;
const EXTERNAL_BASE_URL = process.env.MARKETING_SURFACE_BASE_URL;

let server: ServerHandle | undefined;

test.beforeAll(async () => {
  if (EXTERNAL_BASE_URL) return;
  test.setTimeout(180_000);
  execSync('npx next build', { cwd: WEB_DIR, stdio: 'ignore' });
  server = await startServer(WEB_DIR, PORT);
});

test.afterAll(() => {
  server?.close();
});

test('marketing product surfaces retain the approved scanner, report, and remediation hierarchy', async ({ page }) => {
  test.setTimeout(180_000);
  const baseUrl = EXTERNAL_BASE_URL ?? (server ? `${server.url}/` : undefined);
  if (!baseUrl) throw new Error('The marketing surface server did not start');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await page.locator('[data-scan-handoff]').waitFor({ timeout: 120_000 });

  const heroScanner = await page.locator('[data-scan-handoff]').evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      borderWidth: style.borderTopWidth,
      radius: style.borderTopLeftRadius,
      backgroundImage: style.backgroundImage,
      shadow: style.boxShadow,
    };
  });
  expect(heroScanner.borderWidth).toBe('1px');
  expect(heroScanner.radius).toBe('17px');
  expect(heroScanner.backgroundImage).toContain('linear-gradient');
  expect(heroScanner.shadow).toContain('inset');

  const reportFrame = await page.locator('#report-showcase > div').evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      radius: style.borderTopLeftRadius,
      padding: style.paddingTop,
    };
  });
  expect(reportFrame).toEqual({ radius: '17px', padding: '7px' });

  const finding = await page.locator('#report-showcase article').evaluate((element) => {
    const style = getComputedStyle(element);
    return { paddingTop: style.paddingTop, paddingLeft: style.paddingLeft };
  });
  expect(finding).toEqual({ paddingTop: '16px', paddingLeft: '13px' });

  const repair = await page.locator('#remediation article').evaluate((element) => {
    const style = getComputedStyle(element);
    return { backgroundImage: style.backgroundImage, borderColor: style.borderTopColor, shadow: style.boxShadow };
  });
  expect(repair.backgroundImage).toContain('linear-gradient');
  expect(repair.borderColor).toBe('rgba(214, 220, 255, 0.18)');
  expect(repair.shadow).toContain('0, 0, 0, 0.2');

  const promptBox = await page.locator('#remediation .rounded-marketing-prompt').evaluate((element) => {
    const style = getComputedStyle(element);
    return { radius: style.borderTopLeftRadius, backgroundColor: style.backgroundColor };
  });
  expect(promptBox).toEqual({ radius: '10px', backgroundColor: 'rgba(0, 0, 0, 0)' });

  const finalScanner = await page.locator('#final-cta form').evaluate((form) => {
    const style = getComputedStyle(form.parentElement!);
    return { radius: style.borderTopLeftRadius, backgroundImage: style.backgroundImage };
  });
  expect(finalScanner.radius).toBe('17px');
  expect(finalScanner.backgroundImage).toContain('linear-gradient');

  const origin = new URL(baseUrl).origin;
  for (const { locale, direction } of [
    { locale: 'en', direction: 'ltr' },
    { locale: 'ar', direction: 'rtl' },
  ]) {
    await page.goto(`${origin}/${locale}`, { waitUntil: 'domcontentloaded' });
    await page.locator('[data-landing-section="hero"]').waitFor();
    await expect(page.locator('html')).toHaveAttribute('lang', locale);
    await expect(page.locator('html')).toHaveAttribute('dir', direction);
    await expect(page.locator('[data-landing-section]')).toHaveCount(10);

    for (const width of [1440, 1280, 1024, 768, 390, 360]) {
      await page.setViewportSize({ width, height: 900 });
      const dimensions = await page.evaluate(() => ({
        viewport: document.documentElement.clientWidth,
        document: document.documentElement.scrollWidth,
      }));
      expect(dimensions.document, `${locale} page at ${width}px`).toBeLessThanOrEqual(
        dimensions.viewport,
      );
    }
  }

  await page.goto(`${origin}/en`, { waitUntil: 'domcontentloaded' });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.locator('html').evaluate((element) => element.setAttribute('data-theme', 'dark'));
  const darkSurfaces = await page.evaluate(() => ({
    report: getComputedStyle(document.querySelector('#report-showcase > div')!).backgroundColor,
    repair: getComputedStyle(document.querySelector('#remediation article')!).boxShadow,
    scannerBorder: getComputedStyle(document.querySelector('[data-scan-handoff]')!).borderTopWidth,
  }));
  expect(darkSurfaces.report).not.toBe('rgb(255, 255, 255)');
  expect(darkSurfaces.repair).toContain('0, 0, 0, 0.2');
  expect(darkSurfaces.scannerBorder).toBe('1px');
});
