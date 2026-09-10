// @vitest-environment jsdom
/**
 * Sidebar.tsx — found via manual testing (Playwright MCP against a real dev
 * stack): a freshly-registered free-tier account (real balance: 50 credits)
 * showed "1,120 credits left", "Khalid Ahmed", and "Pro plan" in the
 * sidebar — the vendored source's exact placeholder values, never wired to
 * `GET /auth/me`. The mismatch was only visible because a real `402
 * Insufficient credits` refusal (a real, correct refusal) reported the
 * account's real balance (50) right next to a sidebar claiming 1,120.
 *
 * This mounts the real `Sidebar` with a real jsdom + `act` (renderClient),
 * mocking `lib/api`'s `getMe`/`getPlans` so the fix is proven from the
 * actual fetch-and-render path, not by inspecting the source.
 */
import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderClient } from '../helpers/render-client.js';

vi.mock('next/navigation', () => ({
  usePathname: () => '/scan',
}));

vi.mock('../../lib/api.js', () => ({
  getMe: vi.fn().mockResolvedValue({
    id: 'u1',
    email: 'fullstack-check@example.com',
    isOperator: false,
    emailVerified: true,
    plan: 'free',
    credits: { plan: 42, purchased: 8, planExpiresAt: null },
  }),
  getPlans: vi.fn().mockResolvedValue({
    plans: [{ id: 'free', name: 'Free', monthlyCredits: 50 }],
  }),
}));

describe('Sidebar — real identity, plan, and credit balance', () => {
  it('shows the real signed-in email and plan instead of the vendored placeholder', async () => {
    const { Sidebar } = await import('../../components/dashboard/Sidebar.js');
    const mounted = await renderClient(createElement(Sidebar, { open: true, setOpen: () => {} }));
    try {
      const html = mounted.html();
      expect(html).toContain('fullstack-check@example.com');
      expect(html).toContain('Free plan');
      expect(html).not.toContain('Khalid Ahmed');
      expect(html).not.toContain('Pro plan');
    } finally {
      mounted.unmount();
    }
  });

  it('shows the real derived credit total (plan + purchased lots), not the fixed 1,120', async () => {
    const { Sidebar } = await import('../../components/dashboard/Sidebar.js');
    const mounted = await renderClient(createElement(Sidebar, { open: true, setOpen: () => {} }));
    try {
      const html = mounted.html();
      expect(html).toContain('50'); // 42 + 8
      expect(html).not.toContain('1,120');
    } finally {
      mounted.unmount();
    }
  });

  it('derives avatar initials from the real email rather than reusing "KA"', async () => {
    const { Sidebar } = await import('../../components/dashboard/Sidebar.js');
    const mounted = await renderClient(createElement(Sidebar, { open: true, setOpen: () => {} }));
    try {
      // "fullstack-check@example.com" -> words ["fullstack", "check"] -> "FC"
      expect(mounted.html()).toContain('>FC<');
    } finally {
      mounted.unmount();
    }
  });

  it('fills the credits bar as a real fraction of the plan\'s monthly credits, not the fixed 77%', async () => {
    const { Sidebar } = await import('../../components/dashboard/Sidebar.js');
    const mounted = await renderClient(createElement(Sidebar, { open: true, setOpen: () => {} }));
    try {
      // 50 real credits / 50 monthlyCredits for the free plan = 100%.
      expect(mounted.html()).toContain('width: 100%');
      expect(mounted.html()).not.toContain('width: 77%');
    } finally {
      mounted.unmount();
    }
  });
});
