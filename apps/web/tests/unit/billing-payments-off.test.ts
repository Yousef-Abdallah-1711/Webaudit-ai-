// @vitest-environment jsdom
/**
 * Phase 5 (production-without-Paymob-or-AI master plan), PAYMENTS-FOLLOWUP-1
 * — a live-data (jsdom + real fetch effect) test proving `BillingPage`
 * actually disables/relabels its checkout CTAs when `GET /billing/plans`
 * reports `paymentsEnabled: false`, not just that the static pre-data shell
 * still renders (that's `billing-and-pricing.test.ts`'s job, unchanged).
 */
import { act, createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderClient } from '../helpers/render-client.js';
import type * as ApiModule from '../../lib/api.js';

vi.mock('../../lib/api.js', async (importOriginal) => {
  const actual = await importOriginal<typeof ApiModule>();
  return {
    ...actual,
    getCredits: vi.fn().mockResolvedValue({
      balance: { plan: 10, purchased: 5, planExpiresAt: null },
      subscription: null,
      movements: [],
    }),
    getReceipts: vi.fn().mockResolvedValue({ receipts: [] }),
    getPlans: vi.fn().mockResolvedValue({
      plans: [
        {
          id: 'free',
          name: 'Free',
          monthlyCredits: 50,
          creditsRecur: false,
          allowedInputTypes: ['URL'],
          allowLoadGeneration: false,
          allowReadinessPass: false,
          allowCreditPurchase: false,
          allowCustomCapability: false,
          concurrentScanLimit: 1,
          queuePriority: 100,
          retentionDays: 7,
        },
        {
          id: 'pro',
          name: 'Pro',
          monthlyCredits: 1200,
          creditsRecur: true,
          allowedInputTypes: ['URL', 'ARCHIVE', 'REPOSITORY'],
          allowLoadGeneration: true,
          allowReadinessPass: true,
          allowCreditPurchase: true,
          allowCustomCapability: false,
          concurrentScanLimit: 3,
          queuePriority: 10,
          retentionDays: 90,
        },
      ],
      paymentsEnabled: false,
    }),
  };
});

describe('BillingPage with payments disabled', () => {
  it('disables and relabels the plan-choice buttons instead of leaving them clickable', async () => {
    const { default: BillingPage } = await import('../../app/(dashboard)/billing/page.js');
    const mounted = await renderClient(createElement(BillingPage));
    try {
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });

      const html = mounted.html();
      expect(html).toContain('Contact administrator');
      expect(html).toContain('managed by an administrator');

      const proButton = Array.from(document.querySelectorAll('button')).find((b) =>
        /contact administrator/i.test(b.textContent ?? ''),
      );
      expect(proButton?.hasAttribute('disabled')).toBe(true);
    } finally {
      mounted.unmount();
    }
  });

  it('replaces the "Buy credits" input/button with contact-administrator copy', async () => {
    const { default: BillingPage } = await import('../../app/(dashboard)/billing/page.js');
    const mounted = await renderClient(createElement(BillingPage));
    try {
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });

      const html = mounted.html();
      expect(html).not.toContain('Buy credits');
      expect(html).toContain('Credit purchases are managed by an administrator');
      expect(document.querySelector('input[aria-label="Credits to purchase"]')).toBeNull();
    } finally {
      mounted.unmount();
    }
  });
});
