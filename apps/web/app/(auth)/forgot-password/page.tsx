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
import { Field } from '../../../components/auth/AuthFrame';
import { AuthFormPanel, AuthShell } from '../../../components/auth/AuthShell';
import { useTranslations } from 'next-intl';
import { ApiError, forgotPassword } from '../../../lib/api';
import styles from './page.module.css';

export default function ForgotPage(): React.ReactElement {
  const t = useTranslations('auth');
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
      <AuthShell
        form={
          <AuthFormPanel
            title={t('forgot_title')}
            lead={t('forgot_sent_lead')}
            foot={<a href="/login">{t('forgot_foot_link')}</a>}
          />
        }
      />
    );
  }

  return (
    <AuthShell
      form={
        <AuthFormPanel
          title={t('forgot_title')}
          lead={t('forgot_lead')}
          foot={<a href="/login">{t('forgot_foot_link')}</a>}
        >
          <div className={styles.stack}>
            <Field
              label={t('email')}
              type="email"
              placeholder="you@company.com"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
              }}
            />
            <Button fullWidth disabled={submitting} onClick={() => void onSubmit()}>
              {t('forgot_submit')}
            </Button>
          </div>
        </AuthFormPanel>
      }
    />
  );
}
