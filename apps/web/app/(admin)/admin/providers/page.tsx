'use client';

/**
 * Ported from design-system/ui_kits/admin/AdminScreens.jsx's `Providers`
 * (T244). The reorder buttons mutate local state only — no backend wiring
 * exists yet (T075+, AI executor) — so this needs `'use client'`.
 *
 * The initial chain (claude/openai/gemini, their health, invocation counts,
 * cost) is the exact placeholder data the vendored source shows.
 */
import { useState } from 'react';
import { Button, Card } from '../../../../components/ui';
import { AHead, mono, num, Table } from '../../../../components/admin';
import styles from './page.module.css';

type ProviderRow = readonly [
  id: string,
  vendor: string,
  health: string,
  invocations: string,
  cost: string,
];

const INITIAL_CHAIN: readonly ProviderRow[] = [
  ['claude', 'Anthropic', 'healthy', '1,204', '$28.10'],
  ['openai', 'OpenAI', 'degraded', '168', '$9.02'],
  ['gemini', 'Google', 'healthy', '41', '$4.10'],
];

export default function AdminProvidersPage(): React.ReactElement {
  const [chain, setChain] = useState(INITIAL_CHAIN);
  const vendors = new Set(chain.map((c) => c[1])).size;

  const moveUp = (i: number): void => {
    setChain((ch) => {
      if (i === 0) return ch;
      const next = [...ch];
      [next[i - 1], next[i]] = [next[i]!, next[i - 1]!];
      return next;
    });
  };

  const moveDown = (i: number): void => {
    setChain((ch) => {
      if (i === ch.length - 1) return ch;
      const next = [...ch];
      [next[i + 1], next[i]] = [next[i]!, next[i + 1]!];
      return next;
    });
  };

  return (
    <div>
      <AHead
        eyebrow="Catalogue"
        title="AI providers"
        meta={`ordered fallback chain · ${String(vendors)} vendors`}
        actions={<Button size="sm">Add provider</Button>}
      />
      {vendors < 2 && (
        <div className={styles.warning}>
          A chain spanning fewer than two vendors is refused at startup.
        </div>
      )}
      <Table
        cols={[
          { label: '#', width: 40 },
          { label: 'Provider', width: '1fr' },
          { label: 'Vendor', width: 150 },
          { label: 'Health', width: 110 },
          { label: 'Invocations', width: 120 },
          { label: 'Cost 24h', width: 100 },
          { label: '', width: 160 },
        ]}
        rows={chain.map(([id, vendor, health, invocations, cost], i) => [
          num(i + 1),
          mono(id),
          vendor,
          <span
            key="health"
            className={
              health === 'healthy'
                ? `${styles.health} ${styles.healthHealthy}`
                : `${styles.health} ${styles.healthDegraded}`
            }
          >
            {health}
          </span>,
          num(invocations),
          num(cost),
          <span key="actions" className={styles.actions}>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                moveUp(i);
              }}
            >
              Up
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                moveDown(i);
              }}
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
