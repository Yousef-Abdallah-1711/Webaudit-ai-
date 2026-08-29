import type { Mailer } from '../../src/services/email/mailer.js';

export interface CapturingMailer extends Mailer {
  clear(): void;
  lastVerificationToken(): string;
  lastResetToken(): string;
  sent(): ReadonlyArray<{ kind: string; email: string; token: string }>;
}

/**
 * Captures what would have been emailed. Lets a contract test read a
 * verification token without the API ever exposing one over HTTP.
 */
export function createCapturingMailer(): CapturingMailer {
  const log: { kind: string; email: string; token: string }[] = [];
  const lastOf = (kind: string): string => {
    const hit = [...log].reverse().find((e) => e.kind === kind);
    if (!hit) throw new Error(`no ${kind} email was sent`);
    return hit.token;
  };
  return {
    sendVerification: (email, token) => {
      log.push({ kind: 'verify', email, token });
      return Promise.resolve();
    },
    sendPasswordReset: (email, token) => {
      log.push({ kind: 'reset', email, token });
      return Promise.resolve();
    },
    clear: () => void (log.length = 0),
    lastVerificationToken: () => lastOf('verify'),
    lastResetToken: () => lastOf('reset'),
    sent: () => log,
  };
}
