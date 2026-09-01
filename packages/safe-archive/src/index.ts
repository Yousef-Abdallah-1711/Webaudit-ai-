/**
 * R7 / FR-015 — the only sanctioned way an uploaded archive is inspected or
 * extracted.
 *
 * The package boundary is the point. `apps/api` inspects before charging;
 * `apps/worker` extracts into a scan workspace. Neither reaches a zip parser
 * directly, exactly as neither reaches a network client without going through
 * `@webaudit/safe-net` — a guarantee enforced by there being one door is worth
 * more than the same guarantee written in a review checklist.
 */

export {
  DEFAULT_ARCHIVE_LIMITS,
  extractArchive,
  inspectArchive,
  readBoundedUpload,
  type ArchiveInspection,
  type ArchiveLimits,
  type ExtractOptions,
  type ExtractionResult,
  type InspectedEntry,
} from './guard.js';

export {
  ArchiveRefusedError,
  isArchiveRefusal,
  type ArchiveRefusalDetail,
  type ArchiveRefusalReason,
} from './errors.js';

export { normaliseEntryPath, type NormalisedEntryPath } from './paths.js';
