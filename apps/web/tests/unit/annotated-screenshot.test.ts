/**
 * T143 — AnnotatedScreenshot, an original design (see the component's own
 * module note for why). Same discipline as heading-and-attribution.test.ts:
 * renderToStaticMarkup, no jsdom — which is also why the legend is
 * always-visible markup rather than hover/click-revealed state, the same
 * principle IssueCard and AttributionMark already follow: nothing here
 * needs a DOM event to prove correct.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AnnotatedScreenshot, type ScreenshotAnnotation } from '../../components/report';

function render(element: React.ReactElement): string {
  return renderToStaticMarkup(element);
}

const ANNOTATIONS: readonly ScreenshotAnnotation[] = [
  { id: 'a', xPercent: 12, yPercent: 34, severity: 'critical', title: 'Missing CSP header' },
  {
    id: 'b',
    xPercent: 80,
    yPercent: 5,
    severity: 'low',
    title: 'Low-contrast footer text',
    description: 'The footer copy renders under the recommended contrast ratio.',
  },
];

describe('AnnotatedScreenshot', () => {
  it('renders the unavailable state when no screenshot URL is given, with no image and no pins', () => {
    const html = render(createElement(AnnotatedScreenshot, { alt: 'Home page', annotations: ANNOTATIONS }));
    expect(html).toContain('not available for this scan yet');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('Missing CSP header');
  });

  it('renders the image with the required alt text when a screenshot URL is given', () => {
    const html = render(
      createElement(AnnotatedScreenshot, { screenshotUrl: 'https://cdn.example/shot.png', alt: 'Home page' }),
    );
    expect(html).toContain('<img');
    expect(html).toContain('src="https://cdn.example/shot.png"');
    expect(html).toContain('alt="Home page"');
  });

  it('places one pin per annotation at its percentage position', () => {
    const html = render(
      createElement(AnnotatedScreenshot, {
        screenshotUrl: 'https://cdn.example/shot.png',
        alt: 'Home page',
        annotations: ANNOTATIONS,
      }),
    );
    expect(html).toContain('inset-inline-start:12%');
    expect(html).toContain('inset-block-start:34%');
    expect(html).toContain('inset-inline-start:80%');
    expect(html).toContain('inset-block-start:5%');
  });

  it('lists every annotation in an always-visible legend — never hidden behind hover', () => {
    const html = render(
      createElement(AnnotatedScreenshot, {
        screenshotUrl: 'https://cdn.example/shot.png',
        alt: 'Home page',
        annotations: ANNOTATIONS,
      }),
    );
    expect(html).toContain('Missing CSP header');
    expect(html).toContain('Low-contrast footer text');
    expect(html).toContain('The footer copy renders under the recommended contrast ratio.');
    expect(html).not.toContain('<details');
    expect(html).not.toContain('display:none');
    expect(html).not.toContain('visibility:hidden');
  });

  it('renders no legend at all when there are no annotations', () => {
    const html = render(
      createElement(AnnotatedScreenshot, { screenshotUrl: 'https://cdn.example/shot.png', alt: 'Home page' }),
    );
    expect(html).not.toContain('<ol');
  });

  it('gives each severity its own pin colour, matching the SeverityBadge token', () => {
    const html = render(
      createElement(AnnotatedScreenshot, {
        screenshotUrl: 'https://cdn.example/shot.png',
        alt: 'Home page',
        annotations: ANNOTATIONS,
      }),
    );
    expect(html).toContain('border-color:var(--sev-critical)');
    expect(html).toContain('border-color:var(--sev-low)');
  });
});
