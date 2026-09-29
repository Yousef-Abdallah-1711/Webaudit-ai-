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
  ApiError: class ApiError extends Error {},
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
      expect(mounted.html()).toContain('Address confirmed');
      expect(mounted.html()).toContain('href="/login"');
    } finally {
      mounted.unmount();
    }
  });
});
