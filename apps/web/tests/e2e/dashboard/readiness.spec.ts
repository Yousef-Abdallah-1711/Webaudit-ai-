import { test, expect } from '@playwright/test';
import { startStack, type Stack } from '../support/stack.js';
import { registerAndVerify, loginViaUi } from '../support/auth.js';
import { runScanToCompletion } from '../support/journey.js';
import { startFixtureSite, type FixtureSite } from '../fixtures/static-site.js';

let stack: Stack;
let fixture: FixtureSite;
const creds = { email: 'readiness@example.com', password: 'correct-horse-battery-staple' };

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

test('a free-tier account cannot actually run a readiness pass — the real reason is visible', async ({
  page,
}) => {
  // The seeded free plan has both `allowReadinessPass: false` and only 50
  // credits (READINESS_PASS_COST is 60) — apps/api/src/services/readiness/
  // create.ts's own entitlement check runs before the premature check, so a
  // free account is refused regardless of the baseline's issue mix. Which of
  // the two visible states this test lands on depends on whether the fixture
  // scan happens to produce a critical/high issue (readiness/page.tsx's own
  // GET-side "premature" computation is independent of plan entitlement) —
  // both are real, both are correct, so this asserts whichever the page
  // actually shows rather than assuming one.
  await loginViaUi(page, stack.webBaseUrl, creds);
  const { scanId } = await runScanToCompletion(page, fixture);

  await page.goto(`${stack.webBaseUrl}/readiness?scan=${scanId}`);
  const runButton = page.getByRole('button', { name: /Run readiness pass/ });
  await expect(runButton).toBeVisible({ timeout: 10_000 });

  if (await runButton.isDisabled()) {
    // Premature: the offer is shown but refused for having outstanding
    // critical/high issues, per FR-066's own copy.
    await expect(page.getByText(/still outstanding/)).toBeVisible();
  } else {
    await runButton.click();
    // create.ts's real ReadinessNotOnPlanError message, surfaced verbatim by
    // readiness/page.tsx's onStart catch block.
    await expect(
      page.getByText('The current plan does not include the production-readiness pass.'),
    ).toBeVisible({ timeout: 10_000 });
  }
});
