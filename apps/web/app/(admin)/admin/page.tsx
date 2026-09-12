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
import styles from './page.module.css';

const STATS: readonly (readonly [string, string, string])[] = [
  ['Audits completed', 'Unavailable', 'Live overview data is not available'],
  ['Credits recognised', 'Unavailable', 'Live overview data is not available'],
  ['Provider cost', 'Unavailable', 'Live overview data is not available'],
  ['Queue depth', 'Unavailable', 'Live overview data is not available'],
];

export default function AdminOverviewPage(): React.ReactElement {
  return (
    <div>
      <AHead eyebrow="Platform" title="Overview" meta="all figures last 24 hours" />

      <div className={styles.statsGrid}>
        {STATS.map(([label, value, sub]) => (
          <Stat key={label} label={label} value={value} sub={sub} />
        ))}
      </div>

      <div className={styles.twoCol}>
        <Card padding={22} title="Needs attention">
          <div className={styles.attentionDesc}>No live attention items are available.</div>
        </Card>
        <Card padding={22} title="Area health">
          <div className={styles.attentionDesc}>Live area health data is not available.</div>
        </Card>
      </div>
    </div>
  );
}
