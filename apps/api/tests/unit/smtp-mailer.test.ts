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

  it('T019 — sends a payment-failure notice, recorded as its own message type', async () => {
    const sendMail = vi.fn().mockResolvedValue({ messageId: 'm2' });
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

    await mailer.sendPaymentFailure('user@example.com');

    expect(sendMail).toHaveBeenCalledOnce();
    expect(sendMail.mock.calls[0]![0]).toMatchObject({
      to: 'user@example.com',
      subject: 'Your Fahes payment did not go through',
    });
    expect(attempts).toEqual([
      { recipient: 'user@example.com', messageType: 'payment-failure', succeeded: true },
    ]);
  });

  it('sends a registration-attempt notice with both actions via the shared renderer', async () => {
    const sendMail = vi.fn().mockResolvedValue({ messageId: 'm3' });
    const mailer = createSmtpMailer({
      host: 'smtp.hostinger.com',
      port: 465,
      user: 'ai-audit@example.com',
      password: 'test-only',
      from: 'ai-audit@example.com',
      transporter: { sendMail },
    });

    await mailer.sendRegistrationAttemptNotice(
      'user@example.com',
      'https://app.example/login',
      'https://app.example/reset-password',
    );

    expect(sendMail).toHaveBeenCalledOnce();
    expect(sendMail.mock.calls[0]![0]).toMatchObject({
      to: 'user@example.com',
      subject: 'Someone tried to register with your email',
    });
    expect(sendMail.mock.calls[0]![0].html).toContain('https://app.example/login');
    expect(sendMail.mock.calls[0]![0].html).toContain('https://app.example/reset-password');
    expect(sendMail.mock.calls[0]![0].text).toContain('https://app.example/reset-password');
  });
});
