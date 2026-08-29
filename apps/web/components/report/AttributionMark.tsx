/**
 * Ported from design-system/components/report/AttributionMark.jsx (T239).
 *
 * FR-032: required on every finding — says whether it was observed or
 * concluded. AttributionMark.prompt.md: "Never hide it behind a hover or a
 * tooltip-only affordance — 100% of delivered issues must carry visible
 * attribution." Nothing in this component hides it; that constraint governs
 * how a caller places it, not this file, and is restated here so the next
 * caller reads it before wrapping this in a `title`-only or `:hover`-revealed
 * container.
 */
import styles from './AttributionMark.module.css';

export interface AttributionMarkProps {
  kind?: 'measured' | 'ai-judgment';
}

const KIND: Record<
  NonNullable<AttributionMarkProps['kind']>,
  {
    readonly className: string;
    readonly label: string;
    readonly title: string;
    readonly path: string;
  }
> = {
  measured: {
    className: styles.measured!,
    label: 'Measured',
    title: 'Observed directly by a check',
    path: 'M4 20V10m5 10V4m5 16v-7m5 7V8',
  },
  'ai-judgment': {
    className: styles.aiJudgment!,
    label: 'AI judgment',
    title: 'Concluded by a model from measured input',
    path: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm-2 7a2 2 0 1 1 4 0c0 1.5-2 1.8-2 3m0 3v.5',
  },
};

export function AttributionMark({ kind = 'measured' }: AttributionMarkProps): React.ReactElement {
  const entry = KIND[kind];

  return (
    <span className={`${styles.mark} ${entry.className}`} title={entry.title}>
      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
      >
        <path d={entry.path} />
      </svg>
      {entry.label}
    </span>
  );
}
