/**
 * T088 — concurrent, isolated code-layer execution.
 *
 * R13: "run all code-layer capabilities concurrently, each isolated so one
 * rejection cannot fail the batch". The isolation is `containCapabilityCall`, the
 * same wrapper the conformance suite checks capabilities against — one
 * implementation, so the suite's promise that it tests the runner's mechanism is
 * literally true.
 *
 * **`Promise.all` would be wrong here and it is worth saying why**, because it is
 * the obvious way to write "run these concurrently". `Promise.all` rejects on the
 * first rejection and abandons the rest: one capability throwing would lose the
 * findings of every capability that had not yet resolved. That is exactly the
 * failure FR-022 and SC-011 forbid. Containment happens *inside* each task, so by
 * the time the array is awaited there are no rejections left to short-circuit on
 * — every entry is a result.
 *
 * **Global `fetch` is poisoned for the duration.** Principle III says the code
 * layer costs zero tokens, and FR-025 restricts audit egress. The realistic
 * violation is not an SDK import — eslint stops that — it is a capability
 * reaching the network outside `ctx`. Poisoning records the attempt and denies
 * it, so it becomes a reportable fact about that capability rather than silent
 * unmetered traffic.
 *
 * Attribution of a violation uses `AsyncLocalStorage`. The first version of this
 * file credited every concurrently-running capability with any call, which would
 * report innocent capabilities as violating FR-025 — worse than not reporting at
 * all, because an operator would disable the wrong check. The store follows the
 * async context across `await` boundaries, so the capability that called is the
 * capability recorded.
 *
 * A caveat stated rather than hidden: the poison is process-wide for the window
 * the code layer runs in, so this is safe only because the code layer is the one
 * thing running in that window. When the orchestrator runs several modules
 * concurrently (FR-033), poisoning must move to the sandbox boundary or the
 * modules must share one code-layer phase. Recorded in PROGRESS as an open item
 * for 2J.
 */

import {
  containCapabilityCall,
  currentCapabilityId,
  describeThrown,
  runAsCapability,
} from '@webaudit/capability-sdk';
import type { AuditCapability, CapabilityInput, CodeLayerContext } from '@webaudit/capability-sdk';
import { isSeverity } from '@webaudit/types';
import type { CapabilityFinding } from '@webaudit/types';
import type { ResolvedCapability } from './resolve.js';

export interface CodeLayerOutcome {
  readonly capabilityId: string;
  readonly succeeded: boolean;
  /** Empty on failure. Never partially populated. */
  readonly findings: readonly CapabilityFinding[];
  readonly durationMs: number;
  readonly errorMessage?: string;
  /** URLs the capability tried to reach outside `ctx`. Normally empty. */
  readonly egressViolations: readonly string[];
}

export interface CodeLayerOptions {
  readonly applicable: readonly ResolvedCapability[];
  readonly input: CapabilityInput;
  readonly makeContext: (signal: AbortSignal, capabilityId: string) => CodeLayerContext;
  readonly timeoutMs: number;
}

/** Distinguishes "no evidence" from "evidence we cannot use". */
const UNUSABLE = Symbol('unusable-evidence');

/**
 * Evidence, flattened to something every downstream serialiser can handle.
 *
 * Evidence is the one field a capability fills with an arbitrary object, and
 * three separate places later call `JSON.stringify` on it — the fix prompt, the
 * prompt's measured-findings block, and persistence. A circular reference or a
 * BigInt throws in all three, and the natural shape for a UI or TESTING check is
 * a DOM-ish or AST-ish node that holds a parent back-reference. Round-tripping
 * here means the throw happens once, at the boundary, where it can be blamed on
 * the capability that caused it.
 */
function usableEvidence(value: unknown): Readonly<Record<string, unknown>> | undefined | symbol {
  if (value === undefined) return undefined;
  if (typeof value !== 'object' || value === null) return UNUSABLE;
  try {
    return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
  } catch {
    return UNUSABLE;
  }
}

/**
 * A finding array, or nothing — **snapshotted, not merely inspected**.
 *
 * A capability that resolves with a string, an object, or an array containing
 * something that is not a finding has failed, not succeeded oddly. Accepting
 * partial results would put unvalidated shapes into the report and into the
 * prompt.
 *
 * Two things this does that the first version did not, both found by probing
 * rather than by reading:
 *
 * **It validates every field it later relies on, not four of them.** Checking
 * `typeof severity === 'string'` let an invented severity through to
 * `SEVERITY_WEIGHT[...]`, which is `undefined`, which makes the area's score
 * `NaN`. Since `NaN !== null` the area then counted toward the overall score and
 * the whole audit's number became `NaN` — and `score Int?` rejects it, so a
 * scoring defect surfaced hours later as a failed write. Likewise a numeric
 * `fingerprintParts` element reached `Buffer.from(part, 'utf8')` and a numeric
 * `location` reached `.trim()`; both threw out of `runModule`, which promises it
 * never throws.
 *
 * **It copies.** Validation used to read each field once and the finding was
 * read again later by attribution and by the prompt renderer, so a Proxy or a
 * getter could return one value to the check and another to the use — validated
 * as HIGH, persisted as anything. Building a fresh literal from values read
 * exactly once closes that, and it also means a getter that throws on its second
 * read throws here, inside the containment, rather than three files away.
 *
 * Rejecting the whole array rather than dropping the bad entry is deliberate and
 * matches the paragraph above: a capability that produced one unusable finding
 * has a defect, and reporting its other findings as if nothing happened hides
 * that from the operator who could fix it.
 */
function asFindings(value: unknown): readonly CapabilityFinding[] | null {
  if (!Array.isArray(value)) return null;

  const snapshot: CapabilityFinding[] = [];
  try {
    for (const entry of value) {
      if (typeof entry !== 'object' || entry === null) return null;
      const candidate = entry as Partial<CapabilityFinding>;

      const checkId = candidate.checkId;
      if (typeof checkId !== 'string' || checkId === '') return null;

      const parts = candidate.fingerprintParts;
      if (!Array.isArray(parts)) return null;
      // Every element, not just the array: `Buffer.from` is what consumes these.
      if (!parts.every((part) => typeof part === 'string')) return null;

      const severity = candidate.severity;
      if (!isSeverity(severity)) return null;

      const title = candidate.title;
      if (typeof title !== 'string' || title === '') return null;

      const description = candidate.description;
      if (typeof description !== 'string') return null;

      const location = candidate.location;
      if (location !== undefined && typeof location !== 'string') return null;

      const consequence = candidate.consequence;
      if (consequence !== undefined && typeof consequence !== 'string') return null;

      const evidence = usableEvidence(candidate.evidence);
      if (typeof evidence === 'symbol') return null;

      snapshot.push({
        checkId,
        fingerprintParts: [...parts],
        severity,
        title,
        description,
        ...(location === undefined ? {} : { location }),
        ...(consequence === undefined ? {} : { consequence }),
        ...(evidence === undefined ? {} : { evidence }),
        // Absent means not fixable. A truthy non-boolean is not a claim we honour.
        fixable: candidate.fixable === true,
      });
    }
  } catch {
    // A throwing getter is a malformed finding like any other, and the
    // capability that supplied it is the one that gets blamed.
    return null;
  }

  return snapshot;
}

/**
 * The `globalThis.fetch` poison is **process-wide and reference-counted**
 * (review finding H3). The orchestrator runs a phase's modules concurrently
 * (FR-033), so two `runCodeLayer` calls overlap; a per-call save/restore let
 * module A's `finally` un-poison `fetch` while module B's capabilities were
 * still running, silently disabling FR-025 enforcement for the rest of B.
 *
 * Instead: the first concurrent entrant installs the poison, the last to leave
 * restores it, and violations are collected in one shared map keyed by
 * `currentCapabilityId()` — which propagates correctly across the concurrent
 * async contexts (`capability-context.ts`), so an attempt is still attributed
 * to exactly the capability that made it.
 */
const egressViolations = new Map<string, string[]>();
let realFetchRef: typeof globalThis.fetch | undefined;
let poisonDepth = 0;

const poisonedFetch = ((...args: unknown[]): never => {
  const url = typeof args[0] === 'string' ? args[0] : describeThrown(args[0]);
  const id = currentCapabilityId() ?? '(unattributed)';
  const bucket = egressViolations.get(id) ?? [];
  bucket.push(url);
  egressViolations.set(id, bucket);
  throw new Error(
    'The code layer must reach the network only through ctx.fetch, which is SSRF-guarded ' +
      '(FR-025, Principle III).',
  );
}) as unknown as typeof globalThis.fetch;

function installPoison(): void {
  if (poisonDepth++ === 0) {
    realFetchRef = globalThis.fetch;
    globalThis.fetch = poisonedFetch;
  }
}

function removePoison(): void {
  poisonDepth = Math.max(0, poisonDepth - 1);
  if (poisonDepth === 0 && realFetchRef !== undefined) {
    globalThis.fetch = realFetchRef;
    realFetchRef = undefined;
  }
}

export async function runCodeLayer(
  options: CodeLayerOptions,
): Promise<readonly CodeLayerOutcome[]> {
  const runnable = options.applicable.filter((entry) => entry.runsCodeLayer);
  if (runnable.length === 0) return [];

  const violations = egressViolations;
  // Start every runnable capability from a clean slate — a previous phase's
  // (unattributed) or a re-run of the same id must not carry over.
  for (const entry of runnable) violations.delete(entry.capability.id);

  installPoison();
  try {
    // Every task contains its own failure, so nothing here can reject and
    // `Promise.all` cannot short-circuit. See the module note.
    return await Promise.all(
      runnable.map(async (entry): Promise<CodeLayerOutcome> => {
        const capability: AuditCapability = entry.capability;
        const controller = new AbortController();
        const context = options.makeContext(controller.signal, capability.id);

        const outcome = await containCapabilityCall(
          () =>
            runAsCapability(capability.id, () => capability.runCodeLayer!(options.input, context)),
          { timeoutMs: options.timeoutMs },
        );

        // Abort on the way out, whatever happened. A capability that timed out
        // is still running, and its context's signal is how it learns to stop.
        if (outcome.kind !== 'resolved') controller.abort();

        const egressViolations = violations.get(capability.id) ?? [];

        if (outcome.kind === 'timeout') {
          return {
            capabilityId: capability.id,
            succeeded: false,
            findings: [],
            durationMs: outcome.durationMs,
            errorMessage: `did not finish within ${String(options.timeoutMs)}ms`,
            egressViolations,
          };
        }
        if (outcome.kind === 'rejected') {
          return {
            capabilityId: capability.id,
            succeeded: false,
            findings: [],
            durationMs: outcome.durationMs,
            errorMessage: describeThrown(outcome.error),
            egressViolations,
          };
        }

        const findings = asFindings(outcome.value);
        if (findings === null) {
          return {
            capabilityId: capability.id,
            succeeded: false,
            findings: [],
            durationMs: outcome.durationMs,
            errorMessage: 'returned something that is not an array of findings',
            egressViolations,
          };
        }

        return {
          capabilityId: capability.id,
          succeeded: true,
          findings,
          durationMs: outcome.durationMs,
          egressViolations,
        };
      }),
    );
  } finally {
    // Decrement the refcount. `fetch` is only restored once the last concurrent
    // module's code layer has finished — leaving it poisoned while another
    // module still runs is the whole point (H3).
    removePoison();
  }
}
