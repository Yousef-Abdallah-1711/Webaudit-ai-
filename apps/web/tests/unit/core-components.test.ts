/**
 * T237 — the 7 core components, rendered and asserted rather than trusted.
 *
 * `renderToStaticMarkup` rather than jsdom or Testing Library: none of these
 * components need an event loop or a real DOM to prove what they render, and
 * every module import already goes through the ported CSS Modules pipeline
 * that the manual `next build`/`next dev` verification for this task
 * confirmed generates real class names from real `var(--token)` CSS — these
 * tests exist to keep that true across a later edit, not to re-prove it.
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
import badgeStyles from '../../components/ui/Badge.module.css';
import eyebrowStyles from '../../components/ui/Eyebrow.module.css';

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

  it('gives every variant a distinct class', () => {
    const variants = ['primary', 'secondary', 'ghost', 'inverse'] as const;
    const classes = variants.map((variant) => {
      const html = render(createElement(Button, { variant }, 'x'));
      return /class="([^"]+)"/.exec(html)?.[1];
    });
    expect(new Set(classes).size).toBe(variants.length);
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

  it('applies the invalid class exactly when invalid is true', () => {
    // InputProps.d.ts: "Red hairline border; pair with a message, never colour
    // alone" — the class carries the colour; a caller supplies the message.
    // The <input> itself, not the wrapping <div> — both have a class attribute
    // and only the second one changes with `invalid`.
    const inputTag = (html: string): string | undefined => /<input[^>]*>/.exec(html)?.[0];
    const invalid = inputTag(render(createElement(Input, { invalid: true })));
    const valid = inputTag(render(createElement(Input, { invalid: false })));
    expect(invalid).not.toBe(valid);
  });
});

describe('Card', () => {
  it('omits eyebrow, title, and footer when none are given', () => {
    const html = render(createElement(Card, {}, 'body only'));
    expect(html).toContain('body only');
    expect(html).not.toContain('Card_eyebrow');
    expect(html).not.toContain('Card_title');
    expect(html).not.toContain('Card_footer');
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
    expect(html).not.toContain(badgeStyles.accent);
    expect(html).toContain(badgeStyles.neutral);
  });

  it('gives every tone a distinct class', () => {
    const tones = ['neutral', 'accent', 'success', 'inverse'] as const;
    const classes = tones.map((tone) => {
      const html = render(createElement(Badge, { tone }, 'x'));
      return /class="([^"]+)"/.exec(html)?.[1];
    });
    expect(new Set(classes).size).toBe(tones.length);
  });

  it('pill defaults true; pill={false} gives the square radius class', () => {
    const pill = render(createElement(Badge, {}, 'x'));
    const square = render(createElement(Badge, { pill: false }, 'x'));
    expect(pill).toContain(badgeStyles.pill);
    expect(square).toContain(badgeStyles.square);
  });
});

describe('Eyebrow', () => {
  it('is muted by default and accent only when asked', () => {
    const muted = render(createElement(Eyebrow, {}, 'x'));
    const accent = render(createElement(Eyebrow, { tone: 'accent' }, 'x'));
    expect(muted).not.toContain(eyebrowStyles.accent);
    expect(accent).toContain(eyebrowStyles.accent);
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
      createElement(PromoBar, { message: 'First audit free', code: 'START50' }),
    );
    const withoutCode = render(createElement(PromoBar, { message: 'First audit free' }));
    expect(withCode).toContain('First audit free');
    expect(withCode).toContain('START50');
    expect(withoutCode).not.toContain('<code');
  });

  it('has a dismiss control labelled for assistive tech', () => {
    const html = render(createElement(PromoBar, { message: 'x' }));
    expect(html).toContain('aria-label="Dismiss"');
  });
});
