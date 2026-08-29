/**
 * T100 — every realtime event, per
 * [contracts/realtime-and-internal.md](../../../specs/001-webaudit-mvp-baseline/contracts/realtime-and-internal.md)
 * §1.
 *
 * Declared here, in the dependency-free types package, because three processes
 * need to agree on them: the worker publishes, the API fans out, and `apps/web`
 * renders. A type duplicated across those three is a defect (CLAUDE.md), and a
 * type that lives in the worker would make the web app depend on the queue.
 *
 * **No Zod here, deliberately.** Validation belongs at the boundary, and the
 * boundary is where an event arrives off Redis — `apps/api/.../realtime/fanout.ts`
 * parses it there. Putting schemas in this package would mean `apps/web` pulls
 * Zod in to render a progress bar, and the whole reason this package exists is
 * that rendering a severity badge should not require the database layer or the
 * queue.
 *
 * **What is deliberately absent from every payload:** findings, evidence, and
 * anything lifted from the target. The contract is explicit — "Events carry no
 * secret material and no raw target content. `module:complete` carries counts and
 * scores, not findings — findings are fetched over HTTP where authorisation is
 * uniform." A socket is a fan-out channel whose authorisation was checked once at
 * subscribe; HTTP re-checks on every request. Putting findings on the socket
 * would move the report onto the weaker path, and it would route target content
 * around the redaction boundary.
 */

import type { ControlLevel, ModuleState, ModuleType, ScanState } from './domain.js';

export const SCAN_EVENT_TYPES = [
  'scan:state',
  'module:started',
  'module:complete',
  'module:degraded',
  'module:skipped',
  'check:unavailable',
  'questionnaire:needed',
  'scan:complete',
  'scan:failed',
  'issue:verified',
] as const;

export type ScanEventType = (typeof SCAN_EVENT_TYPES)[number];

/** FR-044: progress as it happens, without the user refreshing. */
export interface ScanStateEvent {
  readonly type: 'scan:state';
  readonly scanId: string;
  readonly state: ScanState;
  /** 0-100. Derived from completed areas, never from elapsed time. */
  readonly progressPercent: number;
}

/** FR-045: each area's individual state. */
export interface ModuleStartedEvent {
  readonly type: 'module:started';
  readonly scanId: string;
  readonly module: ModuleType;
}

/**
 * FR-033 and FR-045. Counts and scores only — see the module note on why
 * findings are not here.
 */
export interface ModuleCompleteEvent {
  readonly type: 'module:complete';
  readonly scanId: string;
  readonly module: ModuleType;
  readonly state: ModuleState;
  /** Null for an area that did not complete. Never coerced to zero (FR-053). */
  readonly score: number | null;
  readonly issueCount: number;
}

/** FR-035: the area delivered measurements without interpretation. */
export interface ModuleDegradedEvent {
  readonly type: 'module:degraded';
  readonly scanId: string;
  readonly module: ModuleType;
  readonly reason: string;
}

/** FR-021: not applicable, which is not the same as failed. */
export interface ModuleSkippedEvent {
  readonly type: 'module:skipped';
  readonly scanId: string;
  readonly module: ModuleType;
  readonly reason: string;
}

/**
 * FR-017 and US1 scenario 8: unavailable pending verification.
 *
 * Carries the level that would unlock it, so the client can say what to do
 * rather than only that something is missing.
 */
export interface CheckUnavailableEvent {
  readonly type: 'check:unavailable';
  readonly scanId: string;
  readonly module: ModuleType;
  readonly checkId: string;
  readonly requiredControlLevel: ControlLevel;
}

/** FR-040 and FR-046: the user's input is needed to continue. */
export interface QuestionnaireNeededEvent {
  readonly type: 'questionnaire:needed';
  readonly scanId: string;
  readonly questions: readonly {
    readonly id: string;
    readonly prompt: string;
    readonly kind: 'text' | 'choice' | 'colors';
    readonly choices?: readonly string[];
  }[];
  /**
   * ISO 8601. After this the scan resumes on documented defaults (FR-041), so
   * the client can show a countdown rather than an open-ended wait.
   */
  readonly deadline: string;
}

export interface ScanCompleteEvent {
  readonly type: 'scan:complete';
  readonly scanId: string;
  /** Null when no area produced a score. Not zero (FR-053). */
  readonly overallScore: number | null;
  readonly reportUrl: string;
}

/** FR-075: a failure says what was refunded, because we never charge for ours. */
export interface ScanFailedEvent {
  readonly type: 'scan:failed';
  readonly scanId: string;
  readonly reason: string;
  readonly creditsRefunded: number;
}

/** FR-060: the outcome of a re-verification, and the state it produced. */
export interface IssueVerifiedEvent {
  readonly type: 'issue:verified';
  readonly issueId: string;
  /** Present so the fan-out can route it to the scan's room. */
  readonly scanId: string;
  readonly outcome: 'PASSED' | 'FAILED' | 'UNVERIFIABLE';
  readonly state: 'OPEN' | 'ASSERTED_FIXED' | 'RESOLVED' | 'UNVERIFIABLE';
}

export type ScanEvent =
  | ScanStateEvent
  | ModuleStartedEvent
  | ModuleCompleteEvent
  | ModuleDegradedEvent
  | ModuleSkippedEvent
  | CheckUnavailableEvent
  | QuestionnaireNeededEvent
  | ScanCompleteEvent
  | ScanFailedEvent
  | IssueVerifiedEvent;

/**
 * The envelope on the wire.
 *
 * `scanId` is duplicated out of the event on purpose: the fan-out routes on it
 * and must not have to know the shape of ten payloads to find it. `emittedAt`
 * lets a client drop an event older than the state it already fetched over HTTP,
 * which is the reconnect gap FR-047 describes.
 */
export interface ScanEventEnvelope {
  readonly scanId: string;
  /** ISO 8601, set by the worker at publish time. */
  readonly emittedAt: string;
  readonly event: ScanEvent;
}

/** The single Redis pub/sub channel. One channel, filtered by the API. */
export const SCAN_EVENTS_CHANNEL = 'webaudit:scan-events';

/**
 * The room a socket joins. Derived, never client-supplied — a client that could
 * name its own room could name someone else's.
 */
export function scanRoom(scanId: string): string {
  return `scan:${scanId}`;
}

export function isScanEventType(value: unknown): value is ScanEventType {
  return typeof value === 'string' && (SCAN_EVENT_TYPES as readonly string[]).includes(value);
}
