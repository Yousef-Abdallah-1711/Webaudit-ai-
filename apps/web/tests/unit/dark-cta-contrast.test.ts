import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

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

describe('inverse-surface CTA text contrast (WCAG AA, 4.5:1)', () => {
  it('light theme muted eyebrow text (#737373) on the white page meets AA', () => {
    expect(contrastRatio('#737373', '#ffffff')).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
  });

  it('dark theme muted eyebrow text (#a1a1aa) on the dark page meets AA', () => {
    expect(contrastRatio('#a1a1aa', '#1f2937')).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
  });

  it('light theme --text-on-surface-inverse (#fafafa) on --surface-inverse (#1f2937) meets AA', () => {
    expect(contrastRatio('#fafafa', '#1f2937')).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
  });

  it('light theme --text-on-surface-inverse-muted (#9ca3af) on --surface-inverse (#1f2937) meets AA', () => {
    expect(contrastRatio('#9ca3af', '#1f2937')).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
  });

  it('dark theme --text-on-surface-inverse (#1f2937) on --surface-inverse (#fafafa) meets AA', () => {
    expect(contrastRatio('#1f2937', '#fafafa')).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
  });

  it('dark theme --text-on-surface-inverse-muted (#6b7280) on --surface-inverse (#fafafa) meets AA', () => {
    expect(contrastRatio('#6b7280', '#fafafa')).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
  });

  it('marketing hero and auth text use the contrasting marketing inverse token', () => {
    const authSource = readFileSync(
      new URL('../../components/auth/AuthShell.tsx', import.meta.url),
      'utf8',
    );
    expect(authSource).toContain('bg-surface-hero');
    expect(authSource).toContain('text-marketing-inverse');
    expect(contrastRatio('#ffffff', '#0c1428')).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
    expect(authSource).not.toContain('text-text-on-accent');

    const heroSource = readFileSync(
      new URL('../../components/marketing/hero.tsx', import.meta.url),
      'utf8',
    );
    const remediationSource = readFileSync(
      new URL('../../components/marketing/remediation.tsx', import.meta.url),
      'utf8',
    );
    const reportSource = readFileSync(
      new URL('../../components/marketing/report-showcase.tsx', import.meta.url),
      'utf8',
    );
    for (const [surface, source] of [
      ['hero', heroSource],
      ['remediation', remediationSource],
    ] as const) {
      expect(source, `${surface} uses the approved inverse text token`).toContain(
        'text-marketing-inverse',
      );
      expect(source).not.toContain('text-text-on-accent');
    }

    // The report sample is on the raised marketing surface in both themes,
    // so it must use the primary foreground rather than the inverse token.
    expect(reportSource, 'report sample uses the raised-surface foreground').toContain(
      'text-marketing-primary',
    );
    expect(reportSource).not.toContain('text-text-on-accent');
  });
});
