/**
 * Ported from design-system/ui_kits/admin/AdminScreens.jsx's `Log` (T244).
 *
 * No hooks in the source, so this stays a Server Component. All rows are
 * the exact placeholder audit-log entries the vendored source shows.
 */
import { Badge, Input } from '../../../../components/ui';
import { AHead, mono, Table } from '../../../../components/admin';
import styles from './page.module.css';

const ROWS: readonly (readonly [string, string, string, string, string])[] = [
  ['23 Aug 14:41', 'khalid@webaudit.ai', 'capability.disable', 'playwright-runner', '203.0.113.4'],
  ['23 Aug 14:22', 'khalid@webaudit.ai', 'credits.grant', 'user 4f21 · +200', '203.0.113.4'],
  ['23 Aug 11:07', 'ops@webaudit.ai', 'provider.reorder', 'gemini → position 3', '198.51.100.9'],
  ['22 Aug 19:50', 'ops@webaudit.ai', 'plan.update', 'Pro concurrent 2 → 3', '198.51.100.9'],
  ['22 Aug 09:14', 'khalid@webaudit.ai', 'scan.cancel', 'b1994f02', '203.0.113.4'],
];

export default function AdminLogPage(): React.ReactElement {
  return (
    <div>
      <AHead
        eyebrow="Governance"
        title="Audit log"
        meta="every operator action is recorded · append only"
        actions={
          <div className={styles.searchBox}>
            <Input placeholder="Filter by actor or action" />
          </div>
        }
      />
      <Table
        cols={[
          { label: 'When', width: 150 },
          { label: 'Actor', width: 230 },
          { label: 'Action', width: 180 },
          { label: 'Subject', width: '1fr' },
          { label: 'Source', width: 130 },
        ]}
        rows={ROWS.map(([when, actor, action, subject, source]) => [
          mono(when),
          mono(actor),
          <Badge key="action" mono pill={false}>
            {action}
          </Badge>,
          subject,
          mono(source),
        ])}
      />
    </div>
  );
}
