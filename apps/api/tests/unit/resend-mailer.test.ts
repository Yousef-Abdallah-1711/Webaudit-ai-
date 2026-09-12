import { describe, expect, it, vi } from 'vitest';
import { createResendMailer, ResendApiError } from '../../src/services/email/resend-mailer.js';

const baseOptions = {
  apiKey: 're_test_key',
  from: 'WebAudit AI <noreply@example.com>',
  fetchImpl: vi.fn<typeof fetch>(),
};

function okResponse(): Response {
  return new Response(JSON.stringify({ id: 'email_123' }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

describe('Resend mailer', () => {
  it.each([
    [
      'sendVerification',
      (mailer: ReturnType<typeof createResendMailer>) =>
        mailer.sendVerification('user@example.com', 'verify-token'),
    ],
    [
      'sendPasswordReset',
      (mailer: ReturnType<typeof createResendMailer>) =>
        mailer.sendPasswordReset('user@example.com', 'reset-token'),
    ],
    [
      'sendReadinessAchieved',
      (mailer: ReturnType<typeof createResendMailer>) =>
        mailer.sendReadinessAchieved('user@example.com', {
          targetName: 'Example site',
          score: 92,
          baselineScore: 81,
          certificateUrl: 'https://app.example/certificate/1',
          reportUrl: 'https://app.example/reports/1',
        }),
    ],
    [
      'sendRenewalWarning',
      (mailer: ReturnType<typeof createResendMailer>) =>
        mailer.sendRenewalWarning('user@example.com', {
          planName: 'Pro',
          expiringCredits: 120,
          renewsAt: new Date('2026-10-01T00:00:00.000Z'),
        }),
    ],
    [
      'sendRetentionWarning',
      (mailer: ReturnType<typeof createResendMailer>) =>
        mailer.sendRetentionWarning('user@example.com', {
          targetName: 'Example site',
          removesAt: new Date('2026-10-15T00:00:00.000Z'),
          exportUrl: 'https://app.example/reports/1/export',
        }),
    ],
  ])('%s sends the complete email payload', async (_name, send) => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(okResponse());
    const mailer = createResendMailer({ ...baseOptions, fetchImpl });

    await send(mailer);

    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, init] = fetchImpl.mock.calls[0] ?? [];
    expect(url).toBe('https://api.resend.com/emails');
    expect(init?.method).toBe('POST');
    expect(init?.headers).toEqual({
      Authorization: 'Bearer re_test_key',
      'Content-Type': 'application/json',
      'User-Agent': 'webaudit-api/1.0',
    });
    const payload = JSON.parse(typeof init?.body === 'string' ? init.body : '') as Record<
      string,
      unknown
    >;
    expect(payload).toMatchObject({
      from: 'WebAudit AI <noreply@example.com>',
      to: ['user@example.com'],
    });
    expect(payload.subject).toEqual(expect.any(String));
    expect(payload.html).toEqual(expect.any(String));
    expect(payload.text).toEqual(expect.any(String));
    expect(payload.html).toContain('Web<span style="color:#fe5a01">Audit</span> AI');
    expect(String(payload.text)).toContain('WebAudit AI');
  });

  it('surfaces provider failures as a typed error', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(JSON.stringify({ message: 'invalid from address' }), { status: 422 }),
      );
    const mailer = createResendMailer({ ...baseOptions, fetchImpl });

    const result = await mailer
      .sendVerification('user@example.com', 'token')
      .catch((error: unknown) => error);
    expect(result).toBeInstanceOf(ResendApiError);
    expect(result).toMatchObject({
      message: 'Resend email request failed (422): invalid from address',
      status: 422,
    });
  });
});
