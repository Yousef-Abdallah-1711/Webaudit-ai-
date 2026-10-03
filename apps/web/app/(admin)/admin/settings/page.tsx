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
      <div className={'grid grid-cols-2 items-start gap-4 [@media(max-width:40rem)]:grid-cols-1'}>
        <Card padding={24} title={t('settings_feature_switches')}>
          <p className={'mt-[0.875rem] mb-[0.875rem] type-small text-text-muted'}>
            {t('settings_read_only_note')}
          </p>
          {FLAGS.map((key) => (
            <div
              key={key}
              className={
                'flex items-center gap-3 border-x-0 border-b-0 border-t-hairline border-solid border-border-default py-3'
              }
            >
              <span className={'type-small'}>{t(key)}</span>
              <span className={'ms-auto font-mono'}>{t('unavailable')}</span>
            </div>
          ))}
        </Card>
        <div className={'flex flex-col gap-4'}>
          <Card padding={24} title={t('settings_limits')}>
            {LIMITS.map(([label, value]) => (
              <div
                key={label}
                className={
                  'flex border-x-0 border-b-0 border-t-hairline border-solid border-border-default py-2.5 type-small'
                }
              >
                <span>{t(label)}</span>
                <span className={'ms-auto font-mono'}>{t(value)}</span>
              </div>
            ))}
          </Card>
          <Card padding={24} title={t('table_retention')}>
            {RETENTION.map(([label, value]) => (
              <div
                key={label}
                className={
                  'flex border-x-0 border-b-0 border-t-hairline border-solid border-border-default py-2.5 type-small'
                }
              >
                <span>{t(label)}</span>
                <span className={'ms-auto font-mono'}>{t(value)}</span>
              </div>
            ))}
            <p className={'mt-3 mb-0 type-small text-text-muted'}>{t('settings_retention_note')}</p>
          </Card>
        </div>
      </div>
    </div>
  );
}
