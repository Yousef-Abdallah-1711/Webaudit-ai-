// @vitest-environment jsdom
import { act, createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderClient } from '../helpers/render-client.js';

const { verifyEmail, resendVerification } = vi.hoisted(() => ({
  verifyEmail: vi.fn(),
  resendVerification: vi.fn(),
}));
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams('?token=single-use-token'),
}));
vi.mock('../../lib/api.js', () => ({
  ApiError: class ApiError extends Error {
    constructor(readonly status: number) {
      super('API request failed');
    }
  },
  resendVerification,
  verifyEmail,
}));
vi.mock('../../components/auth/AuthProvider.js', () => ({
  useAuth: () => ({ status: 'anonymous', isOperator: false }),
}));

afterEach(() => {
  verifyEmail.mockReset();
  resendVerification.mockReset();
});

describe('VerifyPage token confirmation', () => {
  it('waits for an explicit click before verifying, then offers sign in', async () => {
    verifyEmail.mockResolvedValue({ message: 'confirmed' });
    const { default: VerifyPage } = await import('../../app/(auth)/verify-email/page.js');
    const mounted = await renderClient(createElement(VerifyPage));
    try {
      expect(mounted.html()).toContain('Confirm your email');
      expect(mounted.html()).toContain('Confirm Email Address');
      expect(verifyEmail).not.toHaveBeenCalled();

      await act(async () => {
        Array.from(document.querySelectorAll('button'))
          .find((button) => button.textContent?.includes('Confirm Email Address'))!
          .click();
        await Promise.resolve();
      });

      expect(verifyEmail).toHaveBeenCalledWith('single-use-token');
      expect(mounted.html()).toContain('Email verified successfully');
      expect(mounted.html()).toContain(
        'Your email address has been confirmed. Your account is ready.',
      );
      expect(mounted.html()).toContain('You can safely close this page.');
      expect(mounted.html()).toContain('href="/login"');
    } finally {
      mounted.unmount();
    }
  });

  it('shows the same calm invalid-link state for any client error', async () => {
    const { ApiError } = await import('../../lib/api.js');
    verifyEmail.mockRejectedValue(new ApiError(410));
    const { default: VerifyPage } = await import('../../app/(auth)/verify-email/page.js');
    const mounted = await renderClient(createElement(VerifyPage));
    try {
      await act(async () => {
        Array.from(document.querySelectorAll('button'))
          .find((button) => button.textContent?.includes('Confirm Email Address'))!
          .click();
        await Promise.resolve();
      });

      expect(mounted.html()).toContain('This link is no longer valid');
      expect(mounted.html()).toContain('Start again');
      expect(mounted.html()).not.toContain('Email verified successfully');
    } finally {
      mounted.unmount();
    }
  });

  it('offers retry after a transient verification failure', async () => {
    verifyEmail.mockRejectedValueOnce(new Error('Network unavailable'));
    verifyEmail.mockResolvedValueOnce({ message: 'confirmed' });
    const { default: VerifyPage } = await import('../../app/(auth)/verify-email/page.js');
    const mounted = await renderClient(createElement(VerifyPage));
    try {
      await act(async () => {
        Array.from(document.querySelectorAll('button'))
          .find((button) => button.textContent?.includes('Confirm Email Address'))!
          .click();
        await Promise.resolve();
      });

      expect(mounted.html()).toContain('Something went wrong. Please try again.');
      expect(mounted.html()).toContain('Try again');
      expect(mounted.html()).not.toContain('Start again');

      await act(async () => {
        Array.from(document.querySelectorAll('button'))
          .find((button) => button.textContent?.includes('Try again'))!
          .click();
        await Promise.resolve();
      });

      expect(verifyEmail).toHaveBeenNthCalledWith(2, 'single-use-token');
      expect(mounted.html()).toContain('Email verified successfully');
    } finally {
      mounted.unmount();
    }
  });
});
