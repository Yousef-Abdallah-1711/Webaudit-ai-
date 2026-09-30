/**
 * Ported from design-system/ui_kits/admin/AdminScreens.jsx's `Overview`
 * (T243 — the task text names AdminShell.jsx as the source, but `Overview`
 * itself is actually defined in AdminScreens.jsx alongside the 9 screens
 * T244 draws its 4 from; ported from where the code actually is).
 *
 * `Overview`'s source signature is `({go})` — an unused prop in the source
 * itself (never read in its body, and never passed by any caller either).
 * Not ported, for the same reason `AdminShell`'s dead `useTheme()`
 * destructure wasn't (see components/admin/AdminShell.tsx).
 *
 * No hooks anywhere in the source, so this stays a Server Component. The
 * overview endpoint is not available yet, so this page deliberately renders
 * an honest unavailable state instead of presenting vendored placeholder data
 * as production telemetry.
 */
import { Card } from '../../../components/ui';
import { AHead, Stat } from '../../../components/admin';
import { getTranslations } from 'next-intl/server';
import styles from './page.module.css';

const STATS = [
  ['stat_audits_completed', 'unavailable', 'overview_data_unavailable'],
  ['credits_recognised', 'unavailable', 'overview_data_unavailable'],
  ['provider_cost', 'unavailable', 'overview_data_unavailable'],
  ['queue_depth', 'unavailable', 'overview_data_unavailable'],
] as const;

export default async function AdminOverviewPage(): Promise<React.ReactElement> {
  const t = await getTranslations('admin');

  return (
    <div>
      <AHead eyebrow={t('group_platform')} title={t('overview')} meta={t('overview_meta')} />

      <div className={styles.statsGrid}>
        {STATS.map(([label, value, sub]) => (
          <Stat key={label} label={t(label)} value={t(value)} sub={t(sub)} />
        ))}
      </div>

      <div className={styles.twoCol}>
        <Card padding={22} title={t('overview_needs_attention')}>
          <div className={styles.attentionDesc}>{t('overview_no_attention_items')}</div>
        </Card>
        <Card padding={22} title={t('overview_area_health')}>
          <div className={styles.attentionDesc}>{t('overview_area_health_unavailable')}</div>
        </Card>
      </div>
    </div>
  );
}
