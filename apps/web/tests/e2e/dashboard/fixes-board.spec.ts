import { test, expect } from '@playwright/test';
import { startStack, type Stack } from '../support/stack.js';
import { registerAndVerify, loginViaUi } from '../support/auth.js';
import { runScanToCompletion } from '../support/journey.js';
import { startFixtureSite, type FixtureSite } from '../fixtures/static-site.js';

let stack: Stack;
let fixture: FixtureSite;
const creds = { email: 'fixes-board@example.com', password: 'correct-horse-battery-staple' };

test.beforeAll(async () => {
  test.setTimeout(180_000);
  fixture = await startFixtureSite();
  process.env['SAFE_NET_ALLOW_TARGETS'] = fixture.origin;
  stack = await startStack();
  await registerAndVerify(stack, creds);
});

test.afterAll(async () => {
  await stack.stop();
  await fixture.close();
  delete process.env['SAFE_NET_ALLOW_TARGETS'];
});

test('the fixes board lists real issues from a completed scan and re-verify reaches a terminal state', async ({
  page,
}) => {
  await loginViaUi(page, stack.webBaseUrl, creds);
  const { scanId } = await runScanToCompletion(page, fixture);

  // fixes/page.tsx reads which audit's issues to show from ?scan=<id> — the
  // sidebar's own "Fixes" link is not scan-specific.
  await page.goto(`${stack.webBaseUrl}/fixes?scan=${scanId}`);

  // IssueRow.tsx has no stable data-testid; its real, always-visible button
  // copy ("I fixed this — 3 cr", IssueCard.prompt.md's own rule for this
  // control) is the stable selector — scoped to the first row via `.first()`
  // rather than guessing at a hashed CSS-module row class.
  const assertButton = page.getByRole('button', { name: 'I fixed this — 3 cr' }).first();
  await expect(assertButton).toBeVisible({ timeout: 10_000 });

  await assertButton.click();
  await expect(page.getByRole('button', { name: 'Re-checking…' }).first()).toBeVisible({
    timeout: 5_000,
  });

  // AI_MODE=fixtures resolves re-verification deterministically and fast —
  // assert a terminal state is reached (the button leaves "Re-checking…"),
  // not which one: the fixture's canned reverify outcome is not this test's
  // concern, only that the real assert-fixed -> re-check -> realtime-update
  // loop completes end to end.
  await expect(page.getByRole('button', { name: 'Re-checking…' })).toHaveCount(0, {
    timeout: 15_000,
  });
});
