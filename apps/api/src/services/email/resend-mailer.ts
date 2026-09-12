import type {
  Mailer,
  ReadinessAchievedMail,
  RenewalWarningMail,
  RetentionWarningMail,
} from './mailer.js';
import { escapeEmailHtml, renderEmail } from './template.js';

const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const USER_AGENT = 'webaudit-api/1.0';

export interface ResendMailerOptions {
  readonly apiKey: string;
  readonly from: string;
  readonly webUrl?: string;
  readonly fetchImpl?: typeof fetch;
}

export class ResendApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(`Resend email request failed (${String(status)}): ${message}`);
    this.name = 'ResendApiError';
    this.status = status;
  }
}

export function createResendMailer(options: ResendMailerOptions): Mailer {
  const fetchImpl = options.fetchImpl ?? fetch;
  const webUrl = (options.webUrl ?? process.env['WEB_URL'] ?? 'http://localhost:3000').replace(
    /\/+$/,
    '',
  );

  async function sendEmail(input: {
    readonly to: string;
    readonly subject: string;
    readonly text: string;
    readonly html: string;
  }): Promise<void> {
    const response = await fetchImpl(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        'Content-Type': 'application/json',
        'User-Agent': USER_AGENT,
      },
      body: JSON.stringify({
        from: options.from,
        to: [input.to],
        subject: input.subject,
        html: input.html,
        text: input.text,
      }),
    });

    if (response.ok) return;

    const body = await response.text();
    let message = body || response.statusText || 'unknown provider error';
    try {
      const parsed = JSON.parse(body) as { message?: unknown; error?: { message?: unknown } };
      const providerMessage = parsed.error?.message ?? parsed.message;
      if (typeof providerMessage === 'string' && providerMessage !== '') message = providerMessage;
    } catch {
      // Preserve the raw provider body when it is not JSON.
    }
    throw new ResendApiError(response.status, message);
  }

  return {
    sendVerification(email, token) {
      const url = `${webUrl}/verify-email?token=${encodeURIComponent(token)}`;
      const content = renderEmail({
        title: 'Confirm your WebAudit AI email address',
        bodyHtml: '<p>Confirm your email address to finish creating your WebAudit AI account.</p>',
        ctaLabel: 'Confirm email',
        ctaUrl: url,
      });
      return sendEmail({
        to: email,
        subject: 'Confirm your WebAudit AI email address',
        ...content,
      });
    },
    sendPasswordReset(email, token) {
      const url = `${webUrl}/reset-password?token=${encodeURIComponent(token)}`;
      const content = renderEmail({
        title: 'Reset your WebAudit AI password',
        bodyHtml: '<p>Use the secure link below to choose a new password.</p>',
        ctaLabel: 'Reset password',
        ctaUrl: url,
      });
      return sendEmail({
        to: email,
        subject: 'Reset your WebAudit AI password',
        ...content,
      });
    },
    sendReadinessAchieved(email, mail: ReadinessAchievedMail) {
      const content = renderEmail({
        title: `${mail.targetName} is ready to ship`,
        bodyHtml: `<p>${escapeEmailHtml(mail.targetName)} reached a score of ${String(mail.score)} (baseline ${String(mail.baselineScore)}).</p><p><a href="${escapeEmailHtml(mail.certificateUrl)}">View certificate</a></p>`,
        ctaLabel: 'View report',
        ctaUrl: mail.reportUrl,
      });
      return sendEmail({
        to: email,
        subject: `${mail.targetName} is ready to ship`,
        ...content,
      });
    },
    sendRenewalWarning(email, mail: RenewalWarningMail) {
      const content = renderEmail({
        title: 'Your WebAudit AI plan is renewing soon',
        bodyHtml: `<p>${String(mail.expiringCredits)} ${escapeEmailHtml(mail.planName)} plan credits expire when your plan renews on ${mail.renewsAt.toISOString().slice(0, 10)}.</p>`,
      });
      return sendEmail({
        to: email,
        subject: 'Your WebAudit AI plan is renewing soon',
        ...content,
      });
    },
    sendRetentionWarning(email, mail: RetentionWarningMail) {
      const content = renderEmail({
        title: 'Your WebAudit AI report is expiring soon',
        bodyHtml: `<p>The report for ${escapeEmailHtml(mail.targetName)} will be removed on ${mail.removesAt.toISOString().slice(0, 10)}.</p>`,
        ctaLabel: 'Export report',
        ctaUrl: mail.exportUrl,
      });
      return sendEmail({
        to: email,
        subject: 'Your WebAudit AI report is expiring soon',
        ...content,
      });
    },
  };
}

export function createResendMailerFromEnv(): Mailer {
  const apiKey = process.env['RESEND_API_KEY'];
  const from = process.env['EMAIL_FROM'];
  if (!apiKey) throw new Error('RESEND_API_KEY is required for the production mailer.');
  if (!from) throw new Error('EMAIL_FROM is required for the production mailer.');
  return createResendMailer({ apiKey, from });
}
