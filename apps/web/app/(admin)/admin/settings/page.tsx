/**
 * T244 — admin platform settings.
 *
 * Persistence is not wired yet, so this is intentionally a read-only reference
 * surface. It does not expose local switches or an inert Save action that could
 * imply a successful platform mutation.
 */
import { Card } from '../../../../components/ui';
import { AHead } from '../../../../components/admin';
import { getTranslations } from 'next-intl/server';
import styles from './page.module.css';

const FLAGS = [
  'settings_repository_input',
  'settings_archive_upload',
  'settings_load_generation',
  'settings_design_questionnaire',
  'settings_readiness_certificates',
] as const;

const LIMITS = [
  ['limit_scan_timeout', 'limit_value_scan_timeout'],
  ['limit_level_1_probe_rate', 'limit_value_level_1_probe_rate'],
  ['limit_archive_size_ceiling', 'limit_value_archive_size_ceiling'],
  ['limit_sandbox_wall_clock', 'limit_value_sandbox_wall_clock'],
  ['limit_sandbox_memory', 'limit_value_sandbox_memory'],
] as const;

const RETENTION = [
  ['plan_free', 'retention_free'],
  ['plan_starter', 'retention_starter'],
  ['plan_pro', 'retention_pro'],
  ['plan_business', 'retention_business'],
] as const;

export default async function AdminSettingsPage(): Promise<React.ReactElement> {
  const t = await getTranslations('admin');

  return (
    <div>
      <AHead eyebrow={t('group_governance')} title={t('settings')} meta={t('settings_meta')} />
      <div className={styles.grid}>
        <Card padding={24} title={t('settings_feature_switches')}>
          <p className={styles.note}>{t('settings_read_only_note')}</p>
          {FLAGS.map((key) => (
            <div key={key} className={styles.flagRow}>
              <span className={styles.flagLabel}>{t(key)}</span>
              <span className={styles.limitValue}>{t('unavailable')}</span>
            </div>
          ))}
        </Card>
        <div className={styles.rightCol}>
          <Card padding={24} title={t('settings_limits')}>
            {LIMITS.map(([label, value]) => (
              <div key={label} className={styles.limitRow}>
                <span>{t(label)}</span>
                <span className={styles.limitValue}>{t(value)}</span>
              </div>
            ))}
          </Card>
          <Card padding={24} title={t('table_retention')}>
            {RETENTION.map(([label, value]) => (
              <div key={label} className={styles.limitRow}>
                <span>{t(label)}</span>
                <span className={styles.limitValue}>{t(value)}</span>
              </div>
            ))}
            <p className={styles.retentionNote}>{t('settings_retention_note')}</p>
          </Card>
        </div>
      </div>
    </div>
  );
}
