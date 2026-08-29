'use client';

/**
 * T128 — `ForgotPage`, ported from `design-system/ui_kits/marketing/
 * AuthPages.jsx`. `POST /auth/forgot-password` always answers `202`
 * regardless of whether the address has an account (no account-enumeration
 * signal) — the success state below is shown unconditionally after submit,
 * matching that contract rather than trying to infer one it does not give.
 */
import { useState } from 'react';
import { Button } from '../../../components/ui';
import { AuthFrame, Field } from '../../../components/auth/AuthFrame';
import { useT } from '../../theme';
import { ApiError, forgotPassword } from '../../../lib/api';
import styles from './page.module.css';

export default function ForgotPage(): React.ReactElement {
  const [t] = useT();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(): Promise<void> {
    if (!email) return;
    setSubmitting(true);
    try {
      await forgotPassword(email);
    } catch (e) {
      if (!(e instanceof ApiError)) throw e;
    } finally {
      setSubmitting(false);
      setSent(true);
    }
  }

  if (sent) {
    return (
      <AuthFrame
        title={t('auth_forgot_title')}
        lead={t('auth_forgot_sent_lead')}
        foot={<a href="/login">{t('auth_forgot_foot_link')}</a>}
      />
    );
  }

  return (
    <AuthFrame
      title={t('auth_forgot_title')}
      lead={t('auth_forgot_lead')}
      foot={<a href="/login">{t('auth_forgot_foot_link')}</a>}
    >
      <div className={styles.stack}>
        <Field
          label={t('auth_email')}
          type="email"
          placeholder="you@company.com"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
          }}
        />
        <Button fullWidth disabled={submitting} onClick={() => void onSubmit()}>
          {t('auth_forgot_submit')}
        </Button>
      </div>
    </AuthFrame>
  );
}
