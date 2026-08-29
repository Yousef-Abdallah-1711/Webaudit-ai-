/**
 * The module runner. R13's strict order, in one function.
 *
 *   resolve applicable → run all code-layer capabilities concurrently, each
 *   isolated → merge findings → assemble one prompt → one AI call → attribute →
 *   resolve state
 *
 * The order is not stylistic. FR-030 requires "all deterministic measurement for
 * an area before any AI interpretation of that area begins", and the AI layer's
 * prompt is built *from* the merged code-layer output — so the phases cannot
 * overlap even if someone wanted them to. `layer-ordering.test.ts` asserts it on
 * an observed timeline rather than by reading this file, because the failure mode
 * is an AI call that starts while the slowest capability is still going.
 *
 * `runModule` never throws. Everything below it is contained, and the state
 * machine in `state.ts` has an answer for every combination — including the ones
 * that look like they should be exceptions, such as every capability failing at
 * once. A throw here would propagate to the orchestrator, and one capability's
 * defect would fail an audit somebody paid for (FR-022, SC-011).
 */

import type { AiExecutor, AiInvocationRecord } from '@webaudit/ai-executor';
import { totalCostMicros } from '@webaudit/ai-executor';
import type { CapabilityInput, CodeLayerContext } from '@webaudit/capability-sdk';
import type { AuditCapability } from '@webaudit/capability-sdk';
import type { ControlLevel, ModuleType } from '@webaudit/types';
import { runAiLayer, secretFindingsFrom } from './ai-layer.js';
import { attributeJudgment, attributeMeasured, type AttributedFinding } from './attribute.js';
import { runCodeLayer, type CodeLayerOutcome } from './code-layer.js';
import { resolveApplicable, type SkippedCapability } from './resolve.js';
import { resolveModuleState } from './state.js';

export interface RunModuleOptions {
  readonly module: ModuleType;
  readonly capabilities: readonly AuditCapability[];
  readonly input: CapabilityInput;
  readonly executor: AiExecutor;
  readonly makeContext: (signal: AbortSignal, capabilityId: string) => CodeLayerContext;
  readonly timeoutMs: number;
  readonly scanId?: string;
  /** Scopes fingerprints to a target (R3). Defaults to the scan id. */
  readonly targetId?: string;
  readonly workspaceRoot?: string;
  /** From the registry snapshot, which is the authority — not the capability. */
  readonly requiredControlLevels?: Readonly<Record<string, ControlLevel>>;
}

/** One `CapabilityExecution` row's worth of facts (Principle VI, SC-009). */
export interface ExecutionRecord {
  readonly capabilityId: string;
  readonly layer: 'CODE' | 'AI';
  readonly succeeded: boolean;
  readonly skippedReason: string | undefined;
  readonly findingCount: number;
  readonly durationMs: number;
  /** Zero for every code-layer execution. Principle III, asserted by T085. */
  readonly costMicros: number;
  readonly errorMessage: string | undefined;
  readonly invocations: readonly AiInvocationRecord[];
  readonly egressViolations: readonly string[];
}

export interface ModuleRunResult {
  readonly module: ModuleType;
  readonly state: ReturnType<typeof resolveModuleState>['state'];
  readonly score: number | null;
  readonly summary: string | undefined;
  readonly skippedReason: string | undefined;
  readonly degradedReason: string | undefined;
  /** Every delivered issue, each carrying an attribution. SC-006. */
  readonly findings: readonly AttributedFinding[];
  readonly executions: readonly ExecutionRecord[];
  readonly skipped: readonly SkippedCapability[];
  /** The module's AI cost, attributed to the module and not to a code row. */
  readonly aiCostMicros: number;
  readonly aiInvocations: readonly AiInvocationRecord[];
  readonly durationMs: number;
}

function executionsFor(
  outcomes: readonly CodeLayerOutcome[],
  skipped: readonly SkippedCapability[],
): ExecutionRecord[] {
  const records: ExecutionRecord[] = outcomes.map((outcome) => ({
    capabilityId: outcome.capabilityId,
    layer: 'CODE',
    succeeded: outcome.succeeded,
    skippedReason: undefined,
    findingCount: outcome.findings.length,
    durationMs: outcome.durationMs,
    // Principle III. Not "usually zero" — zero, by construction.
    costMicros: 0,
    errorMessage: outcome.errorMessage,
    invocations: [],
    egressViolations: outcome.egressViolations,
  }));

  // A skip is recorded too. FR-021 requires it be reported as not applicable,
  // and a skip that leaves no row is indistinguishable from a capability that
  // was never registered.
  for (const skip of skipped) {
    records.push({
      capabilityId: skip.capabilityId,
      layer: 'CODE',
      succeeded: false,
      skippedReason: skip.detail,
      findingCount: 0,
      durationMs: 0,
      costMicros: 0,
      errorMessage: undefined,
      invocations: [],
      egressViolations: [],
    });
  }

  return records;
}

export async function runModule(options: RunModuleOptions): Promise<ModuleRunResult> {
  const startedAt = Date.now();
  const targetId = options.targetId ?? options.scanId ?? 'unknown-target';
  const attributeContext = {
    module: options.module,
    targetId,
    ...(options.workspaceRoot === undefined ? {} : { workspaceRoot: options.workspaceRoot }),
  };

  // 1. Resolve.
  const { applicable, skipped } = await resolveApplicable({
    capabilities: options.capabilities,
    input: options.input,
    ...(options.requiredControlLevels === undefined
      ? {}
      : { requiredControlLevels: options.requiredControlLevels }),
  });

  // 2. Code layer, concurrent and isolated. Nothing after this line runs until
  //    every capability has finished, failed, or timed out (FR-030).
  const outcomes = await runCodeLayer({
    applicable,
    input: options.input,
    makeContext: options.makeContext,
    timeoutMs: options.timeoutMs,
  });

  // 3. Merge.
  const measured = outcomes.flatMap((outcome) => [...outcome.findings]);

  // 4. AI layer: one prompt, one call, through the redaction boundary.
  const ai = await runAiLayer({
    module: options.module,
    applicable,
    measured,
    input: options.input,
    executor: options.executor,
    ...(options.scanId === undefined ? {} : { scanId: options.scanId }),
    timeoutMs: options.timeoutMs,
  });

  // 5. Attribute. The only place an attribution is set.
  const insight = ai.ran ? ai.insight : undefined;
  const measuredFindings = attributeMeasured(measured, attributeContext, insight);

  // Credentials found while assembling the prompt are findings in their own
  // right (FR-056), and they are measurements — detection is deterministic.
  const secretFindings = attributeMeasured(secretFindingsFrom(ai.secrets), attributeContext);

  const judged = ai.ran
    ? attributeJudgment(
        ai.insight,
        attributeContext,
        measured.map((f) => f.checkId),
      )
    : [];

  const findings = [...measuredFindings, ...secretFindings, ...judged];

  // 6. State.
  const aiDegraded = !ai.ran && ai.reason === 'CHAIN_EXHAUSTED';
  const state = resolveModuleState({
    applicableCount: applicable.length,
    outcomes,
    skipped,
    findings,
    aiDegraded,
    ...(aiDegraded ? { aiDetail: ai.detail } : {}),
  });

  const executions = executionsFor(outcomes, skipped);
  const aiInvocations = ai.invocations;

  return {
    module: options.module,
    state: state.state,
    score: state.score,
    summary: insight?.summary,
    skippedReason: state.skippedReason,
    degradedReason: state.degradedReason,
    findings,
    executions,
    skipped,
    aiCostMicros: totalCostMicros(aiInvocations),
    aiInvocations,
    durationMs: Math.max(0, Date.now() - startedAt),
  };
}

export { isAttributed } from './attribute.js';
export type { AttributedFinding } from './attribute.js';
export { resolveModuleState } from './state.js';
export { resolveApplicable } from './resolve.js';
export type { Resolution, SkippedCapability, SkipReason } from './resolve.js';
export { persistModuleResult } from './persist.js';
export type { PersistOptions, PersistResult } from './persist.js';
