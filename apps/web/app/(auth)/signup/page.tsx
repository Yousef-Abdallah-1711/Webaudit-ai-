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
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import {
  AuthPrimaryButton,
  AuthSecondaryButton,
  Divider,
  Field,
} from '../../../components/auth/AuthFrame';
import {
  AuthContextPanel,
  AuthFormPanel,
  AuthShell,
  AuthStatus,
} from '../../../components/auth/AuthShell';
import { useTranslations } from 'next-intl';
import { API_BASE, register } from '../../../lib/api';
import { useAuth } from '../../../components/auth/AuthProvider';

export default function RegisterPage(): React.ReactElement | null {
  const t = useTranslations('auth');
  const router = useRouter();
  const { status } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submissionLock = useRef(false);

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

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (submissionLock.current) return;
    submissionLock.current = true;
    void onSubmit().finally(() => {
      submissionLock.current = false;
    });
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
          <form className="flex flex-col gap-3.5" noValidate onSubmit={handleSubmit}>
            <Field
              label={t('name')}
              autoComplete="name"
              placeholder="Khalid Ahmed"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
              }}
            />
            <Field
              label={t('work_email')}
              type="email"
              autoComplete="email"
              placeholder="you@company.com"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
              }}
            />
            <Field
              label={t('password')}
              type="password"
              autoComplete="new-password"
              placeholder={t('password_hint')}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
              }}
            />
            <div
              className={`flex items-center gap-2 text-marketing-body font-marketing ${password.length >= 12 ? 'text-sev-resolved' : 'text-marketing-muted'}`}
            >
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
                <path d={password.length >= 12 ? 'm4 12 5 5L20 6' : 'M5 12h14'} />
              </svg>
              {t('min_chars')}
            </div>
            <div className="text-marketing-body font-marketing text-marketing-muted">
              {t('register_note')}
            </div>
            {error !== null && <AuthStatus>{error}</AuthStatus>}
            <AuthPrimaryButton
              type="submit"
              fullWidth
              disabled={password.length < 12 || submitting}
            >
              {t('register_submit')}
            </AuthPrimaryButton>
          </form>
          <Divider />
          <AuthSecondaryButton fullWidth href={`${API_BASE}/auth/oauth/github/start`}>
            {t('github')}
          </AuthSecondaryButton>
        </AuthFormPanel>
      }
      context={<AuthContextPanel />}
    />
  );
}
