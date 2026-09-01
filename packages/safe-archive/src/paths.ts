/**
 * Entry-path validation, separated from the guard so it can be reasoned about
 * (and tested) on its own.
 *
 * R7 names the two rules that matter and the reason they are separate: "path
 * normalisation against the extraction root, refusal of absolute paths and
 * traversal segments" **and** "refusal of symlinks ... Symlink refusal matters
 * specifically because a symlink is how an archive escapes a directory that
 * path checks alone would protect." Symlinks are handled in `guard.ts`, where
 * the entry's mode is available; everything here is about the string.
 *
 * The validation is deliberately stricter than "resolve it and see where it
 * lands". A resolve-and-compare check accepts `a/../b` because it lands inside
 * the root — but accepting it means the extractor must then create, and later
 * destroy, whatever `a` turns out to be. Refusing any archive that contains a
 * `..` segment at all costs nothing (no real build tool emits one) and removes
 * a whole class of ordering bug.
 */

import { ArchiveRefusedError } from './errors.js';

/** Windows drive-letter prefix, e.g. `C:\` or `c:/`. */
const DRIVE_LETTER = /^[A-Za-z]:[\\/]?/;

export interface NormalisedEntryPath {
  /** Forward-slashed, relative, with no `.` or `..` segments. */
  readonly path: string;
  /** Path segments, for a caller that needs to create parent directories. */
  readonly segments: readonly string[];
}

/**
 * Validate one archive member path and return it in the single normal form the
 * rest of the pipeline uses. Throws rather than returning a result type: every
 * caller's response to a bad path is to abandon the archive.
 */
export function normaliseEntryPath(rawPath: string): NormalisedEntryPath {
  if (rawPath.includes('\0')) {
    throw new ArchiveRefusedError('MALFORMED_ARCHIVE', {
      detail: 'an entry path contains a NUL byte',
      entryPath: rawPath.replace(/\0/g, '\\0'),
    });
  }

  // Backslash is a path separator on the extraction host even when the archive
  // was written somewhere it is not, so it is normalised *before* the traversal
  // check rather than after — `..\\..\\etc` must not read as one long segment.
  const unified = rawPath.replace(/\\/g, '/');

  if (unified.startsWith('/') || DRIVE_LETTER.test(unified) || unified.startsWith('//')) {
    throw new ArchiveRefusedError('ABSOLUTE_PATH', {
      detail: 'an archive member may not name an absolute location',
      entryPath: rawPath,
    });
  }

  const segments = unified.split('/').filter((segment) => segment !== '' && segment !== '.');

  if (segments.includes('..')) {
    throw new ArchiveRefusedError('PATH_ESCAPES_ROOT', {
      detail: 'an archive member may not contain a ".." segment',
      entryPath: rawPath,
    });
  }

  if (segments.length === 0) {
    throw new ArchiveRefusedError('MALFORMED_ARCHIVE', {
      detail: 'an archive member has an empty path',
      entryPath: rawPath,
    });
  }

  return { path: segments.join('/'), segments };
}
