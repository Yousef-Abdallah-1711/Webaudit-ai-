'use client';

/**
 * Ported from design-system/ui_kits/admin/AdminScreens.jsx's `Settings`
 * (T244). The feature-flag toggles mutate local state only — no backend
 * wiring exists yet — so this needs `'use client'`, same reasoning as
 * `providers/page.tsx`.
 *
 * Flag defaults, limits, and retention figures are the exact placeholder
 * values the vendored source shows.
 */
import { useState } from 'react';
import { Button, Card } from '../../../../components/ui';
import { AHead } from '../../../../components/admin';
import styles from './page.module.css';

const INITIAL_FLAGS = {
  'Repository input': true,
  'Archive upload': false,
  'Load generation': true,
  'Design questionnaire': true,
  'Readiness certificates': true,
};

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
  const [flags, setFlags] = useState(INITIAL_FLAGS);

  return (
    <div>
      <AHead
        eyebrow="Governance"
        title="Settings"
        meta="platform-wide switches"
        actions={<Button size="sm">Save</Button>}
      />
      <div className={styles.grid}>
        <Card padding={24} title="Feature switches">
          {Object.entries(flags).map(([key, value]) => (
            <div key={key} className={styles.flagRow}>
              <span className={styles.flagLabel}>{key}</span>
              <button
                type="button"
                onClick={() => {
                  setFlags((f) => ({ ...f, [key]: !value }));
                }}
                aria-label={key}
                className={value ? `${styles.switch} ${styles.switchOn}` : styles.switch}
              >
                <span
                  className={
                    value ? `${styles.switchKnob} ${styles.switchKnobOn}` : styles.switchKnob
                  }
                />
              </button>
            </div>
          ))}
          <p className={styles.note}>
            Archive upload stays off until the sandbox runner is deployed. It returns 503 rather
            than falling back.
          </p>
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
