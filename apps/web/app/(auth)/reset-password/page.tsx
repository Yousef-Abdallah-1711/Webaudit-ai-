'use client';

/**
 * T128 — `ResetPage`, ported from `design-system/ui_kits/marketing/
 * AuthPages.jsx`. The reset link's `token` arrives via the query string
 * (same shape as `/verify-email`'s), consumed by `POST /auth/
 * reset-password`. Adds a passwords-match check the source's single-field
 * checkmark did not need to express, since the source only ever rendered
 * the static mock, never two fields that could actually disagree.
 */
import { Suspense, useRef, useState, type FormEvent } from 'react';
import { useSearchParams } from 'next/navigation';
import { Button } from '../../../components/ui';
import { Field } from '../../../components/auth/AuthFrame';
import { AuthFormPanel, AuthShell } from '../../../components/auth/AuthShell';
import { useTranslations } from 'next-intl';
import { ApiError, resetPassword } from '../../../lib/api';
import styles from './page.module.css';

function ResetPageInner(): React.ReactElement {
  const t = useTranslations('auth');
  const token = useSearchParams().get('token') ?? '';
  const [pw, setPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const submissionLock = useRef(false);
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
        setError(t('reset_invalid_lead'));
      } else {
        setError(t('error_generic'));
      }
    } finally {
      setSubmitting(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (submissionLock.current) return;
    submissionLock.current = true;
    void onSubmit().finally(() => {
      submissionLock.current = false;
    });
  }

  if (done) {
    return (
      <AuthShell
        form={
          <AuthFormPanel title={t('reset_done_title')} lead={t('reset_done_lead')}>
            <Button fullWidth href="/login">
              {t('verify_confirmed_submit')}
            </Button>
          </AuthFormPanel>
        }
      />
    );
  }

  return (
    <AuthShell
      form={
        <AuthFormPanel
          title={t('reset_title')}
          lead={t('reset_lead')}
          foot={<a href="/login">{t('reset_foot_link')}</a>}
        >
          <form className={styles.stack} noValidate onSubmit={handleSubmit}>
            <Field
              label={t('new_password')}
              type="password"
              autoComplete="new-password"
              placeholder={t('password_hint')}
              value={pw}
              onChange={(e) => {
                setPw(e.target.value);
              }}
            />
            <Field
              label={t('confirm_password')}
              type="password"
              autoComplete="new-password"
              placeholder={t('repeat_it')}
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
              {t('min_chars')}
            </div>
            {confirm !== '' && !matches && (
              <div className={styles.error}>{t('error_passwords_match')}</div>
            )}
            {error !== null && <div className={styles.error}>{error}</div>}
            <Button type="submit" fullWidth disabled={!ok || submitting}>
              {t('reset_submit')}
            </Button>
          </form>
        </AuthFormPanel>
      }
    />
  );
}

export default function ResetPage(): React.ReactElement {
  return (
    <Suspense>
      <ResetPageInner />
    </Suspense>
  );
}
