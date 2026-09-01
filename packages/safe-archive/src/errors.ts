/**
 * One error type for every archive refusal, carrying which rule refused and why.
 *
 * Modelled on `@webaudit/safe-net`'s `SsrfRefusedError` deliberately: the
 * `reason` is part of the contract rather than debug detail, because the T169
 * adverse suite asserts on it. A case that passed by being refused for an
 * unrelated reason would prove nothing — "the bomb was rejected" is only
 * meaningful if it was rejected *as a bomb*.
 *
 * Callers upstream turn this into a user-facing message and, per Principle VI,
 * decline to charge for the attempt (FR-015: "in every case before extracting
 * content and before charging").
 */

export type ArchiveRefusalReason =
  /** The archive itself is larger than the published limit. */
  | 'ARCHIVE_TOO_LARGE'
  /** Not a format we support. Detected from magic bytes, never the filename. */
  | 'UNSUPPORTED_FORMAT'
  /** Structurally broken: truncated, bad signature, unreadable directory. */
  | 'MALFORMED_ARCHIVE'
  /** More members than the published limit. */
  | 'TOO_MANY_ENTRIES'
  /** Total or per-entry expansion past the published ratio. A zip bomb. */
  | 'EXPANSION_RATIO_EXCEEDED'
  /** Uncompressed content exceeds the published absolute ceiling. */
  | 'UNCOMPRESSED_TOO_LARGE'
  /** An entry path that is absolute, or names a drive, or is a UNC path. */
  | 'ABSOLUTE_PATH'
  /** An entry path that climbs out of the extraction root. */
  | 'PATH_ESCAPES_ROOT'
  /** A symlink, hardlink, device, socket, or FIFO. Never extracted. */
  | 'NON_REGULAR_ENTRY'
  /** A compression method we will not run. */
  | 'UNSUPPORTED_COMPRESSION'
  /**
   * The stream produced more bytes than the entry's own header declared.
   * A central directory that lies is the way past a metadata-only check.
   */
  | 'DECLARED_SIZE_MISMATCH';

export interface ArchiveRefusalDetail {
  /** Human-readable specifics. Never contains archive content. */
  readonly detail: string;
  /** The member this is about, when it is about one. */
  readonly entryPath?: string;
  /** The measured value that broke the rule, and the limit it broke. */
  readonly observed?: number;
  readonly limit?: number;
}

export class ArchiveRefusedError extends Error {
  override readonly name = 'ArchiveRefusedError';
  readonly reason: ArchiveRefusalReason;
  readonly detail: string;
  readonly entryPath: string | undefined;
  readonly observed: number | undefined;
  readonly limit: number | undefined;

  constructor(reason: ArchiveRefusalReason, detail: ArchiveRefusalDetail) {
    super(
      detail.entryPath === undefined
        ? `Refused the archive: ${reason} — ${detail.detail}`
        : `Refused the archive at "${detail.entryPath}": ${reason} — ${detail.detail}`,
    );
    this.reason = reason;
    this.detail = detail.detail;
    this.entryPath = detail.entryPath;
    this.observed = detail.observed;
    this.limit = detail.limit;
  }
}

export function isArchiveRefusal(error: unknown): error is ArchiveRefusedError {
  return error instanceof ArchiveRefusedError;
}
