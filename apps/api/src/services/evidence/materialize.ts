/**
 * Finding materialization and coverage (finding-materialization-contract.md, FR-036..039).
 *
 * Identity is the existing, unchanged `fingerprintOf`; the Issue row follows today's `(scanId, fingerprint)` one-row
 * semantics; attribution is always MEASURED here (no AI judgment may create or alter a finding, FR-046). The only writer
 * of `IssueEvidenceLink`. A COMPLETED unit's findings never depend on a sibling's outcome (FR-038).
 */

import { fingerprintOf } from '@webaudit/scoring';
import type { ModuleType } from '@webaudit/types';
import { inTransaction, type SafetyDb } from '../safety/db.js';
import type { ExecutionUnitStatus } from '../planning/graph.js';

export type MaterializeRefusal =
  | 'UNIT_NOT_FOUND'
  | 'UNIT_DID_NOT_RUN'
  | 'MODULE_RESULT_NOT_FOUND'
  | 'EVIDENCE_NOT_FOUND'
  | 'INVALID_FINDING';

export class MaterializeRefusedError extends Error {
  constructor(readonly reason: MaterializeRefusal) {
    super(reason);
    this.name = 'MaterializeRefusedError';
  }
}

export interface FindingShape {
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
  title: string;
  explanation: string;
  consequence: string;
  location?: string;
  fixPrompt: string;
  fixable: boolean;
}

export interface MaterializeInput {
  executionUnitId: string;
  userId: string;
  module: ModuleType;
  /** The ModuleResult (same scan) the Issue belongs to; the caller owns module-result writing (finalizer extension point). */
  moduleResultId: string;
  checkId: string;
  fingerprintParts: readonly string[];
  finding: FindingShape;
  supportingEvidenceIds: readonly string[];
}

/** Statuses that mean the unit actually ran, so evidence it produced may support a finding (never SKIPPED/BLOCKED/REFUSED). */
const RAN: ReadonlySet<ExecutionUnitStatus> = new Set([
  'RUNNING',
  'COMPLETED',
  'FAILED',
  'CANCELLED',
  'KILLED',
]);

export async function materializeFinding(
  db: SafetyDb,
  input: MaterializeInput,
): Promise<{ issueId: string; fingerprint: string; created: boolean; linksCreated: number }> {
  if (input.finding.title.trim() === '' || input.checkId.trim() === '')
    throw new MaterializeRefusedError('INVALID_FINDING');
  const unit = await db.executionUnit.findFirst({
    where: { id: input.executionUnitId, userId: input.userId },
    select: { id: true, status: true, targetId: true, scanPlan: { select: { scanId: true } } },
  });
  const scanId = unit?.scanPlan.scanId ?? null;
  if (unit === null || scanId === null) throw new MaterializeRefusedError('UNIT_NOT_FOUND');
  if (!RAN.has(unit.status))
    throw new MaterializeRefusedError('UNIT_DID_NOT_RUN');

  const moduleResult = await db.moduleResult.findFirst({
    where: { id: input.moduleResultId, scanId },
    select: { id: true },
  });
  if (moduleResult === null) throw new MaterializeRefusedError('MODULE_RESULT_NOT_FOUND');

  // Provenance can only name evidence of this scan and tenant (no cross-tenant links).
  const evidenceIds = [...new Set(input.supportingEvidenceIds)];
  if (evidenceIds.length > 0) {
    const owned = await db.evidence.count({
      where: {
        id: { in: evidenceIds },
        executionUnit: { userId: input.userId, scanPlan: { scanId } },
      },
    });
    if (owned !== evidenceIds.length) throw new MaterializeRefusedError('EVIDENCE_NOT_FOUND');
  }

  const fingerprint = fingerprintOf({
    targetId: unit.targetId,
    module: input.module,
    checkId: input.checkId,
    parts: input.fingerprintParts,
  });

  return inTransaction(db, async (tx) => {
    // INSERT ... ON CONFLICT DO NOTHING: a unique violation would abort the whole Postgres transaction, so the
    // race for the same fingerprint is decided by the insert itself and the loser simply reads the winner's row.
    const inserted = await tx.issue.createMany({
      data: [
        {
          scanId,
          moduleResultId: moduleResult.id,
          fingerprint,
          checkId: input.checkId,
          severity: input.finding.severity,
          title: input.finding.title,
          explanation: input.finding.explanation,
          consequence: input.finding.consequence,
          location: input.finding.location ?? null,
          attribution: 'MEASURED',
          fixPrompt: input.finding.fixPrompt,
          fixable: input.finding.fixable,
          requiredControlLevel: 'NONE',
        },
      ],
      skipDuplicates: true,
    });
    const created = inserted.count === 1;
    const issue = await tx.issue.findUniqueOrThrow({
      where: { scanId_fingerprint: { scanId, fingerprint } },
      select: { id: true },
    });
    const linked =
      evidenceIds.length === 0
        ? { count: 0 }
        : await tx.issueEvidenceLink.createMany({
            data: evidenceIds.map((evidenceId) => ({ issueId: issue.id, evidenceId })),
            skipDuplicates: true,
          });
    return { issueId: issue.id, fingerprint, created, linksCreated: linked.count };
  });
}

export interface UnitRef {
  id: string;
  executionUnitClass: string;
  engineId: string;
}

export interface CoverageSummary {
  completedUnits: UnitRef[];
  nonCompletedUnits: Array<{ unit: UnitRef; status: string; reason: string | null }>;
}

/** FR-038/039: facts only — what ran, what did not, and why. No verdict, no score. */
export async function scanCoverageSummary(
  db: SafetyDb,
  scanPlanId: string,
  userId: string,
): Promise<CoverageSummary> {
  const units = await db.executionUnit.findMany({
    where: { scanPlanId, userId },
    orderBy: { id: 'asc' },
    select: {
      id: true,
      executionUnitClass: true,
      engineId: true,
      status: true,
      terminalReason: true,
      skippedReason: true,
      failureClass: true,
    },
  });
  const completedUnits: UnitRef[] = [];
  const nonCompletedUnits: CoverageSummary['nonCompletedUnits'] = [];
  for (const u of units) {
    const ref = { id: u.id, executionUnitClass: u.executionUnitClass, engineId: u.engineId };
    if (u.status === 'COMPLETED') completedUnits.push(ref);
    else
      nonCompletedUnits.push({
        unit: ref,
        status: u.status,
        reason: u.skippedReason ?? u.terminalReason ?? u.failureClass ?? null,
      });
  }
  return { completedUnits, nonCompletedUnits };
}
