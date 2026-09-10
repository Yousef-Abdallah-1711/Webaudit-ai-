/**
 * Full auth-system security audit (2026-09-10) — horizontal IDOR on the
 * report/issue read and fix-loop routes.
 *
 * `reports.routes.ts` and `issues.routes.ts` scope every lookup to the
 * caller's own `userId` (directly on `Scan`, or via the `scan: { userId }`
 * relation for an `Issue`) — the same pattern already proven at the HTTP
 * layer for `targets.routes.ts` (`targets.routes.test.ts`'s "404s for
 * another account target" test) and for `scans.routes.ts` implicitly through
 * its own contract tests. Neither of these two files had an equivalent
 * cross-user test of its own before this audit — this file closes that gap
 * for every route in both, proving "not yours" and "does not exist" are
 * genuinely indistinguishable (same status, same body) rather than merely
 * both refused.
 */
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { closeDb, resetDb, seedPlans, testDb } from '../helpers/db.js';
import { createCapturingMailer } from '../helpers/mailer.js';

const mailer = createCapturingMailer();
const app = createApp({ db: testDb, mailer });

const OWNER = { email: 'idor-owner@example.com', password: 'correct-horse-battery-staple' };
const STRANGER = { email: 'idor-stranger@example.com', password: 'correct-horse-battery-staple' };

async function registerAndSignIn(creds: { email: string; password: string }): Promise<string> {
  await request(app).post('/auth/register').send(creds).expect(201);
  await testDb.user.update({
    where: { email: creds.email },
    data: { emailVerifiedAt: new Date() },
  });
  const res = await request(app).post('/auth/login').send(creds).expect(200);
  return (res.body as { accessToken: string }).accessToken;
}
const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

/** Seeds a scan with one module result and one issue, owned by `ownerId`. */
async function seedScanWithIssue(ownerId: string): Promise<{ scanId: string; issueId: string }> {
  const target = await testDb.target.create({
    data: {
      userId: ownerId,
      inputType: 'URL',
      canonicalValue: 'https://idor-fixture.example.com',
      displayName: 'idor-fixture.example.com',
    },
  });
  const scan = await testDb.scan.create({
    data: {
      userId: ownerId,
      targetId: target.id,
      capabilitySnapshot: {},
      quotedCredits: 80,
    },
  });
  const moduleResult = await testDb.moduleResult.create({
    data: { scanId: scan.id, module: 'SECURITY', state: 'COMPLETE', score: 50 },
  });
  const issue = await testDb.issue.create({
    data: {
      scanId: scan.id,
      moduleResultId: moduleResult.id,
      fingerprint: 'idor-fixture-fingerprint',
      checkId: 'idor-fixture-check',
      severity: 'HIGH',
      title: 'Fixture issue',
      explanation: 'Fixture issue for IDOR testing.',
      consequence: 'None — this is test fixture data.',
      attribution: 'MEASURED',
      fixPrompt: 'Fixture fix prompt.',
    },
  });
  return { scanId: scan.id, issueId: issue.id };
}

let ownerToken: string;
let strangerToken: string;
let scanId: string;
let issueId: string;

beforeEach(async () => {
  await resetDb();
  await seedPlans();
  mailer.clear();
  ownerToken = await registerAndSignIn(OWNER);
  strangerToken = await registerAndSignIn(STRANGER);
  const owner = await testDb.user.findUniqueOrThrow({ where: { email: OWNER.email } });
  ({ scanId, issueId } = await seedScanWithIssue(owner.id));
});
afterAll(closeDb);

describe("a stranger cannot reach another account's report/issue data — 404, identical to a missing id", () => {
  it('GET /scans/:id/report', async () => {
    const owned = await request(app)
      .get(`/scans/${scanId}/report`)
      .set(auth(ownerToken))
      .expect(200);
    expect(owned.body.report.scanId).toBe(scanId);

    const stranger = await request(app)
      .get(`/scans/${scanId}/report`)
      .set(auth(strangerToken))
      .expect(404);
    const missing = await request(app)
      .get('/scans/clzzzznotarealid/report')
      .set(auth(strangerToken))
      .expect(404);
    expect(stranger.body).toEqual(missing.body);
  });

  it('GET /scans/:id/issues', async () => {
    const owned = await request(app)
      .get(`/scans/${scanId}/issues`)
      .set(auth(ownerToken))
      .expect(200);
    expect(owned.body.issues).toHaveLength(1);

    const stranger = await request(app)
      .get(`/scans/${scanId}/issues`)
      .set(auth(strangerToken))
      .expect(404);
    const missing = await request(app)
      .get('/scans/clzzzznotarealid/issues')
      .set(auth(strangerToken))
      .expect(404);
    expect(stranger.body).toEqual(missing.body);
  });

  it('GET /scans/:id/issues/failing-evidence', async () => {
    await request(app)
      .get(`/scans/${scanId}/issues/failing-evidence`)
      .set(auth(ownerToken))
      .expect(200);

    const stranger = await request(app)
      .get(`/scans/${scanId}/issues/failing-evidence`)
      .set(auth(strangerToken))
      .expect(404);
    const missing = await request(app)
      .get('/scans/clzzzznotarealid/issues/failing-evidence')
      .set(auth(strangerToken))
      .expect(404);
    expect(stranger.body).toEqual(missing.body);
  });

  it('GET /scans/:id/export', async () => {
    const stranger = await request(app).get(`/scans/${scanId}/export`).set(auth(strangerToken));
    expect(stranger.status).toBe(404);
  });

  it('GET /issues/:id', async () => {
    const owned = await request(app).get(`/issues/${issueId}`).set(auth(ownerToken)).expect(200);
    expect(owned.body.issue.id).toBe(issueId);

    const stranger = await request(app)
      .get(`/issues/${issueId}`)
      .set(auth(strangerToken))
      .expect(404);
    const missing = await request(app)
      .get('/issues/clzzzznotarealid')
      .set(auth(strangerToken))
      .expect(404);
    expect(stranger.body).toEqual(missing.body);
  });

  it("POST /issues/:id/assert-fixed never charges or transitions a stranger's target issue", async () => {
    const before = await testDb.issue.findUniqueOrThrow({ where: { id: issueId } });

    const stranger = await request(app)
      .post(`/issues/${issueId}/assert-fixed`)
      .set(auth(strangerToken))
      .expect(404);
    const missing = await request(app)
      .post('/issues/clzzzznotarealid/assert-fixed')
      .set(auth(strangerToken))
      .expect(404);
    expect(stranger.body).toEqual(missing.body);

    const after = await testDb.issue.findUniqueOrThrow({ where: { id: issueId } });
    expect(after.state).toBe(before.state);
    // Not a global count: registering OWNER and STRANGER in `beforeEach`
    // already produced two GRANT transactions of their own (the free-signup
    // allocation) — what must be zero is specifically the reverify DEBIT this
    // route would have charged had the 404 not stopped it before that point.
    expect(await testDb.creditTransaction.count({ where: { reason: 'reverify:issue' } })).toBe(0);
  });

  it('GET /issues/:id/attempts', async () => {
    const owned = await request(app)
      .get(`/issues/${issueId}/attempts`)
      .set(auth(ownerToken))
      .expect(200);
    expect(owned.body.attempts).toEqual([]);

    const stranger = await request(app)
      .get(`/issues/${issueId}/attempts`)
      .set(auth(strangerToken))
      .expect(404);
    const missing = await request(app)
      .get('/issues/clzzzznotarealid/attempts')
      .set(auth(strangerToken))
      .expect(404);
    expect(stranger.body).toEqual(missing.body);
  });
});
