/**
 * T172 — the streaming extraction guard (R7, FR-015).
 *
 * FR-015 in full: "System MUST refuse uploaded archives that exceed the
 * published size limit, are not a supported format, expand beyond a bounded
 * ratio, or contain paths that escape the extraction target — in every case
 * **before extracting content and before charging**."
 *
 * That sentence dictates the shape of this file. There are two entry points and
 * the order between them is the guarantee:
 *
 *   1. `inspectArchive` reads metadata only. It touches no filesystem, creates
 *      nothing, and answers every one of FR-015's four questions. The API calls
 *      it at upload time, before a scan row exists and before a credit moves.
 *   2. `extractArchive` calls `inspectArchive` first — always, never optionally —
 *      and only then writes. Each entry is streamed through a byte counter that
 *      aborts the moment the inflated size passes what the directory declared,
 *      and the partially-written file is removed before the error propagates.
 *
 * **Why the second cap exists even though the first check passed.** The central
 * directory is data supplied by the same person who supplied the bomb. A
 * declared `uncompressedBytes` of 1,024 on an entry that inflates to 4 GiB
 * passes every metadata rule ever written. The only defence is to stop counting
 * on trust and start counting bytes, which is what `writeEntry` does — the
 * stream is destroyed on the first byte past the declaration
 * (`DECLARED_SIZE_MISMATCH`), so the offending bytes never finish landing.
 *
 * **One supported format: ZIP.** A deliberate scope decision, recorded rather
 * than implied. FR-015 requires "are not a supported format" to be a refusal,
 * so the supported set has to be closed and small; a project archive from a
 * browser upload is a zip in practice; and every additional container is a
 * second parser that must be independently proven not to write before it
 * checks. `tar.gz` support belongs to whichever task first has a user who needs
 * it, and it must arrive with its own entry in the T169 suite — a `typeflag`
 * check for symlinks and hardlinks is not the same code as a zip mode check,
 * and sharing this module's tests between them would prove neither.
 *
 * **Nothing here follows a symlink, because nothing here creates one.** Symlink
 * entries are refused outright (`NON_REGULAR_ENTRY`) rather than dereferenced
 * or flattened. R7 is explicit about why: "a symlink is how an archive escapes
 * a directory that path checks alone would protect."
 */

import { createWriteStream } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable, Transform, type TransformCallback } from 'node:stream';
import { createInflateRaw } from 'node:zlib';
import { ARCHIVE_LIMITS } from '@webaudit/config';
import { ArchiveRefusedError } from './errors.js';
import { normaliseEntryPath } from './paths.js';
import {
  COMPRESSION_DEFLATE,
  COMPRESSION_STORE,
  localDataOffset,
  looksLikeZip,
  readCentralDirectory,
  type ZipCentralEntry,
} from './zip.js';

export interface ArchiveLimits {
  readonly maxBytes: number;
  readonly maxRatio: number;
  readonly maxEntries: number;
  readonly maxUncompressedBytes: number;
}

export const DEFAULT_ARCHIVE_LIMITS: ArchiveLimits = ARCHIVE_LIMITS;

/** One member of an archive that has passed every metadata rule. */
export interface InspectedEntry {
  /** Forward-slashed, relative, guaranteed to stay under the extraction root. */
  readonly path: string;
  readonly compressedBytes: number;
  readonly uncompressedBytes: number;
  readonly isDirectory: boolean;
}

export interface ArchiveInspection {
  readonly format: 'zip';
  readonly archiveBytes: number;
  readonly entries: readonly InspectedEntry[];
  readonly fileCount: number;
  readonly totalUncompressedBytes: number;
  /** Total expansion, for the report and for the operator's own judgement. */
  readonly expansionRatio: number;
}

/**
 * The uncompressed budget for this archive.
 *
 * Two rules rather than one, because either alone has a hole. The ratio alone
 * lets a 50 MB archive expand to 5 GB; the ceiling alone lets a 4 KB archive
 * expand to 512 MB, which is the classic bomb. `min` of the two is the only
 * answer that refuses both.
 */
function uncompressedBudget(archiveBytes: number, limits: ArchiveLimits): number {
  return Math.min(archiveBytes * limits.maxRatio, limits.maxUncompressedBytes);
}

/**
 * Is this entry a plain file or a plain directory?
 *
 * A zip written on a DOS or Windows host carries no Unix mode at all, and
 * absence of a mode is not evidence of a regular file — but it is also not
 * evidence of a symlink, and refusing every Windows-authored archive would be
 * a refusal FR-015 does not ask for. So: when a mode is present it must be
 * regular or directory; when it is absent the entry is treated as regular,
 * which is what the format itself means by "no mode".
 */
function assertRegular(entry: ZipCentralEntry, entryPath: string): void {
  if (entry.unixMode === null) return;
  const fileType = entry.unixMode & 0xf000;
  if (fileType === 0 || fileType === 0x8000 || fileType === 0x4000) return;

  const described =
    fileType === 0xa000
      ? 'a symbolic link'
      : fileType === 0x6000
        ? 'a block device'
        : fileType === 0x2000
          ? 'a character device'
          : fileType === 0xc000
            ? 'a socket'
            : fileType === 0x1000
              ? 'a FIFO'
              : `a non-regular entry (mode 0x${fileType.toString(16)})`;

  throw new ArchiveRefusedError('NON_REGULAR_ENTRY', {
    detail: `${described} is never extracted; only files and directories are`,
    entryPath,
  });
}

/**
 * Answer every FR-015 question about an archive without touching a filesystem.
 *
 * Throws `ArchiveRefusedError` on the first violation. Deliberately first, not
 * worst: an archive that is both a bomb and a traversal attempt is refused for
 * whichever rule its earliest member breaks, and reporting one honest reason is
 * more useful than an aggregate.
 */
export function inspectArchive(
  bytes: Uint8Array,
  limits: ArchiveLimits = DEFAULT_ARCHIVE_LIMITS,
): ArchiveInspection {
  if (bytes.byteLength > limits.maxBytes) {
    throw new ArchiveRefusedError('ARCHIVE_TOO_LARGE', {
      detail: 'the upload is larger than the published archive size limit',
      observed: bytes.byteLength,
      limit: limits.maxBytes,
    });
  }

  if (!looksLikeZip(bytes)) {
    throw new ArchiveRefusedError('UNSUPPORTED_FORMAT', {
      detail: 'only zip archives are accepted, and this does not begin like one',
    });
  }

  const directory = readCentralDirectory(bytes);

  if (directory.entries.length > limits.maxEntries) {
    throw new ArchiveRefusedError('TOO_MANY_ENTRIES', {
      detail: 'the archive declares more members than the published limit',
      observed: directory.entries.length,
      limit: limits.maxEntries,
    });
  }

  const budget = uncompressedBudget(bytes.byteLength, limits);
  const entries: InspectedEntry[] = [];
  const seen = new Set<string>();
  let totalUncompressedBytes = 0;
  let fileCount = 0;

  for (const entry of directory.entries) {
    const { path } = normaliseEntryPath(entry.rawPath);
    assertRegular(entry, path);

    // Two members that normalise to one path would have the second overwrite
    // the first — and which one a capability then reads depends on iteration
    // order. Refused rather than resolved.
    //
    // Directories are in this check, not just files, and the case that needs it
    // is a member `a/` beside a member `a`: both normalise to `a`, so the
    // extractor would `mkdir` the first and then open the second for writing at
    // the same path. That surfaces as a raw `EISDIR` from the filesystem rather
    // than as a refusal, which means a crafted archive answers 500 instead of
    // 422 — the one shape of reply that says the *platform* malfunctioned when
    // in fact the archive was hostile and correctly stopped.
    if (seen.has(path)) {
      throw new ArchiveRefusedError('MALFORMED_ARCHIVE', {
        detail: 'two members normalise to the same path',
        entryPath: path,
      });
    }
    seen.add(path);

    if (entry.isDirectory) {
      entries.push({ path, compressedBytes: 0, uncompressedBytes: 0, isDirectory: true });
      continue;
    }

    if (
      entry.compressionMethod !== COMPRESSION_STORE &&
      entry.compressionMethod !== COMPRESSION_DEFLATE
    ) {
      throw new ArchiveRefusedError('UNSUPPORTED_COMPRESSION', {
        detail:
          `compression method ${String(entry.compressionMethod)} is not one this platform ` +
          'will run; store and deflate are',
        entryPath: path,
      });
    }

    totalUncompressedBytes += entry.uncompressedBytes;
    fileCount += 1;

    if (totalUncompressedBytes > budget) {
      throw new ArchiveRefusedError(
        budget === limits.maxUncompressedBytes
          ? 'UNCOMPRESSED_TOO_LARGE'
          : 'EXPANSION_RATIO_EXCEEDED',
        {
          detail:
            'the archive declares more extracted content than the published expansion budget ' +
            `allows for an upload of ${String(bytes.byteLength)} bytes`,
          entryPath: path,
          observed: totalUncompressedBytes,
          limit: budget,
        },
      );
    }

    entries.push({
      path,
      compressedBytes: entry.compressedBytes,
      uncompressedBytes: entry.uncompressedBytes,
      isDirectory: false,
    });
  }

  return {
    format: 'zip',
    archiveBytes: bytes.byteLength,
    entries,
    fileCount,
    totalUncompressedBytes,
    expansionRatio: bytes.byteLength === 0 ? 0 : totalUncompressedBytes / bytes.byteLength,
  };
}

/**
 * A pass-through that counts and refuses.
 *
 * This is the part that makes the guard *streaming* rather than a metadata
 * check with an extraction bolted on. It sits between inflate and the file, so
 * the moment the inflated stream exceeds either the entry's own declaration or
 * the archive's remaining budget, the pipeline errors and the write stream is
 * destroyed — mid-file, before the rest of the bomb reaches the disk.
 */
class ByteBudget extends Transform {
  private written = 0;

  constructor(
    private readonly entryPath: string,
    private readonly declared: number,
    private readonly remainingBudget: number,
  ) {
    super();
  }

  override _transform(chunk: Buffer, _encoding: BufferEncoding, done: TransformCallback): void {
    this.written += chunk.byteLength;

    if (this.written > this.declared) {
      done(
        new ArchiveRefusedError('DECLARED_SIZE_MISMATCH', {
          detail:
            'the member expanded past the size its own directory entry declared; the ' +
            'extraction was aborted part-way',
          entryPath: this.entryPath,
          observed: this.written,
          limit: this.declared,
        }),
      );
      return;
    }

    if (this.written > this.remainingBudget) {
      done(
        new ArchiveRefusedError('EXPANSION_RATIO_EXCEEDED', {
          detail: 'the archive expanded past the published budget part-way through a member',
          entryPath: this.entryPath,
          observed: this.written,
          limit: this.remainingBudget,
        }),
      );
      return;
    }

    done(null, chunk);
  }
}

export interface ExtractOptions {
  /** Where the archive's contents go. Created if absent; must not be shared. */
  readonly destRoot: string;
  readonly limits?: ArchiveLimits;
  /**
   * Leading path segments to drop from every member.
   *
   * Exists for one real case: a repository zipball wraps the whole tree in a
   * single `owner-repo-<sha>/` directory, and leaving it in place would mean
   * every capability's glob had to know the commit hash. Applied strictly
   * *after* path validation, so it can only ever shorten an already-safe path —
   * it is a convenience, never a second chance for a member to escape. A member
   * with no segments left after the strip is the container directory itself and
   * is skipped.
   */
  readonly stripComponents?: number;
}

export interface ExtractionResult {
  readonly inspection: ArchiveInspection;
  /** Workspace-relative paths of the regular files actually written. */
  readonly files: readonly string[];
  readonly bytesWritten: number;
}

/**
 * Resolve a validated entry path against the destination root, and confirm the
 * result is still under it.
 *
 * Belt and braces on top of `normaliseEntryPath`, and worth the four lines: the
 * two checks fail differently. The string check catches a hostile path; this
 * one catches a bug in the string check.
 */
function destinationFor(destRoot: string, entryPath: string): string {
  const root = resolve(destRoot);
  const absolute = resolve(root, entryPath);
  if (absolute !== root && !absolute.startsWith(root + sep)) {
    throw new ArchiveRefusedError('PATH_ESCAPES_ROOT', {
      detail: 'the member resolves outside the extraction root',
      entryPath,
    });
  }
  return absolute;
}

/**
 * Extract, having first refused.
 *
 * `inspectArchive` runs unconditionally at the top. There is no option to skip
 * it and no separate "already inspected" fast path, because the one thing that
 * must never be possible is an extraction whose caller forgot to validate.
 */
export async function extractArchive(
  bytes: Uint8Array,
  options: ExtractOptions,
): Promise<ExtractionResult> {
  const limits = options.limits ?? DEFAULT_ARCHIVE_LIMITS;
  const inspection = inspectArchive(bytes, limits);
  const budget = uncompressedBudget(bytes.byteLength, limits);

  const root = resolve(options.destRoot);
  await mkdir(root, { recursive: true });

  /**
   * Parsed once, indexed by the same normal form `inspection` reports.
   *
   * This used to be a `readCentralDirectory(bytes)` plus a `.find()` *inside*
   * the loop, which is quadratic in the member count and re-normalises every
   * path on every lookup. At the published ceiling of 20,000 members that is
   * 400 million string operations to extract an archive that broke no rule —
   * and 20,000 files is an ordinary monorepo, not an attack. The cost landed on
   * exactly the legitimate input the guard is supposed to let through.
   *
   * The key is unambiguous because `inspectArchive` has already refused any
   * archive whose members collide after normalisation.
   */
  const central = new Map<string, ZipCentralEntry>();
  for (const candidate of readCentralDirectory(bytes).entries) {
    central.set(normaliseEntryPath(candidate.rawPath).path, candidate);
  }

  const strip = options.stripComponents ?? 0;
  const files: string[] = [];
  let bytesWritten = 0;

  for (const entry of inspection.entries) {
    const stripped = strip === 0 ? entry.path : entry.path.split('/').slice(strip).join('/');
    if (stripped === '') continue;

    const absolute = destinationFor(root, stripped);

    if (entry.isDirectory) {
      await mkdir(absolute, { recursive: true });
      continue;
    }

    await mkdir(dirname(absolute), { recursive: true });

    const member = central.get(entry.path);
    /* c8 ignore next 4 -- inspection derived `entry` from this same directory. */
    if (member === undefined) {
      throw new ArchiveRefusedError('MALFORMED_ARCHIVE', {
        detail: 'a member present at inspection is no longer in the central directory',
        entryPath: entry.path,
      });
    }

    const start = localDataOffset(bytes, member);
    const compressed = Buffer.from(bytes.buffer, bytes.byteOffset + start, member.compressedBytes);

    const source = Readable.from([compressed]);
    const budgeted = new ByteBudget(entry.path, entry.uncompressedBytes, budget - bytesWritten);
    const sink = createWriteStream(absolute, { flags: 'wx' });

    try {
      await (member.compressionMethod === COMPRESSION_DEFLATE
        ? pipeline(source, createInflateRaw(), budgeted, sink)
        : pipeline(source, budgeted, sink));
    } catch (error) {
      // The partial file is removed before the error leaves this function. An
      // aborted bomb that left half a gigabyte behind would have achieved most
      // of what it set out to do.
      await rm(absolute, { force: true });
      throw error;
    }

    bytesWritten += entry.uncompressedBytes;
    files.push(stripped);
  }

  return { inspection, files, bytesWritten };
}

/**
 * Read an upload stream, refusing past the published size without ever holding
 * more than the limit in memory.
 *
 * The size limit is the one FR-015 rule that cannot wait for `inspectArchive`,
 * because reaching `inspectArchive` at all means having accepted the bytes. A
 * caller that buffered the request body first and measured afterwards has
 * already let an attacker choose how much memory this process uses.
 */
export async function readBoundedUpload(
  source: AsyncIterable<Uint8Array>,
  limits: ArchiveLimits = DEFAULT_ARCHIVE_LIMITS,
): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let total = 0;

  for await (const chunk of source) {
    total += chunk.byteLength;
    if (total > limits.maxBytes) {
      throw new ArchiveRefusedError('ARCHIVE_TOO_LARGE', {
        detail: 'the upload exceeded the published archive size limit and was cut off',
        observed: total,
        limit: limits.maxBytes,
      });
    }
    chunks.push(Buffer.from(chunk));
  }

  return Buffer.concat(chunks);
}
