// @vitest-environment jsdom
/**
 * Found via real-browser e2e testing (Playwright against a real built
 * frontend + real API): every one of `tests/e2e/auth/registration.spec.ts`'s
 * three tests failed, stuck on `/signup` after clicking "Create account".
 * The real API returned a real `422` — `POST /auth/register`'s Zod schema
 * (`auth.routes.ts`) allows `name` to be entirely absent (`.optional()`) but
 * rejects it as `.min(1)` when present. The signup form's `name` state
 * defaults to `''` and is passed to `register()` unconditionally
 * (`register(email, password, name)`), so leaving the optional Name field
 * blank — the field's own placeholder and every real-world case where a
 * user skips an optional field — sent `name: ''`, not an omitted field, and
 * every registration with a blank name was refused. This mounts the real
 * `RegisterPage` and proves the bug via the real `register()` call
 * arguments, not by reading source.
 */
import { act, createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderClient } from '../helpers/render-client.js';
import type * as ApiModule from '../../lib/api.js';

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

vi.mock('../../lib/api.js', async (importOriginal) => {
  const actual = await importOriginal<typeof ApiModule>();
  return {
    ...actual,
    register: vi.fn().mockResolvedValue({ message: 'Check your email to confirm your address.' }),
  };
});

function fireInput(el: Element, value: string): void {
  Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('RegisterPage', () => {
  it('never sends an empty-string name — omits it entirely when the optional Name field is left blank', async () => {
    const api = await import('../../lib/api.js');
    const { default: RegisterPage } = await import('../../app/(auth)/signup/page.js');
    const mounted = await renderClient(createElement(RegisterPage));
    try {
      const emailInput = document.querySelector('input[type="email"]');
      const passwordInput = document.querySelector('input[type="password"]');
      expect(emailInput).not.toBeNull();
      expect(passwordInput).not.toBeNull();

      await act(async () => {
        fireInput(emailInput!, 'blank-name@example.com');
        fireInput(passwordInput!, 'correct-horse-battery-staple');
        await Promise.resolve();
      });

      const submitButton = Array.from(document.querySelectorAll('button')).find((b) =>
        /create account/i.test(b.textContent ?? ''),
      );
      expect(submitButton).toBeDefined();
      await act(async () => {
        submitButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(api.register).toHaveBeenCalledWith(
        'blank-name@example.com',
        'correct-horse-battery-staple',
        undefined,
      );
      expect(push).toHaveBeenCalledWith('/verify-email?email=blank-name%40example.com');
    } finally {
      mounted.unmount();
    }
  });

  it('still sends a real, filled-in name', async () => {
    const api = await import('../../lib/api.js');
    const { default: RegisterPage } = await import('../../app/(auth)/signup/page.js');
    const mounted = await renderClient(createElement(RegisterPage));
    try {
      const nameInput = document.querySelector('input[type="text"]');
      const emailInput = document.querySelector('input[type="email"]');
      const passwordInput = document.querySelector('input[type="password"]');

      await act(async () => {
        fireInput(nameInput!, 'Real Name');
        fireInput(emailInput!, 'filled-name@example.com');
        fireInput(passwordInput!, 'correct-horse-battery-staple');
        await Promise.resolve();
      });

      const submitButton = Array.from(document.querySelectorAll('button')).find((b) =>
        /create account/i.test(b.textContent ?? ''),
      );
      await act(async () => {
        submitButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(api.register).toHaveBeenCalledWith(
        'filled-name@example.com',
        'correct-horse-battery-staple',
        'Real Name',
      );
    } finally {
      mounted.unmount();
    }
  });
});
