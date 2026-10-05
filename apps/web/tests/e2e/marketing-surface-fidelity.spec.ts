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

  const compactSurfaces = await page.evaluate(() => {
    const read = (selector: string) => {
      const element = document.querySelector(selector);
      if (!element) throw new Error(`Missing surface: ${selector}`);
      const style = getComputedStyle(element);
      return {
        border: style.borderTopColor,
        radius: style.borderTopLeftRadius,
        padding: `${style.paddingTop} ${style.paddingRight}`,
      };
    };
    return {
      evidence: read('#difference article'),
      workflow: read('#loop article'),
      readiness: read('#readiness .rounded-marketing-readiness'),
      explorer: read('#areas > div'),
      pricing: read('#pricing-preview > div'),
      priceHighlight: read('#pricing-preview article'),
      trust: read('#technical-trust dl > div'),
    };
  });
  expect(compactSurfaces).toEqual({
    evidence: { border: 'rgb(223, 230, 246)', radius: '16px', padding: '17px 17px' },
    workflow: { border: 'rgb(225, 231, 245)', radius: '16px', padding: '16px 17px' },
    readiness: { border: 'rgb(223, 229, 244)', radius: '20px', padding: '17px 14px' },
    explorer: { border: 'rgb(222, 229, 245)', radius: '15px', padding: '10px 10px' },
    pricing: { border: 'rgb(223, 229, 242)', radius: '17px', padding: '16px 13px' },
    priceHighlight: { border: 'rgb(228, 233, 245)', radius: '13px', padding: '11px 11px' },
    trust: { border: 'rgb(223, 229, 244)', radius: '0px', padding: '17px 17px' },
  });
  const compactDetails = await page.evaluate(() => {
    const highlight = document.querySelector('#pricing-preview article');
    const amount = highlight?.querySelector('strong');
    const blocker = document.querySelector('#readiness .rounded-marketing-blocker');
    const icon = document.querySelector('#difference article span[aria-hidden="true"]');
    if (!highlight || !amount || !blocker || !icon) throw new Error('Missing nested surface detail');
    const highlightStyle = getComputedStyle(highlight);
    const amountStyle = getComputedStyle(amount);
    const blockerStyle = getComputedStyle(blocker);
    const iconStyle = getComputedStyle(icon);
    return {
      priceHighlightDisplay: highlightStyle.display,
      priceAmountPlacement: `${amountStyle.gridColumnStart}/${amountStyle.gridRowStart}/${amountStyle.gridRowEnd}`,
      blockerBorder: blockerStyle.borderInlineStartWidth,
      blockerRadius: blockerStyle.borderTopLeftRadius,
      evidenceIcon: `${iconStyle.width}/${iconStyle.height}/${iconStyle.borderTopLeftRadius}`,
    };
  });
  expect(compactDetails).toEqual({
    priceHighlightDisplay: 'grid',
    priceAmountPlacement: '2/1/span 2',
    blockerBorder: '3px',
    blockerRadius: '8px',
    evidenceIcon: '37px/37px/12px',
  });

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
    supportingBorder: getComputedStyle(document.querySelector('#pricing-preview article')!).borderTopColor,
  }));
  expect(darkSurfaces.report).not.toBe('rgb(255, 255, 255)');
  expect(darkSurfaces.repair).toContain('0, 0, 0, 0.2');
  expect(darkSurfaces.scannerBorder).toBe('1px');
  expect(darkSurfaces.supportingBorder).toBe('rgb(55, 65, 81)');
});
