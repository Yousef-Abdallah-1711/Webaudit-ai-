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
 * No hooks anywhere in the source, so this stays a Server Component.
 * All figures (audits, credits, provider cost, the three "needs attention"
 * entries, per-area issue counts) are the exact placeholder content the
 * vendored source shows.
 */
import { Card } from '../../../components/ui';
import { AHead, Stat } from '../../../components/admin';
import { ModuleStatus, SeverityBadge } from '../../../components/report';
import styles from './page.module.css';

const STATS: readonly (readonly [string, string, string])[] = [
  ['Audits completed', '248', '9 degraded · 2 failed'],
  ['Credits recognised', '4,180', '112 refunded'],
  ['Provider cost', '$41.22', 'gross margin 78%'],
  ['Queue depth', '3', 'longest wait 41s'],
];

const NEEDS_ATTENTION: readonly (readonly [
  string,
  string,
  'critical' | 'high' | 'medium' | 'low' | 'info' | 'resolved',
])[] = [
  ['openai adapter degraded', 'Chain still spans two vendors — no action required', 'medium'],
  ['playwright-runner disabled', 'Testing area reports 2 of 5 checks unavailable', 'high'],
  ['sandbox-runner unavailable', 'Capability upload returns 503 with no fallback', 'info'],
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
          {NEEDS_ATTENTION.map(([title, desc, level]) => (
            <div key={title} className={styles.attentionRow}>
              <SeverityBadge level={level} />
              <div>
                <div className={styles.attentionTitle}>{title}</div>
                <div className={styles.attentionDesc}>{desc}</div>
              </div>
            </div>
          ))}
        </Card>
        <Card padding={22} title="Area health">
          <div className={styles.areaHealth}>
            <ModuleStatus area="Security" state="complete" issues={412} />
            <ModuleStatus area="Performance" state="complete" issues={301} />
            <ModuleStatus area="Design" state="complete" issues={188} />
            <ModuleStatus area="Search visibility" state="complete" issues={140} />
            <ModuleStatus
              area="Testing"
              state="degraded"
              detail="playwright-runner disabled by operator"
            />
          </div>
        </Card>
      </div>
    </div>
  );
}
