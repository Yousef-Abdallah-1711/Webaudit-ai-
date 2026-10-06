import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MarketingSectionHeader, SectionNo } from '../../components/marketing/section-header';

describe('marketing section typography', () => {
  it('uses one standard section number, heading, and lead recipe', () => {
    const html = renderToStaticMarkup(
      createElement(MarketingSectionHeader, {
        id: 'example-heading',
        number: '02',
        eyebrow: 'Production readiness',
        title: 'Evidence before conclusions',
        lead: 'A short explanation of what the product measures.',
      }),
    );

    expect(html).toContain('<span dir="ltr">02</span>');
    expect(html).toContain('Production readiness');
    expect(html).toContain('<h2 id="example-heading"');
    expect(html).toContain('text-marketing-h2');
    expect(html).toContain('text-marketing-lead');
    expect(html).toContain('leading-marketing-lead');
  });

  it('keeps inverse section markers semantic and visually distinct', () => {
    const html = renderToStaticMarkup(
      createElement(SectionNo, {
        number: '05',
        tone: 'inverse',
        children: 'From report to repair',
      }),
    );

    expect(html).toContain('<span dir="ltr">05</span>');
    expect(html).toContain('From report to repair');
    expect(html).toContain('text-marketing-inverse-muted');
    expect(html).toContain('before:bg-brand-highlight');
  });

  it('emits content for the decorative dash in both section marker tones', () => {
    const normal = renderToStaticMarkup(
      createElement(SectionNo, { number: '01', children: 'Overview' }),
    );
    const inverse = renderToStaticMarkup(
      createElement(SectionNo, { number: '02', tone: 'inverse', children: 'Repair' }),
    );

    expect(normal.replace(/&#x27;/g, "'")).toContain("before:content-['']");
    expect(inverse.replace(/&#x27;/g, "'")).toContain("before:content-['']");
  });
});
