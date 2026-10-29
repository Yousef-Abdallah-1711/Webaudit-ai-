'use client';

/**
 * T128 — `ForgotPage`, ported from `design-system/ui_kits/marketing/
 * AuthPages.jsx`. `POST /auth/forgot-password` always answers `202`
 * regardless of whether the address has an account (no account-enumeration
 * signal) — the success state below is shown unconditionally after submit,
 * matching that contract rather than trying to infer one it does not give.
 */
import { useRef, useState, type FormEvent } from 'react';
import { AuthPrimaryButton, Field } from '../../../components/auth/AuthFrame';
import { AuthFormPanel, AuthShell, AuthStatus } from '../../../components/auth/AuthShell';
import { useTranslations } from 'next-intl';
import { forgotPassword } from '../../../lib/api';

export default function ForgotPage(): React.ReactElement {
  const t = useTranslations('auth');
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [requestFailed, setRequestFailed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const submissionLock = useRef(false);

  async function onSubmit(): Promise<void> {
    if (!email) return;
    setSubmitting(true);
    setRequestFailed(false);
    try {
      await forgotPassword(email.trim());
      setSent(true);
    } catch {
      setRequestFailed(true);
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
          <form className="flex flex-col gap-3.5" onSubmit={handleSubmit}>
            <Field
              label={t('email')}
              type="email"
              autoComplete="email"
              required
              maxLength={320}
              placeholder="you@company.com"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
              }}
            />
            {requestFailed && <AuthStatus>{t('forgot_failed')}</AuthStatus>}
            <AuthPrimaryButton type="submit" fullWidth disabled={submitting}>
              {t('forgot_submit')}
            </AuthPrimaryButton>
          </form>
        </AuthFormPanel>
      }
    />
  );
}
