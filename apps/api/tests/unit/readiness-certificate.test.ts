/**
 * T165 — FR-072: the shareable readiness certificate.
 */

import { describe, expect, it } from 'vitest';
import {
  generateReadinessCertificate,
  renderCertificateHtml,
} from '../../src/services/readiness/certificate.js';
import type { ReportStorage } from '../../src/services/storage/reports.js';

const input = {
  scanId: 'scan_abc123',
  verdictId: 'verdict_xyz',
  targetName: 'acme.com',
  overallScore: 91,
  baselineScore: 62,
  completedAt: new Date('2026-09-01T12:00:00Z'),
  moduleOutcomes: [
    { module: 'SECURITY', score: 96, threshold: 80, pass: true },
    { module: 'SEO', score: 68, threshold: 70, pass: false },
  ],
};

describe('renderCertificateHtml', () => {
  it('is a self-contained page — no external CSS, fonts, or scripts', () => {
    const html = renderCertificateHtml(input);
    expect(html).toMatch(/^<!doctype html>/i);
    expect(html).not.toMatch(/<link[^>]+href=["']https?:/i);
    expect(html).not.toMatch(/<script[^>]+src=/i);
    expect(html).not.toMatch(/@import/);
  });

  it('names the target, the score against the baseline, and every area against its threshold', () => {
    const html = renderCertificateHtml(input);
    expect(html).toContain('acme.com');
    expect(html).toContain('Score 91');
    expect(html).toContain('baseline 62');
    expect(html).toContain('+29');
    expect(html).toContain('Security');
    expect(html).toContain('96 / 80');
    expect(html).toContain('68 / 70');
    expect(html).toContain('verdict_xyz');
  });

  it('escapes the target name', () => {
    const html = renderCertificateHtml({ ...input, targetName: '<script>x</script>' });
    expect(html).not.toContain('<script>x</script>');
    expect(html).toContain('&lt;script&gt;');
  });
});

describe('generateReadinessCertificate', () => {
  it('stores the html under the scan prefix and returns the full key', async () => {
    const puts: { scanId: string; key: string; contentType: string; body: string }[] = [];
    const storage: ReportStorage = {
      putObject: (scanId, key, body, contentType) => {
        puts.push({ scanId, key, contentType, body: new TextDecoder().decode(body) });
        return Promise.resolve();
      },
      getObject: () => Promise.reject(new Error('not used')),
    };

    const { certificateKey } = await generateReadinessCertificate(storage, input);
    expect(certificateKey).toBe('scans/scan_abc123/certificate.html');
    expect(puts).toHaveLength(1);
    expect(puts[0]?.contentType).toContain('text/html');
    expect(puts[0]?.body).toContain('acme.com');
  });
});
