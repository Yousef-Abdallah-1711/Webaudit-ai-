'use client';

/**
 * Ported from design-system/ui_kits/app/Account.jsx's `ProfileScreen` (T242).
 *
 * `Row` is the source's own private layout helper — ported alongside, not
 * exported, matching how the source itself never shares it outside this
 * file.
 *
 * Two fields (`Name`, `Email`) use `defaultValue` in the source — outside
 * `Input`'s documented contract (`Input.d.ts` never declared it, in the
 * vendored source or this port). Wired as `value`/`onChange` instead, the
 * one documented way to pre-fill an editable field; same demo values, same
 * editability, no contract extension.
 *
 * Every value here (name, email, plan, sessions, connected account) is the
 * exact placeholder content the vendored source shows — not real data.
 */
import { useState } from 'react';
import { Badge, Button, Card, Input } from '../../../components/ui';
import { PageHead } from '../../../components/dashboard';
import { useTheme } from '../../theme';
import styles from './page.module.css';

interface RowProps {
  label: string;
  note?: string;
  children?: React.ReactNode;
}

function Row({ label, note, children }: RowProps): React.ReactElement {
  return (
    <div className={styles.row}>
      <div>
        <div className={styles.rowLabel}>{label}</div>
        {note !== undefined && <div className={styles.rowNote}>{note}</div>}
      </div>
      <div>{children}</div>
    </div>
  );
}

const SESSIONS: readonly (readonly [string, string, boolean])[] = [
  ['macOS · Chrome', 'Riyadh · now', true],
  ['iOS · Safari', 'Riyadh · 2 days ago', false],
  ['Linux · Firefox', 'Frankfurt · 11 days ago', false],
];

export default function SettingsPage(): React.ReactElement {
  const [theme, setTheme] = useTheme();
  const dark = theme === 'dark';
  const [name, setName] = useState('Khalid Ahmed');
  const [email, setEmail] = useState('you@company.com');

  return (
    <div>
      <PageHead
        eyebrow="Profile"
        title="Khalid Ahmed"
        meta="you@company.com · Pro plan · member since 14 Feb 2026"
        actions={<Button size="sm">Save changes</Button>}
      />

      <div className={styles.layout}>
        <div className={styles.col}>
          <Card padding={26} title="Account">
            <Row label="Name">
              <div className={styles.fieldWrap}>
                <Input
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                  }}
                />
              </div>
            </Row>
            <Row label="Email" note="Changing this sends a new verification link.">
              <div className={styles.fieldWrap}>
                <Input
                  value={email}
                  type="email"
                  onChange={(e) => {
                    setEmail(e.target.value);
                  }}
                />
              </div>
            </Row>
            <Row label="Password" note="At least 12 characters.">
              <Button variant="secondary" size="sm">
                Change password
              </Button>
            </Row>
            <Row label="Appearance" note="Dark-mode severity values are not contrast-verified yet.">
              <button
                type="button"
                onClick={() => {
                  setTheme(dark ? 'light' : 'dark');
                }}
                className={styles.appearanceBtn}
              >
                <span
                  className={
                    dark ? `${styles.switchTrack} ${styles.switchTrackOn}` : styles.switchTrack
                  }
                >
                  <span
                    className={
                      dark ? `${styles.switchKnob} ${styles.switchKnobOn}` : styles.switchKnob
                    }
                  />
                </span>
                {dark ? 'Dark' : 'Light'}
              </button>
            </Row>
          </Card>

          <Card padding={26} title="Connected accounts">
            <Row
              label="GitHub"
              note="Grants repository input. Revoking it refunds any scan that then fails."
            >
              <div className={styles.connectedRow}>
                <Badge tone="success">Connected</Badge>
                <span className={styles.mono}>khalid-a</span>
                <Button variant="ghost" size="sm">
                  Disconnect
                </Button>
              </div>
            </Row>
            <Row label="Tokens" note="Stored encrypted. There is no plaintext column.">
              <span className={styles.tokensNote}>3 tokens · last used 23 Aug 14:02</span>
            </Row>
          </Card>

          <Card padding={26} title="Sessions">
            {SESSIONS.map(([device, where, current]) => (
              <div key={device} className={styles.sessionRow}>
                <span className={styles.sessionDevice}>{device}</span>
                <span className={styles.sessionWhere}>{where}</span>
                {current ? (
                  <Badge tone="success">This device</Badge>
                ) : (
                  <Button variant="ghost" size="sm">
                    Revoke
                  </Button>
                )}
              </div>
            ))}
          </Card>

          <Card padding={26} title="Delete account" accentRule="var(--sev-critical)">
            <p className={styles.deleteNote}>
              Deletion cascades: every scan, report, issue, verification attempt and stored artifact
              is removed. Purchased credits are forfeited. This cannot be undone.
            </p>
            <Button variant="secondary" size="sm">
              Delete my account
            </Button>
          </Card>
        </div>

        <div className={styles.col}>
          <Card padding={22} title="Plan">
            <div className={styles.planValue}>Pro</div>
            <div className={styles.planSub}>1,200 credits a month · renews 12 September</div>
            <Button variant="secondary" fullWidth size="sm">
              Manage plan
            </Button>
          </Card>
          <Card padding={22} title="Retention">
            <p className={styles.retentionText}>
              Reports are kept 12 months on Pro. We warn you before anything is removed, and an
              export is always self-contained.
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}
