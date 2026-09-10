// @vitest-environment jsdom
/**
 * ScanForm.tsx — found via manual testing (Playwright MCP against a real dev
 * stack): submitting a quote that exceeded the account's real balance showed
 * "Insufficient credits: 80 required, 50 available", and the message stayed
 * on screen even after deselecting areas down to a quote the account could
 * actually afford — a stale refusal describing a selection the user had
 * already abandoned. `onSubmit` only ever cleared `error` at the *start* of
 * the next submit; nothing cleared it when the selection itself changed.
 *
 * This mounts the real `ScanForm` with a real jsdom + `act` (renderClient),
 * types a URL (InputTabs reports a real `InputSelection` from its own
 * effect), submits once against a mocked 402, then toggles a checkbox and
 * asserts the stale message is gone — proving the fix from the actual
 * `toggle` handler, not from a second submit.
 */
import { act, createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderClient } from '../helpers/render-client.js';
import type * as ApiModule from '../../lib/api.js';

vi.mock('../../lib/api.js', async (importOriginal) => {
  const actual = await importOriginal<typeof ApiModule>();
  return {
    ...actual,
    createTarget: vi.fn().mockResolvedValue({ target: { id: 't1' } }),
    quoteScan: vi.fn().mockResolvedValue({ quote: { credits: 80 } }),
    createScan: vi
      .fn()
      .mockRejectedValue(
        new actual.ApiError(
          402,
          'INSUFFICIENT_CREDITS',
          'Insufficient credits: 80 required, 50 available',
        ),
      ),
  };
});

function fireInput(el: Element, value: string): void {
  Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('ScanForm', () => {
  it('clears a stale "insufficient credits" error once the user changes the area selection', async () => {
    const { ScanForm } = await import('../../components/scan/ScanForm.js');
    const mounted = await renderClient(createElement(ScanForm, {}));
    try {
      const urlInput = document.querySelector('input:not([type="checkbox"])');
      expect(urlInput).not.toBeNull();
      await act(async () => {
        fireInput(urlInput!, 'example.com');
        await Promise.resolve();
      });

      const submitButton = Array.from(document.querySelectorAll('button')).find((b) =>
        /accept and run/i.test(b.textContent ?? ''),
      );
      expect(submitButton).toBeDefined();
      await act(async () => {
        submitButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(mounted.html()).toContain('Insufficient credits');

      const checkbox = document.querySelector('input[type="checkbox"]');
      expect(checkbox).not.toBeNull();
      await act(async () => {
        checkbox!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        await Promise.resolve();
      });

      expect(mounted.html()).not.toContain('Insufficient credits');
    } finally {
      mounted.unmount();
    }
  });
});
