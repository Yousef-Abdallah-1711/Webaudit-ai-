import * as React from 'react';
/**
 * The one CTA control. Primary is the brand accent; label is 14px/500, never large or heavy.
 */
export interface ButtonProps {
  /** primary = accent fill; secondary = bordered white; ghost = text only; inverse = white on dark */
  variant?: 'primary' | 'secondary' | 'ghost' | 'inverse';
  /** md is the 48px control height and the default everywhere */
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  fullWidth?: boolean;
  /** Leading icon node, 20px, currentColor stroke */
  icon?: React.ReactNode;
  onClick?: () => void;
  /** Renders an <a> instead of a <button> */
  href?: string;
  children?: React.ReactNode;
}
export function Button(props: ButtonProps): JSX.Element;
