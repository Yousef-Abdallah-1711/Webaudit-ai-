import { test, expect } from '@playwright/test';
import { startStack, type Stack } from '../support/stack.js';
import { registerAndVerify, loginViaUi } from '../support/auth.js';
import { startFixtureSite, type FixtureSite } from '../fixtures/static-site.js';

let stack: Stack;
let fixture: FixtureSite;
const creds = { email: 'onboarding@example.com', password: 'correct-horse-battery-staple' };

test.beforeAll(async () => {
  test.setTimeout(180_000);
  fixture = await startFixtureSite();
  // Must be set before `startStack`'s own `startApi` call — `assertPublicTarget`
  // reads it live on every call, but there is no reason to leave a wider
  // window open than the fixture's own lifetime.
  process.env['SAFE_NET_ALLOW_TARGETS'] = fixture.origin;
  stack = await startStack();
  await registerAndVerify(stack, creds);
});

test.afterAll(async () => {
  await stack.stop();
  await fixture.close();
  delete process.env['SAFE_NET_ALLOW_TARGETS'];
});

test('a new user submits a URL, watches progress, and receives a scored report with a fix prompt', async ({
  page,
}) => {
  await loginViaUi(page, stack.webBaseUrl, creds);
  // login's post-auth redirect: /scan is the new-scan form, not a scaffold —
  // see apps/web/app/(dashboard)/scan/page.tsx's own header note.
  await expect(page).toHaveURL(/\/scan$/);

  // The URL field has no <label> (InputTabs.tsx) — a cosmetic "https://"
  // prefix chip sits beside it, but the underlying value is whatever is
  // typed verbatim, so a full http:// URL (the local fixture is plain HTTP)
  // passes straight through ScanForm's resolveTargetId unchanged.
  await page.getByPlaceholder('yoursite.com').fill(`${fixture.origin}/`);

  // All five areas are pre-selected by default (ScanForm's ALL_AREAS
  // initial state), which costs more credits (95, packages/config/src/
  // pricing.ts's AREA_COST) than the free plan grants (50) — narrowed to
  // Security + Search visibility (30 credits), matching the API-only
  // suite's own area selection.
  await page.getByLabel('Performance').uncheck();
  await page.getByLabel('Design').uncheck();
  await page.getByLabel('Testing').uncheck();
  await page.getByRole('button', { name: 'Accept and run', exact: true }).click();

  // ScanForm's onStart navigates to /scan/<id> (the live-progress screen).
  await page.waitForURL(/\/scan\/[^/]+$/, { timeout: 10_000 });

  // AI_MODE=fixtures scans complete in a few seconds, not a minute — a long
  // wait here means a stuck job, not a slow-but-working one.
  await page.getByRole('button', { name: 'Open report' }).click({ timeout: 30_000 });
  await page.waitForURL(/\/reports\/[^/]+$/, { timeout: 10_000 });

  // FR-053/spec.md: a fix prompt exists for every issue — assert the real,
  // accessible "Copy fix prompt" control is present rather than guessing at
  // a hashed CSS-module class name.
  await expect(page.getByRole('button', { name: 'Copy fix prompt' }).first()).toBeVisible({
    timeout: 5_000,
  });
});
