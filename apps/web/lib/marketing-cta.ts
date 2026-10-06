/**
 * Shared class recipes for public marketing actions.
 *
 * These are plain class strings, not components: `Button`'s variants and props
 * are locked by the design-system contract and the adherence lint, so marketing
 * styling is layered on through `className` instead. Keep every recipe a
 * literal string so Tailwind's content scan can see it.
 */

/** AA-safe gradient fill for white text: the primary CTA and the active area tab. */
export const gradientSurface = 'bg-gradient-cta-marketing text-white shadow-marketing-card';

/**
 * Marketing primary CTA, applied through `className` on `<Button variant="primary">`.
 * Hover is a brightness step because the gradient is a background image.
 */
export const marketingPrimaryCta = `${gradientSurface} [&:hover:not(:disabled)]:brightness-110 [&:active:not(:disabled)]:!brightness-95`;

/** Header and drawer CTA height (44px), applied after Button's own size height. */
export const marketingCtaHeight = 'h-landing-cta';

/**
 * Quiet action on the dark landing hero, for `<Button variant="ghost">`.
 * Button's own hover rule is written as `[&:hover:not(:disabled)]:`, which
 * outranks a plain `hover:` utility, so the override must use the same variant.
 */
export const onHeroGhostButton =
  'text-marketing-inverse-muted [&:hover:not(:disabled)]:bg-white/10 [&:hover:not(:disabled)]:text-marketing-inverse';

/** Same look for raw controls (language/theme toggles) that have no Button hover rule. */
export const onHeroGhostControl =
  'text-marketing-inverse-muted hover:bg-white/10 hover:text-marketing-inverse';

/** Keyboard focus ring on light marketing surfaces. */
export const focusRingBrand =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-marketing';

/** Same ring, offset from the control edge. */
export const focusRingBrandOffset = `${focusRingBrand} focus-visible:outline-offset-2`;

/** Keyboard focus ring on the dark landing hero. */
export const focusRingHighlightOffset =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-highlight focus-visible:outline-offset-2';
