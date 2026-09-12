/**
 * T244 — admin platform settings.
 *
 * Persistence is not wired yet, so this is intentionally a read-only reference
 * surface. It does not expose local switches or an inert Save action that could
 * imply a successful platform mutation.
 */
import { Card } from '../../../../components/ui';
import { AHead } from '../../../../components/admin';
import styles from './page.module.css';

const FLAGS = [
  'Repository input',
  'Archive upload',
  'Load generation',
  'Design questionnaire',
  'Readiness certificates',
] as const;

const LIMITS: readonly (readonly [string, string])[] = [
  ['Scan timeout', '20 min'],
  ['Level 1 probe rate', '4 req/s'],
  ['Archive size ceiling', '200 MB'],
  ['Sandbox wall clock', '30 s'],
  ['Sandbox memory', '512 MB'],
];

const RETENTION: readonly (readonly [string, string])[] = [
  ['Free', '7 days'],
  ['Starter', '30 days'],
  ['Pro', '12 months'],
  ['Business', '24 months'],
];

export default function AdminSettingsPage(): React.ReactElement {
  return (
    <div>
      <AHead eyebrow="Governance" title="Settings" meta="platform-wide switches" />
      <div className={styles.grid}>
        <Card padding={24} title="Feature switches">
          <p className={styles.note}>
            Platform settings are read-only until a persistence endpoint is available.
          </p>
          {FLAGS.map((key) => (
            <div key={key} className={styles.flagRow}>
              <span className={styles.flagLabel}>{key}</span>
              <span className={styles.limitValue}>Unavailable</span>
            </div>
          ))}
        </Card>
        <div className={styles.rightCol}>
          <Card padding={24} title="Limits">
            {LIMITS.map(([label, value]) => (
              <div key={label} className={styles.limitRow}>
                <span>{label}</span>
                <span className={styles.limitValue}>{value}</span>
              </div>
            ))}
          </Card>
          <Card padding={24} title="Retention">
            {RETENTION.map(([label, value]) => (
              <div key={label} className={styles.limitRow}>
                <span>{label}</span>
                <span className={styles.limitValue}>{value}</span>
              </div>
            ))}
            <p className={styles.retentionNote}>
              Users are warned before anything is removed, and every export is self-contained.
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}
