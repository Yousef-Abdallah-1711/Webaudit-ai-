'use client';

import { useEffect, useState } from 'react';
import {
  getAdminProviders,
  setAdminProviderChain,
  type AdminProviderChainEntry,
} from '../../../../lib/api.js';
import { Button, Card } from '../../../../components/ui';
import { AHead, mono, num, Table } from '../../../../components/admin';
import styles from './page.module.css';

export default function AdminProvidersPage(): React.ReactElement {
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
        setError(cause instanceof Error ? cause.message : 'Unable to load provider chain.');
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

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
      setError(cause instanceof Error ? cause.message : 'Unable to save provider chain.');
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
        eyebrow="Catalogue"
        title="AI providers"
        meta={`ordered fallback chain · ${String(vendors)} vendors`}
      />
      <p className={styles.caveat}>
        Changes are persisted for the next worker deployment; running workers keep their boot-time
        provider chain until redeployed.
      </p>
      {loading && <p className={styles.status}>Loading provider chain...</p>}
      {error && <p className={styles.error}>{error}</p>}
      {vendors < 2 && !loading && (
        <div className={styles.warning}>
          A chain spanning fewer than two vendors is refused at startup.
        </div>
      )}
      <Table
        cols={[
          { label: '#', width: 40 },
          { label: 'Provider', width: '1fr' },
          { label: 'Vendor', width: 150 },
          { label: 'Status', width: 110 },
          { label: 'Invocations', width: 120 },
          { label: 'Cost 24h', width: 100 },
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
            {isEnabled ? 'enabled' : 'disabled'}
          </span>,
          num(0),
          num(0),
          <span key="actions" className={styles.actions}>
            <Button
              variant="ghost"
              size="sm"
              disabled={index === 0 || saving}
              onClick={() => move(index, -1)}
            >
              Up
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={index === chain.length - 1 || saving}
              onClick={() => move(index, 1)}
            >
              Down
            </Button>
          </span>,
        ])}
      />
      <div className={styles.grid}>
        <Card padding={20} title="Schema failures advance the chain">
          <p className={styles.cardText}>
            A schema-invalid response is treated as a provider failure. Nothing is partially
            accepted.
          </p>
        </Card>
        <Card padding={20} title="Exhaustion degrades, never collapses">
          <p className={styles.cardText}>
            With every provider unavailable, measured findings are still delivered and the area is
            marked degraded.
          </p>
        </Card>
      </div>
    </div>
  );
}
