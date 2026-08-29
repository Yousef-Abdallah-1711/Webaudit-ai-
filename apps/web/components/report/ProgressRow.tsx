/**
 * Ported from design-system/components/report/ProgressRow.jsx (T130).
 *
 * ProgressRow.prompt.md: "Never render indeterminate motion when nothing is
 * happening, and never omit elapsed time." Elapsed time is always rendered
 * (default `'0:00'`), and the fill width is derived directly from
 * `done`/`total` — there is no animation independent of that ratio for it to
 * run indeterminately.
 */
import styles from './ProgressRow.module.css';

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
  const pct = Math.round((done / total) * 100);

  return (
    <div className={styles.row}>
      <div className={styles.head}>
        <span className={styles.phase}>{phase}</span>
        <span className={styles.count}>
          {done} of {total} areas
        </span>
        <span dir="ltr" className={styles.elapsed}>
          {elapsed}
        </span>
      </div>
      <div className={styles.track}>
        <div className={styles.fill} style={{ width: `${String(pct)}%` }} />
      </div>
      {safeToClose && <div className={styles.safe}>You can close this tab. The audit keeps running and the report will be waiting.</div>}
    </div>
  );
}
