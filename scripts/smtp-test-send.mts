// Sends one verification email through the project's own createSmtpMailer,
// against the local TLS sink on 127.0.0.1:2465.
process.env['WEB_URL'] = 'http://localhost:7100';
const { createSmtpMailer } = await import(
  '../apps/api/src/services/email/smtp-mailer.ts'
);
const mailer = createSmtpMailer({
  host: '127.0.0.1',
  port: 2465,
  user: 'test-user',
  password: 'test-password',
  from: 'noreply@webaudit.ai',
});
await mailer.sendVerification('new-user@example.com', 'smpt-test-token-123');
console.log('SEND-OK');
setTimeout(() => process.exit(0), 500);
