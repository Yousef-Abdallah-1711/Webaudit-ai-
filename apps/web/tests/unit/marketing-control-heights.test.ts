/**
 * Marketing control heights follow the approved refresh artifact
 * (specs/fahes-design-refresh/index.html):
 *   - header and drawer CTA: 44px (.button min-height)
 *   - scanner input + submit: 56px, 48px at 640px and below
 *   - header toggles 36px, mobile menu/close 42px and area tabs 42/38px already match
 * Sizes are driven by tokens so the mobile step needs no extra classes.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { cn } from '../../lib/cn';
import { marketingCtaHeight } from '../../lib/marketing-cta';

const landingCss = readFileSync(
  fileURLToPath(new URL('../../app/tokens/landing.css', import.meta.url)),
  'utf8',
);

function tokenIn(block: string, token: string): string | undefined {
  return block.match(new RegExp(`--${token}:\\s*([^;]+);`))?.[1]?.trim();
}

describe('marketing control height tokens', () => {
  const mobileBlock = landingCss.match(/@media \(max-width: 640px\) \{\s*:root \{([^}]*)\}/)?.[1] ?? '';
  const baseBlock = landingCss.slice(0, landingCss.indexOf('@media (max-width: 640px)'));

  it('sizes the header and drawer CTA at 44px', () => {
    expect(tokenIn(baseBlock, 'height-landing-cta')).toBe('44px');
    expect(marketingCtaHeight).toBe('h-landing-cta');
  });

  it('keeps the scanner at 56px and steps it to 48px at 640px and below', () => {
    expect(tokenIn(baseBlock, 'height-landing-control')).toBe('56px');
    expect(tokenIn(mobileBlock, 'height-landing-control')).toBe('48px');
  });
});

describe('custom heights merge deterministically', () => {
  it('lets a marketing height replace the Button size height', () => {
    expect(cn('h-[36px]', 'h-landing-cta')).toBe('h-landing-cta');
    expect(cn('h-12', 'h-landing-control')).toBe('h-landing-control');
    expect(cn('h-landing-cta', 'h-9')).toBe('h-9');
  });
});
