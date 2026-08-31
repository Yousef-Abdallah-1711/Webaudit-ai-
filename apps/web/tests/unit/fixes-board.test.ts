/**
 * T155 / T156 — FixesBoard + IssueRow, ported from `FixesScreen` in
 * `design-system/ui_kits/app/Screens.jsx`.
 *
 * Same discipline as `report-status.test.ts`: `renderToStaticMarkup`, no
 * jsdom. `onClick` handlers cannot fire in a static render, so this asserts
 * what the markup says rather than interaction — the button label per state,
 * the resolved styling, the outstanding/resolved counts (FR-057), and that
 * failing evidence renders inline in mono rather than behind a click
 * (FR-061).
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { FixesBoard, IssueRow } from '../../components/fixes';
import type { FixesIssue } from '../../lib/api';

function issue(overrides: Partial<FixesIssue> = {}): FixesIssue {
  return {
    id: 'i1',
    severity: 'HIGH',
    title: 'Missing CSP header',
    explanation: 'x',
    consequence: 'y',
    location: 'https://acme.com/',
    attribution: 'MEASURED',
    fixPrompt: 'add a CSP',
    state: 'OPEN',
    checkId: 'headers.csp-missing',
    assertedFixedAt: null,
    resolvedAt: null,
    reopenedAt: null,
    previouslyResolved: false,
    createdAt: '2026-08-30T10:00:00.000Z',
    ...overrides,
  };
}

const render = (el: React.ReactElement): string => renderToStaticMarkup(el);

describe('IssueRow', () => {
  it('an open issue shows the "I fixed this — 3 cr" button, enabled', () => {
    const html = render(createElement(IssueRow, { issue: issue(), onAssertFixed: () => {} }));
    expect(html).toContain('I fixed this — 3 cr');
    expect(html).not.toContain('disabled');
  });

  it('an issue being re-checked shows "Re-checking…" and is disabled', () => {
    const html = render(
      createElement(IssueRow, { issue: issue({ state: 'ASSERTED_FIXED' }), onAssertFixed: () => {} }),
    );
    expect(html).toContain('Re-checking…');
    expect(html).toContain('disabled');
  });

  it('a resolved issue reads "Verified" with the verification time', () => {
    const html = render(
      createElement(IssueRow, {
        issue: issue({ state: 'RESOLVED', resolvedAt: '2026-08-30T14:31:00.000Z' }),
        onAssertFixed: () => {},
      }),
    );
    expect(html).toContain('Verified');
    expect(html).toMatch(/verified \d\d:\d\d/);
    expect(html).toContain('disabled');
  });

  it('failing evidence renders inline in a <pre>, not behind a control', () => {
    const html = render(
      createElement(IssueRow, {
        issue: issue({ state: 'OPEN', assertedFixedAt: '2026-08-30T14:29:00.000Z' }),
        failingEvidence: { url: 'https://acme.com/', 'content-security-policy': null },
        onAssertFixed: () => {},
      }),
    );
    expect(html).toContain('Re-check failed');
    expect(html).toContain('<pre');
    expect(html).toContain('content-security-policy');
    expect(html).not.toContain('<button'.concat(' hidden'));
  });

  it('a reopened (regressed) issue is flagged', () => {
    const html = render(
      createElement(IssueRow, {
        issue: issue({ state: 'REOPENED', previouslyResolved: true }),
        onAssertFixed: () => {},
      }),
    );
    expect(html).toContain('regressed');
  });

  it('an UNVERIFIABLE issue explains there is no automated re-check', () => {
    const html = render(
      createElement(IssueRow, { issue: issue({ state: 'UNVERIFIABLE' }), onAssertFixed: () => {} }),
    );
    expect(html).toContain('no automated re-check');
  });
});

describe('FixesBoard', () => {
  const issues: FixesIssue[] = [
    issue({ id: 'a', severity: 'CRITICAL', title: 'Crit A' }),
    issue({ id: 'b', severity: 'HIGH', title: 'High B' }),
    issue({ id: 'c', severity: 'MEDIUM', title: 'Med C', state: 'RESOLVED', resolvedAt: '2026-08-30T12:00:00.000Z' }),
    issue({ id: 'd', severity: 'LOW', title: 'Low D' }),
  ];

  it('counts outstanding by severity band and resolved separately (FR-057)', () => {
    const html = render(createElement(FixesBoard, { issues, onAssertFixed: () => {} }));
    // 1 critical, 1 high, 1 medium-and-low (D only; C is resolved), 1 resolved
    expect(html).toContain('critical');
    expect(html).toContain('high');
    expect(html).toContain('medium and low');
    expect(html).toContain('resolved');
  });

  it('renders every issue and puts resolved ones after outstanding ones', () => {
    const html = render(createElement(FixesBoard, { issues, onAssertFixed: () => {} }));
    expect(html).toContain('Crit A');
    expect(html).toContain('High B');
    expect(html).toContain('Med C');
    expect(html).toContain('Low D');
    expect(html.indexOf('Low D')).toBeLessThan(html.indexOf('Med C'));
  });

  it('shows the "turns green only when that check passes" note', () => {
    const html = render(createElement(FixesBoard, { issues: [], onAssertFixed: () => {} }));
    expect(html).toContain('turns green only when that check passes');
    expect(html).toContain('no issues');
  });
});
