import { describe, expect, it, vi } from 'vitest';
import { createQueuedNotificationMailer } from '../../src/services/email/notification-queue.js';
import { createConsoleMailer } from '../../src/services/email/mailer.js';

describe('queued notification mailer', () => {
  it('queues only payment and readiness notifications while bearer mail stays direct', async () => {
    const mailer = createConsoleMailer();
    const verification = vi.spyOn(mailer, 'sendVerification');
    const reset = vi.spyOn(mailer, 'sendPasswordReset');
    const enqueue = vi.fn(() => Promise.resolve());
    const queued = createQueuedNotificationMailer(mailer, enqueue);
    const readiness = {
      targetName: 'Example',
      score: 90,
      baselineScore: 80,
      certificateUrl: 'https://app.example/certificate/1',
      reportUrl: 'https://app.example/reports/1',
    };

    await queued.sendVerification('user@example.com', 'verify-secret');
    await queued.sendPasswordReset('user@example.com', 'reset-secret');
    await queued.sendPaymentConfirmation('user@example.com');
    await queued.sendPaymentFailure('user@example.com');
    await queued.sendReadinessAchieved('user@example.com', readiness);

    expect(verification).toHaveBeenCalledWith('user@example.com', 'verify-secret');
    expect(reset).toHaveBeenCalledWith('user@example.com', 'reset-secret');
    expect(enqueue.mock.calls).toEqual([
      [{ kind: 'payment-confirmation', email: 'user@example.com' }],
      [{ kind: 'payment-failure', email: 'user@example.com' }],
      [{ kind: 'readiness-achieved', email: 'user@example.com', mail: readiness }],
    ]);
    expect(JSON.stringify(enqueue.mock.calls)).not.toContain('verify-secret');
    expect(JSON.stringify(enqueue.mock.calls)).not.toContain('reset-secret');
  });
});
