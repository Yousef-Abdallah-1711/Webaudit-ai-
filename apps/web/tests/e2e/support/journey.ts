import type { Page } from '@playwright/test';
import type { FixtureSite } from '../fixtures/static-site.js';

/**
 * Runs the same real browser journey `onboarding/first-audit.spec.ts` itself
 * asserts step by step, without the assertions — for specs that need a
 * completed, real scan already sitting in the database as their own
 * starting point. Assumes the caller is already logged in and on `/scan`
 * (login's own post-auth redirect target).
 */
export async function runScanToCompletion(
  page: Page,
  fixture: FixtureSite,
): Promise<{ readonly scanId: string }> {
  // The URL field has no <label> (InputTabs.tsx) — a cosmetic "https://"
  // prefix chip sits beside it, but the underlying value is whatever is
  // typed verbatim, so a full http:// URL (the local fixture is plain HTTP)
  // passes straight through ScanForm's resolveTargetId unchanged.
  await page.getByPlaceholder('yoursite.com').fill(`${fixture.origin}/`);

  // All five areas are pre-selected by default (ScanForm's ALL_AREAS
  // initial state), which costs more credits (95, packages/config/src/
  // pricing.ts's AREA_COST) than the free plan grants (50) — narrowed to
  // Security + Search visibility (30 credits).
  await page.getByLabel('Performance').uncheck();
  await page.getByLabel('Design').uncheck();
  await page.getByLabel('Testing').uncheck();
  await page.getByRole('button', { name: 'Accept and run', exact: true }).click();

  // ScanForm's onStart navigates to /scan/<id> (the live-progress screen).
  await page.waitForURL(/\/scan\/[^/]+$/, { timeout: 10_000 });
  const match = /\/scan\/([^/?]+)/.exec(page.url());
  if (match === null) throw new Error(`could not extract scan id from ${page.url()}`);
  const scanId = match[1]!;

  // AI_MODE=fixtures scans complete in a few seconds, not a minute — a long
  // wait here means a stuck job, not a slow-but-working one.
  await page.getByRole('button', { name: 'Open report' }).click({ timeout: 30_000 });
  await page.waitForURL(/\/reports\/[^/]+$/, { timeout: 10_000 });

  return { scanId };
}
