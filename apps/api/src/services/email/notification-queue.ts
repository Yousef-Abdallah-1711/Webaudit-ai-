import { Queue } from 'bullmq';
import { EMAIL_NOTIFICATION_JOB_OPTIONS, QUEUE_NAMES, redisConnection } from '@webaudit/config';
import type { Mailer, EmailNotificationJobData } from './mailer.js';

/** Enqueue one secret-free notification, closing its producer connection afterward. */
export async function enqueueEmailNotification(
  notification: EmailNotificationJobData,
): Promise<void> {
  const queue = new Queue(QUEUE_NAMES.emailNotification, {
    connection: redisConnection(),
    defaultJobOptions: EMAIL_NOTIFICATION_JOB_OPTIONS,
  });
  try {
    await queue.add('email-notification', { kind: 'email-notification', notification });
  } finally {
    await queue.close();
  }
}

/** Keep bearer-token mail direct; only non-secret request notifications enter BullMQ. */
export function createQueuedNotificationMailer(
  mailer: Mailer,
  enqueue: (notification: EmailNotificationJobData) => Promise<void> = enqueueEmailNotification,
): Mailer {
  return {
    sendVerification: (email, token) => mailer.sendVerification(email, token),
    sendPasswordReset: (email, token) => mailer.sendPasswordReset(email, token),
    sendRegistrationAttemptNotice: (email, loginUrl, resetUrl) =>
      mailer.sendRegistrationAttemptNotice(email, loginUrl, resetUrl),
    sendPaymentConfirmation: (email) => enqueue({ kind: 'payment-confirmation', email }),
    sendPaymentFailure: (email) => enqueue({ kind: 'payment-failure', email }),
    sendReadinessAchieved: (email, mail) => enqueue({ kind: 'readiness-achieved', email, mail }),
    sendRenewalWarning: (email, mail) => mailer.sendRenewalWarning(email, mail),
    sendRetentionWarning: (email, mail) => mailer.sendRetentionWarning(email, mail),
  };
}
