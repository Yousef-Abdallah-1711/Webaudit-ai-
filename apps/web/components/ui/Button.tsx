/**
 * Ported from design-system/components/core/Button.jsx (T237).
 *
 * Two changes from the source, both required by the task rather than chosen:
 * hover moved from a `useState` + `onMouseEnter`/`onMouseLeave` pair to CSS
 * `:hover`, and the per-variant/per-size inline style objects moved to
 * `Button.module.css`. Neither changes what renders — see the module's own
 * doc comment for the one thing the `.prompt.md` requires that the source's
 * inline styles never state: hover is a colour step only.
 */
import type { CSSProperties, MouseEventHandler, ReactNode } from 'react';
import styles from './Button.module.css';

export interface ButtonProps {
  /** primary = accent fill; secondary = bordered white; ghost = text only; inverse = white on dark */
  variant?: 'primary' | 'secondary' | 'ghost' | 'inverse';
  /** md is the 48px control height and the default everywhere */
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  fullWidth?: boolean;
  /** Leading icon node, 20px, currentColor stroke */
  icon?: ReactNode;
  onClick?: MouseEventHandler<HTMLButtonElement | HTMLAnchorElement>;
  /** Renders an <a> instead of a <button> */
  href?: string;
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
}

const VARIANT_CLASS: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary: styles.primary!,
  secondary: styles.secondary!,
  ghost: styles.ghost!,
  inverse: styles.inverse!,
};

const SIZE_CLASS: Record<NonNullable<ButtonProps['size']>, string | undefined> = {
  sm: styles.sm,
  md: undefined,
  lg: styles.lg,
};

export function Button({
  variant = 'primary',
  size = 'md',
  disabled = false,
  fullWidth = false,
  icon = null,
  onClick,
  href,
  children,
  className,
  style,
  ...rest
}: ButtonProps): React.ReactElement {
  const classes = [
    styles.base,
    VARIANT_CLASS[variant],
    SIZE_CLASS[size],
    fullWidth ? styles.fullWidth : undefined,
    className,
  ]
    .filter(Boolean)
    .join(' ');

  if (href !== undefined) {
    return (
      <a
        href={href}
        className={classes}
        style={style}
        onClick={disabled ? undefined : onClick}
        {...rest}
      >
        {icon}
        {children}
      </a>
    );
  }

  return (
    <button
      type="button"
      className={classes}
      style={style}
      disabled={disabled}
      onClick={disabled ? undefined : onClick}
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
}
