import nodemailer, { type Transporter } from 'nodemailer';
import type {
  Mailer,
  ReadinessAchievedMail,
  RenewalWarningMail,
  RetentionWarningMail,
} from './mailer.js';
import { escapeEmailHtml, renderEmail } from './template.js';

export interface SmtpMailerOptions {
  readonly host: string;
  readonly port: number;
  readonly user: string;
  readonly password: string;
  readonly from: string;
  readonly webUrl?: string;
  readonly transporter?: Pick<Transporter, 'sendMail'>;
  readonly recordAttempt?: (attempt: {
    recipient: string;
    messageType: string;
    succeeded: boolean;
    providerError?: string;
  }) => Promise<void>;
}

function required(value: string, name: string): string {
  if (value.trim() === '') throw new Error(`${name} is required for SMTP mail.`);
  return value;
}

export function createSmtpMailer(options: SmtpMailerOptions): Mailer {
  const host = required(options.host, 'SMTP_HOST');
  const user = required(options.user, 'SMTP_USER');
  const password = required(options.password, 'SMTP_PASSWORD');
  const from = required(options.from, 'EMAIL_FROM');
  if (!Number.isInteger(options.port) || options.port <= 0) {
    throw new Error('SMTP_PORT must be a positive integer.');
  }
  // Hostinger port 465 requires implicit TLS. Keep this explicit; deriving it
  // from the port has caused insecure SMTP regressions in the past.
  const transporter =
    options.transporter ??
    nodemailer.createTransport({
      host,
      port: options.port,
      secure: true,
      auth: { user, pass: password },
    });
  const webUrl = (options.webUrl ?? process.env['WEB_URL'] ?? 'http://localhost:3000').replace(
    /\/+$/,
    '',
  );

  async function send(
    recipient: string,
    messageType: string,
    subject: string,
    content: { html: string; text: string },
  ): Promise<void> {
    try {
      await transporter.sendMail({
        from,
        to: recipient,
        subject,
        html: content.html,
        text: content.text,
      });
      await options.recordAttempt?.({ recipient, messageType, succeeded: true });
    } catch (error) {
      const providerError = error instanceof Error ? error.message : 'SMTP send failed';
      await options.recordAttempt?.({ recipient, messageType, succeeded: false, providerError });
      throw error;
    }
  }

  return {
    sendVerification(email, token) {
      const content = renderEmail({
        title: 'Confirm your WebAudit AI email address',
        bodyHtml: '<p>Confirm your email address to finish creating your WebAudit AI account.</p>',
        ctaLabel: 'Confirm email',
        ctaUrl: `${webUrl}/verify-email?token=${encodeURIComponent(token)}`,
      });
      return send(email, 'verification', 'Confirm your WebAudit AI email address', content);
    },
    sendPasswordReset(email, token) {
      const content = renderEmail({
        title: 'Reset your WebAudit AI password',
        bodyHtml: '<p>Use the secure link below to choose a new password.</p>',
        ctaLabel: 'Reset password',
        ctaUrl: `${webUrl}/reset-password?token=${encodeURIComponent(token)}`,
      });
      return send(email, 'password-reset', 'Reset your WebAudit AI password', content);
    },
    sendPaymentConfirmation(email) {
      const content = renderEmail({
        title: 'Your WebAudit AI payment was successful',
        bodyHtml: '<p>Your payment was successful and your account has been updated.</p>',
      });
      return send(
        email,
        'payment-confirmation',
        'Your WebAudit AI payment was successful',
        content,
      );
    },
    sendReadinessAchieved(email, mail: ReadinessAchievedMail) {
      const content = renderEmail({
        title: `${mail.targetName} is ready to ship`,
        bodyHtml: `<p>${escapeEmailHtml(mail.targetName)} reached a score of ${String(mail.score)} (baseline ${String(mail.baselineScore)}).</p><p><a href="${escapeEmailHtml(mail.certificateUrl)}">View certificate</a></p>`,
        ctaLabel: 'View report',
        ctaUrl: mail.reportUrl,
      });
      return send(email, 'readiness-achieved', `${mail.targetName} is ready to ship`, content);
    },
    sendRenewalWarning(email, mail: RenewalWarningMail) {
      const content = renderEmail({
        title: 'Your WebAudit AI plan is renewing soon',
        bodyHtml: `<p>${String(mail.expiringCredits)} ${escapeEmailHtml(mail.planName)} plan credits expire when your plan renews on ${mail.renewsAt.toISOString().slice(0, 10)}.</p>`,
      });
      return send(email, 'renewal-warning', 'Your WebAudit AI plan is renewing soon', content);
    },
    sendRetentionWarning(email, mail: RetentionWarningMail) {
      const content = renderEmail({
        title: 'Your WebAudit AI report is expiring soon',
        bodyHtml: `<p>The report for ${escapeEmailHtml(mail.targetName)} will be removed on ${mail.removesAt.toISOString().slice(0, 10)}.</p>`,
        ctaLabel: 'Export report',
        ctaUrl: mail.exportUrl,
      });
      return send(email, 'retention-warning', 'Your WebAudit AI report is expiring soon', content);
    },
  };
}

export function createSmtpMailerFromEnv(): Mailer {
  const host = process.env['SMTP_HOST'] ?? 'smtp.hostinger.com';
  const port = Number(process.env['SMTP_PORT'] ?? '465');
  return createSmtpMailer({
    host,
    port,
    user: required(process.env['SMTP_USER'] ?? '', 'SMTP_USER'),
    password: required(process.env['SMTP_PASSWORD'] ?? '', 'SMTP_PASSWORD'),
    from: required(process.env['EMAIL_FROM'] ?? '', 'EMAIL_FROM'),
  });
}
