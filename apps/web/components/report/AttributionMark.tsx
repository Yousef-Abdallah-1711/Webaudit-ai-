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
import { useTranslations } from 'next-intl';
import styles from './AttributionMark.module.css';

export interface AttributionMarkProps {
  kind?: 'measured' | 'ai-judgment';
}

export function AttributionMark({ kind = 'measured' }: AttributionMarkProps): React.ReactElement {
  const t = useTranslations('reports');
  const entry =
    kind === 'measured'
      ? {
          className: styles.measured!,
          label: t('report_attribution_measured'),
          title: t('report_attribution_measured_title'),
          path: 'M4 20V10m5 10V4m5 16v-7m5 7V8',
        }
      : {
          className: styles.aiJudgment!,
          label: t('report_attribution_ai_judgment'),
          title: t('report_attribution_ai_judgment_title'),
          path: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm-2 7a2 2 0 1 1 4 0c0 1.5-2 1.8-2 3m0 3v.5',
        };

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
