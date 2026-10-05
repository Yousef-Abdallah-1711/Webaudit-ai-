/**
 * `cn` must understand this app's Tailwind 3 theme.
 *
 * tailwind-merge 3 targets Tailwind 4 and only knows the default theme, so it
 * used to treat custom font sizes (`text-marketing-label`) as colours, treat
 * `border-hairline` as a colour, and treat a bare `outline` as a width. Real
 * classes were silently dropped from marketing headings, copy and focus rings.
 */
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { cn } from '../../lib/cn';
import { CUSTOM_FONT_SIZES, CUSTOM_HEIGHTS } from '../../lib/tailwind-merge-config';

function classes(value: string): string[] {
  return value.split(/\s+/).filter(Boolean);
}

describe('cn', () => {
  it('keeps a custom font size next to a text colour', () => {
    expect(classes(cn('text-marketing-label', 'text-marketing-muted'))).toEqual([
      'text-marketing-label',
      'text-marketing-muted',
    ]);
    expect(classes(cn('text-marketing-h2 text-marketing-primary font-extrabold'))).toEqual([
      'text-marketing-h2',
      'text-marketing-primary',
      'font-extrabold',
    ]);
  });

  it('still lets a later font size replace an earlier one', () => {
    expect(cn('text-marketing-label', 'text-sm')).toBe('text-sm');
    expect(cn('text-xs', 'text-marketing-micro')).toBe('text-marketing-micro');
  });

  it('keeps a hairline border width next to a border colour', () => {
    expect(classes(cn('border-hairline', 'border-border-default'))).toEqual([
      'border-hairline',
      'border-border-default',
    ]);
    expect(classes(cn('border', 'border-hairline'))).toEqual(['border-hairline']);
  });

  it('keeps the outline style, width and colour of a focus ring', () => {
    const ring =
      'focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-marketing focus-visible:outline-offset-2';
    expect(classes(cn(ring))).toEqual(classes(ring));
    expect(classes(cn('outline-hairline', 'outline-brand-electric'))).toEqual([
      'outline-hairline',
      'outline-brand-electric',
    ]);
  });

  it('keeps ordinary merging working', () => {
    expect(cn('px-8', 'px-2')).toBe('px-2');
    expect(cn('bg-surface-page', 'bg-surface-raised')).toBe('bg-surface-raised');
    expect(cn('outline-2', 'outline-4')).toBe('outline-4');
  });
});

describe('custom font size list', () => {
  it('matches the fontSize keys declared in tailwind.config.ts', async () => {
    const configPath = fileURLToPath(new URL('../../tailwind.config.ts', import.meta.url));
    const { default: config } = (await import(/* @vite-ignore */ configPath)) as {
      default: { theme: { extend: { fontSize: Record<string, string> } } };
    };

    expect([...CUSTOM_FONT_SIZES].sort()).toEqual(
      Object.keys(config.theme.extend.fontSize).sort(),
    );
  });

  it('matches the height keys declared in tailwind.config.ts', async () => {
    const configPath = fileURLToPath(new URL('../../tailwind.config.ts', import.meta.url));
    const { default: config } = (await import(/* @vite-ignore */ configPath)) as {
      default: { theme: { extend: { height: Record<string, string> } } };
    };

    expect([...CUSTOM_HEIGHTS].sort()).toEqual(Object.keys(config.theme.extend.height).sort());
  });
});
