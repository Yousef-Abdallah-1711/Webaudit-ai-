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
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Badge, Button, Card, Input } from '../../../components/ui';
import { PageHead } from '../../../components/dashboard';
import {
  changePassword,
  disconnectGithub,
  getMe,
  updateProfile,
  type CurrentUser,
} from '../../../lib/api';
import { useTheme } from '../../theme';
import { useAuth } from '../../../components/auth/AuthProvider';
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

function planLabel(plan: CurrentUser['plan']): string {
  return plan === 'free' ? 'Free plan' : `${plan.charAt(0).toUpperCase()}${plan.slice(1)} plan`;
}

export default function SettingsPage(): React.ReactElement {
  const router = useRouter();
  const [theme, setTheme] = useTheme();
  const { logout } = useAuth();
  const dark = theme === 'dark';
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [profile, setProfile] = useState<CurrentUser | null>(null);
  const [disconnectingGithub, setDisconnectingGithub] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    let active = true;
    void getMe()
      .then((profile) => {
        if (!active) return;
        setName(profile.name ?? '');
        setEmail(profile.email);
        setProfile(profile);
      })
      .catch(() => {
        if (active) setProfileError('Your profile could not be loaded.');
      });
    return () => {
      active = false;
    };
  }, []);

  const onSaveProfile = async (): Promise<void> => {
    const trimmedName = name.trim();
    if (trimmedName === '') {
      setProfileError('Name is required.');
      return;
    }
    setSavingProfile(true);
    setProfileError(null);
    try {
      const profile = await updateProfile(trimmedName);
      setName(profile.name ?? trimmedName);
    } catch {
      setProfileError('Your profile could not be saved.');
    } finally {
      setSavingProfile(false);
    }
  };

  const onChangePassword = async (): Promise<void> => {
    setChangingPassword(true);
    setProfileError(null);
    try {
      await changePassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setShowPasswordForm(false);
    } catch {
      setProfileError('The current password was incorrect or the new password was invalid.');
    } finally {
      setChangingPassword(false);
    }
  };

  const onDisconnectGithub = async (): Promise<void> => {
    setDisconnectingGithub(true);
    setProfileError(null);
    try {
      await disconnectGithub();
      setProfile((current) => (current === null ? current : { ...current, githubLogin: null }));
    } catch {
      setProfileError('The GitHub account could not be disconnected.');
    } finally {
      setDisconnectingGithub(false);
    }
  };

  const onDeleteAccount = async (): Promise<void> => {
    if (deleteConfirmation !== 'DELETE') return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const { deleteAccount } = await import('../../../lib/api');
      await deleteAccount();
      window.location.assign('/login');
    } catch {
      setDeleteError('The account could not be deleted.');
      setDeleting(false);
    }
  };

  const onLogout = async (): Promise<void> => {
    setSigningOut(true);
    await logout();
    router.replace('/');
  };

  return (
    <div>
      <PageHead
        eyebrow="Profile"
        title={name || 'Profile'}
        meta={`${email || 'Loading profile...'} · ${planLabel(profile?.plan ?? 'free')}`}
        actions={
          <Button
            size="sm"
            disabled={savingProfile || name.trim() === ''}
            onClick={() => void onSaveProfile()}
          >
            {savingProfile ? 'Saving...' : 'Save changes'}
          </Button>
        }
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
                <Input value={email} type="email" readOnly />
              </div>
            </Row>
            {profileError !== null && <p className={styles.deleteError}>{profileError}</p>}
            <Row label="Password" note="At least 12 characters.">
              {showPasswordForm ? (
                <div className={styles.fieldWrap}>
                  <Input
                    type="password"
                    placeholder="Current password"
                    value={currentPassword}
                    onChange={(event) => setCurrentPassword(event.target.value)}
                  />
                  <Input
                    type="password"
                    placeholder="New password"
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                  />
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={changingPassword || currentPassword === '' || newPassword === ''}
                    onClick={() => void onChangePassword()}
                  >
                    {changingPassword ? 'Changing...' : 'Confirm password change'}
                  </Button>
                </div>
              ) : (
                <Button variant="secondary" size="sm" onClick={() => setShowPasswordForm(true)}>
                  Change password
                </Button>
              )}
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
                {profile?.githubLogin === null ? (
                  <span className={styles.tokensNote}>Not connected</span>
                ) : (
                  <>
                    <Badge tone="success">Connected</Badge>
                    <span className={styles.mono}>{profile?.githubLogin ?? 'Loading...'}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={disconnectingGithub}
                      onClick={() => void onDisconnectGithub()}
                    >
                      {disconnectingGithub ? 'Disconnecting...' : 'Disconnect'}
                    </Button>
                  </>
                )}
              </div>
            </Row>
            <Row label="Tokens" note="Stored encrypted. There is no plaintext column.">
              <span className={styles.tokensNote}>
                Stored encrypted · usage details unavailable
              </span>
            </Row>
          </Card>

          <Card padding={26} title="Sessions">
            <p className={styles.tokensNote}>Session device details are not available yet.</p>
            <Button
              variant="secondary"
              size="sm"
              disabled={signingOut}
              onClick={() => void onLogout()}
            >
              {signingOut ? 'Signing out...' : 'Sign out'}
            </Button>
          </Card>

          <Card padding={26} title="Delete account" accentRule="var(--sev-critical)">
            <p className={styles.deleteNote}>
              Deletion cascades: every scan, report, issue, verification attempt and stored artifact
              is removed. Purchased credits are forfeited. This cannot be undone.
            </p>
            <label className={styles.confirmLabel}>
              Type DELETE to confirm
              <Input
                value={deleteConfirmation}
                onChange={(event) => setDeleteConfirmation(event.target.value)}
              />
            </label>
            {deleteError !== null && <p className={styles.deleteError}>{deleteError}</p>}
            <Button
              variant="secondary"
              size="sm"
              disabled={deleting || deleteConfirmation !== 'DELETE'}
              onClick={() => void onDeleteAccount()}
            >
              Delete my account
            </Button>
          </Card>
        </div>

        <div className={styles.col}>
          <Card padding={22} title="Plan">
            <div className={styles.planValue}>{planLabel(profile?.plan ?? 'free')}</div>
            <div className={styles.planSub}>
              {profile === null
                ? 'Loading plan details...'
                : `${String(profile.credits.plan)} plan credits available`}
            </div>
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
