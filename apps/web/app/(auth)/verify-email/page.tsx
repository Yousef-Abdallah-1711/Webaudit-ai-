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
 * and `token` present (the user followed the email and must explicitly
 * confirm before the token is submitted to `POST /auth/verify/:token`).
 */
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Button } from '../../../components/ui';
import { AuthFormPanel, AuthShell } from '../../../components/auth/AuthShell';
import { Icon } from '../../../components/ui/icons/Icon';
import { useTranslations } from 'next-intl';
import { ApiError, resendVerification, verifyEmail } from '../../../lib/api';
import styles from './page.module.css';

type Outcome = 'ready' | 'confirming' | 'confirmed' | 'invalid' | 'failed';

function TokenOutcome({ token }: { token: string }): React.ReactElement {
  const t = useTranslations('auth');
  const [outcome, setOutcome] = useState<Outcome>('ready');

  async function onConfirm(): Promise<void> {
    setOutcome('confirming');
    try {
      await verifyEmail(token);
      setOutcome('confirmed');
    } catch (error) {
      setOutcome(
        error instanceof ApiError && error.status >= 400 && error.status < 500
          ? 'invalid'
          : 'failed',
      );
    }
  }

  if (outcome === 'ready' || outcome === 'confirming') {
    return (
      <AuthShell
        form={
          <AuthFormPanel title={t('verify_confirm_title')} lead={t('verify_confirm_lead')}>
            <Button fullWidth disabled={outcome === 'confirming'} onClick={() => void onConfirm()}>
              {outcome === 'confirming' ? t('verify_confirm_pending') : t('verify_confirm_button')}
            </Button>
          </AuthFormPanel>
        }
      />
    );
  }
  if (outcome === 'confirmed') {
    return (
      <AuthShell
        form={
          <AuthFormPanel>
            <div className={`${styles.statusBadge} ${styles.successBadge}`} aria-hidden="true">
              <Icon name="check" className={styles.statusIcon ?? ''} />
            </div>
            <h1 className={styles.outcomeTitle}>{t('verify_confirmed_title')}</h1>
            <p className={styles.outcomeLead}>{t('verify_confirmed_lead')}</p>
            <Button fullWidth href="/login">
              {t('verify_confirmed_submit')}
            </Button>
            <p className={styles.closeNote}>{t('verify_confirmed_close_note')}</p>
          </AuthFormPanel>
        }
      />
    );
  }
  if (outcome === 'failed') {
    return (
      <AuthShell
        form={
          <AuthFormPanel>
            <h1 className={styles.outcomeTitle}>{t('verify_retry_title')}</h1>
            <p className={styles.outcomeLead}>{t('verify_retry_lead')}</p>
            <Button fullWidth onClick={() => void onConfirm()}>
              {t('verify_retry_button')}
            </Button>
          </AuthFormPanel>
        }
      />
    );
  }
  return (
    <AuthShell
      form={
        <AuthFormPanel>
          <div className={`${styles.statusBadge} ${styles.neutralBadge}`} aria-hidden="true">
            <Icon name="circleAlert" className={styles.statusIcon ?? ''} />
          </div>
          <h1 className={styles.outcomeTitle}>{t('verify_invalid_title')}</h1>
          <p className={styles.outcomeLead}>{t('verify_invalid_lead')}</p>
          <Button fullWidth href="/signup">
            {t('verify_foot_link')}
          </Button>
        </AuthFormPanel>
      }
    />
  );
}

function WaitingForClick({ email }: { email: string }): React.ReactElement {
  const t = useTranslations('auth');
  const [sent, setSent] = useState(false);

  async function onResend(): Promise<void> {
    try {
      await resendVerification(email || undefined);
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
    <AuthShell
      form={
        <AuthFormPanel
          title={t('verify_title')}
          lead={t('verify_lead', { email: email || t('verify_email_fallback') })}
          foot={
            <span>
              {t('verify_foot_lead')} <a href="/signup">{t('verify_foot_link')}</a>
            </span>
          }
        >
          <div className={styles.emailBox}>{email || t('verify_email_fallback')}</div>
          <Button variant="secondary" fullWidth disabled={sent} onClick={() => void onResend()}>
            {sent ? t('verify_resent') : t('verify_resend')}
          </Button>
        </AuthFormPanel>
      }
    />
  );
}

function VerifyPageInner(): React.ReactElement {
  const params = useSearchParams();
  const token = params.get('token');
  const [email, setEmail] = useState('');

  useEffect(() => {
    if (token !== null && token !== '') return;
    try {
      const displayEmail = window.sessionStorage.getItem('wa-verification-display-email');
      if (displayEmail !== null) {
        window.sessionStorage.removeItem('wa-verification-display-email');
        setEmail(displayEmail);
      }
    } catch {
      // Storage can be unavailable; the generic waiting copy remains usable.
    }
  }, [token]);

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
