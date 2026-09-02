/**
 * T190 — self-contained report export (FR-093).
 */

import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { closeDb, resetDb, seedPlans, testDb } from '../helpers/db.js';
import { ReportNotExportableError, exportReport } from '../../src/services/storage/export.js';

async function seed(state: string, opts: { removed?: boolean } = {}): Promise<{ scanId: string; userId: string }> {
  const user = await testDb.user.create({ data: { email: `exp-${Math.random()}@example.com`, emailVerifiedAt: new Date() } });
  const target = await testDb.target.create({
    data: { userId: user.id, inputType: 'URL', canonicalValue: 'https://exp.example.com', displayName: 'acme.com' },
  });
  const scan = await testDb.scan.create({
    data: {
      userId: user.id,
      targetId: target.id,
      requestedModules: ['SECURITY', 'SEO'],
      capabilitySnapshot: {},
      quotedCredits: 30,
      chargedCredits: 30,
      state: state as never,
      overallScore: 62,
      summary: 'Two critical findings block a launch.',
      completedAt: new Date('2026-08-20T10:00:00Z'),
      ...(opts.removed ? { reportRemovedAt: new Date() } : {}),
    },
  });
  const mr = await testDb.moduleResult.create({
    data: { scanId: scan.id, module: 'SECURITY', state: 'COMPLETE', score: 40, summary: 's' },
  });
  await testDb.issue.create({
    data: {
      scanId: scan.id,
      moduleResultId: mr.id,
      fingerprint: 'fp1',
      checkId: 'headers.csp-missing',
      severity: 'CRITICAL',
      title: 'No Content-Security-Policy header',
      explanation: 'The response carries no CSP.',
      consequence: 'Cross-site scripting has no second line of defence.',
      location: 'https://exp.example.com/',
      evidence: { 'content-security-policy': null },
      attribution: 'MEASURED',
      fixPrompt: 'Add a Content-Security-Policy header with a strict default-src.',
    },
  });
  return { scanId: scan.id, userId: user.id };
}

beforeEach(async () => {
  await resetDb();
  await seedPlans();
});
afterAll(closeDb);

describe('exportReport', () => {
  it('produces a self-contained HTML document with the score, summary, areas, and every issue + fix prompt', async () => {
    const { scanId, userId } = await seed('COMPLETED');
    const { html, filename } = await exportReport(testDb, { scanId, userId });

    expect(filename).toBe(`webaudit-report-${scanId}.html`);
    expect(html).toMatch(/^<!doctype html>/i);
    expect(html).not.toMatch(/<link[^>]+href=["']https?:/i);
    expect(html).not.toMatch(/<script[^>]+src=/i);

    expect(html).toContain('62');
    expect(html).toContain('Two critical findings block a launch.');
    expect(html).toContain('Security');
    expect(html).toContain('No Content-Security-Policy header');
    expect(html).toContain('Add a Content-Security-Policy header'); // FR-051 — the fix prompt survives export
    expect(html).toContain('measured');
  });

  it('refuses an unfinished audit', async () => {
    const { scanId, userId } = await seed('RUNNING_PHASE_1');
    await expect(exportReport(testDb, { scanId, userId })).rejects.toMatchObject({ reason: 'not-ready' });
  });

  it('refuses once the report has been removed by retention', async () => {
    const { scanId, userId } = await seed('COMPLETED', { removed: true });
    await expect(exportReport(testDb, { scanId, userId })).rejects.toBeInstanceOf(
      ReportNotExportableError,
    );
  });

  it('refuses someone else\'s report', async () => {
    const { scanId } = await seed('COMPLETED');
    const other = await testDb.user.create({ data: { email: 'other@example.com' } });
    await expect(exportReport(testDb, { scanId, userId: other.id })).rejects.toMatchObject({
      reason: 'not-found',
    });
  });
});
