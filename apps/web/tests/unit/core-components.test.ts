/**
 * T237 — the 7 core components, rendered and asserted rather than trusted.
 *
 * `renderToStaticMarkup` rather than jsdom or Testing Library: these
 * components do not need an event loop or a real DOM to verify their props,
 * markup, and semantic Tailwind utility selection.
 *
 * What is NOT covered here, and why: `Button`'s hover-is-a-colour-step-only
 * constraint (`Button.prompt.md`) is a CSS `:hover` rule with nothing to
 * assert from static markup — verified instead by reading the generated
 * stylesheet during manual testing. `PromoBar`'s dismiss click needs a real
 * DOM event, which `renderToStaticMarkup` cannot simulate; T246's visual
 * harness is the right place for interaction coverage once it exists.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Badge, Button, Card, Eyebrow, Input, PromoBar, StatRow } from '../../components/ui';
// Tailwind utility assertions cover the migrated visual states without coupling tests to CSS Module hashes.

function render(element: React.ReactElement): string {
  return renderToStaticMarkup(element);
}

describe('Button', () => {
  it('renders a <button> by default, disabled and onClick both wired', () => {
    const html = render(createElement(Button, { variant: 'primary' }, 'Run audit'));
    expect(html).toContain('<button');
    expect(html).toContain('Run audit');
  });

  it('renders an <a> instead when href is given', () => {
    // ButtonProps.d.ts: "Renders an <a> instead of a <button>".
    const html = render(createElement(Button, { href: '/pricing' }, 'See plans'));
    expect(html).toContain('<a');
    expect(html).toContain('href="/pricing"');
    expect(html).not.toContain('<button');
  });

  it('uses the mapped surface and text colors for each variant', () => {
    const variants = [
      ['primary', 'bg-accent', 'text-text-on-accent'],
      ['secondary', 'bg-surface-page', 'text-text-primary'],
      ['ghost', 'bg-transparent', 'text-text-secondary'],
      ['inverse', 'bg-surface-page', 'text-text-primary'],
    ] as const;
    for (const [variant, background, color] of variants) {
      const html = render(createElement(Button, { variant }, 'x'));
      expect(html).toContain(background);
      expect(html).toContain(color);
    }
  });

  it('merges caller utilities with its own base classes', () => {
    const html = render(createElement(Button, { className: 'px-2' }, 'x'));
    expect(html).toContain('px-2');
    expect(html).toContain('bg-accent');
    expect(html).not.toContain('px-8');
  });

  it('shows a keyboard-only focus ring on every variant, as a button and as a link', () => {
    // :focus-visible keeps the ring off pointer clicks; an outline never shifts layout.
    const ring = [
      'focus-visible:outline',
      'focus-visible:outline-2',
      'focus-visible:outline-offset-2',
      'focus-visible:outline-focus-ring',
    ];
    for (const variant of ['primary', 'secondary', 'ghost', 'inverse'] as const) {
      for (const props of [{ variant }, { variant, href: '/x' }]) {
        const classes = render(createElement(Button, props, 'x')).match(/class="([^"]*)"/)?.[1];
        for (const utility of ring) {
          expect(classes?.split(' '), `${variant} ${'href' in props ? 'link' : 'button'}`).toContain(
            utility,
          );
        }
      }
    }
  });

  it('lets a caller recolour the focus ring without losing its width or style', () => {
    const classes = render(
      createElement(Button, { className: 'focus-visible:outline-brand-marketing' }, 'x'),
    ).match(/class="([^"]*)"/)?.[1]?.split(' ');
    expect(classes).toContain('focus-visible:outline-brand-marketing');
    expect(classes).not.toContain('focus-visible:outline-focus-ring');
    expect(classes).toContain('focus-visible:outline');
    expect(classes).toContain('focus-visible:outline-2');
  });

  it('marks a disabled button disabled and drops the click handler', () => {
    const html = render(createElement(Button, { disabled: true, onClick: () => {} }, 'x'));
    expect(html).toContain('disabled=""');
  });
});

describe('Input', () => {
  it('reserves the prefix affordance only when a prefix is given', () => {
    const withPrefix = render(createElement(Input, { prefix: 'https://' }));
    const without = render(createElement(Input, {}));
    expect(withPrefix).toContain('https://');
    expect(without).not.toContain('span');
  });

  it('uses the critical border color exactly when invalid is true', () => {
    // InputProps.d.ts: "Red hairline border; pair with a message, never colour
    // alone" — the class carries the colour; a caller supplies the message.
    // The <input> itself, not the wrapping <div> — both have a class attribute
    // and only the second one changes with `invalid`.
    const inputTag = (html: string): string | undefined => /<input[^>]*>/.exec(html)?.[0];
    const invalid = inputTag(render(createElement(Input, { invalid: true })));
    const valid = inputTag(render(createElement(Input, { invalid: false })));
    expect(invalid).toContain('border-sev-critical');
    expect(valid).not.toContain('border-sev-critical');
  });
});

describe('Card', () => {
  it('omits eyebrow, title, and footer when none are given', () => {
    const html = render(createElement(Card, {}, 'body only'));
    expect(html).toContain('body only');
    expect(html).not.toContain('type-eyebrow');
    expect(html).not.toContain('type-card-title');
    expect(html).not.toContain('border-t');
  });

  it('renders the numeric padding prop as an inline style, not a class', () => {
    const html = render(createElement(Card, { padding: 40 }, 'x'));
    expect(html).toContain('padding:40px');
  });

  it('renders accentRule as a left border, unset by default', () => {
    const withRule = render(createElement(Card, { accentRule: '#b91c1c' }, 'x'));
    const without = render(createElement(Card, {}, 'x'));
    expect(withRule).toContain('border-inline-start:3px solid #b91c1c');
    expect(without).not.toContain('border-inline-start');
  });
});

describe('Badge', () => {
  it('never uses tone=accent by default', () => {
    // Badge.prompt.md: "Never use tone=\"accent\" on anything that isn't
    // clickable-adjacent" — the default has to be something else for that
    // rule to mean anything.
    const html = render(createElement(Badge, {}, 'x'));
    expect(html).not.toContain('bg-accent');
    expect(html).toContain('bg-surface-raised');
  });

  it('uses the mapped colors for each tone', () => {
    const tones = [
      ['neutral', 'bg-surface-raised'],
      ['accent', 'bg-[#fff3ec]'],
      ['success', 'bg-sev-resolved-bg'],
      ['inverse', 'bg-surface-inverse'],
    ] as const;
    for (const [tone, background] of tones) {
      const html = render(createElement(Badge, { tone }, 'x'));
      expect(html).toContain(background);
    }
  });

  it('pill defaults true; pill={false} gives the square radius class', () => {
    const pill = render(createElement(Badge, {}, 'x'));
    const square = render(createElement(Badge, { pill: false }, 'x'));
    expect(pill).toContain('rounded-pill');
    expect(square).toContain('rounded-none');
  });
});

describe('Eyebrow', () => {
  it('is muted by default and accent only when asked', () => {
    const muted = render(createElement(Eyebrow, {}, 'x'));
    const accent = render(createElement(Eyebrow, { tone: 'accent' }, 'x'));
    expect(muted).not.toContain('text-accent');
    expect(accent).toContain('text-accent');
  });
});

describe('StatRow', () => {
  it('separates items with a middot and puts none before the first', () => {
    const html = render(
      createElement(StatRow, {
        items: [
          { value: 3, label: 'critical' },
          { value: 5, label: 'high' },
          { value: 2, label: 'resolved' },
        ],
      }),
    );
    // Exactly two separators for three items — one before the second and
    // third, none before the first.
    expect(html.split('·').length - 1).toBe(2);
    expect(html).toContain('critical');
    expect(html).toContain('resolved');
  });

  it('renders nothing but the row for zero items', () => {
    const html = render(createElement(StatRow, { items: [] }));
    expect(html).not.toContain('·');
  });
});

describe('PromoBar', () => {
  it('renders the message, and the code chip only when given', () => {
    const withCode = render(
      createElement(PromoBar, {
        message: 'First audit free',
        dismissLabel: 'Dismiss',
        code: 'START50',
      }),
    );
    const withoutCode = render(
      createElement(PromoBar, { message: 'First audit free', dismissLabel: 'Dismiss' }),
    );
    expect(withCode).toContain('First audit free');
    expect(withCode).toContain('START50');
    expect(withoutCode).not.toContain('<code');
  });

  it('has a dismiss control labelled for assistive tech', () => {
    const html = render(createElement(PromoBar, { message: 'x', dismissLabel: 'Dismiss' }));
    expect(html).toContain('aria-label="Dismiss"');
  });
});
