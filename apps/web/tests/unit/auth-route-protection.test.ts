// @vitest-environment jsdom
import { act, createElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderClient } from '../helpers/render-client.js';
import { useAuth } from '../../components/auth/AuthProvider.js';

const push = vi.fn();
let pathname = '/scan';
let search = '';

vi.mock('next/navigation', () => ({
  usePathname: () => pathname,
  useRouter: () => ({ push, replace: push }),
}));

vi.mock('../../lib/api.js', () => ({
  ApiError: class ApiError extends Error {
    constructor(
      readonly status: number,
      readonly code: string,
      message: string,
    ) {
      super(message);
    }
  },
  getMe: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
  refreshAccessToken: vi.fn(),
  setAccessToken: vi.fn(),
  subscribeToUnauthorized: vi.fn(() => () => undefined),
}));

const customer = {
  id: 'customer-1',
  email: 'customer@example.com',
  name: null,
  isOperator: false,
  emailVerified: true,
  plan: 'free' as const,
  githubLogin: null,
  credits: { plan: 50, purchased: 0, planExpiresAt: null },
};

function AuthActions(): React.ReactElement {
  const auth = useAuth();
  return createElement(
    'div',
    null,
    createElement('span', { id: 'auth-status' }, auth.status),
    createElement(
      'button',
      { type: 'button', onClick: () => void auth.login('customer@example.com', 'password') },
      'login',
    ),
    createElement('button', { type: 'button', onClick: () => void auth.logout() }, 'logout'),
  );
}

describe('AuthProvider and RouteGuard', () => {
  beforeEach(() => {
    push.mockReset();
    pathname = '/scan';
    search = '';
    window.history.replaceState(null, '', '/scan');
  });

  it('does not render protected content while identity is being resolved', async () => {
    const api = await import('../../lib/api.js');
    vi.mocked(api.getMe).mockReturnValue(new Promise(() => undefined));
    const { AuthProvider } = await import('../../components/auth/AuthProvider.js');
    const { RouteGuard } = await import('../../components/auth/RouteGuard.js');

    const mounted = await renderClient(
      createElement(AuthProvider, null, createElement(RouteGuard, null, 'protected dashboard')),
    );
    try {
      expect(mounted.html()).not.toContain('protected dashboard');
      expect(push).not.toHaveBeenCalled();
    } finally {
      mounted.unmount();
    }
  });

  it('redirects an anonymous deep link to login with a safe internal next path', async () => {
    const api = await import('../../lib/api.js');
    const error = new api.ApiError(401, 'UNAUTHORIZED', 'Unauthenticated');
    vi.mocked(api.getMe).mockRejectedValue(error);
    vi.mocked(api.refreshAccessToken).mockRejectedValue(error);
    pathname = '/reports/scan-1';
    search = 'tab=issues';
    window.history.replaceState(null, '', `${pathname}?${search}`);
    const { AuthProvider } = await import('../../components/auth/AuthProvider.js');
    const { RouteGuard } = await import('../../components/auth/RouteGuard.js');

    const mounted = await renderClient(
      createElement(AuthProvider, null, createElement(RouteGuard, null, 'protected dashboard')),
    );
    try {
      expect(mounted.html()).not.toContain('protected dashboard');
      expect(push).toHaveBeenCalledWith('/login?next=%2Freports%2Fscan-1%3Ftab%3Dissues');
    } finally {
      mounted.unmount();
    }
  });

  it('sends an authenticated non-operator away from admin without rendering its shell', async () => {
    const api = await import('../../lib/api.js');
    vi.mocked(api.getMe).mockResolvedValue(customer);
    pathname = '/admin/providers';
    search = '';
    const { AuthProvider } = await import('../../components/auth/AuthProvider.js');
    const { RouteGuard } = await import('../../components/auth/RouteGuard.js');

    const mounted = await renderClient(
      createElement(
        AuthProvider,
        null,
        createElement(RouteGuard, { requireOperator: true }, 'admin shell'),
      ),
    );
    try {
      expect(mounted.html()).not.toContain('admin shell');
      expect(push).toHaveBeenCalledWith('/scan');
    } finally {
      mounted.unmount();
    }
  });

  it('allows an authenticated operator into admin', async () => {
    const api = await import('../../lib/api.js');
    vi.mocked(api.getMe).mockResolvedValue({ ...customer, isOperator: true });
    pathname = '/admin';
    const { AuthProvider } = await import('../../components/auth/AuthProvider.js');
    const { RouteGuard } = await import('../../components/auth/RouteGuard.js');

    const mounted = await renderClient(
      createElement(
        AuthProvider,
        null,
        createElement(RouteGuard, { requireOperator: true }, 'operator console'),
      ),
    );
    try {
      expect(mounted.html()).toContain('operator console');
      expect(push).not.toHaveBeenCalled();
    } finally {
      mounted.unmount();
    }
  });

  it('refreshes identity after login and clears both token and UI state on logout', async () => {
    const api = await import('../../lib/api.js');
    vi.mocked(api.getMe).mockResolvedValue(customer);
    vi.mocked(api.login).mockResolvedValue({ accessToken: 'new-access-token' });
    vi.mocked(api.logout).mockResolvedValue(undefined);
    const { AuthProvider } = await import('../../components/auth/AuthProvider.js');

    const mounted = await renderClient(
      createElement(AuthProvider, null, createElement(AuthActions)),
    );
    try {
      expect(mounted.html()).toContain('authenticated');
      await act(async () => {
        (document.querySelector('button') as HTMLButtonElement).click();
        await Promise.resolve();
      });
      expect(api.login).toHaveBeenCalledWith('customer@example.com', 'password');
      expect(mounted.html()).toContain('authenticated');

      await act(async () => {
        (document.querySelectorAll('button')[1] as HTMLButtonElement).click();
        await Promise.resolve();
      });
      expect(api.logout).toHaveBeenCalledOnce();
      expect(api.setAccessToken).toHaveBeenCalledWith(undefined);
      expect(mounted.html()).toContain('anonymous');
    } finally {
      mounted.unmount();
    }
  });

  it('removes authenticated UI when another API operation reports 401', async () => {
    const api = await import('../../lib/api.js');
    let onUnauthorized: (() => void) | undefined;
    vi.mocked(api.getMe).mockResolvedValue(customer);
    vi.mocked(api.subscribeToUnauthorized).mockImplementation((listener) => {
      onUnauthorized = listener;
      return () => undefined;
    });
    const { AuthProvider } = await import('../../components/auth/AuthProvider.js');

    const mounted = await renderClient(
      createElement(AuthProvider, null, createElement(AuthActions)),
    );
    try {
      expect(mounted.html()).toContain('authenticated');
      await act(async () => {
        onUnauthorized?.();
        await Promise.resolve();
      });
      expect(mounted.html()).toContain('anonymous');
    } finally {
      mounted.unmount();
    }
  });

  it('rejects external or protocol-relative next destinations', async () => {
    const { safeNextDestination } = await import('../../components/auth/RouteGuard.js');
    expect(safeNextDestination('https://attacker.example')).toBe('/scan');
    expect(safeNextDestination('//attacker.example')).toBe('/scan');
    expect(safeNextDestination('/reports/scan-1')).toBe('/reports/scan-1');
  });

  it('shows the admin entry only to an authenticated operator in public navigation', async () => {
    const api = await import('../../lib/api.js');
    const { AuthProvider } = await import('../../components/auth/AuthProvider.js');
    const { PublicHeader, PublicFooter } = await import('../../components/public/Public.js');

    vi.mocked(api.getMe).mockResolvedValue(customer);
    const customerNav = await renderClient(
      createElement(
        AuthProvider,
        null,
        createElement('div', null, createElement(PublicHeader), createElement(PublicFooter)),
      ),
    );
    try {
      expect(customerNav.html()).toContain('href="/scan"');
      expect(customerNav.html()).not.toContain('href="/admin"');
    } finally {
      customerNav.unmount();
    }

    vi.mocked(api.getMe).mockResolvedValue({ ...customer, isOperator: true });
    const operatorNav = await renderClient(
      createElement(
        AuthProvider,
        null,
        createElement('div', null, createElement(PublicHeader), createElement(PublicFooter)),
      ),
    );
    try {
      expect(operatorNav.html()).toContain('href="/admin"');
    } finally {
      operatorNav.unmount();
    }
  });
});
