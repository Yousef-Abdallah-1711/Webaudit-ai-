/**
 * T168 — ReadinessVerdict, ported from VerdictPanel.jsx.
 *
 * `VerdictPanel.prompt.md`: "A no-go always names its blockers." Same
 * renderToStaticMarkup / no-jsdom discipline as the other component tests.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { I18nProvider } from '../../app/theme';
import { ReadinessVerdict } from '../../components/report';
import enReports from '../../messages/en/reports.json';

const render = (el: React.ReactElement): string =>
  renderToStaticMarkup(createElement(I18nProvider, null, el));

describe('ReadinessVerdict', () => {
  it('a go verdict reads "Ready to ship" and shows the score against the baseline', () => {
    const html = render(
      createElement(ReadinessVerdict, {
        verdict: 'go',
        score: 91,
        baseline: 62,
        areas: [{ name: 'Security', score: 96, threshold: 80, pass: true }],
      }),
    );
    expect(html).toContain(enReports.report_readiness_go);
    expect(html).toContain(
      enReports.report_score_summary
        .replace('{score}', '91')
        .replace('{baseline}', '62')
        .replace('{sign}', '+')
        .replace('{delta}', '29'),
    );
    expect(html).toContain(enReports.report_area_score.replace('{score}', '96').replace('{threshold}', '80'));
  });

  it('a no-go verdict reads "Not ready to ship" and names every blocker', () => {
    const blockers = [
      'Security scored 40 against a 80 threshold',
      'Regressed: "Missing HSTS" was verified fixed and has returned',
    ];
    const html = render(
      createElement(ReadinessVerdict, {
        verdict: 'no-go',
        score: 55,
        baseline: 62,
        blockers,
        areas: [{ name: 'Security', score: 40, threshold: 80, pass: false }],
      }),
    );
    expect(html).toContain(enReports.report_readiness_no_go);
    expect(html).toContain(enReports.report_blockers);
    expect(html).toContain('Security scored 40 against a 80 threshold');
    // React escapes the quotes in the second blocker's title.
    expect(html).toContain('Regressed: ');
    expect(html).toContain('was verified fixed and has returned');
    expect(html).toContain(
      enReports.report_score_summary
        .replace('{score}', '55')
        .replace('{baseline}', '62')
        .replace('{sign}', '')
        .replace('{delta}', '-7'),
    );
  });

  it('renders an unscored area as "—"', () => {
    const html = render(
      createElement(ReadinessVerdict, {
        verdict: 'no-go',
        areas: [{ name: 'Testing', score: null, threshold: 75, pass: false }],
      }),
    );
    expect(html).toContain(enReports.report_area_score_missing.replace('{threshold}', '75'));
  });
});
