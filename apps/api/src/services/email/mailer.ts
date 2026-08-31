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

export interface Mailer {
  sendVerification(email: string, token: string): Promise<void>;
  sendPasswordReset(email: string, token: string): Promise<void>;
  /** FR-072 / SC-014 — the "you reached a go verdict" email. */
  sendReadinessAchieved(email: string, mail: ReadinessAchievedMail): Promise<void>;
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
  };
}
