/**
 * T240 (folds in T131/T132) — ScoreArc, ModuleStatus.
 *
 * Same discipline as core-components.test.ts: renderToStaticMarkup, no
 * jsdom. `useEffect` never runs under `renderToStaticMarkup`, so ScoreArc's
 * rAF count-up is untested here by construction — the static render always
 * shows the initial (measured) score, which is exactly ScoreArc.jsx's own
 * fallback guarantee ("a throttled or never-firing rAF can only cost the
 * animation — never the number"). The animation itself needs a real browser;
 * T246's visual harness is where that would be exercised.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ModuleStatus, ScoreArc } from '../../components/report';
import moduleStatusStyles from '../../components/report/ModuleStatus.module.css';

function render(element: React.ReactElement): string {
  return renderToStaticMarkup(element);
}

describe('ScoreArc', () => {
  it('renders the measured score immediately, with no animation run yet', () => {
    const html = render(createElement(ScoreArc, { score: 84, delta: 23 }));
    expect(html).toContain('>84<');
    expect(html).toContain('+23 vs baseline');
  });

  it('omits the delta text entirely when delta is not given', () => {
    const withDelta = render(createElement(ScoreArc, { score: 50, delta: 5 }));
    const without = render(createElement(ScoreArc, { score: 50 }));
    expect(withDelta).toContain('vs baseline');
    expect(without).not.toContain('vs baseline');
  });

  it('a negative delta omits the leading plus sign', () => {
    const html = render(createElement(ScoreArc, { score: 50, delta: -8 }));
    expect(html).toContain('-8 vs baseline');
    expect(html).not.toContain('+-8');
  });

  it('the default label is "Health score"; a caller can override it', () => {
    const html = render(createElement(ScoreArc, { score: 60 }));
    expect(html).toContain('Health score');
    const custom = render(createElement(ScoreArc, { score: 60, label: 'Design score' }));
    expect(custom).toContain('Design score');
    expect(custom).not.toContain('Health score');
  });
});

describe('ModuleStatus', () => {
  it('FR-053: every state gets a visually distinct class — none reads as another', () => {
    const states = ['waiting', 'running', 'complete', 'degraded', 'not-applicable'] as const;
    const classes = states.map((state) => {
      const html = render(createElement(ModuleStatus, { area: 'Security', state }));
      return /class="([^"]+)"/.exec(html)?.[1];
    });
    expect(new Set(classes).size).toBe(states.length);
  });

  it('degraded gets the left accent rule the other states do not', () => {
    const degraded = render(
      createElement(ModuleStatus, { area: 'Testing', state: 'degraded', detail: '2 / 5' }),
    );
    const complete = render(createElement(ModuleStatus, { area: 'Security', state: 'complete' }));
    expect(degraded).toContain(moduleStatusStyles.stateDegraded);
    expect(complete).not.toContain(moduleStatusStyles.stateDegraded);
  });

  it('renders the issue count only when given, and the detail text only when given', () => {
    const withIssues = render(
      createElement(ModuleStatus, { area: 'Security', state: 'complete', issues: 7 }),
    );
    const withoutIssues = render(
      createElement(ModuleStatus, { area: 'Security', state: 'complete' }),
    );
    expect(withIssues).toContain('>7<');
    expect(withoutIssues).not.toContain('dir="ltr"');

    const withDetail = render(
      createElement(ModuleStatus, { area: 'Testing', state: 'degraded', detail: '2 / 5' }),
    );
    expect(withDetail).toContain('2 / 5');
  });

  it('compact renders the stacked two-line layout, not the default row', () => {
    const compact = render(
      createElement(ModuleStatus, {
        area: 'Testing',
        state: 'degraded',
        detail: 'x',
        compact: true,
      }),
    );
    const normal = render(
      createElement(ModuleStatus, { area: 'Testing', state: 'degraded', detail: 'x' }),
    );
    expect(compact).toContain(moduleStatusStyles.compact);
    expect(normal).not.toContain(moduleStatusStyles.compact);
  });
});
