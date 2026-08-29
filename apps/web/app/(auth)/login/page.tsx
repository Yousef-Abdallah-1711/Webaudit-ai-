'use client';

/**
 * T128 — `LoginPage`, ported from `design-system/ui_kits/marketing/
 * AuthPages.jsx`. Real submission wired against `apps/api`'s `POST /auth/
 * login` (`lib/api.ts`) — the source's `href="../app/index.html"` becomes a
 * router push to `/scan` on success.
 */
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Input } from '../../../components/ui';
import { AuthFrame, Divider, Field } from '../../../components/auth/AuthFrame';
import { useT } from '../../theme';
import { ApiError, API_BASE, login } from '../../../lib/api';
import styles from './page.module.css';

export default function LoginPage(): React.ReactElement {
  const [t] = useT();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(): Promise<void> {
    setError(null);
    if (!email || !password) return;
    setSubmitting(true);
    try {
      await login(email, password);
      router.push('/scan');
    } catch (e) {
      if (e instanceof ApiError && e.code === 'EMAIL_NOT_VERIFIED') {
        setError(t('auth_error_not_verified'));
      } else if (e instanceof ApiError && e.code === 'INVALID_CREDENTIALS') {
        setError(t('auth_error_credentials'));
      } else {
        setError(t('auth_error_generic'));
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthFrame
      title={t('auth_signin_title')}
      lead={t('auth_signin_lead')}
      foot={
        <span>
          {t('auth_signin_foot_lead')}{' '}
          <a href="/signup">{t('auth_signin_foot_link')}</a> {t('auth_signin_foot_tail')}
        </span>
      }
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
        <div>
          <div className={styles.passwordRow}>
            <span className={styles.passwordLabel}>{t('auth_password')}</span>
            <a href="/forgot-password" className={styles.forgotLink}>
              {t('auth_forgot_link')}
            </a>
          </div>
          <Input
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
            }}
          />
        </div>
        {error !== null && <div className={styles.error}>{error}</div>}
        <Button fullWidth disabled={submitting} onClick={() => void onSubmit()}>
          {t('auth_signin_submit')}
        </Button>
      </div>
      <Divider />
      <Button variant="secondary" fullWidth href={`${API_BASE}/auth/oauth/github/start`}>
        {t('auth_github')}
      </Button>
    </AuthFrame>
  );
}
