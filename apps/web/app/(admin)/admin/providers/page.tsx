'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  getAdminProviders,
  setAdminProviderChain,
  type AdminProviderChainEntry,
} from '../../../../lib/api.js';
import { Button, Card } from '../../../../components/ui';
import { AHead, mono, num, Table } from '../../../../components/admin';

export default function AdminProvidersPage(): React.ReactElement {
  const t = useTranslations('admin');
  const [chain, setChain] = useState<readonly AdminProviderChainEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    void getAdminProviders()
      .then(({ chain: persisted }) => {
        if (!active) return;
        setChain(persisted);
        setLoading(false);
      })
      .catch((cause: unknown) => {
        if (!active) return;
        setError(cause instanceof Error ? cause.message : t('providers_load_error'));
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [t]);

  const vendors = new Set(chain.map((entry) => entry.vendor)).size;

  const persist = async (next: readonly AdminProviderChainEntry[]): Promise<void> => {
    setSaving(true);
    setError(null);
    try {
      const result = await setAdminProviderChain(
        next.map(({ vendor, model, isEnabled }) => ({ vendor, model, isEnabled })),
      );
      setChain(result.chain);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('providers_save_error'));
    } finally {
      setSaving(false);
    }
  };

  const move = (index: number, delta: -1 | 1): void => {
    if (index + delta < 0 || index + delta >= chain.length || saving) return;
    const next = [...chain];
    [next[index], next[index + delta]] = [next[index + delta]!, next[index]!];
    void persist(next);
  };

  return (
    <div>
      <AHead
        eyebrow={t('group_catalogue')}
        title={t('providers')}
        meta={t('providers_meta', { vendors })}
      />
      <p className={'mb-4 mt-0 type-small text-text-secondary'}>{t('providers_caveat')}</p>
      {loading && (
        <p className={'mb-4 mt-0 type-small text-text-secondary'}>{t('providers_loading')}</p>
      )}
      {error && <p className={'mb-4 mt-0 type-small text-sev-critical'}>{error}</p>}
      {vendors < 2 && !loading && (
        <div
          className={
            'mb-4 border border-hairline border-solid border-sev-critical bg-sev-critical-bg px-[1.125rem] py-3.5 type-small text-sev-critical'
          }
        >
          {t('providers_two_vendor_warning')}
        </div>
      )}
      <Table
        cols={[
          { label: t('table_number'), width: 40 },
          { label: t('table_provider'), width: '1fr' },
          { label: t('table_vendor'), width: 150 },
          { label: t('table_status'), width: 110 },
          { label: t('table_invocations'), width: 120 },
          { label: t('table_cost_24h'), width: 100 },
          { label: '', width: 160 },
        ]}
        rows={chain.map(({ vendor, model, isEnabled }, index) => [
          num(index + 1),
          mono(model),
          vendor,
          <span
            key="status"
            className={`${'type-small !font-bold'} ${isEnabled ? 'text-sev-resolved' : 'text-sev-medium'}`}
          >
            {t(isEnabled ? 'status_enabled' : 'status_disabled')}
          </span>,
          num(t('number_value', { value: 0 })),
          num(t('number_value', { value: 0 })),
          <span key="actions" className={'flex gap-1.5'}>
            <Button
              variant="ghost"
              size="sm"
              disabled={index === 0 || saving}
              onClick={() => move(index, -1)}
            >
              {t('button_up')}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={index === chain.length - 1 || saving}
              onClick={() => move(index, 1)}
            >
              {t('button_down')}
            </Button>
          </span>,
        ])}
      />
      <div className={'mt-4 grid grid-cols-2 gap-4 [@media(max-width:40rem)]:grid-cols-1'}>
        <Card padding={20} title={t('provider_schema_title')}>
          <p className={'m-0 type-small text-text-secondary'}>{t('provider_schema_body')}</p>
        </Card>
        <Card padding={20} title={t('provider_exhaustion_title')}>
          <p className={'m-0 type-small text-text-secondary'}>{t('provider_exhaustion_body')}</p>
        </Card>
      </div>
    </div>
  );
}
