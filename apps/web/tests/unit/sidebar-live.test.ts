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
import { act, createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderClient } from '../helpers/render-client.js';
import styles from '../../components/dashboard/Sidebar.module.css';

const { logoutMock, replaceMock } = vi.hoisted(() => ({
  logoutMock: vi.fn(),
  replaceMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/scan',
  useRouter: () => ({ replace: replaceMock }),
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
  getOutstandingIssueCount: vi.fn().mockResolvedValue({ count: 7 }),
  logout: logoutMock,
  refreshAccessToken: vi.fn(),
  setAccessToken: vi.fn(),
  subscribeToUnauthorized: vi.fn(() => () => undefined),
}));

describe('Sidebar — real identity, plan, and credit balance', () => {
  it('opens an accessible account menu from the profile button', async () => {
    const { Sidebar } = await import('../../components/dashboard/Sidebar.js');
    const { AuthProvider } = await import('../../components/auth/AuthProvider.js');
    const mounted = await renderClient(
      createElement(AuthProvider, null, createElement(Sidebar, { open: true, setOpen: () => {} })),
    );
    try {
      const trigger = document.querySelector<HTMLButtonElement>(
        'button[aria-label="Account menu"]',
      );
      expect(trigger).not.toBeNull();
      expect(trigger?.getAttribute('aria-expanded')).toBe('false');

      await act(async () => {
        trigger?.click();
      });

      expect(trigger?.getAttribute('aria-expanded')).toBe('true');
      const menu = document.body.querySelector('[role="menu"]');
      expect(menu).not.toBeNull();
      expect(menu?.querySelectorAll('[role="menuitem"]')).toHaveLength(3);
      expect(menu?.querySelector('a[href="/settings"]')?.textContent).toBe('Profile');
      expect(menu?.querySelector('a[href="/billing"]')?.textContent).toBe('Billing and plans');
      expect(menu?.textContent).toContain('Sign out');
    } finally {
      mounted.unmount();
    }
  });

  it('closes the account menu on Escape and outside click', async () => {
    const { Sidebar } = await import('../../components/dashboard/Sidebar.js');
    const { AuthProvider } = await import('../../components/auth/AuthProvider.js');
    const mounted = await renderClient(
      createElement(AuthProvider, null, createElement(Sidebar, { open: true, setOpen: () => {} })),
    );
    try {
      const trigger = document.querySelector<HTMLButtonElement>(
        'button[aria-label="Account menu"]',
      );
      await act(async () => {
        trigger?.click();
      });
      expect(document.body.querySelector('[role="menu"]')).not.toBeNull();

      await act(async () => {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      });
      expect(document.body.querySelector('[role="menu"]')).toBeNull();
      expect(trigger?.getAttribute('aria-expanded')).toBe('false');

      await act(async () => {
        trigger?.click();
      });
      expect(document.body.querySelector('[role="menu"]')).not.toBeNull();
      await act(async () => {
        document.dispatchEvent(new Event('pointerdown', { bubbles: true }));
      });
      expect(document.body.querySelector('[role="menu"]')).toBeNull();
    } finally {
      mounted.unmount();
    }
  });

  it('logs out and returns to the public home from the account menu', async () => {
    logoutMock.mockClear();
    replaceMock.mockClear();
    const { Sidebar } = await import('../../components/dashboard/Sidebar.js');
    const { AuthProvider } = await import('../../components/auth/AuthProvider.js');
    const mounted = await renderClient(
      createElement(AuthProvider, null, createElement(Sidebar, { open: true, setOpen: () => {} })),
    );
    try {
      await act(async () => {
        document.querySelector<HTMLButtonElement>('button[aria-label="Account menu"]')?.click();
      });
      await act(async () => {
        document.body.querySelector<HTMLButtonElement>('[role="menuitem"]:last-child')?.click();
      });
      expect(logoutMock).toHaveBeenCalledOnce();
      expect(replaceMock).toHaveBeenCalledWith('/');
    } finally {
      mounted.unmount();
    }
  });

  it('shows the real outstanding issue count instead of a fixed badge', async () => {
    const { Sidebar } = await import('../../components/dashboard/Sidebar.js');
    const { AuthProvider } = await import('../../components/auth/AuthProvider.js');
    const mounted = await renderClient(
      createElement(AuthProvider, null, createElement(Sidebar, { open: true, setOpen: () => {} })),
    );
    try {
      expect(mounted.html()).toContain('>7<');
      expect(mounted.html()).not.toContain('>4<');
    } finally {
      mounted.unmount();
    }
  });

  it('shows the real signed-in email and plan instead of the vendored placeholder', async () => {
    const { Sidebar } = await import('../../components/dashboard/Sidebar.js');
    const { AuthProvider } = await import('../../components/auth/AuthProvider.js');
    const mounted = await renderClient(
      createElement(AuthProvider, null, createElement(Sidebar, { open: true, setOpen: () => {} })),
    );
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
    const { AuthProvider } = await import('../../components/auth/AuthProvider.js');
    const mounted = await renderClient(
      createElement(AuthProvider, null, createElement(Sidebar, { open: true, setOpen: () => {} })),
    );
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
    const { AuthProvider } = await import('../../components/auth/AuthProvider.js');
    const mounted = await renderClient(
      createElement(AuthProvider, null, createElement(Sidebar, { open: true, setOpen: () => {} })),
    );
    try {
      // "fullstack-check@example.com" -> words ["fullstack", "check"] -> "FC"
      expect(mounted.html()).toContain('>FC<');
    } finally {
      mounted.unmount();
    }
  });

  it("fills the credits bar as a real fraction of the plan's monthly credits, not the fixed 77%", async () => {
    const { Sidebar } = await import('../../components/dashboard/Sidebar.js');
    const { AuthProvider } = await import('../../components/auth/AuthProvider.js');
    const mounted = await renderClient(
      createElement(AuthProvider, null, createElement(Sidebar, { open: true, setOpen: () => {} })),
    );
    try {
      // 50 real credits / 50 monthlyCredits for the free plan = 100%.
      expect(mounted.html()).toContain('width: 100%');
      expect(mounted.html()).not.toContain('width: 77%');
    } finally {
      mounted.unmount();
    }
  });
});

describe('AppShell — mobile sidebar drawer', () => {
  async function mountShell() {
    const { AppShell } = await import('../../components/dashboard/Sidebar.js');
    const { AuthProvider } = await import('../../components/auth/AuthProvider.js');
    return renderClient(
      createElement(AuthProvider, null, createElement(AppShell, null, 'dashboard page')),
    );
  }

  it('opens from the translated mobile trigger and closes from the backdrop', async () => {
    const mounted = await mountShell();
    const originalOverflow = document.body.style.overflow;
    try {
      const trigger = document.querySelector<HTMLButtonElement>(
        'button[aria-label="Open navigation menu"]',
      );
      expect(trigger).not.toBeNull();
      expect(trigger?.getAttribute('aria-expanded')).toBe('false');

      await act(async () => {
        trigger?.click();
      });

      expect(trigger?.getAttribute('aria-expanded')).toBe('true');
      expect(document.querySelector(`.${styles.mobileBackdrop}`)).not.toBeNull();
      expect(document.body.style.overflow).toBe('hidden');

      await act(async () => {
        document.querySelector<HTMLElement>(`.${styles.mobileBackdrop}`)?.click();
      });

      expect(trigger?.getAttribute('aria-expanded')).toBe('false');
      expect(document.querySelector(`.${styles.mobileBackdrop}`)).toBeNull();
      expect(document.body.style.overflow).toBe(originalOverflow);
    } finally {
      mounted.unmount();
      document.body.style.overflow = originalOverflow;
    }
  });

  it('closes on Escape and keeps the account menu portal usable while open', async () => {
    const mounted = await mountShell();
    const originalOverflow = document.body.style.overflow;
    try {
      const trigger = document.querySelector<HTMLButtonElement>(
        'button[aria-label="Open navigation menu"]',
      );
      await act(async () => {
        trigger?.click();
      });

      const accountTrigger = document.querySelector<HTMLButtonElement>(
        'button[aria-label="Account menu"]',
      );
      expect(accountTrigger).not.toBeNull();
      await act(async () => {
        accountTrigger?.click();
      });
      const accountMenu = document.body.querySelector('[role="menu"]');
      expect(accountMenu).not.toBeNull();
      expect(accountMenu?.parentElement).toBe(document.body);
      expect(accountMenu?.getAttribute('style')).toContain('visibility: visible');

      await act(async () => {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      });

      expect(trigger?.getAttribute('aria-expanded')).toBe('false');
      expect(document.querySelector(`.${styles.mobileBackdrop}`)).toBeNull();
      expect(document.body.style.overflow).toBe(originalOverflow);
    } finally {
      mounted.unmount();
      document.body.style.overflow = originalOverflow;
    }
  });
});
