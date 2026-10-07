import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { startStack, type Stack } from '../support/stack.js';

const VISUAL_QA_DIR = path.join(tmpdir(), 'webaudit-hero-visual-qa');

let stack: Stack;

test.beforeAll(async () => {
  test.setTimeout(180_000);
  stack = await startStack();
});

test.afterAll(async () => stack.stop());

test('the hero URL reaches the authenticated scan form through signup and email verification', async ({
  page,
}) => {
  const email = 'hero-handoff@example.com';
  const password = 'correct-horse-battery-staple';
  const target = 'https://example.com/launch';

  await page.goto(stack.webBaseUrl);
  await page.locator('#hero').getByLabel('Example URL').fill(target);
  await page.locator('#hero').getByRole('button', { name: 'Audit my site', exact: true }).click();
  await page.waitForURL(`${stack.webBaseUrl}/signup`);

  await page.getByLabel('Work email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await page.waitForURL(`${stack.webBaseUrl}/verify-email`);

  const token = stack.mailer.lastVerificationToken();
  await page.goto(`${stack.webBaseUrl}/verify-email?token=${token}`);
  await page.getByRole('button', { name: 'Confirm Email Address' }).click();
  await page.getByRole('main').getByRole('link', { name: 'Sign in' }).click();
  await page.waitForURL(`${stack.webBaseUrl}/login`);

  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL(/\/scan$/);

  await expect(page.getByPlaceholder('yoursite.com')).toHaveValue('example.com/launch');
  expect(await page.evaluate(() => window.sessionStorage.getItem('wa-hero-scan-url'))).toBeNull();
});

test('the hero stays within the viewport in both themes, locales, and required widths', async ({
  page,
}) => {
  const widths = [1440, 1280, 1024, 900, 899, 768, 390, 360, 320];
  const heroBackgrounds = new Map<string, string>();
  mkdirSync(VISUAL_QA_DIR, { recursive: true });

  for (const locale of ['en', 'ar'] as const) {
    const route = locale === 'ar' ? '/ar' : '/';
    for (const theme of ['light', 'dark'] as const) {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(`${stack.webBaseUrl}${route}`);
      await page.evaluate((value) => localStorage.setItem('wa-theme', value), theme);
      await page.reload();
      const background = await page
        .locator('#hero')
        .evaluate((element) => getComputedStyle(element).backgroundColor);
      heroBackgrounds.set(`${locale}-${theme}`, background);
      const heroText = await page
        .locator('#hero h1')
        .evaluate((element) => getComputedStyle(element).color);
      expect(heroText, `${locale}/${theme} hero heading foreground`).toBe('rgb(255, 255, 255)');

      for (const width of widths) {
        await page.setViewportSize({ width, height: 900 });
        await expect(page.locator('#hero input[dir="ltr"]')).toBeVisible();
        const core = await page.locator('#hero [data-scan-handoff]').evaluate((element) => {
          const bounds = element.getBoundingClientRect();
          const heroBounds = element.closest('#hero')?.getBoundingClientRect();
          return {
            display: getComputedStyle(element).display,
            background: getComputedStyle(element).backgroundColor,
            backgroundImage: getComputedStyle(element).backgroundImage,
            width: bounds.width,
            insideHero:
              heroBounds !== undefined &&
              bounds.left >= heroBounds.left &&
              bounds.right <= heroBounds.right &&
              bounds.top >= heroBounds.top &&
              bounds.bottom <= heroBounds.bottom,
          };
        });
        expect(core.display, `Hero scanner display at ${width}px`).not.toBe('none');
        expect(core.width, `Hero scanner width at ${width}px`).toBeGreaterThan(0);
        expect(
          core.background !== 'rgba(0, 0, 0, 0)' || core.backgroundImage !== 'none',
          `Hero scanner surface at ${width}px`,
        ).toBe(true);
        expect(core.insideHero, `Hero scanner bounds at ${width}px`).toBe(true);
        const dimensions = await page.evaluate(() => ({
          documentWidth: document.documentElement.scrollWidth,
          viewportWidth: document.documentElement.clientWidth,
          heroWidth: document.querySelector<HTMLElement>('#hero')?.scrollWidth ?? 0,
          heroClientWidth: document.querySelector<HTMLElement>('#hero')?.clientWidth ?? 0,
        }));
        expect(dimensions.documentWidth, `${locale}/${theme} at ${width}px`).toBeLessThanOrEqual(
          dimensions.viewportWidth,
        );
        expect(dimensions.heroWidth, `hero ${locale}/${theme} at ${width}px`).toBeLessThanOrEqual(
          dimensions.heroClientWidth,
        );
        await page.screenshot({
          path: path.join(VISUAL_QA_DIR, `${locale}-${theme}-${width}.png`),
          fullPage: true,
        });
      }
    }
  }

  expect(heroBackgrounds.get('en-light')).toBe(heroBackgrounds.get('en-dark'));
  expect(heroBackgrounds.get('ar-light')).toBe(heroBackgrounds.get('ar-dark'));
});
