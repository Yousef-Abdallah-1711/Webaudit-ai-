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
import { AuthPrimaryButton } from '../../../components/auth/AuthFrame';
import { AuthFormPanel, AuthShell } from '../../../components/auth/AuthShell';
import { Icon } from '../../../components/ui/icons/Icon';
import { useTranslations } from 'next-intl';
import { ApiError, resendVerification, verifyEmail } from '../../../lib/api';

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
            <AuthPrimaryButton
              fullWidth
              disabled={outcome === 'confirming'}
              onClick={() => void onConfirm()}
            >
              {outcome === 'confirming' ? t('verify_confirm_pending') : t('verify_confirm_button')}
            </AuthPrimaryButton>
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
            <div
              className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-sev-resolved-bg text-sev-resolved"
              aria-hidden="true"
            >
              <Icon name="check" className="h-8 w-8" />
            </div>
            <h1 className="m-0 mb-2 text-marketing-demo-heading font-marketing font-extrabold text-marketing-primary">
              {t('verify_confirmed_title')}
            </h1>
            <p className="m-0 mb-5 text-marketing-body font-marketing text-marketing-secondary text-pretty">
              {t('verify_confirmed_lead')}
            </p>
            <AuthPrimaryButton fullWidth href="/login">
              {t('verify_confirmed_submit')}
            </AuthPrimaryButton>
            <p className="m-0 mt-3 text-center text-marketing-body font-marketing text-marketing-muted">
              {t('verify_confirmed_close_note')}
            </p>
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
            <h1 className="m-0 mb-2 text-marketing-demo-heading font-marketing font-extrabold text-marketing-primary">
              {t('verify_retry_title')}
            </h1>
            <p className="m-0 mb-5 text-marketing-body font-marketing text-marketing-secondary text-pretty">
              {t('verify_retry_lead')}
            </p>
            <AuthPrimaryButton fullWidth onClick={() => void onConfirm()}>
              {t('verify_retry_button')}
            </AuthPrimaryButton>
          </AuthFormPanel>
        }
      />
    );
  }
  return (
    <AuthShell
      form={
        <AuthFormPanel>
          <div
            className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-sev-info-bg text-sev-info"
            aria-hidden="true"
          >
            <Icon name="circleAlert" className="h-8 w-8" />
          </div>
          <h1 className="m-0 mb-2 text-marketing-demo-heading font-marketing font-extrabold text-marketing-primary">
            {t('verify_invalid_title')}
          </h1>
          <p className="m-0 mb-5 text-marketing-body font-marketing text-marketing-secondary text-pretty">
            {t('verify_invalid_lead')}
          </p>
          <AuthPrimaryButton fullWidth href="/signup">
            {t('verify_foot_link')}
          </AuthPrimaryButton>
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
          <div className="mb-5 border-solid border-hairline border-border-marketing bg-surface-marketing-raised p-4 font-mono text-marketing-body text-marketing-primary">
            {email || t('verify_email_fallback')}
          </div>
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
