'use client';

/**
 * T129 — the new-scan panel, ported from `ScanScreen` in
 * `design-system/ui_kits/app/Screens.jsx`.
 *
 * **The live cost estimate is computed client-side from `@webaudit/config`'s
 * `quoteAreas`/`AREA_COST`** (the same public pricing schedule the API
 * enforces server-side) rather than the source's own hardcoded per-area
 * numbers — those happen to already match, but computing them from the one
 * shared source means they can never drift apart. This estimate is exactly
 * that: an estimate, shown live as areas are toggled with no network call.
 * The number actually charged is whatever `POST /scans/quote` returns when
 * "Accept and run" is pressed — the authoritative source FR-011/012 requires
 * — and that is what gets sent to `POST /scans` as `acceptedQuote`.
 *
 * **Preserves the quote-is-not-a-charge copy (FR-011, FR-012)** verbatim
 * from `lib/strings.ts`'s existing `quote_note`/`quote_bundled`/`areas_note`
 * keys — already present from T248, not re-authored here.
 *
 * **All three inputs are real as of T179.** The tab strip, the repository
 * list and the dropzone moved to `InputTabs`, which now talks to `GET /repos`
 * and `POST /scans/upload`. What is left here is what this component was
 * always about: choosing areas, seeing the estimate, and accepting the quote.
 * It no longer knows which tab is open — only what was selected.
 */
import { useCallback, useState } from 'react';
import { AREA_COST, ALL_AREAS, quoteAreas } from '@webaudit/config';
import type { ModuleType } from '@webaudit/types';
import { Button, Card, Eyebrow } from '../ui';
import { useT } from '../../app/theme';
import type { StringKey } from '../../lib/strings';
import { ApiError, createScan, createTarget, quoteScan } from '../../lib/api';
import { InputTabs, type InputSelection } from './InputTabs';
import styles from './ScanForm.module.css';

const AREA_LABEL_KEY: Readonly<Record<ModuleType, StringKey>> = {
  PERFORMANCE: 'a_perf',
  SECURITY: 'a_sec',
  UI: 'a_des',
  TESTING: 'a_test',
  SEO: 'a_seo',
};

export interface ScanFormProps {
  /** Fired once the target, quote, and scan have all been created. */
  onStart?: (scanId: string) => void;
}

export function ScanForm({ onStart }: ScanFormProps): React.ReactElement {
  const [t] = useT();
  const [selection, setSelection] = useState<InputSelection | null>(null);
  const [selected, setSelected] = useState<readonly ModuleType[]>(ALL_AREAS);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const all = selected.length === ALL_AREAS.length;
  const estimate = quoteAreas(selected);

  // Stable, because `InputTabs` reports its selection from an effect keyed on
  // that callback — a new function identity each render would make the effect
  // re-run every render and the two components would loop.
  const onSelectionChange = useCallback((next: InputSelection | null) => {
    setSelection(next);
  }, []);

  function toggle(area: ModuleType): void {
    setSelected((current) =>
      current.includes(area) ? current.filter((a) => a !== area) : [...current, area],
    );
  }

  /**
   * The target id for whatever is selected.
   *
   * An archive already has one — `POST /scans/upload` created it while the
   * user was still choosing areas, which is what lets a refused archive be
   * refused before any of this. A URL or a repository is turned into a target
   * here, at submit, so a half-typed address never creates a row.
   */
  async function resolveTargetId(input: InputSelection): Promise<string> {
    if (input.kind === 'archive') return input.targetId;
    if (input.kind === 'repo') return (await createTarget(input.fullName, 'REPOSITORY')).target.id;
    const fullUrl = input.value.startsWith('http') ? input.value : `https://${input.value}`;
    return (await createTarget(fullUrl)).target.id;
  }

  async function onSubmit(): Promise<void> {
    setError(null);
    if (selection === null || selected.length === 0) return;
    setSubmitting(true);
    try {
      const targetId = await resolveTargetId(selection);
      const { quote } = await quoteScan(targetId, selected);
      const { scan } = await createScan(targetId, selected, quote.credits);
      onStart?.(scan.id);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('scan_start_error'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={styles.grid}>
      <Card padding={24}>
        <InputTabs onChange={onSelectionChange} />

        <div className={styles.areasSection}>
          <Eyebrow>{t('areas_label')}</Eyebrow>
          <div className={styles.areasList}>
            {ALL_AREAS.map((area, i) => (
              <label
                key={area}
                className={i > 0 ? `${styles.areaRow} ${styles.areaRowTop}` : styles.areaRow}
              >
                <input
                  type="checkbox"
                  checked={selected.includes(area)}
                  onChange={() => {
                    toggle(area);
                  }}
                />
                <span className={styles.areaName}>{t(AREA_LABEL_KEY[area])}</span>
                <span dir="ltr" className={styles.areaCost}>
                  {AREA_COST[area]} cr
                </span>
              </label>
            ))}
          </div>
          <div className={styles.areasNote}>{t('areas_note')}</div>
        </div>
      </Card>

      <Card padding={24} title={t('quote')}>
        <div className={styles.costRow}>
          <span className={styles.costValue}>{estimate}</span>
          <span className={styles.costLabel}>{t('credits')}</span>
        </div>
        {all && <div className={styles.bundled}>{t('quote_bundled')}</div>}
        <div className={styles.quoteNote}>{t('quote_note')}</div>
        {error !== null && <div className={styles.error}>{error}</div>}
        <Button
          fullWidth
          disabled={!selected.length || submitting || selection === null}
          onClick={() => void onSubmit()}
        >
          {t('accept_run')}
        </Button>
      </Card>
    </div>
  );
}
