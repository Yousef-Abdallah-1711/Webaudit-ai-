/**
 * Mail transport seam.
 *
 * Injected rather than imported so tests can capture what would be sent. The
 * token never leaves the server through any other path — there is deliberately
 * no endpoint that returns one.
 */
export interface Mailer {
  sendVerification(email: string, token: string): Promise<void>;
  sendPasswordReset(email: string, token: string): Promise<void>;
}

/** Development transport. Real delivery arrives with T166. */
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
  };
}
