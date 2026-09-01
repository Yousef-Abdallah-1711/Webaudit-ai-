/**
 * A ZIP central-directory reader, written here rather than taken from a library.
 *
 * **Why hand-rolled.** Every extraction library in the ecosystem is built to
 * extract: you hand it a destination and it writes files. FR-015 requires the
 * opposite order — "in every case **before** extracting content" — so what this
 * module exposes is a *reader of metadata* with no filesystem access at all.
 * `guard.ts` decides; this file only reports what the archive claims about
 * itself. Bolting a refusal check onto a library's entry callback would put the
 * decision after the library had already opened a write stream, which is the
 * shape R7 explicitly rules out.
 *
 * **The central directory, not the local headers.** A streamed ZIP reader walks
 * local file headers front to back, and a local header may legally declare
 * sizes of zero and defer them to a data descriptor written *after* the entry's
 * bytes (general-purpose flag bit 3). A reader in that position cannot know how
 * large an entry is until it has already read it — which is exactly the
 * position FR-015 forbids. The central directory at the end of the file carries
 * authoritative sizes for every member, so reading it first is what makes
 * "every limit before any byte" achievable rather than aspirational.
 *
 * The local headers are still read at extraction time, and the inflated byte
 * count is still capped against the central directory's declared size — a
 * directory that lies is the obvious way past a metadata-only check, and
 * `DECLARED_SIZE_MISMATCH` is the answer to it.
 */

import { ArchiveRefusedError } from './errors.js';

const SIGNATURE_EOCD = 0x06054b50;
const SIGNATURE_ZIP64_EOCD_LOCATOR = 0x07064b50;
const SIGNATURE_CENTRAL_ENTRY = 0x02014b50;
const SIGNATURE_LOCAL_HEADER = 0x04034b50;

/** Length of the fixed part of an End Of Central Directory record. */
const EOCD_FIXED_BYTES = 22;
/** The trailing comment may be up to 64 KiB, so the EOCD can be that far back. */
const EOCD_MAX_SEARCH_BYTES = EOCD_FIXED_BYTES + 0xffff;

export const COMPRESSION_STORE = 0;
export const COMPRESSION_DEFLATE = 8;

/** What the archive claims about one member. Nothing here has been verified. */
export interface ZipCentralEntry {
  /** Exactly as stored, before any normalisation. `guard.ts` validates it. */
  readonly rawPath: string;
  readonly compressedBytes: number;
  readonly uncompressedBytes: number;
  readonly compressionMethod: number;
  readonly localHeaderOffset: number;
  /** Trailing `/`, or a Unix directory mode. */
  readonly isDirectory: boolean;
  /**
   * The Unix mode from the high 16 bits of the external attributes, when the
   * archive was made on a Unix-like system. `null` when it was not — a DOS or
   * Windows zip carries no mode, and absence is not evidence of a regular file.
   */
  readonly unixMode: number | null;
}

export interface ZipDirectory {
  readonly entries: readonly ZipCentralEntry[];
}

function malformed(detail: string): ArchiveRefusedError {
  return new ArchiveRefusedError('MALFORMED_ARCHIVE', { detail });
}

/** Whether the buffer starts with a ZIP local-header or empty-archive signature. */
export function looksLikeZip(bytes: Uint8Array): boolean {
  if (bytes.length < 4) return false;
  const signature = Buffer.from(bytes.buffer, bytes.byteOffset, 4).readUInt32LE(0);
  // `PK\x03\x04` for an archive with members; `PK\x05\x06` for an empty one.
  return signature === SIGNATURE_LOCAL_HEADER || signature === SIGNATURE_EOCD;
}

function findEocdOffset(buffer: Buffer): number {
  const searchFrom = Math.max(0, buffer.length - EOCD_MAX_SEARCH_BYTES);
  // Backwards: the last EOCD-looking signature is the real one. A file whose
  // *content* happens to contain the signature would otherwise win.
  for (let offset = buffer.length - EOCD_FIXED_BYTES; offset >= searchFrom; offset -= 1) {
    if (buffer.readUInt32LE(offset) === SIGNATURE_EOCD) return offset;
  }
  throw malformed('no end-of-central-directory record; this is not a readable zip');
}

/**
 * Read the central directory.
 *
 * Zip64 is refused rather than parsed. A Zip64 archive exists to carry more
 * than 65,535 members or more than 4 GiB, and both of those are already past
 * `ARCHIVE_LIMITS` — supporting the format would mean writing a second parser
 * that can only ever produce refusals.
 */
export function readCentralDirectory(bytes: Uint8Array): ZipDirectory {
  const buffer = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (buffer.length < EOCD_FIXED_BYTES) {
    throw malformed('shorter than an empty zip archive');
  }

  const eocd = findEocdOffset(buffer);

  if (eocd >= 20 && buffer.readUInt32LE(eocd - 20) === SIGNATURE_ZIP64_EOCD_LOCATOR) {
    throw new ArchiveRefusedError('UNSUPPORTED_FORMAT', {
      detail:
        'this is a Zip64 archive; its capacity is only needed past the published size and ' +
        'entry-count limits, so it is refused rather than parsed',
    });
  }

  const entryCount = buffer.readUInt16LE(eocd + 10);
  const directorySize = buffer.readUInt32LE(eocd + 12);
  const directoryOffset = buffer.readUInt32LE(eocd + 16);

  if (directoryOffset + directorySize > buffer.length) {
    throw malformed('the central directory extends past the end of the file');
  }

  const entries: ZipCentralEntry[] = [];
  let cursor = directoryOffset;

  for (let index = 0; index < entryCount; index += 1) {
    if (cursor + 46 > buffer.length) {
      throw malformed(`central directory entry ${String(index)} is truncated`);
    }
    if (buffer.readUInt32LE(cursor) !== SIGNATURE_CENTRAL_ENTRY) {
      throw malformed(`central directory entry ${String(index)} has a bad signature`);
    }

    const versionMadeBy = buffer.readUInt16LE(cursor + 4);
    const compressionMethod = buffer.readUInt16LE(cursor + 10);
    const compressedBytes = buffer.readUInt32LE(cursor + 20);
    const uncompressedBytes = buffer.readUInt32LE(cursor + 24);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const externalAttributes = buffer.readUInt32LE(cursor + 38);
    const localHeaderOffset = buffer.readUInt32LE(cursor + 42);

    const nameStart = cursor + 46;
    const nameEnd = nameStart + nameLength;
    if (nameEnd > buffer.length) {
      throw malformed(`central directory entry ${String(index)} has a truncated name`);
    }
    // Latin1 rather than utf8: a name is a byte sequence to be validated, and
    // utf8 decoding would silently replace an invalid sequence with U+FFFD,
    // turning a path this code must reject into one it cannot see properly.
    const rawPath = buffer.toString('latin1', nameStart, nameEnd);

    // The high byte of `versionMadeBy` is the host system; 3 is Unix. Only then
    // do the top 16 bits of the external attributes carry a st_mode.
    const unixMode = versionMadeBy >> 8 === 3 ? (externalAttributes >>> 16) & 0xffff : null;

    entries.push({
      rawPath,
      compressedBytes,
      uncompressedBytes,
      compressionMethod,
      localHeaderOffset,
      isDirectory: rawPath.endsWith('/') || (unixMode !== null && (unixMode & 0xf000) === 0x4000),
      unixMode,
    });

    cursor = nameEnd + extraLength + commentLength;
  }

  return { entries };
}

/**
 * Where an entry's compressed bytes begin.
 *
 * The local header's own name and extra-field lengths are read rather than the
 * central directory's: the two are permitted to differ, and trusting the wrong
 * one lands the read a few bytes into the compressed stream, which inflate then
 * reports as corruption rather than as the parsing bug it is.
 */
export function localDataOffset(bytes: Uint8Array, entry: ZipCentralEntry): number {
  const buffer = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const header = entry.localHeaderOffset;
  if (header + 30 > buffer.length) {
    throw malformed(`the local header for "${entry.rawPath}" is past the end of the file`);
  }
  if (buffer.readUInt32LE(header) !== SIGNATURE_LOCAL_HEADER) {
    throw malformed(`the local header for "${entry.rawPath}" has a bad signature`);
  }
  const nameLength = buffer.readUInt16LE(header + 26);
  const extraLength = buffer.readUInt16LE(header + 28);
  const dataStart = header + 30 + nameLength + extraLength;
  if (dataStart + entry.compressedBytes > buffer.length) {
    throw malformed(`the data for "${entry.rawPath}" is truncated`);
  }
  return dataStart;
}
