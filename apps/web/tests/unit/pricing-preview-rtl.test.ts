/**
 * The pricing-details link ends in a diagonal "go onward" arrow. In a
 * right-to-left page "onward" points at the line end on the left, so the glyph
 * must mirror (up-left) there and stay up-right in LTR. The link text, href and
 * behaviour are unchanged.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next-intl/server', () => ({
  getTranslations: async () => (key: string) => key,
}));

import { PricingPreview } from '../../components/marketing/pricing-preview';

async function renderPreview(): Promise<string> {
  const element = await PricingPreview();
  return renderToStaticMarkup(createElement('div', null, element));
}

describe('pricing details arrow', () => {
  it('is hidden from assistive tech and mirrors in RTL only', async () => {
    const html = await renderPreview();
    const arrow = html.match(/<span([^>]*)>↗<\/span>/);

    expect(arrow, 'the ↗ glyph is rendered').not.toBeNull();
    const attributes = arrow?.[1] ?? '';
    expect(attributes).toContain('aria-hidden="true"');
    // A transform only applies to inline-level boxes that are not plain inline.
    expect(attributes).toContain('inline-block');
    expect(attributes).toContain('rtl:-scale-x-100');
  });

  it('keeps pointing at the pricing page', async () => {
    const html = await renderPreview();

    expect(html).toContain('href="/pricing"');
    expect(html).toContain('pricing_preview_details');
  });
});
