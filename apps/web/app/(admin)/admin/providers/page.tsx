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
import styles from './page.module.css';

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
      <p className={styles.caveat}>{t('providers_caveat')}</p>
      {loading && <p className={styles.status}>{t('providers_loading')}</p>}
      {error && <p className={styles.error}>{error}</p>}
      {vendors < 2 && !loading && (
        <div className={styles.warning}>{t('providers_two_vendor_warning')}</div>
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
            className={`${styles.health} ${isEnabled ? styles.healthHealthy : styles.healthDegraded}`}
          >
            {t(isEnabled ? 'status_enabled' : 'status_disabled')}
          </span>,
          num(t('number_value', { value: 0 })),
          num(t('number_value', { value: 0 })),
          <span key="actions" className={styles.actions}>
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
      <div className={styles.grid}>
        <Card padding={20} title={t('provider_schema_title')}>
          <p className={styles.cardText}>{t('provider_schema_body')}</p>
        </Card>
        <Card padding={20} title={t('provider_exhaustion_title')}>
          <p className={styles.cardText}>{t('provider_exhaustion_body')}</p>
        </Card>
      </div>
    </div>
  );
}
