// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nProvider } from '../../app/theme';
import { Hero } from '../../components/marketing/hero';
import { InputTabs } from '../../components/scan/InputTabs';
import { ScanForm } from '../../components/scan/ScanForm';
import { renderClient } from '../helpers/render-client.js';
import {
  HERO_SCAN_URL_KEY,
  readAndClearHeroScanUrl,
  storeHeroScanUrl,
} from '../../lib/hero-scan-handoff';

describe('hero scan URL handoff', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it('stores a trimmed URL in the tab-scoped handoff key', () => {
    storeHeroScanUrl('  https://example.com/path  ');

    expect(window.sessionStorage.getItem(HERO_SCAN_URL_KEY)).toBe('https://example.com/path');
  });

  it('reads and clears the URL in one operation', () => {
    window.sessionStorage.setItem(HERO_SCAN_URL_KEY, 'https://example.com');

    expect(readAndClearHeroScanUrl()).toBe('https://example.com');
    expect(window.sessionStorage.getItem(HERO_SCAN_URL_KEY)).toBeNull();
  });

  it('does not retain an empty submission or an unavailable value', () => {
    window.sessionStorage.setItem(HERO_SCAN_URL_KEY, 'https://old.example');

    storeHeroScanUrl('   ');

    expect(window.sessionStorage.getItem(HERO_SCAN_URL_KEY)).toBeNull();
    expect(readAndClearHeroScanUrl()).toBeNull();
  });

  it('falls back safely when sessionStorage access throws', () => {
    const descriptor = Object.getOwnPropertyDescriptor(window, 'sessionStorage');
    Object.defineProperty(window, 'sessionStorage', {
      configurable: true,
      get: () => {
        throw new Error('storage disabled');
      },
    });

    try {
      expect(() => storeHeroScanUrl('https://example.com')).not.toThrow();
      expect(readAndClearHeroScanUrl()).toBeNull();
    } finally {
      if (descriptor) Object.defineProperty(window, 'sessionStorage', descriptor);
    }
  });

  it('renders an LTR URL input and the editorial hero surfaces', () => {
    const html = renderToStaticMarkup(
      createElement(I18nProvider, null, createElement(Hero)),
    );

    expect(html).toContain('<input');
    expect(html).toContain('dir="ltr"');
    expect(html).toContain('bg-surface-marketing-dark');
    expect(html).toContain('bg-gradient-brand-subtle');
    expect(html).toContain('rounded-marketing-shell');
    expect(html).toContain('action="/signup"');
  });

  it('leaves InputTabs empty for existing callers and seeds only when initialUrl is provided', () => {
    const renderTabs = (initialUrl?: string): string =>
      renderToStaticMarkup(
        createElement(
          I18nProvider,
          null,
          createElement(InputTabs, {
            onChange: () => undefined,
            ...(initialUrl === undefined ? {} : { initialUrl }),
          }),
        ),
      );

    const empty = renderTabs();
    const seeded = renderTabs('https://example.com/path');

    expect(empty).toContain('value=""');
    expect(seeded).toContain('value="example.com/path"');
  });

  it('keeps ScanForm empty for existing callers and seeds its URL field when provided', () => {
    const renderForm = (initialUrl?: string): string =>
      renderToStaticMarkup(
        createElement(
          I18nProvider,
          null,
          createElement(ScanForm, {
            ...(initialUrl === undefined ? {} : { initialUrl }),
          }),
        ),
      );

    expect(renderForm()).toContain('value=""');
    expect(renderForm('https://example.com/path')).toContain('value="example.com/path"');
  });

  it('stores the entered URL before navigating to signup', async () => {
    const locationDescriptor = Object.getOwnPropertyDescriptor(window, 'location');
    const assign = vi.fn();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, assign },
    });
    const mounted = await renderClient(createElement(Hero));

    try {
      const input = document.querySelector<HTMLInputElement>('#hero-url');
      expect(input).not.toBeNull();
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      await act(async () => {
        setter.call(input, 'https://example.com/start');
        input!.dispatchEvent(new Event('input', { bubbles: true }));
      });
      await act(async () => {
        input!.form!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      });

      expect(mounted.html()).toContain('id="hero-url"');
      expect(window.sessionStorage.getItem(HERO_SCAN_URL_KEY)).toBe('https://example.com/start');
      expect(assign).toHaveBeenCalledWith('/signup');
    } finally {
      mounted.unmount();
      if (locationDescriptor) Object.defineProperty(window, 'location', locationDescriptor);
    }
  });
});
