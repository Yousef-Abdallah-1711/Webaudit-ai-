import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

export interface SectionNoProps {
  number: string;
  tone?: 'default' | 'inverse';
  children: ReactNode;
}

const styles = {
  sectionNo: cn(
    'mx-auto mb-0 inline-flex items-center gap-2 text-marketing-muted text-marketing-label font-extrabold tracking-[0.08em] before:h-px before:w-6 before:bg-brand-electric-bright max-marketing-mobile:text-marketing-section-number-mobile',
  ),
  sectionNoInverse: cn('text-marketing-inverse-muted before:bg-brand-highlight'),
  header: cn(
    'mx-auto mb-marketing-section-content-gap max-w-marketing-section text-center max-marketing-mobile:mb-marketing-section-content-gap-mobile',
  ),
  heading: cn(
    'mb-0 mt-marketing-section-heading-gap text-marketing-h2 leading-marketing-h2 font-black tracking-[-0.03em] text-balance text-marketing-primary max-marketing-mobile:mt-marketing-section-heading-gap-mobile',
  ),
  lead: cn(
    'mx-auto mb-0 mt-marketing-section-heading-gap max-w-marketing-body text-marketing-lead leading-marketing-lead text-marketing-secondary text-pretty max-marketing-mobile:mt-marketing-section-heading-gap-mobile max-marketing-mobile:text-marketing-mobile-lead max-marketing-mobile:leading-marketing-mobile-lead',
  ),
};

export function SectionNo({ number, tone = 'default', children }: SectionNoProps): React.ReactElement {
  return (
    <p className={cn(styles.sectionNo, tone === 'inverse' && styles.sectionNoInverse)}>
      <span dir="ltr">{number}</span>
      <span aria-hidden="true">·</span>
      {children}
    </p>
  );
}

export interface MarketingSectionHeaderProps {
  id: string;
  number: string;
  eyebrow: ReactNode;
  title: ReactNode;
  lead: ReactNode;
}

export function MarketingSectionHeader({
  id,
  number,
  eyebrow,
  title,
  lead,
}: MarketingSectionHeaderProps): React.ReactElement {
  return (
    <header className={styles.header}>
      <SectionNo number={number}>{eyebrow}</SectionNo>
      <h2 id={id} className={styles.heading}>
        {title}
      </h2>
      <p className={styles.lead}>{lead}</p>
    </header>
  );
}
