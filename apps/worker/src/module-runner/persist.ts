/**
 * T093 — persistence: `ModuleResult`, `Issue` rows, and `CapabilityExecution`
 * rows with attributable cost.
 *
 * **The signature is the SC-006 guarantee.** `findings` is
 * `readonly AttributedFinding[]`, a type only `attribute.ts` can produce, so
 * there is no way to write an `Issue` row without an attribution having been
 * assigned by the runner — not because a reviewer checked, but because nothing
 * else typechecks. `Issue.attribution` is non-nullable in the schema, so the
 * database is the third lock.
 *
 * `isAttributed` is checked at runtime as well, for the same reason the redaction
 * boundary does: a brand stops honest code and a cast defeats it, and this is the
 * last point before data becomes a report somebody reads.
 *
 * **Cost lands on `CapabilityExecution`, per R9.** "Because cost is recorded per
 * capability execution rather than per scan, FR-082 and SC-009 become
 * straightforward aggregations rather than estimates." A code-layer execution
 * records zero — Principle III, and the schema comment says the same. The
 * module's AI cost is attributed to the module's own AI execution row rather
 * than smeared across the capabilities that contributed to the prompt, because
 * there was one call and dividing it would invent a split nobody can reconcile.
 *
 * The database shape is declared structurally rather than imported from the
 * generated Prisma client: `apps/worker` should not depend on the API app's
 * generated output.
 */

import type { Attribution, ModuleState, ModuleType, Severity } from '@webaudit/types';
import type { AiInvocationRecord } from '@webaudit/ai-executor';
import { isAttributed, type AttributedFinding } from './attribute.js';
import type { ExecutionRecord } from './index.js';

export class UnattributedFindingError extends Error {
  override readonly name = 'UnattributedFindingError';
  constructor(checkId: string) {
    super(
      `Refusing to persist "${checkId}": it was not attributed by the module runner. ` +
        'Every delivered issue carries MEASURED or AI_JUDGMENT, assigned from the layer that ' +
        'produced it (FR-032, SC-006). Route it through attribute.ts.',
    );
  }
}

interface ModuleResultRow {
  scanId: string;
  module: ModuleType;
  state: ModuleState;
  score: number | null;
  summary: string | null;
  skippedReason: string | null;
  degradedReason: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
}

interface IssueRow {
  scanId: string;
  moduleResultId: string;
  fingerprint: string;
  checkId: string;
  severity: Severity;
  title: string;
  explanation: string;
  consequence: string;
  location: string | null;
  evidence: unknown;
  attribution: Attribution;
  fixPrompt: string;
  requiredControlLevel: 'NONE' | 'ATTESTED' | 'VERIFIED';
}

interface CapabilityExecutionRow {
  scanId: string;
  capabilityId: string;
  module: ModuleType;
  succeeded: boolean;
  skippedReason: string | null;
  findingCount: number;
  durationMs: number;
  costMicros: number;
  errorMessage: string | null;
}

/** Only the models and methods this module touches. */
export interface ModuleResultWriter {
  moduleResult: {
    upsert(args: {
      where: { scanId_module: { scanId: string; module: ModuleType } };
      create: ModuleResultRow;
      update: Omit<ModuleResultRow, 'scanId' | 'module'>;
      select: { id: true };
    }): Promise<{ id: string }>;
  };
  issue: {
    createMany(args: { data: IssueRow[]; skipDuplicates?: boolean }): Promise<{ count: number }>;
  };
  capabilityExecution: {
    create(args: { data: CapabilityExecutionRow; select: { id: true } }): Promise<{ id: string }>;
    createMany(args: { data: CapabilityExecutionRow[] }): Promise<{ count: number }>;
  };
  aiInvocation: {
    createMany(args: { data: Record<string, unknown>[] }): Promise<{ count: number }>;
  };
}

export interface PersistOptions {
  readonly scanId: string;
  readonly module: ModuleType;
  readonly state: ModuleState;
  readonly score: number | null;
  readonly summary: string | undefined;
  readonly skippedReason: string | undefined;
  readonly degradedReason: string | undefined;
  readonly findings: readonly AttributedFinding[];
  readonly executions: readonly ExecutionRecord[];
  readonly aiInvocations: readonly AiInvocationRecord[];
  readonly aiCostMicros: number;
  readonly startedAt: Date;
  readonly completedAt: Date;
}

export interface PersistResult {
  readonly moduleResultId: string;
  readonly issuesWritten: number;
  readonly executionsWritten: number;
  readonly invocationsWritten: number;
}

export async function persistModuleResult(
  db: ModuleResultWriter,
  options: PersistOptions,
): Promise<PersistResult> {
  // The runtime half of the type guarantee. Checked before anything is written,
  // so a forged finding cannot land half a module's rows before being caught.
  //
  // Widened to `unknown` first: the declared parameter type already satisfies
  // the guard, so TypeScript narrows the failing branch to `never` and the check
  // reads as dead code. It is not dead — a cast is exactly what it catches.
  for (const finding of options.findings as readonly unknown[]) {
    if (!isAttributed(finding)) {
      const checkId =
        typeof finding === 'object' && finding !== null && 'checkId' in finding
          ? String(finding.checkId)
          : '(unknown check)';
      throw new UnattributedFindingError(checkId);
    }
  }

  const row: Omit<ModuleResultRow, 'scanId' | 'module'> = {
    state: options.state,
    // Passed through, never coerced. `?? 0` here would be the FR-053 defect.
    score: options.score,
    summary: options.summary ?? null,
    skippedReason: options.skippedReason ?? null,
    degradedReason: options.degradedReason ?? null,
    startedAt: options.startedAt,
    completedAt: options.completedAt,
  };

  // Upsert on (scanId, module), which the schema makes unique: a re-run of one
  // area must replace its result rather than add a second one.
  const moduleResult = await db.moduleResult.upsert({
    where: { scanId_module: { scanId: options.scanId, module: options.module } },
    create: { scanId: options.scanId, module: options.module, ...row },
    update: row,
    select: { id: true },
  });

  let issuesWritten = 0;
  if (options.findings.length > 0) {
    const created = await db.issue.createMany({
      data: options.findings.map((finding) => ({
        scanId: options.scanId,
        moduleResultId: moduleResult.id,
        fingerprint: finding.fingerprint,
        checkId: finding.checkId,
        severity: finding.severity,
        title: finding.title,
        explanation: finding.explanation,
        consequence: finding.consequence,
        location: finding.location ?? null,
        evidence: finding.evidence ?? null,
        // From the runner. The whole point of the type above.
        attribution: finding.attribution,
        fixPrompt: finding.fixPrompt,
        requiredControlLevel: 'NONE' as const,
      })),
      // (scanId, fingerprint) is unique — one row per problem per scan. A
      // duplicate is two capabilities finding the same defect, which is one
      // problem, not a reason to fail the write.
      skipDuplicates: true,
    });
    issuesWritten = created.count;
  }

  // Per-capability executions are always code-layer here (`executionsFor` in
  // index.ts sets `invocations: []` on every one — the module's AI call is the
  // separate row below), so they need no id back and go in one round trip
  // rather than N sequential `create`s (review finding L12).
  let executionsWritten = 0;
  let invocationsWritten = 0;
  if (options.executions.length > 0) {
    const written = await db.capabilityExecution.createMany({
      data: options.executions.map((execution) => ({
        scanId: options.scanId,
        capabilityId: execution.capabilityId,
        module: options.module,
        succeeded: execution.succeeded,
        skippedReason: execution.skippedReason ?? null,
        findingCount: execution.findingCount,
        durationMs: execution.durationMs,
        costMicros: execution.costMicros,
        errorMessage: execution.errorMessage ?? null,
      })),
    });
    executionsWritten += written.count;
  }

  // The module's own AI call gets an execution row of its own, carrying the
  // cost. Attributable (SC-009) without inventing a split across contributors.
  if (options.aiInvocations.length > 0) {
    const aiExecution = await db.capabilityExecution.create({
      data: {
        scanId: options.scanId,
        capabilityId: `module-ai:${options.module.toLowerCase()}`,
        module: options.module,
        succeeded: options.aiInvocations.some((i) => i.outcome === 'SUCCESS'),
        skippedReason: null,
        findingCount: options.findings.filter((f) => f.layer === 'AI').length,
        durationMs: options.aiInvocations.reduce((total, i) => total + i.latencyMs, 0),
        costMicros: options.aiCostMicros,
        errorMessage:
          options.aiInvocations.find((i) => i.outcome !== 'SUCCESS')?.errorMessage ?? null,
      },
      select: { id: true },
    });
    executionsWritten += 1;

    const written = await db.aiInvocation.createMany({
      data: options.aiInvocations.map((invocation) => ({
        executionId: aiExecution.id,
        scanId: options.scanId,
        provider: invocation.provider,
        model: invocation.model,
        chainPosition: invocation.chainPosition,
        promptTokens: invocation.promptTokens,
        outputTokens: invocation.outputTokens,
        latencyMs: invocation.latencyMs,
        costMicros: invocation.costMicros,
        outcome: invocation.outcome,
      })),
    });
    invocationsWritten += written.count;
  }

  return {
    moduleResultId: moduleResult.id,
    issuesWritten,
    executionsWritten,
    invocationsWritten,
  };
}
