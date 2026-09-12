/**
 * P3 (full-workflow review, Section 6g) — `POST /scans/:id/cancel`'s
 * post-cancel re-fetch (`fetchScanWithResults` in `scans.routes.ts`) used a
 * bare-id `db.scan.findUniqueOrThrow({ where: { id } })`, unscoped by
 * `userId`, even though the guarded `updateMany` immediately above it already
 * proves ownership before this ever runs. Not exploitable today — a scan's
 * `id` is a unique primary key, so a bare-id lookup can only ever return the
 * one row that id already names, never a different user's data — but the
 * query itself carried no evidence of that scoping, and this repo's own
 * stated discipline (README/CLAUDE.md: guarded `updateMany`, never a bare
 * read/write, for anything touching a user-owned row) applies to reads that
 * feed a response just as much as it does to writes.
 *
 * `fetchCancelledScanForUser` is now exported specifically so this scoping is
 * directly testable, independent of whether today's route can currently
 * reach it with a mismatched user (it structurally cannot, which is exactly
 * why a route-level test alone would never catch a regression here).
 */

import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { closeDb, resetDb, seedPlans, testDb } from '../helpers/db.js';
import { fetchCancelledScanForUser } from '../../src/routes/scans.routes.js';

beforeEach(async () => {
  await resetDb();
  await seedPlans();
});
afterAll(closeDb);

async function makeUser(email: string): Promise<string> {
  const user = await testDb.user.create({
    data: { email, passwordHash: 'x', emailVerifiedAt: new Date() },
  });
  return user.id;
}

async function makeScan(userId: string): Promise<string> {
  const target = await testDb.target.create({
    data: {
      userId,
      inputType: 'URL',
      canonicalValue: 'https://cancel-refetch-scoping.example.com',
      displayName: 'cancel-refetch-scoping',
      controlLevel: 'NONE',
    },
  });
  const scan = await testDb.scan.create({
    data: {
      userId,
      targetId: target.id,
      requestedModules: ['SECURITY'],
      capabilitySnapshot: {},
      quotedCredits: 10,
      chargedCredits: 10,
      state: 'CANCELLED',
    },
  });
  return scan.id;
}

describe('fetchCancelledScanForUser scopes its re-fetch to the caller, not just the scan id', () => {
  it('returns the scan for its real owner', async () => {
    const ownerId = await makeUser('scoping-owner@example.com');
    const scanId = await makeScan(ownerId);

    const scan = await fetchCancelledScanForUser(testDb, scanId, ownerId);
    expect(scan.id).toBe(scanId);
  });

  it('refuses to return the scan for a different user, even though the id alone would resolve it', async () => {
    const ownerId = await makeUser('scoping-owner-2@example.com');
    const otherUserId = await makeUser('scoping-attacker@example.com');
    const scanId = await makeScan(ownerId);

    await expect(fetchCancelledScanForUser(testDb, scanId, otherUserId)).rejects.toThrow();
  });
});
