import * as React from 'react';
/** White panel, 8px radius, hairline border. Most panels take the border and no shadow at all. */
export interface CardProps {
  title?: React.ReactNode;
  /** Uppercase label above the title */
  eyebrow?: string;
  footer?: React.ReactNode;
  padding?: number;
  /** CSS colour for a 3px left rule — used by severity surfaces only */
  accentRule?: string;
  /** Adds shadow-card; prefer a background tint step instead */
  elevated?: boolean;
  children?: React.ReactNode;
  style?: React.CSSProperties;
}
export function Card(props: CardProps): JSX.Element;
