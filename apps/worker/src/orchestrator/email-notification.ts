import { createConsoleMailer, createSmtpMailerFromEnv } from '@webaudit/api/email';
import type { EmailNotificationJobData, Mailer } from '@webaudit/api/email';
import type { PrismaClient } from '@webaudit/api/prisma-client';

export function createWorkerMailer(db: PrismaClient): Mailer {
  if (process.env['NODE_ENV'] !== 'production') return createConsoleMailer();
  return createSmtpMailerFromEnv({
    recordAttempt: async (attempt) => {
      await db.$executeRaw`
              INSERT INTO "EmailSendAttempt" ("id", "recipient", "messageType", "succeeded", "providerError")
              VALUES (gen_random_uuid()::text, ${attempt.recipient}, ${attempt.messageType}, ${attempt.succeeded}, ${attempt.providerError ?? null})
            `;
    },
  });
}

export function createEmailNotificationHandler(
  mailer: Mailer,
): (data: EmailNotificationJobData) => Promise<void> {
  return async (data) => {
    switch (data.kind) {
      case 'payment-confirmation':
        await mailer.sendPaymentConfirmation(data.email);
        return;
      case 'payment-failure':
        await mailer.sendPaymentFailure(data.email);
        return;
      case 'readiness-achieved':
        await mailer.sendReadinessAchieved(data.email, data.mail);
        return;
    }
  };
}
