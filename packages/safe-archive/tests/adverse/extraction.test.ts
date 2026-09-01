/**
 * T169 — FR-015's refusals, stated adversarially.
 *
 * "System MUST refuse uploaded archives that exceed the published size limit,
 * are not a supported format, expand beyond a bounded ratio, or contain paths
 * that escape the extraction target — **in every case before extracting content
 * and before charging**."
 *
 * The final clause is what most of this file is about. It is not enough for a
 * hostile archive to be refused; it must be refused with nothing on disk. Every
 * refusal case below therefore extracts into a fresh empty directory and then
 * asserts that directory is *still empty* — a guard that unpacked the bomb and
 * then deleted it would pass a naive "did it throw" test and fail FR-015.
 *
 * `inspectArchive` is exercised separately from `extractArchive` for the same
 * reason. The API refuses at upload time, before a scan row exists, using
 * metadata only; if that path needed a filesystem it could not run where it
 * has to run.
 *
 * There is a positive control at the bottom. A guard that refused everything
 * would pass every other test in this file, which would make the suite a wall
 * rather than a lock.
 */

import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  ArchiveRefusedError,
  DEFAULT_ARCHIVE_LIMITS,
  extractArchive,
  inspectArchive,
  readBoundedUpload,
  type ArchiveLimits,
  type ArchiveRefusalReason,
} from '@webaudit/safe-archive';
import {
  buildBenignZip,
  buildZip,
  MODE_CHAR_DEVICE,
  MODE_DIRECTORY,
  MODE_FIFO,
  MODE_REGULAR,
  MODE_SYMLINK,
} from '../helpers/build-zip.js';

let destRoot: string;

beforeEach(async () => {
  destRoot = await mkdtemp(join(tmpdir(), 'webaudit-archive-'));
});

afterEach(async () => {
  await rm(destRoot, { recursive: true, force: true });
});

/** Recursively — a traversal that landed one level down is still a landing. */
async function everythingUnder(root: string): Promise<string[]> {
  const found: string[] = [];
  const walk = async (dir: string, prefix: string): Promise<void> => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const rel = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
      found.push(rel);
      if (entry.isDirectory()) await walk(join(dir, entry.name), rel);
    }
  };
  await walk(root, '');
  return found;
}

/**
 * Asserts on `reason`, not on the message. A refusal that happened for an
 * unrelated reason would otherwise pass and prove nothing — the whole point of
 * a typed reason code is that the suite can insist on which rule fired.
 */
function assertRefusal(caught: unknown, reason: ArchiveRefusalReason): ArchiveRefusedError {
  expect(caught, 'the archive was accepted').toBeInstanceOf(ArchiveRefusedError);
  const refusal = caught as ArchiveRefusedError;
  expect(refusal.reason, `refused, but as ${refusal.reason}: ${refusal.detail}`).toBe(reason);
  return refusal;
}

function expectInspectRefusal(
  archive: Buffer,
  reason: ArchiveRefusalReason,
  limits?: ArchiveLimits,
): ArchiveRefusedError {
  let caught: unknown = null;
  try {
    inspectArchive(archive, limits);
  } catch (error) {
    caught = error;
  }
  return assertRefusal(caught, reason);
}

async function expectRefusal(
  archive: Buffer,
  reason: ArchiveRefusalReason,
  limits?: ArchiveLimits,
): Promise<ArchiveRefusedError> {
  const caught = await extractArchive(archive, {
    destRoot,
    ...(limits === undefined ? {} : { limits }),
  }).then(
    () => null,
    (error: unknown) => error,
  );

  return assertRefusal(caught, reason);
}

describe('FR-015: oversize archives', () => {
  it('refuses an archive larger than the published limit, by metadata alone', () => {
    const archive = buildZip([{ path: 'a.txt', content: 'x'.repeat(4096), mode: MODE_REGULAR }]);
    const tiny: ArchiveLimits = { ...DEFAULT_ARCHIVE_LIMITS, maxBytes: 64 };

    const refusal = expectInspectRefusal(archive, 'ARCHIVE_TOO_LARGE', tiny);
    expect(refusal.limit).toBe(64);
  });

  it('cuts an upload off mid-stream rather than buffering past the limit', async () => {
    const limits: ArchiveLimits = { ...DEFAULT_ARCHIVE_LIMITS, maxBytes: 1024 };
    let chunksRead = 0;

    // A synchronous generator wrapped as an async iterable, rather than an
    // `async function*`: nothing here awaits, and a real upload stream is
    // pushed at us anyway. The shape under test is the consumer's.
    function* chunks(): Generator<Uint8Array> {
      for (;;) {
        chunksRead += 1;
        yield Buffer.alloc(256, 0x41);
      }
    }
    const endlessUpload = (): AsyncIterable<Uint8Array> => ({
      [Symbol.asyncIterator]: () => {
        const iterator = chunks();
        return { next: () => Promise.resolve(iterator.next()) };
      },
    });

    const caught = await readBoundedUpload(endlessUpload(), limits).then(
      () => null,
      (error: unknown) => error,
    );
    assertRefusal(caught, 'ARCHIVE_TOO_LARGE');
    // Five 256-byte chunks is the first total past 1024. A guard that measured
    // after buffering would have read for ever.
    expect(chunksRead).toBe(5);
  });

  it('writes nothing when the size limit is what refused it', async () => {
    const archive = buildZip([{ path: 'a.txt', content: 'x'.repeat(4096), mode: MODE_REGULAR }]);
    await expectRefusal(archive, 'ARCHIVE_TOO_LARGE', {
      ...DEFAULT_ARCHIVE_LIMITS,
      maxBytes: 64,
    });
    expect(await everythingUnder(destRoot)).toEqual([]);
  });
});

describe('FR-015: unsupported formats', () => {
  it('refuses a gzip tarball, detected from its magic bytes and not its name', async () => {
    // 1f 8b 08 — a gzip member header. A realistic upload, and a format this
    // platform has deliberately not implemented a guard for yet.
    const tarball = Buffer.concat([Buffer.from([0x1f, 0x8b, 0x08, 0x00]), Buffer.alloc(64)]);
    const refusal = await expectRefusal(tarball, 'UNSUPPORTED_FORMAT');
    expect(refusal.message).toContain('zip');
    expect(await everythingUnder(destRoot)).toEqual([]);
  });

  it('refuses a renamed executable', async () => {
    const elf = Buffer.concat([Buffer.from([0x7f, 0x45, 0x4c, 0x46]), Buffer.alloc(256)]);
    await expectRefusal(elf, 'UNSUPPORTED_FORMAT');
  });

  it('refuses an archive using a compression method it will not run', () => {
    // 14 is LZMA. Structurally a valid zip; the decompressor is the problem.
    const archive = buildZip([
      { path: 'a.txt', content: 'payload', mode: MODE_REGULAR, method: 8 },
    ]);
    // Patch both the local and the central method field to LZMA.
    archive.writeUInt16LE(14, 8);
    const centralOffset = archive.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
    archive.writeUInt16LE(14, centralOffset + 10);

    expectInspectRefusal(archive, 'UNSUPPORTED_COMPRESSION');
  });
});

describe('FR-015: bomb ratios', () => {
  it('refuses a declared expansion past the ratio without inflating anything', async () => {
    // 8 KiB of zeroes deflates to almost nothing, and the entry then *declares*
    // 64 MiB. Nothing needs to be inflated to know this is refused.
    const archive = buildZip([
      {
        path: 'bomb.bin',
        content: Buffer.alloc(8192, 0),
        mode: MODE_REGULAR,
        declaredUncompressedBytes: 64 * 1024 * 1024,
      },
    ]);

    await expectRefusal(archive, 'EXPANSION_RATIO_EXCEEDED');
    expect(await everythingUnder(destRoot)).toEqual([]);
  });

  it('refuses cumulative expansion across members, not just a single fat one', async () => {
    const entries = Array.from({ length: 40 }, (_, index) => ({
      path: `chunk-${String(index)}.bin`,
      content: Buffer.alloc(64, 0),
      mode: MODE_REGULAR,
      declaredUncompressedBytes: 200_000,
    }));

    await expectRefusal(buildZip(entries), 'EXPANSION_RATIO_EXCEEDED');
    expect(await everythingUnder(destRoot)).toEqual([]);
  });

  it('refuses an absolute uncompressed size even when the ratio is honest', () => {
    const archive = buildZip([
      {
        path: 'huge.bin',
        content: Buffer.alloc(4096, 0),
        mode: MODE_REGULAR,
        declaredUncompressedBytes: 40_000,
      },
    ]);
    // A ratio high enough that the ratio rule cannot be what refuses this, and
    // a ceiling low enough that the ceiling rule must be.
    const limits: ArchiveLimits = {
      ...DEFAULT_ARCHIVE_LIMITS,
      maxRatio: 1_000_000,
      maxUncompressedBytes: 10_000,
    };

    expectInspectRefusal(archive, 'UNCOMPRESSED_TOO_LARGE', limits);
  });

  it('aborts mid-member when the directory lied about a size', async () => {
    // The declaration passes every metadata rule; the stream does not match it.
    // This is the case a metadata-only guard cannot see, and the reason the
    // byte budget exists downstream of inflate.
    const archive = buildZip([
      {
        path: 'liar.bin',
        content: Buffer.alloc(600_000, 0x41),
        mode: MODE_REGULAR,
        declaredUncompressedBytes: 512,
      },
    ]);

    const refusal = await expectRefusal(archive, 'DECLARED_SIZE_MISMATCH');
    expect(refusal.entryPath).toBe('liar.bin');
    // The partially-written file is removed before the error propagates.
    expect(await everythingUnder(destRoot)).toEqual([]);
  });
});

describe('FR-015: traversal paths', () => {
  const traversals = [
    ['a relative climb', '../escaped.txt'],
    ['a deep relative climb', 'src/../../../escaped.txt'],
    ['a backslash climb', '..\\..\\escaped.txt'],
    ['a climb hidden mid-path', 'ok/./../../escaped.txt'],
  ] as const;

  it.each(traversals)('refuses %s and writes nothing', async (_label, path) => {
    const archive = buildZip([
      { path: 'project/keep.txt', content: 'kept', mode: MODE_REGULAR },
      { path, content: 'owned', mode: MODE_REGULAR },
    ]);

    await expectRefusal(archive, 'PATH_ESCAPES_ROOT');
    // Note what this asserts: not merely that the *escaping* member was not
    // written, but that the benign member before it was not written either.
    // Refusal is of the archive, not of one entry — a half-extracted upload is
    // a source tree the user never uploaded.
    expect(await everythingUnder(destRoot)).toEqual([]);
  });

  const absolutes = [
    ['a rooted unix path', '/etc/cron.d/pwn'],
    ['a windows drive path', 'C:\\Windows\\System32\\pwn.dll'],
    ['a UNC path', '//attacker/share/pwn'],
  ] as const;

  it.each(absolutes)('refuses %s and writes nothing', async (_label, path) => {
    await expectRefusal(
      buildZip([{ path, content: 'owned', mode: MODE_REGULAR }]),
      'ABSOLUTE_PATH',
    );
    expect(await everythingUnder(destRoot)).toEqual([]);
  });

  it('refuses a NUL-truncated path', async () => {
    await expectRefusal(
      buildZip([{ path: 'safe.txt\0/../../etc/passwd', content: 'x', mode: MODE_REGULAR }]),
      'MALFORMED_ARCHIVE',
    );
  });
});

describe('FR-015 / R7: symlinks and other non-regular members', () => {
  it('refuses a symlink rather than creating or following it', async () => {
    // The classic escape: every path here is relative and inside the root, so
    // path validation alone accepts the archive. The link target is what leaves.
    const archive = buildZip([
      { path: 'project/etc', content: '/etc', mode: MODE_SYMLINK },
      { path: 'project/etc/passwd', content: 'owned', mode: MODE_REGULAR },
    ]);

    const refusal = await expectRefusal(archive, 'NON_REGULAR_ENTRY');
    expect(refusal.message).toContain('symbolic link');
    expect(await everythingUnder(destRoot)).toEqual([]);
  });

  it.each([
    ['a FIFO', MODE_FIFO],
    ['a character device', MODE_CHAR_DEVICE],
  ])('refuses %s', async (_label, mode) => {
    await expectRefusal(buildZip([{ path: 'weird', content: '', mode }]), 'NON_REGULAR_ENTRY');
    expect(await everythingUnder(destRoot)).toEqual([]);
  });

  it('still accepts an archive written on a host that records no mode at all', () => {
    // A zip from Windows Explorer carries no st_mode. Absent is not "symlink",
    // and refusing every DOS-authored archive is a refusal FR-015 never asked
    // for.
    const archive = buildZip([{ path: 'notes.txt', content: 'plain' }]);
    expect(inspectArchive(archive).fileCount).toBe(1);
  });
});

describe('FR-015: entry counts and structural damage', () => {
  it('refuses more members than the published limit', () => {
    const archive = buildZip(
      Array.from({ length: 12 }, (_, index) => ({
        path: `f${String(index)}.txt`,
        content: 'x',
        mode: MODE_REGULAR,
      })),
    );
    expectInspectRefusal(archive, 'TOO_MANY_ENTRIES', { ...DEFAULT_ARCHIVE_LIMITS, maxEntries: 5 });
  });

  it('refuses two members that normalise to one path', () => {
    const archive = buildZip([
      { path: 'src/app.js', content: 'first', mode: MODE_REGULAR },
      { path: './src/app.js', content: 'second', mode: MODE_REGULAR },
    ]);
    expectInspectRefusal(archive, 'MALFORMED_ARCHIVE');
  });

  it('refuses a directory and a file that claim the same path', async () => {
    // The collision the file-only duplicate check missed. `src/` and `src`
    // normalise identically, so the extractor made the directory and then
    // opened the same path for writing: an `EISDIR` from the filesystem rather
    // than a refusal, which reaches the route as a 500. A hostile archive must
    // never be able to make the platform look like the thing that broke.
    const archive = buildZip([
      { path: 'src/', mode: MODE_DIRECTORY },
      { path: 'src', content: 'not a directory', mode: MODE_REGULAR },
    ]);

    expectInspectRefusal(archive, 'MALFORMED_ARCHIVE');
    await expectRefusal(archive, 'MALFORMED_ARCHIVE');
    expect(await everythingUnder(destRoot)).toEqual([]);
  });

  it('refuses a truncated archive rather than extracting what it can read', async () => {
    const archive = buildBenignZip();
    await expectRefusal(archive.subarray(0, archive.length - 40), 'MALFORMED_ARCHIVE');
    expect(await everythingUnder(destRoot)).toEqual([]);
  });
});

describe('the positive control', () => {
  it('extracts an ordinary project archive', async () => {
    const result = await extractArchive(buildBenignZip(), { destRoot });

    expect(result.files).toEqual(['project/package.json', 'project/src/index.js']);
    expect(await readFile(join(destRoot, 'project/src/index.js'), 'utf8')).toBe(
      'export const answer = 42;\n',
    );
    expect(result.inspection.fileCount).toBe(2);
  });

  it('reports what it found without extracting, for the pre-charge check', () => {
    const inspection = inspectArchive(buildBenignZip());

    expect(inspection.format).toBe('zip');
    expect(inspection.entries.map((entry) => entry.path)).toContain('project/package.json');
    expect(inspection.totalUncompressedBytes).toBeGreaterThan(0);
    expect(inspection.expansionRatio).toBeGreaterThan(0);
  });

  it('extracts a directory member as a directory', async () => {
    await extractArchive(buildZip([{ path: 'empty/', mode: MODE_DIRECTORY }]), { destRoot });
    expect(await everythingUnder(destRoot)).toEqual(['empty']);
  });
});
