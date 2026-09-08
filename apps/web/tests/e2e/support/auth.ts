import type { Page } from '@playwright/test';
import type { Stack } from './stack.js';

export interface Creds {
  readonly email: string;
  readonly password: string;
}

/** Registers through the real API, then verifies the same way every apps/api
 * contract test does (there is no verification-EMAIL to click in dev — mail
 * is console-logged, not delivered; RESEND_API_KEY is unset). Verifying
 * through the database, not a shortcut around registration itself, which
 * still goes through the real HTTP endpoint. */
export async function registerAndVerify(stack: Stack, creds: Creds): Promise<void> {
  const res = await fetch(`${stack.apiBaseUrl}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(creds),
  });
  if (res.status !== 201) {
    throw new Error(`register failed: ${String(res.status)} ${await res.text()}`);
  }
  await stack.db.user.update({
    where: { email: creds.email },
    data: { emailVerifiedAt: new Date() },
  });
}

export async function promoteToOperator(stack: Stack, email: string): Promise<void> {
  await stack.db.user.update({ where: { email }, data: { isOperator: true } });
}

/** Drives the REAL /login form — this is the point of this plan, not a
 * localStorage shortcut. */
export async function loginViaUi(page: Page, webBaseUrl: string, creds: Creds): Promise<void> {
  await page.goto(`${webBaseUrl}/login`);
  await page.getByLabel('Email').fill(creds.email);
  await page.getByLabel('Password').fill(creds.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL(/\/scan$/, { timeout: 10_000 });
}
