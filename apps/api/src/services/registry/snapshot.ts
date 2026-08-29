/**
 * T071 — the per-scan snapshot. R10: "each scan resolves its capability set once
 * at start and holds it for the scan's duration, so an operator toggling a
 * capability mid-scan cannot produce a half-configured audit."
 *
 * This is what makes SC-010 safe rather than merely possible. An operator can
 * enable a capability and have it in front of customers in under an hour with no
 * deploy — and no scan already running suddenly grows a new check halfway
 * through, or loses one, and reports a score computed against two different sets
 * of checks.
 *
 * **Why an excluded capability stays in the snapshot.** The obvious design filters
 * the list down to what will run. That loses the information the report needs.
 * Capability contract guarantee 4: "A capability whose `requiredControlLevel`
 * exceeds the target's level is not invoked, and the check is reported
 * unavailable-pending-verification" — which is US1 scenario 8, and the user has
 * to be told the check exists and what would unlock it. Same for a plan
 * restriction (FR-026, FR-016's "naming the tier that permits it") and for a
 * missing input (FR-021's "report it as not applicable, rather than running it or
 * reporting a pass"). So every candidate is in the snapshot with a status, and
 * only `ELIGIBLE` ones run.
 *
 * **Except disabled ones.** An operator-disabled capability is absent entirely,
 * not reported as unavailable. The user never knew it existed; telling them a
 * check they cannot influence is missing is noise, and telling them *why* would
 * leak an operational decision. This is the one case where filtering is right.
 */

import type { CapabilityLayer, ControlLevel, ModuleType } from '@webaudit/types';
import { controlLevelRank, MODULE_TYPES } from '@webaudit/types';
import type { CapabilityRegistry, RegisteredCapability } from './registry.js';

export const SNAPSHOT_STATUSES = [
  'ELIGIBLE',
  /** Needs a higher control level. Reported unavailable-pending-verification. */
  'BLOCKED_CONTROL_LEVEL',
  /** Not on this plan tier. Reported naming the tier that permits it (FR-026). */
  'BLOCKED_PLAN',
  /** Needs source or a screenshot this scan does not have. NOT_APPLICABLE (FR-021). */
  'NOT_APPLICABLE_INPUT',
] as const;
export type SnapshotStatus = (typeof SNAPSHOT_STATUSES)[number];

export interface SnapshotEntry {
  readonly capabilityId: string;
  readonly name: string;
  readonly version: string;
  readonly module: ModuleType;
  readonly layer: CapabilityLayer;
  readonly status: SnapshotStatus;
  readonly estimatedTokens: number;
  /** What would unlock it, when something could. Null when nothing would. */
  readonly requiredControlLevel: ControlLevel | null;
}

export interface CapabilitySnapshot {
  /** Bumped if the shape of a stored snapshot ever changes. */
  readonly version: 1;
  readonly resolvedAt: string;
  readonly entries: readonly SnapshotEntry[];
}

export interface SnapshotContext {
  readonly planId: string;
  readonly controlLevel: ControlLevel;
  /** Whether source is attached to this scan. */
  readonly hasCode: boolean;
  readonly hasScreenshot: boolean;
  /** Which areas the user asked for. Others are not resolved at all. */
  readonly requestedModules: readonly ModuleType[];
  /** Injected so a snapshot is reproducible in a test. */
  readonly now?: Date;
}

function statusFor(capability: RegisteredCapability, context: SnapshotContext): SnapshotStatus {
  // Order matters, and this is the order the user should hear about things in.
  // A capability their plan does not include is not "pending verification" —
  // telling them to publish a DNS record for a check they cannot run either way
  // would be actively misleading.
  if (
    capability.restrictedToPlans.length > 0 &&
    !capability.restrictedToPlans.includes(context.planId)
  ) {
    return 'BLOCKED_PLAN';
  }
  if (capability.requiresCode && !context.hasCode) return 'NOT_APPLICABLE_INPUT';
  if (capability.requiresScreenshot && !context.hasScreenshot) return 'NOT_APPLICABLE_INPUT';
  if (controlLevelRank(capability.requiredControlLevel) > controlLevelRank(context.controlLevel)) {
    return 'BLOCKED_CONTROL_LEVEL';
  }
  return 'ELIGIBLE';
}

/**
 * Resolve the capability set for one scan, once.
 *
 * The result is stored on `Scan.capabilitySnapshot` and is the audit's record of
 * what actually ran — which is what makes a report reproducible and what
 * FR-082's estimate-versus-actual comparison is computed against.
 */
export function resolveSnapshot(
  registry: CapabilityRegistry,
  context: SnapshotContext,
): CapabilitySnapshot {
  const modules = context.requestedModules.length > 0 ? context.requestedModules : MODULE_TYPES;
  const entries: SnapshotEntry[] = [];

  for (const module of modules) {
    for (const capability of registry.forModule(module)) {
      // The one filter, not a status: see the module note.
      if (!capability.isEnabled) continue;

      const status = statusFor(capability, context);
      entries.push({
        capabilityId: capability.id,
        name: capability.name,
        version: capability.version,
        module: capability.module,
        layer: capability.layer,
        status,
        estimatedTokens: capability.estimatedTokens,
        requiredControlLevel:
          status === 'BLOCKED_CONTROL_LEVEL' ? capability.requiredControlLevel : null,
      });
    }
  }

  return {
    version: 1,
    resolvedAt: (context.now ?? new Date()).toISOString(),
    entries: entries.sort((a, b) => a.capabilityId.localeCompare(b.capabilityId)),
  };
}

/** What will actually be invoked. The runner iterates this, nothing else. */
export function eligibleEntries(
  snapshot: CapabilitySnapshot,
  module?: ModuleType,
): readonly SnapshotEntry[] {
  return snapshot.entries.filter(
    (entry) => entry.status === 'ELIGIBLE' && (module === undefined || entry.module === module),
  );
}

/**
 * The estimate FR-011's quote is built from, and the baseline FR-082 compares
 * actual consumption against. Only eligible entries: a blocked check is not
 * charged for (US1 scenario 8, Principle VI).
 */
export function estimatedTokensFor(snapshot: CapabilitySnapshot): number {
  return eligibleEntries(snapshot).reduce((total, entry) => total + entry.estimatedTokens, 0);
}

/**
 * Which requested areas have nothing eligible to run.
 *
 * Not an error. An area with no runnable check is reported incomplete, its score
 * left null and excluded from the average (FR-053) — which is precisely why
 * disabling any single capability cannot fail an audit (SC-011).
 */
export function modulesWithoutWork(
  snapshot: CapabilitySnapshot,
  requested: readonly ModuleType[],
): readonly ModuleType[] {
  return requested.filter((module) => eligibleEntries(snapshot, module).length === 0);
}
