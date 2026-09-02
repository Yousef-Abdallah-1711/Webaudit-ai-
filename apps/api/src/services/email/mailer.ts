/**
 * Mail transport seam.
 *
 * Injected rather than imported so tests can capture what would be sent. The
 * token never leaves the server through any other path — there is deliberately
 * no endpoint that returns one.
 */
/** What the readiness congratulations email (T166) needs to render. */
export interface ReadinessAchievedMail {
  readonly targetName: string;
  readonly score: number;
  readonly baselineScore: number;
  /** Where the shareable certificate can be fetched. */
  readonly certificateUrl: string;
  readonly reportUrl: string;
}

/** FR-078 — "tell the user, before renewal, how many plan credits they are about to lose." */
export interface RenewalWarningMail {
  readonly planName: string;
  readonly expiringCredits: number;
  readonly renewsAt: Date;
}

/** FR-092 — "tell the user when a report is approaching removal." */
export interface RetentionWarningMail {
  readonly targetName: string;
  readonly removesAt: Date;
  readonly exportUrl: string;
}

export interface Mailer {
  sendVerification(email: string, token: string): Promise<void>;
  sendPasswordReset(email: string, token: string): Promise<void>;
  /** FR-072 / SC-014 — the "you reached a go verdict" email. */
  sendReadinessAchieved(email: string, mail: ReadinessAchievedMail): Promise<void>;
  /** FR-078 — the pre-renewal "you are about to lose N plan credits" warning. */
  sendRenewalWarning(email: string, mail: RenewalWarningMail): Promise<void>;
  /** FR-092 — "this report will be removed on <date>; export it to keep it." */
  sendRetentionWarning(email: string, mail: RetentionWarningMail): Promise<void>;
}

/** Development transport. */
export function createConsoleMailer(): Mailer {
  return {
    sendVerification(email, token) {
      console.warn(`[mail] verify ${email}: /verify-email?token=${token}`);
      return Promise.resolve();
    },
    sendPasswordReset(email, token) {
      console.warn(`[mail] reset ${email}: /reset-password?token=${token}`);
      return Promise.resolve();
    },
    sendReadinessAchieved(email, mail) {
      console.warn(
        `[mail] readiness ${email}: ${mail.targetName} is ready to ship ` +
          `(score ${String(mail.score)}, baseline ${String(mail.baselineScore)}) — ${mail.certificateUrl}`,
      );
      return Promise.resolve();
    },
    sendRenewalWarning(email, mail) {
      console.warn(
        `[mail] renewal ${email}: ${String(mail.expiringCredits)} ${mail.planName} plan credits ` +
          `expire when your plan renews on ${mail.renewsAt.toISOString().slice(0, 10)}`,
      );
      return Promise.resolve();
    },
    sendRetentionWarning(email, mail) {
      console.warn(
        `[mail] retention ${email}: the report for ${mail.targetName} will be removed on ` +
          `${mail.removesAt.toISOString().slice(0, 10)} — export it at ${mail.exportUrl}`,
      );
      return Promise.resolve();
    },
  };
}
