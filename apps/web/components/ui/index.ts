/**
 * T237/T238 — the core components, ported from design-system/components/core/.
 *
 * Import from here, not from a component's own file directly — the same
 * discipline design-system/_adherence.oxlintrc.json enforces for the vendored
 * source (T245 wires the equivalent rule for this barrel).
 */
export { Button, type ButtonProps } from './Button';
export { Input, type InputProps } from './Input';
export { Card, type CardProps } from './Card';
export { Badge, type BadgeProps } from './Badge';
export { Eyebrow, type EyebrowProps } from './Eyebrow';
export { StatRow, type StatRowProps, type StatRowItem } from './StatRow';
export { PromoBar, type PromoBarProps } from './PromoBar';
export { TwoToneHeading, type TwoToneHeadingProps } from './TwoToneHeading';
