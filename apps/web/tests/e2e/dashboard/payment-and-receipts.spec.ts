/**
 * Group B — the biggest real-browser coverage gap identified in the
 * production-readiness delta review: checkout, webhook confirmation, and
 * receipts (T264-T266) had full unit/integration coverage but had never been
 * driven through a real browser end to end. This also exercises the fix
 * that closed T263's own acceptance criterion — the stub `PaymentProvider`
 * must be "wired-by-default-in-dev/test" — which `startApi()` (what
 * `startStack()` below actually calls) did not do until now.
 *
 * The stub gateway has no real hosted checkout page, so the real browser
 * navigation to its `checkoutUrl` is fulfilled locally (`page.route`) rather
 * than left to hit a dead host — the point being to prove the app really
 * redirects there, not to render a page nothing in this system serves. The
 * webhook confirmation is a real, HMAC-signed HTTP call to the running
 * stack's own `/webhooks/billing`, the same shape a real payment gateway
 * would send — not an in-process shortcut.
 */
import { createHmac } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { startStack, type Stack } from '../support/stack.js';
import { registerAndVerify, loginViaUi, type Creds } from '../support/auth.js';

let stack: Stack;
const previousRedisUrl = process.env['REDIS_URL'];
const owner: Creds = {
  email: 'payment-owner@example.com',
  password: 'correct-horse-battery-staple',
};
const other: Creds = {
  email: 'payment-other@example.com',
  password: 'correct-horse-battery-staple',
};

test.beforeAll(async () => {
  test.setTimeout(180_000);
  process.env['REDIS_URL'] = 'redis://localhost:6389/14';
  stack = await startStack();
  await registerAndVerify(stack, owner);
  await registerAndVerify(stack, other);
});

test.afterAll(async () => {
  await stack.stop();
  if (previousRedisUrl === undefined) delete process.env['REDIS_URL'];
  else process.env['REDIS_URL'] = previousRedisUrl;
});

function signWebhook(event: Record<string, unknown>): { raw: string; signature: string } {
  const raw = JSON.stringify({ events: [event] });
  const signature = createHmac('sha256', 'e2e-stack-webhook-secret').update(raw).digest('hex');
  return { raw, signature };
}

test('subscribing redirects to a real checkout, a signed webhook confirms it, and a scoped receipt appears', async ({
  page,
  context,
}) => {
  const user = await stack.db.user.findUniqueOrThrow({ where: { email: owner.email } });

  // The stub provider has no real hosted checkout page — fulfil the
  // navigation locally so the real redirect is provable without hitting a
  // dead host.
  await context.route('**/checkout/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: '<html><body>stub checkout</body></html>',
    }),
  );

  await loginViaUi(page, stack.webBaseUrl, owner);
  await page.goto(`${stack.webBaseUrl}/billing`);
  await expect(page.getByText('Free plan')).toBeVisible();

  await page.getByRole('button', { name: 'Choose Pro' }).click();
  await page.waitForURL(/\/checkout\//, { timeout: 15_000 });
  const checkoutUrl = page.url();
  const providerReference = new URL(checkoutUrl).pathname.split('/checkout/')[1]!;
  const amountMicros = Number(providerReference.split('_').pop());
  expect(amountMicros).toBeGreaterThan(0);

  // No plan or credit grant exists yet — checkout initiation alone must not
  // have applied any value (T264's own core acceptance criterion).
  await page.goto(`${stack.webBaseUrl}/billing`);
  await expect(page.getByText('Free plan')).toBeVisible();

  const { raw, signature } = signWebhook({
    id: 'evt_e2e_subscribe_1',
    type: 'payment.succeeded',
    providerReference,
    userId: user.id,
    amountMicros,
    metadata: { kind: 'subscription', planId: 'pro' },
  });
  const webhookRes = await fetch(`${stack.apiBaseUrl}/webhooks/billing`, {
    method: 'POST',
    headers: { 'x-webhook-signature': signature },
    body: raw,
  });
  expect(webhookRes.status).toBe(200);

  await page.goto(`${stack.webBaseUrl}/billing`);
  await expect(page.getByText('pro plan · renews', { exact: false })).toBeVisible();

  // A real, viewable receipt exists for the confirmed payment.
  const receiptRow = page.locator('a', { hasText: 'subscription' }).first();
  await expect(receiptRow).toBeVisible();
  await receiptRow.click();
  await page.waitForURL(/\/billing\/receipts\//);
  const frame = page.frameLocator('iframe[title="Payment receipt"]');
  await expect(frame.getByText('Payment receipt')).toBeVisible();
  await expect(frame.getByText(providerReference)).toBeVisible();
  const receiptId = page.url().split('/billing/receipts/')[1]!;

  // Ownership check: a different, unrelated user cannot view this receipt.
  await loginViaUi(page, stack.webBaseUrl, other);
  await page.goto(`${stack.webBaseUrl}/billing/receipts/${receiptId}`);
  await expect(page.getByText('No such receipt.')).toBeVisible();
});
