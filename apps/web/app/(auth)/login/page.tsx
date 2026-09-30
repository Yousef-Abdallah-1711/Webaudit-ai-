'use client';

/**
 * T128 — `LoginPage`, ported from `design-system/ui_kits/marketing/
 * AuthPages.jsx`. Real submission wired against `apps/api`'s `POST /auth/
 * login` (`lib/api.ts`) — the source's `href="../app/index.html"` becomes a
 * router push to `/scan` on success.
 */
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Input } from '../../../components/ui';
import { AuthFrame, Divider, Field } from '../../../components/auth/AuthFrame';
import { useTranslations } from 'next-intl';
import { ApiError, API_BASE } from '../../../lib/api';
import { useAuth } from '../../../components/auth/AuthProvider';
import { safeNextDestination } from '../../../components/auth/RouteGuard';
import styles from './page.module.css';

export default function LoginPage(): React.ReactElement | null {
  const t = useTranslations('auth');
  const router = useRouter();
  const { status, login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const next = safeNextDestination(
    typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('next'),
  );

  useEffect(() => {
    if (status === 'authenticated') router.replace(next);
  }, [next, router, status]);

  async function onSubmit(): Promise<void> {
    setError(null);
    if (!email || !password) return;
    setSubmitting(true);
    try {
      await login(email, password);
      router.replace(next);
    } catch (e) {
      if (e instanceof ApiError && e.code === 'EMAIL_NOT_VERIFIED') {
        setError(t('error_not_verified'));
      } else if (e instanceof ApiError && e.code === 'INVALID_CREDENTIALS') {
        setError(t('error_credentials'));
      } else {
        setError(t('error_generic'));
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (status === 'authenticated') return null;

  return (
    <AuthFrame
      title={t('signin_title')}
      lead={t('signin_lead')}
      foot={
        <span>
          {t('signin_foot_lead')} <a href="/signup">{t('signin_foot_link')}</a>{' '}
          {t('signin_foot_tail')}
        </span>
      }
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
        <div>
          <div className={styles.passwordRow}>
            <span className={styles.passwordLabel}>{t('password')}</span>
            <a href="/forgot-password" className={styles.forgotLink}>
              {t('forgot_link')}
            </a>
          </div>
          <Input
            type="password"
            placeholder="••••••••"
            value={password}
            aria-label={t('password')}
            onChange={(e) => {
              setPassword(e.target.value);
            }}
          />
        </div>
        {error !== null && <div className={styles.error}>{error}</div>}
        <Button fullWidth disabled={submitting} onClick={() => void onSubmit()}>
          {t('signin_submit')}
        </Button>
      </div>
      <Divider />
      <Button variant="secondary" fullWidth href={`${API_BASE}/auth/oauth/github/start`}>
        {t('github')}
      </Button>
    </AuthFrame>
  );
}
