/**
 * The keyboard focus ring must be visible on every surface it can sit on.
 *
 * WCAG 2.1 SC 1.4.11 asks for 3:1 between a focus indicator and the colours
 * next to it. The ring is an outline offset from the control, so it is drawn
 * against the page surface behind the control. The old orange ring (#fa7014)
 * reached only ~2.7:1 on the light surfaces, so the light theme uses a darker
 * orange from the same hue; dark keeps #fa7014, which already clears 4.4:1.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const LIGHT = readFileSync(
  fileURLToPath(new URL('../../app/tokens/colors.css', import.meta.url)),
  'utf8',
);
const DARK = readFileSync(
  fileURLToPath(new URL('../../app/tokens/dark.css', import.meta.url)),
  'utf8',
);

/** Resolve `--token` to a hex colour, following a single `var(--other)` alias. */
function resolveColor(css: string, token: string): string {
  const match = css.match(new RegExp(`--${token}:\\s*([^;]+);`));
  const value = match?.[1]?.trim();
  if (value === undefined) throw new Error(`Missing token --${token}`);
  const alias = value.match(/^var\(--([\w-]+)\)$/);
  if (alias) return resolveColor(css, alias[1] as string);
  if (!/^#[0-9a-f]{6}$/i.test(value)) throw new Error(`--${token} is not a hex colour: ${value}`);
  return value.toLowerCase();
}

function luminance(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16);
  const channel = (c: number): number => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

const NON_TEXT_MINIMUM = 3;
const SURFACES = ['surface-page', 'surface-raised', 'surface-sunken', 'surface-marketing'];

describe('focus ring contrast', () => {
  it.each([
    ['light', LIGHT],
    ['dark', DARK],
  ] as const)('reaches 3:1 on every %s surface', (_theme, css) => {
    const ring = resolveColor(css, 'focus-ring');
    for (const surface of SURFACES) {
      const background = resolveColor(css, surface);
      expect(contrast(ring, background), `${ring} on ${surface} ${background}`).toBeGreaterThanOrEqual(
        NON_TEXT_MINIMUM,
      );
    }
  });

  it('reaches 3:1 on the dark marketing hero in both themes', () => {
    const hero = resolveColor(LIGHT, 'surface-hero');
    expect(contrast(resolveColor(LIGHT, 'focus-ring'), hero)).toBeGreaterThanOrEqual(
      NON_TEXT_MINIMUM,
    );
    expect(contrast(resolveColor(DARK, 'focus-ring'), hero)).toBeGreaterThanOrEqual(
      NON_TEXT_MINIMUM,
    );
  });
});
