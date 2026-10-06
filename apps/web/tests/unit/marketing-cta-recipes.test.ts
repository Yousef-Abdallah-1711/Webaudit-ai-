/**
 * Wave 2 — marketing CTA recipes.
 *
 * The gradient primary CTA, the on-hero ghost action and the focus rings used
 * to be pasted as long utility strings across Public.tsx, the scanner form and
 * the area tabs. They now live in `lib/marketing-cta.ts`; these tests pin the
 * recipe output, prove the on-hero ghost hover really wins over Button's own
 * hover rule, and guard against the strings being pasted inline again.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Button } from '../../components/ui';
import {
  focusRingBrand,
  focusRingBrandOffset,
  focusRingHighlightOffset,
  gradientSurface,
  marketingPrimaryCta,
  onHeroGhostButton,
  onHeroGhostControl,
} from '../../lib/marketing-cta';

function source(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(`../../${relativePath}`, import.meta.url)), 'utf8');
}

describe('marketing CTA recipes', () => {
  it('keeps the approved gradient primary CTA look', () => {
    expect(gradientSurface).toBe('bg-gradient-cta-marketing text-white shadow-marketing-card');
    expect(marketingPrimaryCta).toBe(
      'bg-gradient-cta-marketing text-white shadow-marketing-card [&:hover:not(:disabled)]:brightness-110 [&:active:not(:disabled)]:!brightness-95',
    );
  });

  it('keeps the approved focus rings', () => {
    expect(focusRingBrand).toBe(
      'focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-marketing',
    );
    expect(focusRingBrandOffset).toBe(`${focusRingBrand} focus-visible:outline-offset-2`);
    expect(focusRingHighlightOffset).toBe(
      'focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-highlight focus-visible:outline-offset-2',
    );
  });

  it('makes the on-hero ghost hover win over the Button ghost hover rule', () => {
    const html = renderToStaticMarkup(
      createElement(
        Button,
        { variant: 'ghost', size: 'sm', href: '/login', className: onHeroGhostButton },
        'Sign in',
      ),
    ).replaceAll('&amp;', '&');

    expect(html).toContain('[&:hover:not(:disabled)]:bg-white/10');
    expect(html).toContain('[&:hover:not(:disabled)]:text-marketing-inverse');
    expect(html).not.toContain('[&:hover:not(:disabled)]:bg-surface-raised');
    expect(html).not.toContain('[&:hover:not(:disabled)]:text-text-strong');
  });

  it('uses plain hover utilities for raw toggle controls', () => {
    expect(onHeroGhostControl).toBe(
      'text-marketing-inverse-muted hover:bg-white/10 hover:text-marketing-inverse',
    );
  });

  it('is not pasted inline in the callsites', () => {
    const callsites = [
      'components/public/Public.tsx',
      'components/marketing/scan-handoff-form.tsx',
      'components/marketing/audit-areas.tsx',
    ];
    for (const path of callsites) {
      const text = source(path);
      expect(text, `${path} inlines the gradient CTA recipe`).not.toContain(
        'bg-gradient-cta-marketing text-white shadow-marketing-card',
      );
      expect(text, `${path} inlines the on-hero ghost recipe`).not.toContain(
        'text-marketing-inverse-muted hover:bg-white/10 hover:text-marketing-inverse',
      );
    }
    expect(source('components/public/Public.tsx')).not.toContain(
      'focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-marketing',
    );
  });
});
