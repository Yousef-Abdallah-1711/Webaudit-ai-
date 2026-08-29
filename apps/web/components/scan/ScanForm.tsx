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
 * **Only the URL tab is wired to a real submission.** The repository tab's
 * radio list and the archive tab's dropzone are ported for visual parity
 * (screen-map.md names this component, not a URL-only variant of it) but
 * have no real backing yet: a repository listing needs a GitHub connection
 * this product does not fetch anywhere yet, and archive upload is
 * `POST /scans/upload`, a separate, unbuilt task. Both tabs are disabled at
 * the submit boundary rather than silently pretending to work.
 */
import { useState } from 'react';
import { AREA_COST, ALL_AREAS, quoteAreas } from '@webaudit/config';
import type { ModuleType } from '@webaudit/types';
import { Button, Card, Eyebrow, Input } from '../ui';
import { useT } from '../../app/theme';
import type { StringKey } from '../../lib/strings';
import { ApiError, createScan, createTarget, quoteScan } from '../../lib/api';
import styles from './ScanForm.module.css';

const AREA_LABEL_KEY: Readonly<Record<ModuleType, StringKey>> = {
  PERFORMANCE: 'a_perf',
  SECURITY: 'a_sec',
  UI: 'a_des',
  TESTING: 'a_test',
  SEO: 'a_seo',
};

type Tab = 'url' | 'repo' | 'archive';

export interface ScanFormProps {
  /** Fired once the target, quote, and scan have all been created. */
  onStart?: (scanId: string) => void;
}

export function ScanForm({ onStart }: ScanFormProps): React.ReactElement {
  const [t] = useT();
  const [tab, setTab] = useState<Tab>('url');
  const [url, setUrl] = useState('');
  const [selected, setSelected] = useState<readonly ModuleType[]>(ALL_AREAS);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const all = selected.length === ALL_AREAS.length;
  const estimate = quoteAreas(selected);

  function toggle(area: ModuleType): void {
    setSelected((current) =>
      current.includes(area) ? current.filter((a) => a !== area) : [...current, area],
    );
  }

  async function onSubmit(): Promise<void> {
    setError(null);
    if (tab !== 'url' || url.trim() === '' || selected.length === 0) return;
    setSubmitting(true);
    try {
      const fullUrl = url.startsWith('http') ? url : `https://${url}`;
      const { target } = await createTarget(fullUrl);
      const { quote } = await quoteScan(target.id, selected);
      const { scan } = await createScan(target.id, selected, quote.credits);
      onStart?.(scan.id);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('scan_start_error'));
    } finally {
      setSubmitting(false);
    }
  }

  const tabs: readonly [Tab, string][] = [
    ['url', t('tab_url')],
    ['repo', t('tab_repo')],
    ['archive', t('tab_archive')],
  ];

  return (
    <div className={styles.grid}>
      <Card padding={24}>
        <div className={styles.tabs}>
          {tabs.map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => {
                setTab(key);
              }}
              className={tab === key ? `${styles.tab} ${styles.tabActive}` : styles.tab}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === 'url' && (
          <Input
            prefix="https://"
            placeholder={t('url_ph')}
            value={url.replace(/^https?:\/\//, '')}
            onChange={(e) => {
              setUrl(e.target.value);
            }}
          />
        )}
        {tab === 'repo' && (
          <div className={styles.repoList}>
            {['acme/storefront', 'acme/marketing-site', 'acme/checkout'].map((repo, i) => (
              <label key={repo} className={styles.repoRow}>
                <input type="radio" name="repo" defaultChecked={i === 0} disabled />
                <span className={styles.repoName}>{repo}</span>
                <span className={styles.repoBranch}>main</span>
              </label>
            ))}
          </div>
        )}
        {tab === 'archive' && (
          <div className={styles.dropzone}>
            <div className={styles.dropzoneTitle}>{t('drop_archive')}</div>
            <div className={styles.dropzoneNote}>{t('drop_note')}</div>
          </div>
        )}

        <div className={styles.areasSection}>
          <Eyebrow>{t('areas_label')}</Eyebrow>
          <div className={styles.areasList}>
            {ALL_AREAS.map((area, i) => (
              <label key={area} className={i > 0 ? `${styles.areaRow} ${styles.areaRowTop}` : styles.areaRow}>
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
          disabled={!selected.length || submitting || tab !== 'url' || url.trim() === ''}
          onClick={() => void onSubmit()}
        >
          {t('accept_run')}
        </Button>
      </Card>
    </div>
  );
}
