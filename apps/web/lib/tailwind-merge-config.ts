import { extendTailwindMerge, validators } from 'tailwind-merge';

/**
 * Custom `theme.extend.fontSize` keys from tailwind.config.ts. tailwind-merge
 * cannot see the Tailwind config, so without this list it reads
 * `text-marketing-label` as a text colour and drops the real size or colour
 * next to it. A unit test keeps this list in sync with the config.
 */
export const CUSTOM_FONT_SIZES: readonly string[] = [
  'landing-title',
  'landing-copy',
  'marketing-display',
  'marketing-h2',
  'marketing-body',
  'marketing-lead',
  'marketing-description',
  'marketing-demo-heading',
  'marketing-principle-heading',
  'marketing-workflow-heading',
  'marketing-card-heading',
  'marketing-pricing-total',
  'marketing-trust-heading',
  'marketing-readiness-copy',
  'marketing-closing-copy',
  'marketing-closing-copy-mobile',
  'marketing-area-heading',
  'marketing-remediation-heading',
  'marketing-faq-heading',
  'marketing-closing-heading',
  'marketing-label',
  'marketing-micro',
  'marketing-stat',
  'marketing-mobile-stat',
  'marketing-mobile-copy',
  'marketing-mobile-h2',
];

/**
 * Custom `theme.extend.height` keys from tailwind.config.ts. Unknown to
 * tailwind-merge, so `h-[36px]` and `h-landing-cta` would both survive a merge
 * and the stylesheet order would pick the winner. A unit test keeps this list
 * in sync with the config.
 */
export const CUSTOM_HEIGHTS: readonly string[] = [
  'landing-header-control',
  'control',
  'landing-header',
  'landing-promo',
  'landing-control',
  'landing-cta',
  'marketing-framebar',
  'landing-core',
  'hairline',
];

/**
 * tailwind-merge 3 follows Tailwind 4, where a bare `outline` is a width. This
 * app runs Tailwind 3, where bare `outline` sets `outline-style: solid` and
 * `outline-2` is the width, so a focus ring written as
 * `outline outline-2 outline-<colour>` is three distinct classes.
 */
const OUTLINE_STYLES = ['', 'solid', 'dashed', 'dotted', 'double', 'none', 'hidden'];

export const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: [...CUSTOM_FONT_SIZES],
    },
    classGroups: {
      'border-w': [{ border: ['hairline'] }],
      h: [{ h: [...CUSTOM_HEIGHTS] }],
    },
  },
  override: {
    classGroups: {
      // The hairline width is registered on the width group only, so it is not
      // mistaken for a colour.
      'outline-w': [
        {
          outline: [
            validators.isNumber,
            validators.isArbitraryVariableLength,
            validators.isArbitraryLength,
            'hairline',
          ],
        },
      ],
      'outline-style': [{ outline: OUTLINE_STYLES }],
    },
  },
});
