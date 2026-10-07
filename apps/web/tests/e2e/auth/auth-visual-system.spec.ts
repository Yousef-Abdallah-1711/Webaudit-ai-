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
const INPUT_ROUTES = [
  ...ROUTES,
  '/forgot-password',
  '/reset-password?token=visual-test-token',
] as const;
const WIDTHS = [1440, 1280, 1024, 768, 390, 360] as const;
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
  property: 'backgroundImage' | 'backgroundColor' | 'borderColor' | 'fontFamily' | 'outlineColor',
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

async function controlGeometry(locator: import('@playwright/test').Locator) {
  return locator.evaluate((element) => {
    const style = getComputedStyle(element);
    const bounds = element.getBoundingClientRect();
    return {
      width: bounds.width,
      height: bounds.height,
      borderWidth: style.borderWidth,
      borderStyle: style.borderStyle,
      padding: style.padding,
      radius: style.borderRadius,
    };
  });
}

async function focusWithKeyboard(
  page: import('@playwright/test').Page,
  target: import('@playwright/test').Locator,
): Promise<void> {
  await page.locator('body').click({ position: { x: 1, y: 1 } });
  for (let presses = 0; presses < 40; presses++) {
    await page.keyboard.press('Tab');
    if (await target.evaluate((element) => element === document.activeElement)) return;
  }
  throw new Error('Keyboard focus did not reach the requested control');
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
    expect(await hasSameComputedToken(firstField, 'outlineColor', '--brand-electric')).toBe(true);
    expect(focusedFieldStyle.outlineStyle).toBe('solid');
    expect(focusedFieldStyle.outlineWidth).toBe('2px');
    expect(focusedFieldStyle.boxShadow).not.toContain('250, 112, 20');
  }
});

test('every auth input shares the public control states without changing geometry', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });

  for (const route of INPUT_ROUTES) {
    await page.goto(pageUrl(route), { waitUntil: 'networkidle' });
    const inputs = page.getByRole('main').locator('input');

    for (let index = 0; index < (await inputs.count()); index++) {
      const input = inputs.nth(index);
      const empty = await controlGeometry(input);
      expect(
        await hasSameComputedToken(input, 'borderColor', '--border-marketing-control'),
        `${route} input ${index} resting border`,
      ).toBe(true);
      expect(empty.borderStyle).toBe('solid');
      expect(
        await hasSameComputedToken(input, 'backgroundColor', '--surface-marketing-raised'),
      ).toBe(true);
      expect(await hasSameComputedToken(input, 'fontFamily', '--font-marketing')).toBe(true);

      await input.fill(
        (await input.getAttribute('type')) === 'password' ? 'Passphrase123!' : 'filled@example.com',
      );
      expect(await controlGeometry(input)).toEqual(empty);
      await input.fill('');

      await input.hover();
      const hovered = await controlGeometry(input);
      await expect
        .poll(() => hasSameComputedToken(input, 'borderColor', '--brand-electric'))
        .toBe(true);
      expect(hovered).toEqual(empty);

      await input.focus();
      const focused = await input.evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          focusVisible: element.matches(':focus-visible'),
          borderColor: style.borderColor,
          outlineStyle: style.outlineStyle,
          outlineWidth: style.outlineWidth,
          outlineColor: style.outlineColor,
          shadow: style.boxShadow,
        };
      });
      expect(focused.focusVisible).toBe(true);
      expect(focused.borderColor).toBe(focused.outlineColor);
      expect(focused.outlineStyle).toBe('solid');
      expect(Number.parseFloat(focused.outlineWidth)).toBeGreaterThanOrEqual(2);
      expect(focused.shadow).not.toContain('250, 112, 20');
      expect(await controlGeometry(input)).toEqual(empty);

      await input.evaluate((element) => element.setAttribute('aria-invalid', 'true'));
      await expect
        .poll(() => hasSameComputedToken(input, 'borderColor', '--sev-critical'))
        .toBe(true);
      await input.evaluate((element) => element.removeAttribute('aria-invalid'));

      await input.evaluate((element) => element.setAttribute('disabled', ''));
      const disabled = await input.evaluate((element) => {
        const style = getComputedStyle(element);
        return { cursor: style.cursor, opacity: Number(style.opacity) };
      });
      expect(disabled.cursor).toBe('not-allowed');
      expect(disabled.opacity).toBeLessThan(1);
      expect(await controlGeometry(input)).toEqual(empty);
      await input.evaluate((element) => element.removeAttribute('disabled'));
    }
  }
});

test('auth secondary actions and links use current Fahes hover and focus states', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });

  for (const route of ROUTES) {
    await page.goto(pageUrl(route), { waitUntil: 'networkidle' });
    const primary = page.getByRole('main').locator('button[type="submit"]');
    const primaryGeometry = await controlGeometry(primary);
    if (route === '/login') {
      await primary.hover();
      expect(await primary.evaluate((element) => getComputedStyle(element).filter)).toContain(
        'brightness(1.1)',
      );
      await page.mouse.down();
      expect(await primary.evaluate((element) => getComputedStyle(element).filter)).toContain(
        'brightness(0.95)',
      );
      expect(await controlGeometry(primary)).toEqual(primaryGeometry);
      await page.mouse.move(0, 0);
      await page.mouse.up();
    } else {
      await expect(primary).toBeDisabled();
      expect(await primary.evaluate((element) => getComputedStyle(element).cursor)).toBe(
        'not-allowed',
      );
    }

    const github = page.locator('main a[href*="/auth/oauth/github/start"]');
    const githubGeometry = await controlGeometry(github);
    await github.hover();
    await expect
      .poll(() => hasSameComputedToken(github, 'backgroundColor', '--surface-marketing'))
      .toBe(true);
    expect(await controlGeometry(github)).toEqual(githubGeometry);
    await page.mouse.down();
    await expect
      .poll(() => hasSameComputedToken(github, 'backgroundColor', '--surface-raised'))
      .toBe(true);
    expect(await controlGeometry(github)).toEqual(githubGeometry);
    await page.mouse.move(0, 0);
    await page.mouse.up();
    await focusWithKeyboard(page, github);
    expect(await hasSameComputedToken(github, 'outlineColor', '--brand-marketing')).toBe(true);
    expect(await github.evaluate((element) => getComputedStyle(element).outlineStyle)).toBe(
      'solid',
    );

    const switchLink = page.locator('main a[href="/signup"], main a[href="/login"]').last();
    const linkRest = await switchLink.evaluate((element) => getComputedStyle(element).color);
    await switchLink.hover();
    expect(await switchLink.evaluate((element) => getComputedStyle(element).color)).not.toBe(
      linkRest,
    );
    await focusWithKeyboard(page, switchLink);
    expect(await hasSameComputedToken(switchLink, 'outlineColor', '--brand-marketing')).toBe(true);
    expect(await switchLink.evaluate((element) => getComputedStyle(element).outlineStyle)).toBe(
      'solid',
    );
  }

  await page.goto(pageUrl('/login'), { waitUntil: 'networkidle' });
  const forgot = page.locator('main a[href="/forgot-password"]');
  const forgotRest = await forgot.evaluate((element) => getComputedStyle(element).color);
  await forgot.hover();
  await expect
    .poll(async () => forgot.evaluate((element) => getComputedStyle(element).color))
    .not.toBe(forgotRest);
  await focusWithKeyboard(page, forgot);
  expect(await hasSameComputedToken(forgot, 'outlineColor', '--brand-marketing')).toBe(true);

  await page.goto(pageUrl('/verify-email'), { waitUntil: 'networkidle' });
  const resend = page.getByRole('main').getByRole('button');
  const resendGeometry = await controlGeometry(resend);
  await resend.hover();
  await expect
    .poll(() => hasSameComputedToken(resend, 'backgroundColor', '--surface-marketing'))
    .toBe(true);
  expect(await controlGeometry(resend)).toEqual(resendGeometry);
  await focusWithKeyboard(page, resend);
  expect(await hasSameComputedToken(resend, 'outlineColor', '--brand-marketing')).toBe(true);
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
  const darkInput = page.getByRole('main').locator('input').first();
  expect(await hasSameComputedToken(darkInput, 'borderColor', '--border-marketing-control')).toBe(
    true,
  );
  await expect
    .poll(() => hasSameComputedToken(darkInput, 'backgroundColor', '--surface-marketing-raised'))
    .toBe(true);
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

test('landing scanner fields, area tabs, FAQ and copy action expose stable interaction states', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(pageUrl('/'), { waitUntil: 'networkidle' });

  for (const selector of [
    '[data-scan-handoff] input',
    '[data-approved-section="final-cta"] input',
  ]) {
    const input = page.locator(selector).first();
    const resting = await controlGeometry(input);
    expect(await hasSameComputedToken(input, 'borderColor', '--border-marketing-control')).toBe(
      true,
    );
    expect(resting.borderStyle).toBe('solid');
    await input.hover();
    await expect
      .poll(() => hasSameComputedToken(input, 'borderColor', '--brand-electric'))
      .toBe(true);
    expect(await controlGeometry(input)).toEqual(resting);
    await input.focus();
    expect(await hasSameComputedToken(input, 'outlineColor', '--brand-electric')).toBe(true);
    expect(await controlGeometry(input)).toEqual(resting);
  }

  const inactiveTab = page.getByRole('tab').nth(1);
  const tabRest = await controlGeometry(inactiveTab);
  expect(await inactiveTab.evaluate((element) => getComputedStyle(element).cursor)).toBe('pointer');
  await inactiveTab.hover();
  await expect
    .poll(() => hasSameComputedToken(inactiveTab, 'borderColor', '--brand-electric'))
    .toBe(true);
  expect(await controlGeometry(inactiveTab)).toEqual(tabRest);
  await inactiveTab.focus();
  expect(await hasSameComputedToken(inactiveTab, 'outlineColor', '--brand-electric')).toBe(true);

  const faq = page.locator('[data-approved-section="faq"] summary').first();
  const faqRest = await faq.evaluate((element) => getComputedStyle(element).color);
  await faq.hover();
  await expect
    .poll(async () => faq.evaluate((element) => getComputedStyle(element).color))
    .not.toBe(faqRest);
  await faq.focus();
  expect(await hasSameComputedToken(faq, 'outlineColor', '--brand-electric')).toBe(true);

  const copy = page.locator('[data-approved-section="remediation"] button').first();
  expect(await copy.evaluate((element) => getComputedStyle(element).cursor)).toBe('pointer');
  const copyBounds = await controlGeometry(copy);
  const copyBackground = await copy.evaluate(
    (element) => getComputedStyle(element).backgroundColor,
  );
  await copy.hover();
  await expect
    .poll(async () => copy.evaluate((element) => getComputedStyle(element).backgroundColor))
    .not.toBe(copyBackground);
  await copy.focus();
  expect(await hasSameComputedToken(copy, 'outlineColor', '--brand-highlight')).toBe(true);
  expect(await controlGeometry(copy)).toEqual(copyBounds);

  const pricingLink = page.locator('[data-approved-section="pricing"] a').last();
  const pricingLinkRest = await pricingLink.evaluate((element) => getComputedStyle(element).color);
  await pricingLink.hover();
  await expect
    .poll(async () => pricingLink.evaluate((element) => getComputedStyle(element).color))
    .not.toBe(pricingLinkRest);

  const faqDetails = faq.locator('..');
  const faqInitiallyOpen = await faqDetails.evaluate(
    (element) => (element as HTMLDetailsElement).open,
  );
  await faq.click();
  await expect
    .poll(() => faqDetails.evaluate((element) => (element as HTMLDetailsElement).open))
    .toBe(!faqInitiallyOpen);
  await faq.click();
  await expect
    .poll(() => faqDetails.evaluate((element) => (element as HTMLDetailsElement).open))
    .toBe(faqInitiallyOpen);

  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const locator of [
    page.locator('[data-scan-handoff] input'),
    inactiveTab,
    faq,
    copy,
    pricingLink,
  ]) {
    await expect
      .poll(() => locator.evaluate((element) => getComputedStyle(element).transitionProperty))
      .toBe('none');
  }
});
