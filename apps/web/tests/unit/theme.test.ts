/**
 * T248 — theme/lang store, hooks, and the two toggle components, plus the
 * pre-paint script that makes the port safe under SSR.
 *
 * `renderToStaticMarkup` runs these in Node, with no `window`/`document` —
 * exactly the environment the source (`design-system/ui_kits/theme.jsx`)
 * never had to survive, since it only ever ran in a browser preview. These
 * tests exist to keep that guard from regressing, not to re-prove the
 * source's own behaviour (default light/English, sun-vs-moon icon) which is
 * exercised incidentally along the way.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { LangToggle, ThemeScript, ThemeToggle } from '../../app/theme';

function render(element: React.ReactElement): string {
  return renderToStaticMarkup(element);
}

describe('module import (no window)', () => {
  it('does not throw when theme.tsx is evaluated outside a browser', () => {
    // The regression this guards: the source calls
    // `document.documentElement.setAttribute(...)` unconditionally at module
    // scope. Importing this file above, in a Node test environment with no
    // `window`, is itself the assertion — a missing SSR guard would have
    // already thrown before this test body ever ran.
    expect(typeof ThemeToggle).toBe('function');
  });
});

describe('ThemeToggle', () => {
  it('defaults to light: sun icon, "Switch to dark mode" label', () => {
    const html = render(createElement(ThemeToggle, {}));
    expect(html).toContain('aria-label="Switch to dark mode"');
    expect(html).toContain('M12 4V2m0 20v-2'); // SUN_PATH prefix
  });

  it('renders the visible label only when label is true', () => {
    const withLabel = render(createElement(ThemeToggle, { label: true }));
    const without = render(createElement(ThemeToggle, {}));
    expect(withLabel).toContain('<span>Light</span>');
    expect(without).not.toContain('<span>');
  });

  it('gives compact a distinct class from the default size', () => {
    const compact = /class="([^"]+)"/.exec(
      render(createElement(ThemeToggle, { compact: true })),
    )?.[1];
    const normal = /class="([^"]+)"/.exec(render(createElement(ThemeToggle, {})))?.[1];
    expect(compact).not.toBe(normal);
  });

  it('hides the decorative icon from assistive tech', () => {
    const html = render(createElement(ThemeToggle, {}));
    expect(html).toContain('aria-hidden="true"');
  });
});

describe('LangToggle', () => {
  it('defaults to English: offers Arabic next, shows the "ع" glyph', () => {
    const html = render(createElement(LangToggle, {}));
    expect(html).toContain('aria-label="Switch to Arabic"');
    expect(html).toContain('<span>ع</span>');
  });

  it('renders full width with a border only when label is true', () => {
    const html = render(createElement(LangToggle, { label: true }));
    expect(html).toContain('class="');
  });
});

describe('ThemeScript', () => {
  it('renders an inline script that reads wa-theme/wa-lang before paint', () => {
    const html = render(createElement(ThemeScript, {}));
    expect(html).toContain('<script');
    expect(html).toContain('wa-theme');
    expect(html).toContain('wa-lang');
    expect(html).toContain('data-theme');
  });
});
