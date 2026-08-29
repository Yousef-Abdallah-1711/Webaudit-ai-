'use client';

/**
 * T128 — `RegisterPage`, ported from `design-system/ui_kits/marketing/
 * AuthPages.jsx`. Submits against `POST /auth/register`, then routes to
 * `/verify-email` with the address in the query string.
 *
 * **The `Name` field is not sent anywhere.** The source shows it (and the
 * visual gate needs it present to match), but `apps/api`'s `User` model has
 * no name column at all — `credentials` in `auth.routes.ts` accepts only
 * `email`/`password`. Kept in the UI for fidelity, not wired, rather than
 * silently dropped (which would break the visual diff) or silently
 * pretended to be saved (which it is not).
 */
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '../../../components/ui';
import { AuthFrame, Divider, Field } from '../../../components/auth/AuthFrame';
import { useT } from '../../theme';
import { ApiError, API_BASE, register } from '../../../lib/api';
import styles from './page.module.css';

export default function RegisterPage(): React.ReactElement {
  const [t] = useT();
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(): Promise<void> {
    setError(null);
    if (!email || password.length < 12) return;
    setSubmitting(true);
    try {
      await register(email, password);
      router.push(`/verify-email?email=${encodeURIComponent(email)}`);
    } catch (e) {
      if (e instanceof ApiError && e.code === 'CONFLICT') {
        setError(t('auth_error_conflict'));
      } else {
        setError(t('auth_error_generic'));
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthFrame
      title={t('auth_register_title')}
      lead={t('auth_register_lead')}
      foot={
        <span>
          {t('auth_register_foot_lead')} <a href="/login">{t('auth_register_foot_link')}</a>
        </span>
      }
    >
      <div className={styles.stack}>
        <Field
          label={t('auth_name')}
          placeholder="Khalid Ahmed"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
          }}
        />
        <Field
          label={t('auth_work_email')}
          type="email"
          placeholder="you@company.com"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
          }}
        />
        <Field
          label={t('auth_password')}
          type="password"
          placeholder={t('auth_password_hint')}
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
          }}
        />
        <div className={styles.note}>{t('auth_register_note')}</div>
        {error !== null && <div className={styles.error}>{error}</div>}
        <Button
          fullWidth
          disabled={submitting}
          onClick={() => void onSubmit()}
        >
          {t('auth_register_submit')}
        </Button>
      </div>
      <Divider />
      <Button variant="secondary" fullWidth href={`${API_BASE}/auth/oauth/github/start`}>
        {t('auth_github')}
      </Button>
    </AuthFrame>
  );
}
