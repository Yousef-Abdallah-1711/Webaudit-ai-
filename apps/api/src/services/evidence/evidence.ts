/**
 * `recordEvidence` — the one write path for `Evidence` (evidence-envelope-contract.md, FR-028/030/031).
 *
 * Redaction cannot be bypassed (no flag exists) for the three classes FR-030 names; the inline-vs-artifact decision is
 * this function's own and never the caller's; a redaction failure still writes the row, with the fixed sentinel.
 * This generic path deliberately does NOT reject writes for a terminal unit (U-1 rule 0): engines fence their own
 * unit-produced evidence in their execution wrapper, and registry-dispatched evidence is written after units end.
 */

import type { EvidenceKind } from '../../../prisma/generated/client/index.js';
import type { SafetyDb } from '../safety/db.js';
import { redactAuditPayload } from '../safety/audit.js';
import { createArtifact, type ArtifactRefusal, ArtifactRefusedError } from './artifacts.js';
import type { ArtifactStore } from './store.js';

/** R7's "small fixed ceiling"; a tuning default, enforced here and nowhere else. */
export const INLINE_EVIDENCE_MAX_BYTES = 16 * 1024;

const REDACTED_CLASSES: ReadonlySet<string> = new Set([
  'ACTIVE_SECURITY',
  'AUTHENTICATED_WORKFLOW',
  'SOURCE_EXECUTION',
]);

export type EvidenceRefusal =
  ArtifactRefusal | 'UNIT_NOT_FOUND' | 'BINARY_NOT_REDACTABLE' | 'UNSERIALIZABLE_PAYLOAD';

export class EvidenceRefusedError extends Error {
  constructor(readonly reason: EvidenceRefusal) {
    super(reason);
    this.name = 'EvidenceRefusedError';
  }
}

export interface RecordedEvidence {
  id: string;
  executionUnitId: string;
  kind: EvidenceKind;
  redacted: boolean;
  artifactId: string | null;
  inline: boolean;
}

export interface RecordEvidenceInput {
  executionUnitId: string;
  /** Tenant filter: another tenant's unit is indistinguishable from a missing one. */
  userId: string;
  kind: EvidenceKind;
  /** Raw, pre-redaction. A `Uint8Array` is binary content and always goes to an artifact. */
  payload: unknown;
  /** Required for a binary payload (a screenshot, a trace). */
  contentType?: string;
}

export async function recordEvidence(
  db: SafetyDb,
  store: ArtifactStore,
  input: RecordEvidenceInput,
): Promise<RecordedEvidence> {
  const unit = await db.executionUnit.findFirst({
    where: { id: input.executionUnitId, userId: input.userId },
    select: { id: true, executionUnitClass: true, scanPlan: { select: { scanId: true } } },
  });
  if (unit === null) throw new EvidenceRefusedError('UNIT_NOT_FOUND');
  const mustRedact = REDACTED_CLASSES.has(unit.executionUnitClass);
  const scanId = unit.scanPlan.scanId;

  let artifactId: string | null = null;
  let inlinePayload: unknown = null;

  if (input.payload instanceof Uint8Array) {
    // Binary content cannot be passed through the text redactor, so for the redacted classes it is refused (fail closed).
    if (mustRedact) throw new EvidenceRefusedError('BINARY_NOT_REDACTABLE');
    if (input.contentType === undefined) throw new EvidenceRefusedError('INVALID_ARTIFACT');
    artifactId = await storeArtifact(db, store, scanId, input, input.payload, input.contentType);
  } else {
    // Step 1: redaction first, unconditionally, for the three named classes.
    const value = mustRedact ? redactAuditPayload(input.payload) : (input.payload ?? null);
    let serialized: string;
    try {
      serialized = JSON.stringify(value);
    } catch {
      throw new EvidenceRefusedError('UNSERIALIZABLE_PAYLOAD');
    }
    if (serialized === undefined) throw new EvidenceRefusedError('UNSERIALIZABLE_PAYLOAD');
    // Step 2: size decides inline vs artifact — the decision is this function's, never the caller's.
    if (Buffer.byteLength(serialized, 'utf8') > INLINE_EVIDENCE_MAX_BYTES) {
      artifactId = await storeArtifact(
        db,
        store,
        scanId,
        input,
        Buffer.from(serialized, 'utf8'),
        'application/json',
      );
    } else {
      inlinePayload = JSON.parse(serialized);
    }
  }

  const row = await db.evidence.create({
    data: {
      executionUnitId: unit.id,
      kind: input.kind,
      ...(inlinePayload === null ? {} : { inlinePayload: inlinePayload as never }),
      artifactId,
      redacted: mustRedact, // the mechanism was applied, whether or not it found anything (rule 3)
    },
  });
  return {
    id: row.id,
    executionUnitId: unit.id,
    kind: row.kind,
    redacted: row.redacted,
    artifactId,
    inline: artifactId === null,
  };
}

async function storeArtifact(
  db: SafetyDb,
  store: ArtifactStore,
  scanId: string | null,
  input: RecordEvidenceInput,
  body: Uint8Array,
  contentType: string,
): Promise<string> {
  if (scanId === null) throw new EvidenceRefusedError('UNIT_NOT_FOUND'); // REVERIFY plans have no scan-scoped key space
  try {
    const artifact = await createArtifact(db, store, {
      scanId,
      userId: input.userId,
      executionUnitId: input.executionUnitId,
      contentType,
      body,
    });
    return artifact.id;
  } catch (error) {
    if (error instanceof ArtifactRefusedError) throw new EvidenceRefusedError(error.reason);
    throw error;
  }
}
