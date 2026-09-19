import type {
  Mailer,
  ReadinessAchievedMail,
  RenewalWarningMail,
  RetentionWarningMail,
} from '../../src/services/email/mailer.js';

export interface CapturingMailer extends Mailer {
  clear(): void;
  lastVerificationToken(): string;
  lastResetToken(): string;
  sent(): ReadonlyArray<{ kind: string; email: string; token: string }>;
  readinessMails(): ReadonlyArray<{ email: string; mail: ReadinessAchievedMail }>;
  renewalWarnings(): ReadonlyArray<{ email: string; mail: RenewalWarningMail }>;
  retentionWarnings(): ReadonlyArray<{ email: string; mail: RetentionWarningMail }>;
  paymentConfirmations(): ReadonlyArray<{ email: string }>;
  paymentFailures(): ReadonlyArray<{ email: string }>;
  failPaymentConfirmation(error: Error | null): void;
  failVerification(error: Error | null): void;
  failPasswordReset(error: Error | null): void;
}

/**
 * Captures what would have been emailed. Lets a contract test read a
 * verification token without the API ever exposing one over HTTP.
 */
export function createCapturingMailer(): CapturingMailer {
  const log: { kind: string; email: string; token: string }[] = [];
  const readiness: { email: string; mail: ReadinessAchievedMail }[] = [];
  const renewal: { email: string; mail: RenewalWarningMail }[] = [];
  const retention: { email: string; mail: RetentionWarningMail }[] = [];
  const confirmations: { email: string }[] = [];
  const failures: { email: string }[] = [];
  let confirmationFailure: Error | null = null;
  let verificationFailure: Error | null = null;
  let passwordResetFailure: Error | null = null;
  const lastOf = (kind: string): string => {
    const hit = [...log].reverse().find((e) => e.kind === kind);
    if (!hit) throw new Error(`no ${kind} email was sent`);
    return hit.token;
  };
  return {
    sendVerification: (email, token) => {
      if (verificationFailure !== null) return Promise.reject(verificationFailure);
      log.push({ kind: 'verify', email, token });
      return Promise.resolve();
    },
    sendPasswordReset: (email, token) => {
      if (passwordResetFailure !== null) return Promise.reject(passwordResetFailure);
      log.push({ kind: 'reset', email, token });
      return Promise.resolve();
    },
    sendReadinessAchieved: (email, mail) => {
      readiness.push({ email, mail });
      return Promise.resolve();
    },
    sendRenewalWarning: (email, mail) => {
      renewal.push({ email, mail });
      return Promise.resolve();
    },
    sendRetentionWarning: (email, mail) => {
      retention.push({ email, mail });
      return Promise.resolve();
    },
    sendPaymentConfirmation: (email: string) => {
      if (confirmationFailure !== null) return Promise.reject(confirmationFailure);
      confirmations.push({ email });
      return Promise.resolve();
    },
    sendPaymentFailure: (email: string) => {
      failures.push({ email });
      return Promise.resolve();
    },
    clear: () => {
      log.length = 0;
      readiness.length = 0;
      renewal.length = 0;
      retention.length = 0;
      confirmations.length = 0;
      failures.length = 0;
      confirmationFailure = null;
      verificationFailure = null;
      passwordResetFailure = null;
    },
    lastVerificationToken: () => lastOf('verify'),
    lastResetToken: () => lastOf('reset'),
    sent: () => log,
    readinessMails: () => readiness,
    renewalWarnings: () => renewal,
    retentionWarnings: () => retention,
    paymentConfirmations: () => confirmations,
    paymentFailures: () => failures,
    failPaymentConfirmation: (error) => {
      confirmationFailure = error;
    },
    failVerification: (error) => {
      verificationFailure = error;
    },
    failPasswordReset: (error) => {
      passwordResetFailure = error;
    },
  };
}
