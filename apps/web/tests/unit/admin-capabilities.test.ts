/**
 * T213 — the capabilities catalogue screen (`/admin/capabilities`).
 *
 * Same discipline as admin-billing.test.ts: `renderToStaticMarkup`, no
 * jsdom — the page's `useEffect` fetch never fires under static render, so
 * this asserts the pre-data shell: the header, the empty table, and the two
 * explanatory cards ported verbatim from the mock. It also asserts the
 * "Cost / run" / dollar-figure column from the mock was NOT carried over,
 * since the real `AdminCapabilitySummary` has no such field — only
 * `estimatedTokens`.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import AdminCapabilitiesPage from '../../app/(admin)/admin/capabilities/page';

function render(element: React.ReactElement): string {
  return renderToStaticMarkup(element);
}

describe('AdminCapabilitiesPage', () => {
  it('renders the header, table shell, and both explanatory cards before any data arrives', () => {
    const html = render(createElement(AdminCapabilitiesPage));
    expect(html).toContain('Capabilities');
    expect(html).toContain('trust derives from discovery root');
    expect(html).toContain('Capability');
    expect(html).toContain('Est. tokens');
    expect(html).toContain('Disabling is safe');
    expect(html).toContain('Uploads are sandboxed or refused');
    expect(html).toContain('503 SANDBOX_UNAVAILABLE');
  });

  it('renders the header actions as inert buttons with no wired functionality yet', () => {
    const html = render(createElement(AdminCapabilitiesPage));
    expect(html).toContain('Run conformance suite');
    expect(html).toContain('Upload capability');
  });

  it('never shows a fabricated dollar cost figure — the mock invented one, the real backend has none', () => {
    const html = render(createElement(AdminCapabilitiesPage));
    expect(html).not.toContain('Cost / run');
    expect(html).not.toContain('$0.0');
  });
});
