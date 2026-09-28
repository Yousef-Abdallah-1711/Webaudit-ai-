/**
 * Phase 7 (production-without-Paymob-or-AI master plan) —
 * `scripts/bootstrap-admin.ts`'s `bootstrapAdmin`: the first documented,
 * auditable, idempotent way to create an operator, replacing the
 * undocumented manual `UPDATE "User" SET "isOperator" = true` this repo
 * relied on before (discovery §J).
 */
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  bootstrapAdmin,
  UserNotFoundForBootstrapError,
} from '../../../../scripts/bootstrap-admin.js';
import { closeDb, resetDb, testDb } from '../helpers/db.js';

beforeEach(resetDb);
afterAll(closeDb);

describe('bootstrapAdmin', () => {
  it('promotes an existing non-operator user and writes an audit entry', async () => {
    const user = await testDb.user.create({
      data: { email: 'first-operator@example.com', emailVerifiedAt: new Date() },
    });

    const result = await bootstrapAdmin(testDb, 'first-operator@example.com');

    expect(result).toEqual({ userId: user.id, email: user.email, promoted: true });
    const after = await testDb.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(after.isOperator).toBe(true);

    const entries = await testDb.auditLogEntry.findMany({
      where: { subjectType: 'User', subjectId: user.id, action: 'user.update' },
    });
    expect(entries).toHaveLength(1);
    expect(entries[0]?.actorId).toBe('system:bootstrap-admin-script');
    expect(entries[0]?.before).toEqual({ isOperator: false });
    expect(entries[0]?.after).toEqual({ isOperator: true });
  });

  it('is idempotent: promoting an already-operator account is a no-op, no duplicate audit entry', async () => {
    const user = await testDb.user.create({
      data: { email: 'already-operator@example.com', isOperator: true, emailVerifiedAt: new Date() },
    });

    const result = await bootstrapAdmin(testDb, 'already-operator@example.com');

    expect(result).toEqual({ userId: user.id, email: user.email, promoted: false });
    const entries = await testDb.auditLogEntry.findMany({
      where: { subjectType: 'User', subjectId: user.id },
    });
    expect(entries).toHaveLength(0);
  });

  it('never creates a user — fails loudly for a nonexistent email', async () => {
    await expect(bootstrapAdmin(testDb, 'does-not-exist@example.com')).rejects.toBeInstanceOf(
      UserNotFoundForBootstrapError,
    );
    expect(await testDb.user.findUnique({ where: { email: 'does-not-exist@example.com' } })).toBeNull();
  });

  it('rejects an empty email without touching the database', async () => {
    await expect(bootstrapAdmin(testDb, '   ')).rejects.toThrow(/email is required/i);
  });
});
