// @vitest-environment jsdom
import { act, createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderClient } from '../helpers/render-client.js';

const persistedChain: Array<{
  vendor: string;
  model: string;
  position: number;
  isEnabled: boolean;
}> = [
  { vendor: 'anthropic', model: 'claude-3-5-sonnet', position: 0, isEnabled: true },
  { vendor: 'openai', model: 'gpt-4o', position: 1, isEnabled: true },
];
let currentChain = [...persistedChain];

const getAdminProviders = vi.fn(async () => ({ chain: currentChain }));
const setAdminProviderChain = vi.fn(async (chain: typeof currentChain) => {
  currentChain = chain.map((entry, position) => ({ ...entry, position }));
  return { chain: currentChain };
});

vi.mock('../../lib/api.js', () => ({
  getAdminProviders,
  setAdminProviderChain,
}));

describe('admin providers live wiring', () => {
  it('loads the persisted chain, saves a reorder, and reflects it after reload', async () => {
    const { default: AdminProvidersPage } =
      await import('../../app/(admin)/admin/providers/page.js');
    const mounted = await renderClient(createElement(AdminProvidersPage));

    try {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 25));
      });
      expect(mounted.html()).toContain('claude-3-5-sonnet');
      expect(mounted.html()).not.toContain('gemini');

      const down = [...document.querySelectorAll('button')].find(
        (button) => button.textContent === 'Down',
      );
      expect(down).toBeDefined();
      await act(async () => {
        down!.click();
        await Promise.resolve();
      });

      expect(setAdminProviderChain).toHaveBeenCalledWith([
        { vendor: 'openai', model: 'gpt-4o', isEnabled: true },
        { vendor: 'anthropic', model: 'claude-3-5-sonnet', isEnabled: true },
      ]);
      expect(mounted.html().indexOf('gpt-4o')).toBeLessThan(
        mounted.html().indexOf('claude-3-5-sonnet'),
      );

      mounted.unmount();
      const reloaded = await renderClient(createElement(AdminProvidersPage));
      try {
        await act(async () => {
          await new Promise((resolve) => setTimeout(resolve, 25));
        });
        expect(getAdminProviders).toHaveBeenCalledTimes(2);
        expect(reloaded.html().indexOf('gpt-4o')).toBeLessThan(
          reloaded.html().indexOf('claude-3-5-sonnet'),
        );
      } finally {
        reloaded.unmount();
      }
    } finally {
      // The reload branch owns its own mount; the original is unmounted above.
    }
  });
});
