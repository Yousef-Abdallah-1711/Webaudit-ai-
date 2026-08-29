/**
 * Ported from design-system/components/core/TwoToneHeading.jsx (T238).
 *
 * TwoToneHeading.prompt.md: "Reproduce the mechanism, not the reference's
 * sentence. One per screen." — a constraint for callers, not something this
 * component can enforce; noted here so a reviewer of a page that uses this
 * twice knows to ask why.
 */
import styles from './TwoToneHeading.module.css';

export interface TwoToneHeadingProps {
  /** First clause, rendered in --text-primary */
  lead: string;
  /** Second clause, rendered in --accent */
  accent: string;
  level?: 'display' | 'h2';
  align?: 'left' | 'center';
  as?: 'h1' | 'h2' | 'h3';
}

export function TwoToneHeading({
  lead,
  accent,
  level = 'display',
  align = 'center',
  as: Tag = 'h1',
}: TwoToneHeadingProps): React.ReactElement {
  const classes = [
    styles.heading,
    level === 'display' ? styles.display : styles.h2,
    align === 'left' ? styles.left : styles.center,
  ].join(' ');

  return (
    <Tag className={classes}>
      {lead} <span className={styles.accent}>{accent}</span>
    </Tag>
  );
}
