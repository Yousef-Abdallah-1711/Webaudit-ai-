/**
 * T173 — archive upload staging, with pre-extraction validation.
 *
 * FR-015's "before extracting content **and before charging**" describes this
 * function's whole shape. Nothing here extracts, and nothing here charges. The
 * sequence is fixed and each step can only refuse:
 *
 *   1. **Read, bounded.** `readBoundedUpload` stops at the published limit
 *      mid-stream. A caller that buffered the body first and measured after has
 *      already let an unauthenticated-shaped request choose this process's
 *      memory use.
 *   2. **Refuse by plan.** FR-016: an input type the plan does not permit is
 *      refused *naming the tier that permits it*, and refused here rather than
 *      at scan creation, so a user on the free tier is told before they wait
 *      for 50 MB to upload... and told again at scan creation, because two
 *      independent checks is the correct number when one of them is a UX
 *      courtesy and the other is the enforcement.
 *   3. **Inspect.** Every FR-015 rule, on metadata, with no filesystem
 *      involved — see `@webaudit/safe-archive`.
 *   4. **Stage.** Only now do the bytes go anywhere, and where they go is
 *      object storage under the user's own prefix, not a directory.
 *   5. **Record a target.** An `ARCHIVE` target whose `canonicalValue` is the
 *      storage key, which is content-addressed — so re-uploading the same
 *      archive resolves to the same target and FR-018's one-target-per-thing
 *      unique index does the deduplication for free.
 *
 * **Why there is no sandbox check here, since the constitution mentions one.**
 * Principle V's "if the sandbox is unavailable, the upload path returns 503"
 * governs FR-027-029 — *capability* code, which the platform executes.
 * `contracts/http-api.md` puts that 503 on `POST /admin/capabilities/upload`
 * and nowhere else. A project archive is read, never run: the three source
 * capabilities parse JSON, count bytes, and match regular expressions against
 * it. Extending the sandbox gate to this path would block US4 on stage 14 for
 * no security gain, and — more to the point — would imply this data is
 * executed, which would be a much worse thing to be wrong about later.
 */

import { createHash } from 'node:crypto';
import {
  ArchiveRefusedError,
  DEFAULT_ARCHIVE_LIMITS,
  inspectArchive,
  readBoundedUpload,
  type ArchiveInspection,
  type ArchiveLimits,
} from '@webaudit/safe-archive';
import type { PrismaClient } from '../../../prisma/generated/client/index.js';
import type { UploadStorage } from '../storage/uploads.js';
import { PlanUpgradeRequiredError } from './create-scan.js';

export interface StageUploadInput {
  readonly userId: string;
  /** For the display name only. Never used to build a path or detect a format. */
  readonly filename: string;
  readonly body: AsyncIterable<Uint8Array>;
}

export interface StageUploadDeps {
  readonly storage: UploadStorage;
  readonly limits?: ArchiveLimits;
}

export interface StagedArchive {
  readonly targetId: string;
  readonly key: string;
  readonly archiveBytes: number;
  readonly fileCount: number;
  readonly totalUncompressedBytes: number;
}

/** FR-016 — refuse an input type the plan does not permit, naming a tier. */
async function assertPlanPermitsArchive(db: PrismaClient, userId: string): Promise<void> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { subscription: { select: { plan: { select: { allowedInputTypes: true } } } } },
  });

  const plan =
    user?.subscription?.plan ??
    (await db.plan.findUniqueOrThrow({
      where: { id: 'free' },
      select: { allowedInputTypes: true },
    }));

  if (plan.allowedInputTypes.includes('ARCHIVE')) return;

  const permitting = await db.plan.findMany({
    where: { isActive: true, allowedInputTypes: { has: 'ARCHIVE' } },
    orderBy: { monthlyCredits: 'asc' },
    select: { id: true },
  });
  throw new PlanUpgradeRequiredError('ARCHIVE', permitting[0]?.id ?? null);
}

/**
 * A display name a user recognises, derived from what they uploaded.
 *
 * The submitted filename is used for *this and nothing else*. It never becomes
 * a path, never selects a parser, and never reaches the filesystem — format
 * detection is by magic bytes and the storage key is a content hash, both
 * inside `safe-archive`. So the only hardening needed is to stop it being a
 * vector into a report or a log line.
 */
function displayNameFrom(filename: string): string {
  const base = filename.split(/[\\/]/).at(-1) ?? 'archive.zip';
  // Control characters removed by code point rather than by regular
  // expression: a `\u0000-\u001f` character class is exactly what `no-control
  // -regex` exists to flag, and the intent reads better as a predicate anyway.
  const cleaned = [...base]
    .filter((character) => {
      const code = character.codePointAt(0) ?? 0;
      return code > 0x1f && code !== 0x7f;
    })
    .join('')
    .trim();
  return cleaned === '' ? 'archive.zip' : cleaned.slice(0, 200);
}

export async function stageArchiveUpload(
  db: PrismaClient,
  input: StageUploadInput,
  deps: StageUploadDeps,
): Promise<StagedArchive> {
  const limits = deps.limits ?? DEFAULT_ARCHIVE_LIMITS;

  const bytes = await readBoundedUpload(input.body, limits);
  await assertPlanPermitsArchive(db, input.userId);

  const inspection: ArchiveInspection = inspectArchive(bytes, limits);

  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const key = await deps.storage.put(input.userId, sha256, bytes);

  // Content-addressed, so the FR-018 unique index on
  // (userId, inputType, canonicalValue) is what deduplicates a re-upload. The
  // display name is refreshed on the way through: a user who renamed the file
  // and uploaded it again means the new name.
  const target = await db.target.upsert({
    where: {
      userId_inputType_canonicalValue: {
        userId: input.userId,
        inputType: 'ARCHIVE',
        canonicalValue: key,
      },
    },
    update: { displayName: displayNameFrom(input.filename) },
    create: {
      userId: input.userId,
      inputType: 'ARCHIVE',
      canonicalValue: key,
      displayName: displayNameFrom(input.filename),
      // An archive is not a live target, so there is nothing to attest control
      // of and nothing a Level 2 check could act against. NONE is correct, and
      // the gate in `resolve.ts` keeps load-generating checks out on its own.
      controlLevel: 'NONE',
    },
    select: { id: true },
  });

  return {
    targetId: target.id,
    key,
    archiveBytes: inspection.archiveBytes,
    fileCount: inspection.fileCount,
    totalUncompressedBytes: inspection.totalUncompressedBytes,
  };
}

export { ArchiveRefusedError };
