/**
 * Ported from design-system/components/core/Card.jsx (T237).
 *
 * `padding` (a number, in px) and `accentRule` (an arbitrary CSS colour) are
 * genuinely per-instance values, not design tokens — they stay as inline
 * style, matching the source's own `...style` merge, rather than becoming
 * static CSS Module classes that could not express them.
 */
import type { CSSProperties, ReactNode } from 'react';
import { cn } from '../../lib/cn';

export interface CardProps {
  title?: ReactNode;
  /** Uppercase label above the title */
  eyebrow?: string;
  footer?: ReactNode;
  padding?: number;
  /** CSS colour for a 3px left rule — used by severity surfaces only */
  accentRule?: string;
  /** Adds shadow-card; prefer a background tint step instead */
  elevated?: boolean;
  children?: ReactNode;
  style?: CSSProperties;
}

export function Card({
  title,
  eyebrow,
  footer,
  padding = 24,
  accentRule,
  elevated = false,
  children,
  style,
  ...rest
}: CardProps): React.ReactElement {
  const classes = cn(
    'rounded-card border border-hairline border-border-card bg-surface-card shadow-none',
    elevated && 'shadow-card',
  );

  return (
    <div
      className={classes}
      style={{
        padding: `${String(padding)}px`,
        ...(accentRule !== undefined ? { borderInlineStart: `3px solid ${accentRule}` } : {}),
        ...style,
      }}
      {...rest}
    >
      {eyebrow !== undefined && (
        // eslint-disable-next-line no-restricted-syntax -- Card eyebrow overrides the shared 15.2px token to 12px today
        <div className="type-eyebrow mb-2 text-[12px] uppercase text-text-muted">{eyebrow}</div>
      )}
      {title !== undefined && <div className="type-card-title mb-3 text-text-strong">{title}</div>}
      {children}
      {footer !== undefined && (
        <div className="mt-4 border-t border-hairline border-border-default pt-4 type-small text-text-secondary">
          {footer}
        </div>
      )}
    </div>
  );
}
