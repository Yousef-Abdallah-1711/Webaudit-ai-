/**
 * T033 — Account deletion.
 *
 * FR-009: deletion destroys the user's audits, reports, retained source, and
 * stored third-party credentials.
 *
 * Two halves, and they are not the same problem.
 *
 * Rows: every owned row cascades from `User`, so the database half is one
 * statement. The credential columns are nulled first because a cascade is about
 * rows and FR-009 is about secrets — see the note on that update below for what
 * that does and does not buy.
 *
 * Artifacts: reports, retained source, and scan workspaces do not live in
 * Postgres. Nothing in this codebase writes them to object storage yet, so there
 * is currently nothing to destroy — but a cascade will never destroy them once
 * something does, and a deletion path that silently ignores them produces
 * customer data that cannot be deleted. So artifact destruction is an explicit,
 * injectable step: this function collects what would have to be purged, hands it
 * to a purger if one is wired, and reports what it found either way.
 *
 * TODO(FR-009): wire a real purger. Two tasks own the pieces:
 *   - T102 (workspace lifecycle) owns `Scan.workspacePath` — the cloned repo or
 *     extracted archive on disk.
 *   - T189 (retention) owns the R2 objects for reports and retained source, and
 *     is where the object-key naming scheme is decided.
 * Until one of them supplies an `ArtifactPurger`, `deleteAccount` reports
 * `artifactsPurged: false` and the caller is responsible for not pretending
 * otherwise. No R2 client is invented here.
 *
 * There is deliberately no `deletedAt` column: a soft-deleted row would hold the
 * unique email hostage forever, so nobody could re-register, and FR-009 says
 * destroy rather than hide.
 */
import type { PrismaClient } from '../../../prisma/generated/client/index.js';

/** Everything outside Postgres that FR-009 requires be destroyed. */
export interface AccountArtifacts {
  userId: string;
  /** Per-scan workspaces (cloned repos, extracted archives) still recorded. */
  workspacePaths: string[];
}

/**
 * Destroys a deleted account's artifacts. Implemented by whoever owns object
 * storage; injected here so this service never grows a storage dependency.
 *
 * MUST be idempotent: deletion may be retried after a partial failure.
 */
export interface ArtifactPurger {
  purge(artifacts: AccountArtifacts): Promise<void>;
}

export interface DeleteAccountResult {
  /** What was handed to the purger, or what went undestroyed without one. */
  workspacePaths: string[];
  /** False when no purger was wired — artifacts, if any, still exist. */
  artifactsPurged: boolean;
}

export async function deleteAccount(
  db: PrismaClient,
  userId: string,
  purger?: ArtifactPurger,
): Promise<DeleteAccountResult> {
  // Read the artifact inventory before anything cascades: once the rows are gone
  // there is no record of what was retained, and an orphaned workspace is then
  // undiscoverable.
  const scans = await db.scan.findMany({
    where: { userId, workspacePath: { not: null } },
    select: { workspacePath: true },
  });
  const workspacePaths = scans
    .map((s) => s.workspacePath)
    .filter((p): p is string => p !== null && p.length > 0);

  const artifacts: AccountArtifacts = { userId, workspacePaths };

  // Artifacts first, deliberately. If destruction fails, the rows survive and
  // the user can ask again; the reverse order would leave live customer data
  // with nothing left in the database pointing at it.
  if (purger) {
    await purger.purge(artifacts);
  } else if (workspacePaths.length > 0) {
    // Not silent. FR-009 is not satisfied for these paths, and the operator
    // needs to know which ones.
    console.warn(
      `[deletion] FR-009: ${String(workspacePaths.length)} workspace path(s) for user ${userId} ` +
        `were not destroyed — no ArtifactPurger is wired (see TODO(FR-009): T102, T189)`,
    );
  }

  await db.$transaction(async (tx) => {
    // Nulling the encrypted GitHub token before the delete keeps the credential
    // out of the row that the delete then removes. It is not a secure erase:
    // Postgres MVCC keeps the previous tuple version until VACUUM reclaims it,
    // so nothing on disk is overwritten by this statement. It is kept because it
    // states the intent, and because it is what runs if the delete below ever
    // becomes a soft delete.
    await tx.user.update({
      where: { id: userId },
      data: { githubTokenEnc: null, githubTokenIv: null, githubLogin: null },
    });

    await tx.user.delete({ where: { id: userId } });
  });

  return { workspacePaths, artifactsPurged: purger !== undefined };
}
