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
 * The authenticated profile, plan credits, and GitHub connection status load
 * from the real account through `getMe()`. Session device details and token
 * usage details are not currently available.
 */
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
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

const styles = {
  layout: 'grid grid-cols-[1fr_20rem] items-start gap-5 max-account-stack:grid-cols-1',
  col: 'flex flex-col gap-4',
  row: 'grid grid-cols-[12.5rem_1fr] items-start gap-5 border-0 border-t-hairline border-t-border-default border-solid py-[1.125rem] max-account-collapse:grid-cols-1',
  rowLabel: 'font-sans text-[0.875rem] leading-5 font-semibold text-text-strong',
  rowNote: 'mt-1 font-sans text-[0.8125rem] leading-5 font-normal text-pretty text-text-muted',
  fieldWrap: 'max-w-[22.5rem]',
  appearanceBtn: 'flex h-9 cursor-pointer items-center gap-2.5 rounded-control border border-hairline border-border-default border-solid bg-surface-page px-3.5 font-sans text-[0.875rem] text-text-primary',
  switchTrack: 'relative h-[1.125rem] w-8 rounded-pill bg-border-default transition-colors',
  switchTrackOn: '!bg-accent',
  switchKnob: 'absolute start-0.5 top-0.5 h-3.5 w-3.5 rounded-pill bg-white transition-[inset-inline-start] duration-150 ease-[var(--easing)]',
  switchKnobOn: 'start-4',
  connectedRow: 'flex items-center gap-3',
  mono: 'font-mono text-[0.8125rem] text-text-secondary',
  tokensNote: 'font-mono text-[0.8125rem] text-text-muted',
  deleteNote: 'm-0 mb-4 max-w-[62ch] text-pretty type-small text-text-secondary',
  confirmLabel: 'mx-0 mb-3 grid max-w-[22.5rem] gap-1.5 type-small text-text-secondary',
  deleteError: 'm-0 mb-3 type-small text-sev-critical',
  planValue: 'type-h3 text-text-strong',
  planSub: 'mx-0 my-1.5 mb-3.5 type-small text-text-secondary',
  retentionText: 'm-0 type-small text-text-secondary',
} as const;

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

export default function SettingsPage(): React.ReactElement {
  const t = useTranslations('settings');
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
        if (active) setProfileError(t('settings_profile_load_error'));
      });
    return () => {
      active = false;
    };
  }, [t]);

  const planLabel = (plan: CurrentUser['plan']): string =>
    plan === 'free'
      ? t('settings_plan_free')
      : t('settings_plan_label', {
          plan: `${plan.charAt(0).toUpperCase()}${plan.slice(1)}`,
        });

  const onSaveProfile = async (): Promise<void> => {
    const trimmedName = name.trim();
    if (trimmedName === '') {
      setProfileError(t('settings_name_required'));
      return;
    }
    setSavingProfile(true);
    setProfileError(null);
    try {
      const profile = await updateProfile(trimmedName);
      setName(profile.name ?? trimmedName);
    } catch {
      setProfileError(t('settings_profile_save_error'));
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
      setProfileError(t('settings_password_change_error'));
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
      setProfileError(t('settings_github_disconnect_error'));
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
      setDeleteError(t('settings_delete_error'));
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
        eyebrow={t('settings_profile')}
        title={name || t('settings_profile')}
        meta={t('settings_profile_meta', {
          email: email || t('settings_profile_loading'),
          plan: planLabel(profile?.plan ?? 'free'),
        })}
        actions={
          <Button
            size="sm"
            disabled={savingProfile || name.trim() === ''}
            onClick={() => void onSaveProfile()}
          >
            {savingProfile ? t('settings_saving') : t('settings_save_changes')}
          </Button>
        }
      />

      <div className={styles.layout}>
        <div className={styles.col}>
          <Card padding={26} title={t('settings_account')}>
            <Row label={t('settings_name')}>
              <div className={styles.fieldWrap}>
                <Input
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                  }}
                />
              </div>
            </Row>
            <Row label={t('settings_email')} note={t('settings_email_cannot_change_here')}>
              <div className={styles.fieldWrap}>
                <Input value={email} type="email" readOnly dir="ltr" />
              </div>
            </Row>
            {profileError !== null && <p className={styles.deleteError}>{profileError}</p>}
            <Row label={t('settings_password')} note={t('settings_password_minimum')}>
              {showPasswordForm ? (
                <div className={styles.fieldWrap}>
                  <Input
                    type="password"
                    placeholder={t('settings_current_password')}
                    value={currentPassword}
                    onChange={(event) => setCurrentPassword(event.target.value)}
                  />
                  <Input
                    type="password"
                    placeholder={t('settings_new_password')}
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                  />
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={changingPassword || currentPassword === '' || newPassword === ''}
                    onClick={() => void onChangePassword()}
                  >
                    {changingPassword
                      ? t('settings_password_changing')
                      : t('settings_password_confirm_change')}
                  </Button>
                </div>
              ) : (
                <Button variant="secondary" size="sm" onClick={() => setShowPasswordForm(true)}>
                  {t('settings_password_change')}
                </Button>
              )}
            </Row>
            <Row
              label={t('settings_appearance')}
              note={t('settings_appearance_severity_note')}
            >
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
                {dark ? t('settings_theme_dark') : t('settings_theme_light')}
              </button>
            </Row>
          </Card>

          <Card padding={26} title={t('settings_connected_accounts')}>
            <Row
              label={t('settings_github')}
              note={t('settings_github_note')}
            >
              <div className={styles.connectedRow}>
                {profile?.githubLogin === null ? (
                  <span className={styles.tokensNote}>{t('settings_not_connected')}</span>
                ) : (
                  <>
                    <Badge tone="success">{t('settings_connected')}</Badge>
                    <span className={styles.mono}>
                      {profile?.githubLogin ?? t('settings_github_loading')}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={disconnectingGithub}
                      onClick={() => void onDisconnectGithub()}
                    >
                      {disconnectingGithub
                        ? t('settings_github_disconnecting')
                        : t('settings_github_disconnect')}
                    </Button>
                  </>
                )}
              </div>
            </Row>
            <Row label={t('settings_tokens')} note={t('settings_tokens_note')}>
              <span className={styles.tokensNote}>
                {t('settings_tokens_usage_unavailable')}
              </span>
            </Row>
          </Card>

          <Card padding={26} title={t('settings_sessions')}>
            <p className={styles.tokensNote}>{t('settings_sessions_unavailable')}</p>
            <Button
              variant="secondary"
              size="sm"
              disabled={signingOut}
              onClick={() => void onLogout()}
            >
              {signingOut ? t('settings_signing_out') : t('settings_sign_out')}
            </Button>
          </Card>

          <Card
            padding={26}
            title={t('settings_delete_account')}
            accentRule="var(--sev-critical)"
          >
            <p className={styles.deleteNote}>
              {t('settings_delete_note')}
            </p>
            <label className={styles.confirmLabel}>
              {t('settings_delete_confirm')}
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
              {t('settings_delete_button')}
            </Button>
          </Card>
        </div>

        <div className={styles.col}>
          <Card padding={22} title={t('settings_plan')}>
            <div className={styles.planValue}>{planLabel(profile?.plan ?? 'free')}</div>
            <div className={styles.planSub}>
              {profile === null
                ? t('settings_plan_loading')
                : t('settings_plan_credit_count', { count: profile.credits.plan })}
            </div>
            <Button
              variant="secondary"
              fullWidth
              size="sm"
              onClick={() => router.push('/billing')}
            >
              {t('settings_manage_plan')}
            </Button>
          </Card>
          <Card padding={22} title={t('settings_retention')}>
            <p className={styles.retentionText}>
              {t('settings_retention_note')}
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}
