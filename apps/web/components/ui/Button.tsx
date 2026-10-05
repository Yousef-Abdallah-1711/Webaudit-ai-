/**
 * Ported from design-system/components/core/Button.jsx (T237).
 *
 * Hover is a colour step only, as required by Button.prompt.md. Its existing
 * :hover:not(:disabled) behavior is represented with Tailwind's arbitrary
 * selector variant so both button and anchor renderings retain it.
 */
import type { CSSProperties, MouseEventHandler, ReactNode } from 'react';
import { cn } from '../../lib/cn';

export interface ButtonProps {
  /** primary = accent fill; secondary = bordered white; ghost = text only; inverse = white on dark */
  variant?: 'primary' | 'secondary' | 'ghost' | 'inverse';
  /** md is the 48px control height and the default everywhere */
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  type?: 'button' | 'submit' | 'reset';
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
  primary: 'bg-accent text-text-on-accent [&:hover:not(:disabled)]:bg-accent-hover',
  secondary:
    'bg-surface-page text-text-primary border-border-default [&:hover:not(:disabled)]:bg-surface-raised',
  ghost:
    'bg-transparent text-text-secondary [&:hover:not(:disabled)]:bg-surface-raised [&:hover:not(:disabled)]:text-text-strong',
  inverse: 'bg-surface-page text-text-primary [&:hover:not(:disabled)]:bg-surface-raised',
};

const SIZE_CLASS: Record<NonNullable<ButtonProps['size']>, string | undefined> = {
  // The source uses a 36px intrinsic small-control height absent from the spacing tokens.
  // eslint-disable-next-line no-restricted-syntax -- preserve the existing component size
  sm: 'h-[36px] px-4 text-[14px]',
  md: undefined,
  // eslint-disable-next-line no-restricted-syntax -- preserve the existing component size
  lg: 'h-[56px] px-10 text-[16px]',
};

export function Button({
  variant = 'primary',
  size = 'md',
  disabled = false,
  type = 'button',
  fullWidth = false,
  icon = null,
  onClick,
  href,
  children,
  className,
  style,
  ...rest
}: ButtonProps): React.ReactElement {
  const classes = cn(
    // eslint-disable-next-line no-restricted-syntax -- 14px is the existing Button label size
    'box-border inline-flex h-12 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-control border-solid [border-width:var(--border-width)] border-transparent px-8 font-sans text-[14px] font-medium no-underline transition-colors disabled:cursor-not-allowed disabled:opacity-[0.45] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring',
    VARIANT_CLASS[variant],
    SIZE_CLASS[size],
    fullWidth && 'w-full',
    className,
  );

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
      type={type}
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
