'use client';

/**
 * T128 — `VerifyPage`, ported from `design-system/ui_kits/marketing/
 * AuthPages.jsx`, extended to actually consume a verification link.
 *
 * The design mock only shows the "we sent a link, waiting" state. The real
 * mailer (`apps/api/src/services/email/mailer.ts`'s console mailer) sends a
 * link shaped `/verify-email?token=...` — a *frontend* route, not directly
 * to the API — so this page has two states the source did not need to
 * distinguish: no `token` in the query string (just registered, waiting),
 * and `token` present (the user followed the email; verify it against
 * `GET /auth/verify/:token` and show the outcome).
 */
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Button } from '../../../components/ui';
import { AuthFrame } from '../../../components/auth/AuthFrame';
import { useT } from '../../theme';
import { ApiError, resendVerification, verifyEmail } from '../../../lib/api';
import styles from './page.module.css';

type Outcome = 'checking' | 'confirmed' | 'invalid';

function TokenOutcome({ token }: { token: string }): React.ReactElement {
  const [t] = useT();
  const [outcome, setOutcome] = useState<Outcome>('checking');

  useEffect(() => {
    let cancelled = false;
    verifyEmail(token)
      .then(() => {
        if (!cancelled) setOutcome('confirmed');
      })
      .catch(() => {
        if (!cancelled) setOutcome('invalid');
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (outcome === 'checking') {
    return <AuthFrame title={t('auth_verify_title')} />;
  }
  if (outcome === 'confirmed') {
    return (
      <AuthFrame title={t('auth_verify_confirmed_title')} lead={t('auth_verify_confirmed_lead')}>
        <Button fullWidth href="/login">
          {t('auth_verify_confirmed_submit')}
        </Button>
      </AuthFrame>
    );
  }
  return (
    <AuthFrame title={t('auth_verify_invalid_title')} lead={t('auth_verify_invalid_lead')}>
      <Button fullWidth href="/signup">
        {t('auth_verify_foot_link')}
      </Button>
    </AuthFrame>
  );
}

function WaitingForClick({ email }: { email: string }): React.ReactElement {
  const [t] = useT();
  const [sent, setSent] = useState(false);

  async function onResend(): Promise<void> {
    try {
      await resendVerification(email);
    } catch (e) {
      // resendVerification always answers 202 regardless of whether the
      // address exists (no account-enumeration signal) — a thrown ApiError
      // here means the request itself failed, not that resending refused.
      if (!(e instanceof ApiError)) throw e;
    } finally {
      setSent(true);
    }
  }

  return (
    <AuthFrame
      title={t('auth_verify_title')}
      lead={t('auth_verify_lead').replace('{email}', email || 'you@company.com')}
      foot={
        <span>
          {t('auth_verify_foot_lead')} <a href="/signup">{t('auth_verify_foot_link')}</a>
        </span>
      }
    >
      <div className={styles.emailBox}>{email || 'you@company.com'}</div>
      <Button variant="secondary" fullWidth disabled={sent} onClick={() => void onResend()}>
        {sent ? t('auth_verify_confirmed_lead') : t('auth_verify_resend')}
      </Button>
    </AuthFrame>
  );
}

function VerifyPageInner(): React.ReactElement {
  const params = useSearchParams();
  const token = params.get('token');
  const email = params.get('email') ?? '';

  if (token !== null && token !== '') return <TokenOutcome token={token} />;
  return <WaitingForClick email={email} />;
}

export default function VerifyPage(): React.ReactElement {
  return (
    <Suspense>
      <VerifyPageInner />
    </Suspense>
  );
}
