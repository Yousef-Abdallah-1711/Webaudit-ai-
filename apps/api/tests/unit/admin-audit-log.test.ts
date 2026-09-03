/**
 * T210 — recordAuditLog, the single append point for AuditLogEntry (FR-089).
 *
 * Two things pinned here: the row is written with the right fields, and
 * `actorId` really is an unconstrained plain string — a row referencing a
 * user id that does not exist in the `User` table must not error, matching
 * the schema's own documented design (schema.prisma's AuditLogEntry note).
 */

import { describe, expect, it, beforeEach, afterAll } from 'vitest';
import { closeDb, resetDb, testDb } from '../helpers/db.js';
import { recordAuditLog } from '../../src/services/admin/audit-log.js';

beforeEach(resetDb);
afterAll(closeDb);

describe('recordAuditLog', () => {
  it('writes a row with the given fields', async () => {
    const row = await recordAuditLog(testDb, {
      actorId: 'operator-1',
      action: 'user.update',
      subjectType: 'User',
      subjectId: 'user-42',
      before: { isOperator: false },
      after: { isOperator: true },
    });

    expect(row.actorId).toBe('operator-1');
    expect(row.action).toBe('user.update');
    expect(row.subjectType).toBe('User');
    expect(row.subjectId).toBe('user-42');
    expect(row.before).toEqual({ isOperator: false });
    expect(row.after).toEqual({ isOperator: true });
    expect(row.createdAt).toBeInstanceOf(Date);

    const persisted = await testDb.auditLogEntry.findUnique({ where: { id: row.id } });
    expect(persisted).not.toBeNull();
    expect(persisted?.subjectId).toBe('user-42');
  });

  it('writes a row omitting subjectId/before/after when not given', async () => {
    const row = await recordAuditLog(testDb, {
      actorId: 'operator-1',
      action: 'plan.list',
      subjectType: 'Plan',
    });

    expect(row.subjectId).toBeNull();
    expect(row.before).toBeNull();
    expect(row.after).toBeNull();
  });

  it('actorId is a plain string with no FK constraint to User — a nonexistent id does not error', async () => {
    const nonexistentUserId = 'this-user-id-does-not-exist-anywhere';
    const existing = await testDb.user.findUnique({ where: { id: nonexistentUserId } });
    expect(existing).toBeNull();

    // Must not throw a foreign-key violation.
    const row = await recordAuditLog(testDb, {
      actorId: nonexistentUserId,
      action: 'user.update',
      subjectType: 'User',
      subjectId: 'someone-else',
    });

    expect(row.actorId).toBe(nonexistentUserId);
    const persisted = await testDb.auditLogEntry.findUnique({ where: { id: row.id } });
    expect(persisted?.actorId).toBe(nonexistentUserId);
  });
});
