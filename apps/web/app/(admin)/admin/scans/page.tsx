/**
 * Ported from design-system/ui_kits/admin/AdminScreens.jsx's `Scans` (T244).
 *
 * No hooks in the source, so this stays a Server Component. All rows are
 * the exact placeholder scan data the vendored source shows.
 */
import { Badge, Button, Input } from '../../../../components/ui';
import { AHead, mono, num, Table } from '../../../../components/admin';
import styles from './page.module.css';

const ROWS: readonly (readonly [string, string, string, string, string, string])[] = [
  ['4f21a8c9', 'acme.com', 'running', '5', '80', '—'],
  ['3ac09b41', 'shopfront.io', 'complete', '5', '80', '62'],
  ['22de71f0', 'legacy.co', 'degraded', '4', '60', '48'],
  ['81aa0cc2', 'docs.internal', 'failed', '0', '0', '—'],
  ['5f31b7d9', 'store.example', 'complete', '2', '35', '71'],
];

function stateTone(state: string): 'success' | 'accent' | 'neutral' {
  if (state === 'complete') return 'success';
  if (state === 'running') return 'accent';
  return 'neutral';
}

export default function AdminScansPage(): React.ReactElement {
  return (
    <div>
      <AHead
        eyebrow="Platform"
        title="Scans"
        meta="248 in the last 24 hours"
        actions={
          <div className={styles.searchBox}>
            <Input placeholder="Search by scan id or target" />
          </div>
        }
      />
      <Table
        cols={[
          { label: 'Scan', width: 120 },
          { label: 'Target', width: '1fr' },
          { label: 'State', width: 110 },
          { label: 'Areas', width: 70 },
          { label: 'Charged', width: 90 },
          { label: 'Score', width: 70 },
          { label: '', width: 110 },
        ]}
        rows={ROWS.map(([scan, target, state, areas, charged, score]) => [
          mono(scan),
          target,
          <Badge key="state" tone={stateTone(state)}>
            {state}
          </Badge>,
          num(areas),
          num(`${charged} cr`),
          num(score),
          <Button key="inspect" variant="ghost" size="sm">
            Inspect
          </Button>,
        ])}
      />
      <p className={styles.note}>
        The failed scan was a platform fault; its 80 credits were returned to the originating lot
        automatically.
      </p>
    </div>
  );
}
