/**
 * Shared constants. Values traceable to the specification, not invented here.
 * The credit cost schedule lands in ./pricing.ts at T043.
 */

/** Viewports the design system was measured at (DESIGN.md §3). */
export const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  tablet: { width: 768, height: 1024 },
  mobile: { width: 390, height: 844 },
} as const;

/** Visual-regression threshold, constitution v1.1.0 Design Adherence. */
export const VISUAL_DIFF_THRESHOLD = 0.005;

/**
 * FR-015 — archive intake bounds.
 *
 * `maxUncompressedBytes` (T172) is an absolute ceiling that `maxRatio` alone
 * does not provide. A 50 MB archive at the permitted 100× ratio would be 5 GB
 * of extracted source, which is a denial of the worker's disk even though every
 * per-entry rule was obeyed. The effective uncompressed budget is therefore
 * `min(archiveBytes * maxRatio, maxUncompressedBytes)` — the ratio catches a
 * small archive that explodes, the ceiling catches a large archive that
 * expands honestly. 512 MB is comfortably above any real project checkout and
 * far below anything that would fill a scan workspace.
 */
export const ARCHIVE_LIMITS = {
  maxBytes: 52_428_800,
  maxRatio: 100,
  maxEntries: 20_000,
  maxUncompressedBytes: 536_870_912,
} as const;

/** FR-028 — untrusted execution bounds. */
export const SANDBOX_LIMITS = {
  wallClockMs: 30_000,
  memoryMb: 256,
} as const;

/** Principle IV — a chain must span at least this many distinct vendors. */
export const MIN_PROVIDER_VENDORS = 2;

/**
 * FR-017 — the target control gate.
 *
 * `level1ProbeRate` is the "published request rate" FR-017 requires Level 1
 * probing to be bounded to regardless of attestation. **The specification does
 * not state a number**, so these are engineering defaults pending a product
 * decision (recorded in research.md open items and PROGRESS.md). They are
 * placed here rather than inside the limiter because a rate hidden in code is
 * not published.
 *
 * 4 requests per second sustained with a burst of 12 is roughly one determined
 * human browsing: enough to observe caching, auth, and rate-limiting behaviour,
 * far too little to constitute load. Anything above it needs Level 2.
 */
export const CONTROL_GATE = {
  /** Where a FILE verification token must be published, relative to the origin. */
  verificationFilePath: '/.well-known/webaudit-verification.txt',
  /** DNS label prefixed to the target host for a TXT verification record. */
  dnsRecordPrefix: '_webaudit-verification',
  /** Entropy of an issued token, in bytes, before base64url encoding. */
  tokenBytes: 32,
  /** A pending token stops being confirmable after this long. */
  tokenTtlMs: 7 * 24 * 60 * 60 * 1000,
  level1ProbeRate: {
    maxRequestsPerSecond: 4,
    burst: 12,
  },
} as const;

/**
 * FR-071 — the per-area score a readiness pass must reach for a *go* verdict.
 *
 * spec.md's Assumptions section: "The per-area scores required for a go verdict
 * are published to users in advance rather than being determined per audit."
 * The specification does **not** state the numbers, so these are engineering
 * defaults pending a product decision — recorded as an open decision in
 * PROGRESS.md, and placed here rather than inside the verdict logic because a
 * threshold hidden in code is not "published."
 *
 * They mirror the same "measured before inferred" ranking the product's voice
 * takes: SECURITY and PERFORMANCE carry the most user/business consequence and
 * are held highest; UI and SEO are held a step lower because a design or
 * search-visibility shortfall is a growth cost, not a launch blocker. The
 * per-area formula (`packages/scoring`) deducts 25 per CRITICAL / 12 per HIGH,
 * so an 80 threshold means "no more than one unresolved HIGH-equivalent of
 * measured debt," which is the spirit of FR-066's blocking severities.
 */
export const READINESS_THRESHOLDS = {
  PERFORMANCE: 80,
  SECURITY: 80,
  UI: 70,
  TESTING: 75,
  SEO: 70,
} as const;
