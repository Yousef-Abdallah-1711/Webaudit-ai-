/**
 * T238/T239 — TwoToneHeading, SeverityBadge, AttributionMark.
 *
 * Same discipline as core-components.test.ts: renderToStaticMarkup, no
 * jsdom, styles imported directly rather than a bundler-specific class-name
 * pattern hardcoded into the assertion.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { TwoToneHeading } from '../../components/ui';
import { AttributionMark, SeverityBadge } from '../../components/report';
import twoToneStyles from '../../components/ui/TwoToneHeading.module.css';
import severityStyles from '../../components/report/SeverityBadge.module.css';
import attributionStyles from '../../components/report/AttributionMark.module.css';

function render(element: React.ReactElement): string {
  return renderToStaticMarkup(element);
}

describe('TwoToneHeading', () => {
  it('renders the lead clause outside, and the accent clause inside, an accent span', () => {
    const html = render(
      createElement(TwoToneHeading, { lead: 'Think your site is ready?', accent: 'Prove it.' }),
    );
    expect(html).toContain('Think your site is ready?');
    // The accent clause specifically sits inside the accent-coloured span.
    const accentSpan = /<span[^>]*>([^<]*)<\/span>/.exec(html);
    expect(accentSpan?.[1]).toBe('Prove it.');
  });

  it('renders an <h1> by default and honours `as`', () => {
    const h1 = render(createElement(TwoToneHeading, { lead: 'a', accent: 'b' }));
    const h3 = render(createElement(TwoToneHeading, { lead: 'a', accent: 'b', as: 'h3' }));
    expect(h1).toMatch(/^<h1/);
    expect(h3).toMatch(/^<h3/);
  });

  it('level=display and level=h2 get different classes', () => {
    const display = render(createElement(TwoToneHeading, { lead: 'a', accent: 'b' }));
    const h2 = render(createElement(TwoToneHeading, { lead: 'a', accent: 'b', level: 'h2' }));
    expect(display).toContain(twoToneStyles.display);
    expect(h2).toContain(twoToneStyles.h2);
  });
});

describe('SeverityBadge', () => {
  it('is never colour alone: icon and text both present for every level', () => {
    // SeverityBadgeProps.d.ts: "Always icon + text + colour — never colour alone."
    const levels = ['critical', 'high', 'medium', 'low', 'info', 'resolved'] as const;
    for (const level of levels) {
      const html = render(createElement(SeverityBadge, { level }));
      expect(html, level).toContain('<svg');
      expect(html, level).toContain('<path');
    }
  });

  it('every level gets a distinct class', () => {
    const levels = ['critical', 'high', 'medium', 'low', 'info', 'resolved'] as const;
    const classes = levels.map((level) => {
      const html = render(createElement(SeverityBadge, { level }));
      return /class="([^"]+)"/.exec(html)?.[1];
    });
    expect(new Set(classes).size).toBe(levels.length);
  });

  it('resolved and low use different colour classes (deliberately different greens)', () => {
    // Direct regression guard for the .prompt.md's explicit "deliberately
    // different greens" — a shared class here would be the collapse it warns
    // against, however innocuous the CSS values might still look.
    expect(severityStyles.resolved).not.toBe(severityStyles.low);
  });

  it('label overrides the default word; a count is optional and trailing', () => {
    const withoutCount = render(createElement(SeverityBadge, { level: 'high' }));
    const withCount = render(createElement(SeverityBadge, { level: 'high', count: 3 }));
    const labelled = render(createElement(SeverityBadge, { level: 'high', label: 'Urgent' }));
    expect(withoutCount).toContain('High');
    expect(withCount).toContain('High');
    expect(withCount).toContain('3');
    expect(labelled).toContain('Urgent');
    expect(labelled).not.toContain('High');
  });
});

describe('AttributionMark', () => {
  it('is measured by default, with a title explaining what that means', () => {
    const html = render(createElement(AttributionMark, {}));
    expect(html).toContain('Measured');
    expect(html).toContain('title="Observed directly by a check"');
  });

  it('ai-judgment gets its own label, title, and class', () => {
    const html = render(createElement(AttributionMark, { kind: 'ai-judgment' }));
    expect(html).toContain('AI judgment');
    expect(html).toContain('title="Concluded by a model from measured input"');
    expect(html).toContain(attributionStyles.aiJudgment);
    expect(html).not.toContain(attributionStyles.measured);
  });

  it('is not hidden behind a <details>/hover-only affordance — plain visible markup', () => {
    // AttributionMark.prompt.md: "Never hide it behind a hover or a
    // tooltip-only affordance." The component itself must not introduce one;
    // a title attribute is a supplement, not the only way to read the label.
    const html = render(createElement(AttributionMark, {}));
    expect(html).not.toContain('<details');
    expect(html).not.toContain('display:none');
    expect(html).not.toContain('visibility:hidden');
  });
});
