/**
 * A ZIP *writer*, for the adverse suite only.
 *
 * The hostile archives T169 needs cannot be produced by any archiving tool: a
 * tool will not write `../../etc/passwd` as a member name, will not declare a
 * size that disagrees with the bytes it wrote, and will not emit a directory
 * entry claiming a member inflates to a gigabyte. Building the bytes by hand is
 * the only way to test that the guard refuses them, and doing it here rather
 * than checking in binary fixtures keeps every hostile property visible in the
 * test that depends on it.
 *
 * CRC-32 is written as zero throughout. `guard.ts` does not verify it — the
 * byte-budget transform is what catches a member that does not match its
 * declaration, and it catches the oversize direction, which is the one that
 * matters. A fixture builder that computed a correct CRC would imply the guard
 * checked it.
 */

import { deflateRawSync } from 'node:zlib';

const SIGNATURE_LOCAL_HEADER = 0x04034b50;
const SIGNATURE_CENTRAL_ENTRY = 0x02014b50;
const SIGNATURE_EOCD = 0x06054b50;

/** High byte 3 = Unix, so the external attributes carry a st_mode. */
const VERSION_MADE_BY_UNIX = 0x0314;
/** High byte 0 = MS-DOS, so they do not. */
const VERSION_MADE_BY_DOS = 0x0014;

export const MODE_REGULAR = 0o100644;
export const MODE_DIRECTORY = 0o040755;
export const MODE_SYMLINK = 0o120777;
export const MODE_FIFO = 0o010644;
export const MODE_CHAR_DEVICE = 0o020644;

export interface ZipEntrySpec {
  /** Written verbatim, including any traversal or absolute prefix. */
  readonly path: string;
  /** Omitted for a directory entry. */
  readonly content?: string | Buffer;
  /** Unix st_mode. Omit for a DOS-authored entry with no mode at all. */
  readonly mode?: number;
  /** Store (0) or deflate (8). Defaults to deflate for content of any size. */
  readonly method?: 0 | 8;
  /** Overrides the true uncompressed size in both headers. For bomb fixtures. */
  readonly declaredUncompressedBytes?: number;
  /** Overrides the true compressed size in both headers. */
  readonly declaredCompressedBytes?: number;
}

interface StagedEntry {
  readonly spec: ZipEntrySpec;
  readonly nameBytes: Buffer;
  readonly payload: Buffer;
  readonly method: number;
  readonly declaredCompressed: number;
  readonly declaredUncompressed: number;
  readonly localHeaderOffset: number;
}

function localHeader(entry: StagedEntry): Buffer {
  const header = Buffer.alloc(30);
  header.writeUInt32LE(SIGNATURE_LOCAL_HEADER, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(0, 6);
  header.writeUInt16LE(entry.method, 8);
  header.writeUInt32LE(0, 14);
  header.writeUInt32LE(entry.declaredCompressed, 18);
  header.writeUInt32LE(entry.declaredUncompressed, 22);
  header.writeUInt16LE(entry.nameBytes.length, 26);
  header.writeUInt16LE(0, 28);
  return Buffer.concat([header, entry.nameBytes]);
}

function centralEntry(entry: StagedEntry): Buffer {
  const record = Buffer.alloc(46);
  const mode = entry.spec.mode;
  record.writeUInt32LE(SIGNATURE_CENTRAL_ENTRY, 0);
  record.writeUInt16LE(mode === undefined ? VERSION_MADE_BY_DOS : VERSION_MADE_BY_UNIX, 4);
  record.writeUInt16LE(20, 6);
  record.writeUInt16LE(0, 8);
  record.writeUInt16LE(entry.method, 10);
  record.writeUInt32LE(0, 16);
  record.writeUInt32LE(entry.declaredCompressed, 20);
  record.writeUInt32LE(entry.declaredUncompressed, 24);
  record.writeUInt16LE(entry.nameBytes.length, 28);
  record.writeUInt16LE(0, 30);
  record.writeUInt16LE(0, 32);
  record.writeUInt16LE(0, 34);
  record.writeUInt16LE(0, 36);
  // st_mode lives in the high 16 bits; the low byte is the DOS attribute set.
  record.writeUInt32LE(mode === undefined ? 0 : (mode << 16) >>> 0, 38);
  record.writeUInt32LE(entry.localHeaderOffset, 42);
  return Buffer.concat([record, entry.nameBytes]);
}

export function buildZip(specs: readonly ZipEntrySpec[]): Buffer {
  const staged: StagedEntry[] = [];
  const body: Buffer[] = [];
  let offset = 0;

  for (const spec of specs) {
    const raw =
      spec.content === undefined
        ? Buffer.alloc(0)
        : Buffer.isBuffer(spec.content)
          ? spec.content
          : Buffer.from(spec.content, 'utf8');

    const method = spec.method ?? (raw.length === 0 ? 0 : 8);
    const payload = method === 8 ? deflateRawSync(raw) : raw;

    const entry: StagedEntry = {
      spec,
      nameBytes: Buffer.from(spec.path, 'latin1'),
      payload,
      method,
      declaredCompressed: spec.declaredCompressedBytes ?? payload.length,
      declaredUncompressed: spec.declaredUncompressedBytes ?? raw.length,
      localHeaderOffset: offset,
    };

    const header = localHeader(entry);
    body.push(header, payload);
    offset += header.length + payload.length;
    staged.push(entry);
  }

  const directory = staged.map(centralEntry);
  const directorySize = directory.reduce((sum, record) => sum + record.length, 0);

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(SIGNATURE_EOCD, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(staged.length, 8);
  eocd.writeUInt16LE(staged.length, 10);
  eocd.writeUInt32LE(directorySize, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...body, ...directory, eocd]);
}

/** A small, entirely ordinary project archive. The positive control. */
export function buildBenignZip(): Buffer {
  return buildZip([
    { path: 'project/', mode: MODE_DIRECTORY },
    {
      path: 'project/package.json',
      content: '{"name":"demo","version":"1.0.0","dependencies":{"left-pad":"1.3.0"}}',
      mode: MODE_REGULAR,
    },
    { path: 'project/src/index.js', content: 'export const answer = 42;\n', mode: MODE_REGULAR },
  ]);
}
