/**
 * Shared domain enums and contracts.  (T022)
 *
 * Hand-declared rather than re-exported from the generated Prisma client, for
 * two reasons: `apps/web` must not depend on the database layer to render a
 * severity badge, and `packages/capability-sdk` must be usable by a capability
 * that has no database access at all (R1 — the sandbox has no credentials).
 *
 * These names are kept identical to the Prisma enums in
 * apps/api/prisma/schema.prisma. A mismatch is a defect; T035 onward asserts
 * they agree.
 */

// ─── Audit shape ──────────────────────────────────────────────────────────────

export const MODULE_TYPES = ['PERFORMANCE', 'SECURITY', 'UI', 'TESTING', 'SEO'] as const;
export type ModuleType = (typeof MODULE_TYPES)[number];

export const CAPABILITY_LAYERS = ['CODE', 'AI', 'BOTH'] as const;
export type CapabilityLayer = (typeof CAPABILITY_LAYERS)[number];

/** Derived from the discovery root, never self-declared by a manifest (R10). */
export const TRUST_LEVELS = ['VENDORED', 'INSTALLED'] as const;
export type TrustLevel = (typeof TRUST_LEVELS)[number];

export const INPUT_TYPES = ['URL', 'REPOSITORY', 'ARCHIVE'] as const;
export type InputType = (typeof INPUT_TYPES)[number];

/** Two escalating levels of established control over a target (FR-017). */
export const CONTROL_LEVELS = ['NONE', 'ATTESTED', 'VERIFIED'] as const;
export type ControlLevel = (typeof CONTROL_LEVELS)[number];

/**
 * Where a control level sits in the ordering CONTROL_LEVELS declares.
 * The single implementation every gating check compares against — do not
 * re-derive this locally; a second copy is how the ordering drifts.
 */
export function controlLevelRank(level: ControlLevel): number {
  return CONTROL_LEVELS.indexOf(level);
}

/** How a user may demonstrate control to reach Level 2 (FR-017). */
export const VERIFICATION_METHODS = ['FILE', 'DNS'] as const;
export type VerificationMethod = (typeof VERIFICATION_METHODS)[number];

// ─── Scan lifecycle ───────────────────────────────────────────────────────────

export const SCAN_KINDS = ['INITIAL', 'READINESS'] as const;
export type ScanKind = (typeof SCAN_KINDS)[number];

export const SCAN_STATES = [
  'QUEUED',
  'RUNNING_PHASE_1',
  'AWAITING_QUESTIONNAIRE',
  'RUNNING_PHASE_2',
  'RUNNING_PHASE_3',
  'RUNNING_MASTER',
  'RUNNING_DOCS',
  'COMPLETED',
  'FAILED',
  'CANCELLED',
  'TIMED_OUT',
] as const;
export type ScanState = (typeof SCAN_STATES)[number];

/** A scan in this state holds no worker slot (R4). */
export const SCAN_STATES_TERMINAL = ['COMPLETED', 'FAILED', 'CANCELLED', 'TIMED_OUT'] as const;

export const MODULE_STATES = [
  'PENDING',
  'RUNNING',
  'COMPLETE',
  'DEGRADED',
  'FAILED',
  'NOT_APPLICABLE',
] as const;
export type ModuleState = (typeof MODULE_STATES)[number];

/**
 * FR-053: an area that did not complete must not be scored. Only these two
 * states carry a score; the rest leave it null and are excluded from the
 * overall average.
 */
export const MODULE_STATES_SCORED = ['COMPLETE', 'DEGRADED'] as const;

// ─── Findings ─────────────────────────────────────────────────────────────────

export const SEVERITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'] as const;
export type Severity = (typeof SEVERITIES)[number];

/** Descending order. Drives the fixes board and report ordering (FR-049). */
export const SEVERITY_ORDER: Readonly<Record<Severity, number>> = {
  CRITICAL: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
  INFO: 4,
};

/** Blocks a readiness verdict while outstanding (FR-066). */
export const SEVERITIES_BLOCKING = ['CRITICAL', 'HIGH'] as const;

/**
 * FR-032 / SC-006. Assigned by the module runner from the layer that produced
 * the finding — a capability cannot label its own guess as a measurement.
 */
export const ATTRIBUTIONS = ['MEASURED', 'AI_JUDGMENT'] as const;
export type Attribution = (typeof ATTRIBUTIONS)[number];

/**
 * What a capability returns, per contracts/capability-contract.md.
 *
 * Lives here rather than in `packages/capability-sdk` because more than one
 * package produces one: `packages/redaction` raises findings for credentials it
 * removed (T062) without depending on the capability SDK, and `apps/web` renders
 * them without depending on either. T063 defines `AuditCapability` around this
 * type; it must not redeclare it.
 *
 * Note the absence of `attribution`. The module runner assigns MEASURED to
 * code-layer findings and AI_JUDGMENT to AI-layer ones, so a capability cannot
 * label its own guess as a measurement (FR-032, SC-006).
 */
export interface CapabilityFinding {
  /** Which check produced this. Routes re-verification (FR-059). */
  readonly checkId: string;
  /** Deterministic identity, computed by the producer (R3, FR-064). */
  readonly fingerprintParts: readonly string[];
  readonly severity: Severity;
  readonly title: string;
  readonly description: string;
  readonly location?: string;
  readonly evidence?: Readonly<Record<string, unknown>>;
  readonly consequence?: string;
  readonly fixable: boolean;
}

export const ISSUE_STATES = [
  'OPEN',
  'ASSERTED_FIXED',
  'RESOLVED',
  'UNVERIFIABLE',
  'REOPENED',
] as const;
export type IssueState = (typeof ISSUE_STATES)[number];

export const VERIFICATION_OUTCOMES = ['PASSED', 'FAILED', 'UNVERIFIABLE', 'ERRORED'] as const;
export type VerificationOutcome = (typeof VERIFICATION_OUTCOMES)[number];

/**
 * SC-007, as a type. `RESOLVED` has exactly one inbound edge and its only
 * trigger is a passing check. No user action appears on the right-hand side.
 */
export const ISSUE_STATE_TRANSITIONS: Readonly<Record<IssueState, readonly IssueState[]>> = {
  OPEN: ['ASSERTED_FIXED'],
  ASSERTED_FIXED: ['RESOLVED', 'OPEN', 'UNVERIFIABLE'],
  RESOLVED: ['REOPENED'],
  UNVERIFIABLE: ['ASSERTED_FIXED'],
  REOPENED: ['ASSERTED_FIXED'],
};

// ─── Credits ──────────────────────────────────────────────────────────────────

export const CREDIT_KINDS = ['PLAN', 'PURCHASED'] as const;
export type CreditKind = (typeof CREDIT_KINDS)[number];

export const LOT_SOURCES = [
  'FREE_GRANT',
  'PLAN_RENEWAL',
  'PURCHASE',
  'REFUND',
  'PROMOTIONAL',
] as const;
export type LotSource = (typeof LOT_SOURCES)[number];

export const TX_TYPES = ['GRANT', 'DEBIT', 'REFUND', 'EXPIRE'] as const;
export type TxType = (typeof TX_TYPES)[number];

export const SUBSCRIPTION_STATUSES = ['ACTIVE', 'PAST_DUE', 'CANCELLED', 'EXPIRED'] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

/** Two figures, never one. A balance is derived from lots, never stored. */
export interface CreditBalance {
  readonly plan: number;
  readonly purchased: number;
  readonly planExpiresAt: Date | null;
}

// ─── Providers ────────────────────────────────────────────────────────────────

export const AI_OUTCOMES = [
  'SUCCESS',
  'SCHEMA_INVALID',
  'RATE_LIMITED',
  'TIMEOUT',
  'ERROR',
] as const;
export type AiOutcome = (typeof AI_OUTCOMES)[number];

export const INTENT_SOURCES = ['SUPPLIED', 'SKIPPED', 'DEFAULTED'] as const;
export type IntentSource = (typeof INTENT_SOURCES)[number];

// ─── Guards ───────────────────────────────────────────────────────────────────

export function isSeverity(v: unknown): v is Severity {
  return typeof v === 'string' && (SEVERITIES as readonly string[]).includes(v);
}

export function isModuleType(v: unknown): v is ModuleType {
  return typeof v === 'string' && (MODULE_TYPES as readonly string[]).includes(v);
}

export function isBlockingSeverity(s: Severity): boolean {
  return (SEVERITIES_BLOCKING as readonly Severity[]).includes(s);
}

export function isScoredState(s: ModuleState): boolean {
  return (MODULE_STATES_SCORED as readonly ModuleState[]).includes(s);
}

export function canTransition(from: IssueState, to: IssueState): boolean {
  return ISSUE_STATE_TRANSITIONS[from].includes(to);
}
