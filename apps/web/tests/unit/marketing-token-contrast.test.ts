import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const COLORS_CSS_PATH = fileURLToPath(new URL('../../app/tokens/colors.css', import.meta.url));
const DARK_CSS_PATH = fileURLToPath(new URL('../../app/tokens/dark.css', import.meta.url));

function readHexToken(css: string, token: string): string {
  const match = css.match(new RegExp(`--${token}:\\s*(#[0-9a-fA-F]{6})`));
  if (!match) throw new Error(`Missing hex token --${token}`);
  return (match[1] as string).toLowerCase();
}

function hexToRgb(hex: string): readonly [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

/** WCAG 2.1 relative luminance, per channel. */
function linearize(channel8Bit: number): number {
  const c = channel8Bit / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
}

/** WCAG 2.1 contrast ratio: (L_lighter + 0.05) / (L_darker + 0.05). */
function contrastRatio(hexA: string, hexB: string): number {
  const lA = relativeLuminance(hexA);
  const lB = relativeLuminance(hexB);
  const [lighter, darker] = lA > lB ? [lA, lB] : [lB, lA];
  return (lighter + 0.05) / (darker + 0.05);
}

const WCAG_AA_NORMAL_TEXT = 4.5;

function readGradientStops(css: string, token: string): string[] {
  const match = css.match(new RegExp(`--${token}:\\s*linear-gradient\\(([^;]+)\\);`));
  if (!match) throw new Error(`Missing gradient token --${token}`);
  return [...(match[1] as string).matchAll(/#[0-9a-fA-F]{6}/g)].map((stop) => stop[0].toLowerCase());
}

describe('marketing surface token contrast and theme behavior', () => {
  const colorsCss = readFileSync(COLORS_CSS_PATH, 'utf8');
  const darkCss = readFileSync(DARK_CSS_PATH, 'utf8');

  it('keeps the marketing hero surface invariant across themes', () => {
    const heroSurface = readHexToken(colorsCss, 'surface-hero');

    expect(readHexToken(darkCss, 'surface-hero')).toBe(heroSurface);
    expect(heroSurface).toBe('#0c1428');
  });

  it('provides AA contrast for light text on the invariant marketing hero surface', () => {
    const foreground = readHexToken(colorsCss, 'text-marketing-inverse');
    const mutedForeground = readHexToken(colorsCss, 'text-marketing-inverse-muted');
    const heroSurface = readHexToken(colorsCss, 'surface-hero');
    const remediationSurface = readHexToken(darkCss, 'surface-dark');

    expect(contrastRatio(foreground, heroSurface)).toBeGreaterThanOrEqual(
      WCAG_AA_NORMAL_TEXT,
    );
    expect(contrastRatio(mutedForeground, remediationSurface)).toBeGreaterThanOrEqual(
      WCAG_AA_NORMAL_TEXT,
    );
  });

  it('provides AA contrast for theme-appropriate text on both marketing page surfaces', () => {
    const lightForeground = readHexToken(colorsCss, 'text-strong');
    const lightSurface = readHexToken(colorsCss, 'surface-marketing');
    const darkForeground = readHexToken(darkCss, 'text-strong');
    const darkSurface = readHexToken(darkCss, 'surface-marketing');

    expect(contrastRatio(lightForeground, lightSurface)).toBeGreaterThanOrEqual(
      WCAG_AA_NORMAL_TEXT,
    );
    expect(contrastRatio(darkForeground, darkSurface)).toBeGreaterThanOrEqual(
      WCAG_AA_NORMAL_TEXT,
    );
  });

  it('keeps white text on every stop of the CTA gradient at AA in both themes', () => {
    // --gradient-brand-marketing also fills the hero headline text, so the
    // white-text CTA fill has its own, darker token.
    for (const [theme, css] of [
      ['light', colorsCss],
      ['dark', darkCss],
    ] as const) {
      const stops = readGradientStops(css, 'gradient-cta-marketing');
      expect(stops.length, `${theme} CTA gradient stops`).toBeGreaterThanOrEqual(2);
      for (const stop of stops) {
        expect(
          contrastRatio('#ffffff', stop),
          `${theme} theme: white on ${stop}`,
        ).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
      }
    }
  });
});
