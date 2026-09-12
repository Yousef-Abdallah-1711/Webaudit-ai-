import { test, expect } from '@playwright/test';
import { startStack, type Stack } from '../support/stack.js';
import { registerAndVerify, loginViaUi } from '../support/auth.js';
import { startFixtureSite, type FixtureSite } from '../fixtures/static-site.js';

let stack: Stack;
let fixture: FixtureSite;
const previousRedisUrl = process.env['REDIS_URL'];
const creds = { email: 'onboarding@example.com', password: 'correct-horse-battery-staple' };

test.beforeAll(async () => {
  test.setTimeout(180_000);
  fixture = await startFixtureSite();
  // Must be set before `startStack`'s own `startApi` call — `assertPublicTarget`
  // reads it live on every call, but there is no reason to leave a wider
  // window open than the fixture's own lifetime.
  process.env['SAFE_NET_ALLOW_TARGETS'] = fixture.origin;
  // Keep this scan's BullMQ queues away from any live worker using the default
  // Redis logical database during manual development work.
  process.env['REDIS_URL'] = 'redis://localhost:6389/15';
  stack = await startStack();
  await registerAndVerify(stack, creds);
});

test.afterAll(async () => {
  await stack.stop();
  await fixture.close();
  delete process.env['SAFE_NET_ALLOW_TARGETS'];
  if (previousRedisUrl === undefined) delete process.env['REDIS_URL'];
  else process.env['REDIS_URL'] = previousRedisUrl;
});

test('a new user receives a real report, export, clipboard prompt, and fixes count', async ({
  page,
  request,
}) => {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], {
    origin: stack.webBaseUrl,
  });
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

  const accessToken = await page.evaluate(() => localStorage.getItem('wa-access-token'));
  expect(accessToken).not.toBeNull();
  const issueCountResponse = await request.get(`${stack.apiBaseUrl}/issues/count`, {
    headers: { Authorization: `Bearer ${String(accessToken)}` },
  });
  expect(issueCountResponse.ok()).toBe(true);
  const issueCount = ((await issueCountResponse.json()) as { count: number }).count;

  const fixesLink = page.getByRole('link', { name: /Fixes/ });
  await expect(fixesLink).toContainText(String(issueCount));

  const copyButton = page.getByRole('button', { name: 'Copy fix prompt' }).first();
  const scanId = page.url().split('/').pop();
  expect(scanId).toBeTruthy();
  const reportResponse = await request.get(`${stack.apiBaseUrl}/scans/${String(scanId)}/report`, {
    headers: { Authorization: `Bearer ${String(accessToken)}` },
  });
  expect(reportResponse.ok()).toBe(true);
  const reportBody = (await reportResponse.json()) as {
    report: { issues: readonly { fixPrompt: string }[] };
  };
  const expectedPrompt = reportBody.report.issues[0]?.fixPrompt;
  expect(expectedPrompt).toBeTruthy();
  await copyButton.click();
  await expect(page.getByRole('button', { name: 'Copied' }).first()).toBeVisible();
  const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
  expect(clipboardText.replaceAll('\r\n', '\n')).toBe(expectedPrompt?.replaceAll('\r\n', '\n'));

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.html$/);
});
