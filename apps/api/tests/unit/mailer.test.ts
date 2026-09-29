import { afterEach, describe, expect, it, vi } from 'vitest';
import { createConsoleMailer } from '../../src/services/email/mailer.js';

describe('console mailer token redaction', () => {
  afterEach(() => vi.restoreAllMocks());

  it('logs generated verification and reset links without their bearer tokens', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const mailer = createConsoleMailer();
    await mailer.sendVerification('user@example.com', 'verification-secret');
    await mailer.sendPasswordReset('user@example.com', 'reset-secret');

    expect(warn).toHaveBeenNthCalledWith(
      1,
      '[mail] verification link generated for user@example.com',
    );
    expect(warn).toHaveBeenNthCalledWith(
      2,
      '[mail] password-reset link generated for user@example.com',
    );
    expect(warn.mock.calls.flat().join(' ')).not.toContain('verification-secret');
    expect(warn.mock.calls.flat().join(' ')).not.toContain('reset-secret');
  });

  it('logs a registration-attempt notice without exposing either URL', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    await createConsoleMailer().sendRegistrationAttemptNotice(
      'user@example.com',
      'https://app.example/login?private=1',
      'https://app.example/reset?private=2',
    );
    expect(warn).toHaveBeenCalledWith(
      '[mail] registration-attempt notice would be sent to user@example.com',
    );
  });
});
