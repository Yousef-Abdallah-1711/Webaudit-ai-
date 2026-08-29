/**
 * T242 — the usage and profile (settings) screens.
 *
 * Same discipline as core-components.test.ts: `renderToStaticMarkup`, no
 * jsdom. Unlike `dashboard-shell.test.ts`, neither page needs
 * `next/navigation` mocked — `UsagePage` has no hooks at all, and
 * `SettingsPage`'s `useTheme()` (from `app/theme.tsx`) already degrades
 * safely with no `window` present, the same guarantee `theme.test.ts`
 * covers directly.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import UsagePage from '../../app/(dashboard)/usage/page';
import SettingsPage from '../../app/(dashboard)/settings/page';

function render(element: React.ReactElement): string {
  return renderToStaticMarkup(element);
}

describe('UsagePage', () => {
  it('renders every stat card, the chart legend, and both breakdown tables', () => {
    const html = render(createElement(UsagePage));
    expect(html).toContain('Spent this period');
    expect(html).toContain('980');
    expect(html).toContain('peak 143 cr');
    expect(html).toContain('Security');
    expect(html).toContain('Refunds and adjustments');
  });

  it('renders 24 daily-spend bars, one per day', () => {
    const html = render(createElement(UsagePage));
    const bars = [...html.matchAll(/title="\d+ credits"/g)];
    expect(bars).toHaveLength(24);
  });

  it('gives a zero-credit day a different class than a non-zero day', () => {
    const html = render(createElement(UsagePage));
    // DAYS[1] is 0, DAYS[0] is 38 — their bars must not share a class list.
    const barClasses = [...html.matchAll(/title="\d+ credits" class="([^"]+)"/g)].map((m) => m[1]);
    expect(barClasses[0]).not.toBe(barClasses[1]);
  });
});

describe('SettingsPage', () => {
  it('pre-fills name and email as editable, controlled fields', () => {
    const html = render(createElement(SettingsPage));
    expect(html).toContain('value="Khalid Ahmed"');
    expect(html).toContain('value="you@company.com"');
  });

  it('renders the connected-account, sessions, and delete-account cards', () => {
    const html = render(createElement(SettingsPage));
    expect(html).toContain('khalid-a');
    expect(html).toContain('macOS · Chrome');
    expect(html).toContain('This device');
    expect(html).toContain('Delete my account');
  });

  it('defaults to light: the appearance switch reads "Light", not "Dark"', () => {
    const html = render(createElement(SettingsPage));
    expect(html).toContain('Light');
    expect(html).not.toContain('>Dark<');
  });
});
