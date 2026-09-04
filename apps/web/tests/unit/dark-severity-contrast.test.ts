/**
 * T228 — the design-system source (`design-system/tokens/dark.css`) flags its own dark-mode
 * severity values as "NOT YET CONTRAST-VERIFIED". This is the real verification: every
 * `--sev-*` foreground read directly out of `apps/web/app/tokens/dark.css` (the port, not a
 * hand-copied literal — a future re-port that changes a value fails this test rather than a
 * comment going stale), checked against WCAG 2.1's contrast formula, against exactly the
 * background `SeverityBadge.module.css` actually pairs it with (`color: var(--sev-X)` on
 * `background: var(--sev-X-bg)`), plus both surface tokens a badge can sit on
 * (`--surface-page`, `--surface-raised`).
 *
 * 12px/700-weight text (`SeverityBadge.module.css`'s own `.badge`) does not meet WCAG's "large
 * text" exemption (18pt regular / 14pt bold), so 4.5:1 (AA, normal text) is the real bar — not
 * the looser 3:1 that would apply to large text or non-text UI components.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const DARK_CSS_PATH = fileURLToPath(new URL('../../app/tokens/dark.css', import.meta.url));

function readTokens(): Record<string, string> {
  const css = readFileSync(DARK_CSS_PATH, 'utf8');
  const tokens: Record<string, string> = {};
  for (const match of css.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})/g)) {
    tokens[match[1] as string] = (match[2] as string).toLowerCase();
  }
  return tokens;
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

const SEVERITIES = ['critical', 'high', 'medium', 'low', 'info', 'resolved'] as const;

describe('dark-mode severity token contrast (WCAG AA, 4.5:1)', () => {
  const tokens = readTokens();

  it('reads all six severity foreground/background pairs plus both surface tokens from the real port', () => {
    for (const sev of SEVERITIES) {
      expect(tokens[`sev-${sev}`]).toMatch(/^#[0-9a-f]{6}$/);
      expect(tokens[`sev-${sev}-bg`]).toMatch(/^#[0-9a-f]{6}$/);
    }
    expect(tokens['surface-page']).toMatch(/^#[0-9a-f]{6}$/);
    expect(tokens['surface-raised']).toMatch(/^#[0-9a-f]{6}$/);
  });

  for (const sev of SEVERITIES) {
    it(`--sev-${sev} on its own --sev-${sev}-bg (SeverityBadge.module.css's real pairing) meets AA`, () => {
      const fg = tokens[`sev-${sev}`] as string;
      const bg = tokens[`sev-${sev}-bg`] as string;
      expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
    });

    it(`--sev-${sev} on --surface-page meets AA`, () => {
      const fg = tokens[`sev-${sev}`] as string;
      expect(contrastRatio(fg, tokens['surface-page'] as string)).toBeGreaterThanOrEqual(
        WCAG_AA_NORMAL_TEXT,
      );
    });

    it(`--sev-${sev} on --surface-raised meets AA`, () => {
      const fg = tokens[`sev-${sev}`] as string;
      expect(contrastRatio(fg, tokens['surface-raised'] as string)).toBeGreaterThanOrEqual(
        WCAG_AA_NORMAL_TEXT,
      );
    });
  }
});
