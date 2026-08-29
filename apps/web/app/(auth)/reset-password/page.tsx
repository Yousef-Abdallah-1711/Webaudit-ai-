'use client';

/**
 * T128 — `ResetPage`, ported from `design-system/ui_kits/marketing/
 * AuthPages.jsx`. The reset link's `token` arrives via the query string
 * (same shape as `/verify-email`'s), consumed by `POST /auth/
 * reset-password`. Adds a passwords-match check the source's single-field
 * checkmark did not need to express, since the source only ever rendered
 * the static mock, never two fields that could actually disagree.
 */
import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Button } from '../../../components/ui';
import { AuthFrame, Field } from '../../../components/auth/AuthFrame';
import { useT } from '../../theme';
import { ApiError, resetPassword } from '../../../lib/api';
import styles from './page.module.css';

function ResetPageInner(): React.ReactElement {
  const [t] = useT();
  const token = useSearchParams().get('token') ?? '';
  const [pw, setPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const longEnough = pw.length >= 12;
  const matches = pw === confirm && confirm !== '';
  const ok = longEnough && matches;

  async function onSubmit(): Promise<void> {
    setError(null);
    setSubmitting(true);
    try {
      await resetPassword(token, pw);
      setDone(true);
    } catch (e) {
      if (e instanceof ApiError && e.status === 410) {
        setError(t('auth_verify_invalid_lead'));
      } else {
        setError(t('auth_error_generic'));
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <AuthFrame title={t('auth_reset_done_title')} lead={t('auth_reset_done_lead')}>
        <Button fullWidth href="/login">
          {t('auth_verify_confirmed_submit')}
        </Button>
      </AuthFrame>
    );
  }

  return (
    <AuthFrame
      title={t('auth_reset_title')}
      lead={t('auth_reset_lead')}
      foot={<a href="/login">{t('auth_reset_foot_link')}</a>}
    >
      <div className={styles.stack}>
        <Field
          label={t('auth_new_password')}
          type="password"
          placeholder={t('auth_password_hint')}
          value={pw}
          onChange={(e) => {
            setPw(e.target.value);
          }}
        />
        <Field
          label={t('auth_confirm_password')}
          type="password"
          placeholder={t('auth_repeat_it')}
          value={confirm}
          onChange={(e) => {
            setConfirm(e.target.value);
          }}
        />
        <div className={longEnough ? styles.checkOk : styles.checkPending}>
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d={longEnough ? 'm4 12 5 5L20 6' : 'M5 12h14'} />
          </svg>
          {t('auth_min_chars')}
        </div>
        {confirm !== '' && !matches && <div className={styles.error}>{t('auth_error_passwords_match')}</div>}
        {error !== null && <div className={styles.error}>{error}</div>}
        <Button fullWidth disabled={!ok || submitting} onClick={() => void onSubmit()}>
          {t('auth_reset_submit')}
        </Button>
      </div>
    </AuthFrame>
  );
}

export default function ResetPage(): React.ReactElement {
  return (
    <Suspense>
      <ResetPageInner />
    </Suspense>
  );
}
