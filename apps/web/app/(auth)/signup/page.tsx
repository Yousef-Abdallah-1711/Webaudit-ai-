'use client';

/**
 * T128 — `RegisterPage`, ported from `design-system/ui_kits/marketing/
 * AuthPages.jsx`. Submits against `POST /auth/register`, then routes to
 * `/verify-email`; the address is carried only in session storage for the
 * waiting page's display and is never added to the URL.
 *
 * The `Name` field is optional on both ends: `register()`'s third argument
 * is omitted entirely (not sent as `''`) when left blank, matching
 * `auth.routes.ts`'s own `name: z.string().trim().min(1).max(100).optional()`
 * — present-but-empty is a validation error there, absent is fine. Found via
 * real-browser e2e testing: leaving Name blank used to send `name: ''`
 * unconditionally, which the API refused with a real `422` on every
 * registration that didn't fill in an optional field.
 */
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '../../../components/ui';
import { Divider, Field } from '../../../components/auth/AuthFrame';
import { AuthContextPanel, AuthFormPanel, AuthShell, AuthStatus } from '../../../components/auth/AuthShell';
import { useTranslations } from 'next-intl';
import { API_BASE, register } from '../../../lib/api';
import { useAuth } from '../../../components/auth/AuthProvider';
import styles from './page.module.css';

export default function RegisterPage(): React.ReactElement | null {
  const t = useTranslations('auth');
  const router = useRouter();
  const { status } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (status === 'authenticated') router.replace('/scan');
  }, [router, status]);

  async function onSubmit(): Promise<void> {
    setError(null);
    if (!email || password.length < 12) return;
    setSubmitting(true);
    try {
      const trimmedName = name.trim();
      const result = await register(email, password, trimmedName === '' ? undefined : trimmedName);
      try {
        window.sessionStorage.setItem('wa-verification-display-email', result.email);
      } catch {
        // The verification flow still works without this display-only value.
      }
      router.push('/verify-email');
    } catch {
      setError(t('error_generic'));
    } finally {
      setSubmitting(false);
    }
  }

  if (status === 'authenticated') return null;

  return (
    <AuthShell
      form={
        <AuthFormPanel
          title={t('register_title')}
          lead={t('register_lead')}
          foot={
            <span>
              {t('register_foot_lead')} <a href="/login">{t('register_foot_link')}</a>
            </span>
          }
        >
          <div className={styles.stack}>
            <Field
              label={t('name')}
              placeholder="Khalid Ahmed"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
              }}
            />
            <Field
              label={t('work_email')}
              type="email"
              placeholder="you@company.com"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
              }}
            />
            <Field
              label={t('password')}
              type="password"
              placeholder={t('password_hint')}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
              }}
            />
            <div className={styles.note}>{t('register_note')}</div>
            {error !== null && <AuthStatus>{error}</AuthStatus>}
            <Button fullWidth disabled={submitting} onClick={() => void onSubmit()}>
              {t('register_submit')}
            </Button>
          </div>
          <Divider />
          <Button variant="secondary" fullWidth href={`${API_BASE}/auth/oauth/github/start`}>
            {t('github')}
          </Button>
        </AuthFormPanel>
      }
      context={<AuthContextPanel />}
    />
  );
}
