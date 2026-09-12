// @vitest-environment jsdom
import { act, createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderClient } from '../helpers/render-client.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('IssueCard copy control', () => {
  it('writes the real fix prompt to the clipboard before showing Copied', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    const { IssueCard } = await import('../../components/report/IssueCard.js');
    const mounted = await renderClient(
      createElement(IssueCard, { title: 'Missing CSP', prompt: 'Add a strict CSP header.' }),
    );
    try {
      const button = document.querySelector('button');
      expect(button).toBeTruthy();
      await act(async () => {
        button!.click();
        await Promise.resolve();
      });
      expect(writeText).toHaveBeenCalledWith('Add a strict CSP header.');
      expect(mounted.html()).toContain('Copied');
    } finally {
      mounted.unmount();
    }
  });
});
