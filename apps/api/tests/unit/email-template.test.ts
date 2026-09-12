import { describe, expect, it } from 'vitest';
import { renderEmail } from '../../src/services/email/template.js';

describe('email template', () => {
  it('renders the approved wordmark, inline styles, CTA, and plain-text fallback', () => {
    const result = renderEmail({
      title: 'Confirm your address',
      bodyHtml: '<p>Your account is ready.</p>',
      ctaLabel: 'Confirm email',
      ctaUrl: 'https://app.example/verify?token=abc&next=home',
    });

    expect(result.html).toContain('Web<span style="color:#fe5a01">Audit</span> AI');
    expect(result.html).toContain('style=');
    expect(result.html).toContain('Confirm email');
    expect(result.html).toContain('https://app.example/verify?token=abc&amp;next=home');
    expect(result.html).not.toMatch(/@import|https?:\/\/(?!app\.example)/);
    expect(result.text).toContain('Confirm your address');
    expect(result.text).toContain('Your account is ready.');
    expect(result.text).toContain('https://app.example/verify?token=abc&next=home');
  });
});
