/**
 * Phase 7 (production-without-Paymob-or-AI master plan) — the first operator
 * account, created through a documented, auditable, idempotent process
 * instead of the undocumented manual `UPDATE "User" SET "isOperator" = true`
 * this repository has relied on so far (discovery §J: confirmed, repo-wide,
 * that no such mechanism existed before this script).
 *
 * Deliberately narrow:
 *   - Takes an explicit email — never a default, never "the first user",
 *     never anything auto-picked. An operator who runs this names exactly
 *     who they mean to promote.
 *   - Never creates a user. A nonexistent email is a loud, non-zero-exit
 *     failure, not a silent account creation — inventing an account with
 *     `isOperator: true` and no password would itself be the insecure
 *     shortcut this script exists to replace.
 *   - Idempotent: promoting an already-operator account is a no-op, not an
 *     error, and does not write a redundant audit entry.
 *   - Every real promotion writes one `AuditLogEntry` in the same
 *     transaction as the mutation, exactly `users.service.ts`'s own
 *     `updateUser` pattern — so the very first operator this system ever
 *     gets is provably traceable, not a database edit nobody recorded.
 *
 * `actorId: 'system:bootstrap-admin-script'` names the actor honestly:
 * `recordAuditLog`'s own module note is explicit that `actorId` carries no
 * FK to `User` by design, precisely so an action taken before any operator
 * exists can still be written down.
 */

import { pathToFileURL } from 'node:url';
import { PrismaClient } from '../apps/api/prisma/generated/client/index.js';
import { recordAuditLog } from '../apps/api/src/services/admin/audit-log.js';

const BOOTSTRAP_ACTOR_ID = 'system:bootstrap-admin-script';

export class UserNotFoundForBootstrapError extends Error {
  override readonly name = 'UserNotFoundForBootstrapError';
  constructor(readonly email: string) {
    super(
      `No user exists with email "${email}". This script never creates a user — ` +
        'register the account normally first, then run this script to promote it.',
    );
  }
}

export interface BootstrapAdminResult {
  readonly userId: string;
  readonly email: string;
  /** false when the account was already an operator — a real no-op, not skipped silently. */
  readonly promoted: boolean;
}

export async function bootstrapAdmin(
  db: Pick<PrismaClient, 'user' | 'auditLogEntry' | '$transaction'>,
  email: string,
): Promise<BootstrapAdminResult> {
  const trimmed = email.trim();
  if (trimmed === '') {
    throw new Error('An email is required: pnpm tsx scripts/bootstrap-admin.ts <email>');
  }

  return db.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { email: trimmed },
      select: { id: true, email: true, isOperator: true },
    });
    if (user === null) throw new UserNotFoundForBootstrapError(trimmed);

    if (user.isOperator) {
      return { userId: user.id, email: user.email, promoted: false };
    }

    await tx.user.update({ where: { id: user.id }, data: { isOperator: true } });
    await recordAuditLog(tx, {
      actorId: BOOTSTRAP_ACTOR_ID,
      action: 'user.update',
      subjectType: 'User',
      subjectId: user.id,
      before: { isOperator: false },
      after: { isOperator: true },
    });

    return { userId: user.id, email: user.email, promoted: true };
  });
}

async function main(): Promise<void> {
  const email = process.argv[2];
  if (email === undefined || email.trim() === '') {
    console.error('Usage: pnpm tsx scripts/bootstrap-admin.ts <email>');
    process.exitCode = 1;
    return;
  }

  const prisma = new PrismaClient();
  try {
    const result = await bootstrapAdmin(prisma, email);
    if (result.promoted) {
      console.log(`Promoted ${result.email} (${result.userId}) to operator.`);
    } else {
      console.log(`${result.email} (${result.userId}) is already an operator — nothing to do.`);
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

// Same entrypoint-detection convention as `apps/api/src/index.ts` — a suite
// importing `bootstrapAdmin` for a test must not also run `main()`.
function isEntrypoint(): boolean {
  const entry = process.argv[1];
  if (entry === undefined) return false;
  return import.meta.url === pathToFileURL(entry).href;
}
if (isEntrypoint()) {
  void main();
}
