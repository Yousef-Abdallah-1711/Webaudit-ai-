/**
 * T087 — which capabilities actually run.
 *
 * Three filters, in an order that is not arbitrary. Each answers a different
 * question, and each produces a different thing for the report to say:
 *
 *   1. **Control level** (FR-017). The capability contract's guarantee 4: "A
 *      capability whose `requiredControlLevel` exceeds the target's level is not
 *      invoked, and the check is reported unavailable-pending-verification."
 *      Checked first because it is a property of the target, not of the
 *      capability, and because it must never reach `canRun` — a load-generating
 *      check whose precondition test itself probes the target would have acted
 *      against a target we have no permission for.
 *   2. **`canRun`** (FR-021). "skip a capability whose preconditions are unmet
 *      and report it as not applicable, rather than running it or reporting a
 *      pass." Called exactly once per capability, and never for one the gate
 *      above already excluded.
 *   3. **Layer.** A capability with no `runCodeLayer` has nothing to do in the
 *      code layer; one with no AI-layer method contributes nothing to the prompt.
 *
 * `canRun` is contained like any other capability call. It is documented as
 * synchronous and side-effect free, and the conformance suite checks that — but
 * conformance is checked at registration, and a vendored capability updated in
 * place has not been re-checked. A `canRun` that throws must skip its capability,
 * not fail the area.
 */

import { containCapabilityCall, describeThrown } from '@webaudit/capability-sdk';
import type { AuditCapability, CapabilityInput } from '@webaudit/capability-sdk';
import { controlLevelRank, type ControlLevel } from '@webaudit/types';

export type SkipReason =
  /** FR-017: needs a higher control level. Unavailable pending verification. */
  | 'CONTROL_LEVEL'
  /** FR-021: preconditions unmet. Not applicable. */
  | 'PRECONDITIONS'
  /** `canRun` itself misbehaved. Skipped rather than trusted. */
  | 'CAN_RUN_FAILED';

export interface ResolvedCapability {
  readonly capability: AuditCapability;
  readonly runsCodeLayer: boolean;
  readonly contributesToPrompt: boolean;
}

export interface SkippedCapability {
  readonly capabilityId: string;
  readonly reason: SkipReason;
  /** Shown to the user, so it says what would change the answer. */
  readonly detail: string;
}

export interface Resolution {
  readonly applicable: readonly ResolvedCapability[];
  readonly skipped: readonly SkippedCapability[];
}

export interface ResolveOptions {
  readonly capabilities: readonly AuditCapability[];
  readonly input: CapabilityInput;
  /**
   * Per-capability required level, from the registry snapshot. Absent means
   * NONE — but note that the *registry* is the authority here, not the
   * capability object: a capability cannot lower its own requirement.
   */
  readonly requiredControlLevels?: Readonly<Record<string, ControlLevel>>;
  readonly canRunTimeoutMs?: number;
}

export async function resolveApplicable(options: ResolveOptions): Promise<Resolution> {
  const applicable: ResolvedCapability[] = [];
  const skipped: SkippedCapability[] = [];
  const targetLevel = options.input.controlLevel;
  const timeoutMs = options.canRunTimeoutMs ?? 5_000;

  for (const capability of options.capabilities) {
    const required = options.requiredControlLevels?.[capability.id] ?? 'NONE';

    if (controlLevelRank(required) > controlLevelRank(targetLevel)) {
      skipped.push({
        capabilityId: capability.id,
        reason: 'CONTROL_LEVEL',
        detail:
          `This check needs ${required} control of the target and the target is ${targetLevel}. ` +
          'Verify control by publishing the token to unlock it.',
      });
      continue;
    }

    const outcome = await containCapabilityCall(
      () => Promise.resolve(capability.canRun(options.input)),
      { timeoutMs },
    );

    if (outcome.kind !== 'resolved') {
      skipped.push({
        capabilityId: capability.id,
        reason: 'CAN_RUN_FAILED',
        detail:
          outcome.kind === 'timeout'
            ? 'The check did not answer whether it applies. Skipped rather than run.'
            : `The check errored deciding whether it applies (${describeThrown(outcome.error)}). Skipped rather than run.`,
      });
      continue;
    }

    if (outcome.value !== true) {
      skipped.push({
        capabilityId: capability.id,
        reason: 'PRECONDITIONS',
        detail: 'This check does not apply to what was submitted.',
      });
      continue;
    }

    applicable.push({
      capability,
      runsCodeLayer: typeof capability.runCodeLayer === 'function',
      contributesToPrompt:
        typeof capability.getSystemPromptAddition === 'function' ||
        typeof capability.getContextData === 'function',
    });
  }

  return { applicable, skipped };
}
