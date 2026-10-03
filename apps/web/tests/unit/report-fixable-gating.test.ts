// @vitest-environment jsdom
/**
 * Phase 6 (production-without-Paymob-or-AI master plan), P6-T2 — the report
 * page must not offer a "copy fix prompt" action on a finding the capability
 * itself declared not fixable (`CapabilityFinding.fixable`, now persisted on
 * `Issue.fixable` — see the schema migration and `persist.ts`). The three
 * `contradiction.*` findings are the real-world case (Phase 0's own
 * classification, master plan): meta/QA-of-the-audit findings with no code
 * on the target site to change, where `fixPrompt`'s "fix the following
 * issue" framing is a category mismatch.
 */
import { act, createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderClient } from '../helpers/render-client.js';
import type * as ApiModule from '../../lib/api.js';

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'scan-report-fixable-test' }),
}));

// jsdom does not implement matchMedia; ScoreArc (rendered by ReportPage)
// reads it to respect prefers-reduced-motion. A minimal stub is enough —
// this test does not exercise the animation itself.
window.matchMedia ??= ((query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addListener: () => {},
  removeListener: () => {},
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: () => false,
})) as unknown as typeof window.matchMedia;

vi.mock('../../lib/api.js', async (importOriginal) => {
  const actual = await importOriginal<typeof ApiModule>();
  return {
    ...actual,
    getReport: vi.fn().mockResolvedValue({
      report: {
        scanId: 'scan-report-fixable-test',
        state: 'COMPLETED',
        score: 80,
        summary: null,
        areas: [],
        issues: [
          {
            id: 'issue-fixable',
            module: 'SECURITY',
            severity: 'HIGH',
            title: 'Missing CSP header',
            explanation: 'No Content-Security-Policy header was present.',
            location: 'https://example.com/',
            attribution: 'MEASURED',
            fixPrompt: 'Fix the following SECURITY issue...',
            fixable: true,
          },
          {
            id: 'issue-not-fixable',
            module: 'TESTING',
            severity: 'MEDIUM',
            title: 'TESTING: high score despite a HIGH finding',
            explanation: 'The TESTING area scored 95 while its worst finding is HIGH.',
            location: null,
            attribution: 'MEASURED',
            fixPrompt: 'Fix the following TESTING issue...',
            fixable: false,
          },
        ],
      },
    }),
  };
});

describe('ReportPage — fixable gating (P6-T2)', () => {
  it('shows a copy-prompt control for a fixable finding and hides it for a non-fixable one', async () => {
    const { default: ReportPage } = await import('../../app/(dashboard)/reports/[id]/page.js');
    const mounted = await renderClient(createElement(ReportPage));
    try {
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });

      const html = mounted.html();
      expect(html).toContain('Missing CSP header');
      expect(html).toContain('high score despite a HIGH finding');

      // IssueCard only renders a "Copy fix prompt" button when it receives a
      // `prompt` prop (the component's own existing contract, unchanged by
      // this fix) — the fixPrompt text itself is never rendered visibly,
      // only wired to the button's clipboard action. So the real, provable
      // signal is exactly one copy button, on the fixable card only.
      const copyButtons = Array.from(document.querySelectorAll('button')).filter((b) =>
        /copy fix prompt/i.test(b.textContent ?? ''),
      );
      expect(copyButtons).toHaveLength(1);

      const fixableCard = copyButtons[0]!.closest('[class*="bg-surface-card"]');
      expect(fixableCard?.textContent).toContain('Missing CSP header');
    } finally {
      mounted.unmount();
    }
  });
});
