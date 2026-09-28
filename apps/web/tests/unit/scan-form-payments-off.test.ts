// @vitest-environment jsdom
/**
 * Phase 5 (production-without-Paymob-or-AI master plan), P5-T3 — when
 * `getPlans()` reports `paymentsEnabled: false`, an insufficient-credits
 * refusal must point the user at an administrator rather than implying they
 * can buy more credits — a real option `sibling scan-form.test.ts`'s own
 * fixture (payments enabled) correctly leaves alone.
 *
 * Kept in its own file, mirroring this suite's own convention (e.g.
 * `admin-error-paths.test.ts` vs. its sibling static-shell tests): a
 * different `getPlans` mock value per file avoids the fragility of
 * `vi.doMock`/`vi.resetModules` interacting with an already-hoisted
 * `vi.mock` for the same specifier within one file.
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
    getPlans: vi.fn().mockResolvedValue({ plans: [], paymentsEnabled: false }),
  };
});

function fireInput(el: Element, value: string): void {
  Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('ScanForm with payments disabled', () => {
  it('enhances the insufficient-credits message with an administrator pointer, not a purchase prompt', async () => {
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
        // The immediate message, then the getPlans() enhancement — give both
        // microtask chains room to settle.
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
      });

      const html = mounted.html();
      expect(html).toContain('Insufficient credits');
      expect(html).toContain('granted by an administrator');
      expect(html).not.toMatch(/buy|purchase/i);
    } finally {
      mounted.unmount();
    }
  });
});
