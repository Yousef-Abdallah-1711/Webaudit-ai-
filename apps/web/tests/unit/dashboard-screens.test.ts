/**
 * T242 — the usage and profile (settings) screens.
 *
 * Same discipline as core-components.test.ts: `renderToStaticMarkup`, no
 * jsdom. `UsagePage` has no hooks at all. `SettingsPage`'s `useTheme()`
 * (from `app/theme.tsx`) already degrades safely with no `window` present,
 * the same guarantee `theme.test.ts` covers directly -- but `SettingsPage`
 * now also calls `useRouter()` and `useAuth()` directly (added after this
 * file was first written), so it needs the same `next/navigation` mock and
 * `AuthProvider` wrapper `dashboard-shell.test.ts` already established for
 * exactly this "expected router to be mounted" invariant.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../../app/theme';
import UsagePage from '../../app/(dashboard)/usage/page';
import SettingsPage from '../../app/(dashboard)/settings/page';
import { AuthProvider } from '../../components/auth/AuthProvider';
import enUsage from '../../messages/en/usage.json';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: () => undefined, push: () => undefined }),
}));

function render(element: React.ReactElement): string {
  return renderToStaticMarkup(
    createElement(I18nProvider, null, createElement(AuthProvider, null, element)),
  );
}

describe('UsagePage', () => {
  it('renders the real-data loading shell, stat cards, chart, and breakdown tables', () => {
    const html = render(createElement(UsagePage));
    expect(html).toContain(enUsage.usage_spent_this_period);
    expect(html).toContain(enUsage.usage_loading);
    expect(html).toContain(
      enUsage.usage_peak_credits.replace(
        '{credits, plural, one {# cr} other {# cr}}',
        '1 cr',
      ),
    );
    expect(html).toContain(enUsage.usage_by_area);
    expect(html).toContain(enUsage.usage_refunds_adjustments);
  });

  it('does not fabricate daily-spend bars before the usage query resolves', () => {
    const html = render(createElement(UsagePage));
    const bars = [...html.matchAll(/title="\d+ credits?"/g)];
    expect(bars).toHaveLength(0);
  });

  it('keeps the chart empty rather than inventing zero and non-zero days', () => {
    const html = render(createElement(UsagePage));
    const barClasses = [...html.matchAll(/title="\d+ credits?" class="([^"]+)"/g)].map(
      (m) => m[1],
    );
    expect(barClasses).toHaveLength(0);
  });
});

describe('SettingsPage', () => {
  it('does not render the former fabricated profile name on the server shell', () => {
    const html = render(createElement(SettingsPage));
    expect(html).toContain('>Profile</h1>');
    expect(html).not.toContain('Khalid Ahmed');
  });

  it('renders connected-account, honest session, and delete-account cards', () => {
    const html = render(createElement(SettingsPage));
    expect(html).toContain('Loading...');
    expect(html).toContain('Session device details are not available yet.');
    expect(html).not.toContain('khalid-a');
    expect(html).toContain('Delete my account');
  });

  it('defaults to light: the appearance switch reads "Light", not "Dark"', () => {
    const html = render(createElement(SettingsPage));
    expect(html).toContain('Light');
    expect(html).not.toContain('>Dark<');
  });
});
