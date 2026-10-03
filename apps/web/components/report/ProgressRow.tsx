/**
 * Ported from design-system/components/report/ProgressRow.jsx (T130).
 *
 * ProgressRow.prompt.md: "Never render indeterminate motion when nothing is
 * happening, and never omit elapsed time." Elapsed time is always rendered
 * (default `'0:00'`), and the fill width is derived directly from
 * `done`/`total` — there is no animation independent of that ratio for it to
 * run indeterminately.
 */
import { useTranslations } from 'next-intl';
const styles = {
  row: 'border border-solid border-hairline border-border-default bg-surface-page px-[1.125rem] py-4 font-sans',
  head: 'flex items-baseline gap-3 mb-[0.625rem]',
  phase: 'text-[0.9375rem] font-semibold text-text-strong',
  count: 'font-mono text-[0.8125rem] text-text-secondary',
  elapsed: 'ms-auto font-mono text-[0.8125rem] text-text-primary tabular-nums',
  track: 'h-[0.375rem] bg-surface-sunken border border-solid border-hairline border-border-default overflow-hidden',
  fill: 'h-full bg-accent transition-[width] duration-[var(--duration-land)] ease-[var(--easing-reveal)]',
  safe: 'mt-[0.625rem] font-sans text-[0.875rem] leading-5 font-normal text-text-secondary',
} as const;

export interface ProgressRowProps {
  /** m:ss, tabular numerals */
  elapsed?: string;
  phase: string;
  done?: number;
  total?: number;
  /** Says in words that closing the browser is safe */
  safeToClose?: boolean;
}

export function ProgressRow({
  elapsed = '0:00',
  phase,
  done = 0,
  total = 5,
  safeToClose = true,
}: ProgressRowProps): React.ReactElement {
  const t = useTranslations('reports');
  const pct = Math.round((done / total) * 100);

  return (
    <div className={styles.row}>
      <div className={styles.head}>
        <span className={styles.phase}>{phase}</span>
        <span className={styles.count}>{t('report_progress_area_count', { done, total })}</span>
        <span dir="ltr" className={styles.elapsed}>
          {elapsed}
        </span>
      </div>
      <div className={styles.track}>
        <div className={styles.fill} style={{ width: `${String(pct)}%` }} />
      </div>
      {safeToClose && (
        <div className={styles.safe}>{t('report_safe_to_close')}</div>
      )}
    </div>
  );
}
