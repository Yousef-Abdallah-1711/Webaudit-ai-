import { describe, expect, it, vi } from 'vitest';
import { createSmtpMailer } from '../../src/services/email/smtp-mailer.js';

describe('createSmtpMailer', () => {
  it('requires credentials and records successful sends', async () => {
    const sendMail = vi.fn().mockResolvedValue({ messageId: 'm1' });
    const attempts: unknown[] = [];
    const mailer = createSmtpMailer({
      host: 'smtp.hostinger.com',
      port: 465,
      user: 'ai-audit@example.com',
      password: 'test-only',
      from: 'ai-audit@example.com',
      transporter: { sendMail },
      recordAttempt: async (attempt) => {
        attempts.push(attempt);
      },
    });

    await mailer.sendVerification('user@example.com', 'token');
    expect(sendMail).toHaveBeenCalledOnce();
    expect(attempts).toEqual([
      { recipient: 'user@example.com', messageType: 'verification', succeeded: true },
    ]);
  });

  it('records failures and rethrows the provider error', async () => {
    const error = new Error('connection refused');
    const attempts: unknown[] = [];
    const mailer = createSmtpMailer({
      host: 'smtp.hostinger.com',
      port: 465,
      user: 'ai-audit@example.com',
      password: 'test-only',
      from: 'ai-audit@example.com',
      transporter: { sendMail: vi.fn().mockRejectedValue(error) },
      recordAttempt: async (attempt) => {
        attempts.push(attempt);
      },
    });

    await expect(mailer.sendPasswordReset('user@example.com', 'token')).rejects.toThrow(
      'connection refused',
    );
    expect(attempts).toEqual([
      {
        recipient: 'user@example.com',
        messageType: 'password-reset',
        succeeded: false,
        providerError: 'connection refused',
      },
    ]);
  });
});
