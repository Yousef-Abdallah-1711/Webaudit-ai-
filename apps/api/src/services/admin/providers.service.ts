/**
 * T208 — operator administration of the AI provider chain (FR-087:
 * "Operators MUST be able to configure AI providers and their fallback
 * order").
 *
 * ─── What this genuinely achieves, and what it does not ─────────────────
 *
 * Read `packages/ai-executor/src/from-env.ts`'s `createExecutorFromEnv`
 * before touching this file. Today the AI provider chain is entirely
 * environment-variable-driven, resolved exactly once, at process boot:
 * `AI_CHAIN` names the vendors in fallback order, `buildOne` resolves each
 * name against per-vendor env vars, and the resulting array is handed to
 * `createExecutor`. `apps/worker/src/index.ts` calls this once at startup.
 * Nothing anywhere re-reads a chain configuration at runtime or on a
 * schedule — there is no live-reconfiguration mechanism for this file to
 * plug into, and building one (a running worker process dynamically
 * swapping its executor's chain) is a genuinely large, separate change that
 * is out of scope here.
 *
 * So: this file gives an operator a real, persisted place to declare their
 * *intended* chain, validated at write time with the same real guard the
 * boot path uses — but writing here does **not** change what a running
 * worker actually uses. That still reads `AI_CHAIN` / the per-vendor env
 * vars at its own boot, and only takes effect on redeploy. This is a real,
 * recorded gap for a later task (wiring a live process to re-read
 * `ProviderChainEntry`), not something to silently paper over. This mirrors
 * how `capabilities.service.ts` documents `CapabilityPlan`'s own partial
 * enforcement gap in this same phase.
 *
 * ─── Validation: the REAL `buildChain`, not a parallel check ─────────────
 *
 * `packages/ai-executor/src/chain.ts`'s `buildChain` is the actual function
 * `createExecutorFromEnv` calls at boot. It enforces Principle IV's
 * two-vendor minimum, rejects a blank vendor or model, and rejects a
 * duplicate vendor+model pair. Reimplementing that logic here would risk
 * silently drifting from the real boot-time check — an operator could save
 * a chain here that this file considered valid but the boot path would
 * refuse, or vice versa. So every submitted chain is turned into minimal
 * `Provider`-shaped objects (vendor, model, and a `generate` that is never
 * actually invoked — `buildChain` only reads `vendor`/`model`) and handed
 * straight to `buildChain`. A `ChainConfigurationError` is translated into
 * `ProviderChainInvalidError`, carrying `buildChain`'s own message verbatim,
 * so an operator sees the exact same reasoning the boot-time check would
 * have given them.
 *
 * ─── Replace-the-set semantics ────────────────────────────────────────────
 *
 * Matches `capabilities.service.ts`'s `setCapabilityPlanRestrictions`
 * precedent for the same reason: fallback order is an ordered list, and a
 * partial-update model for an ordered list invites exactly the ambiguity
 * ("insert where?") a full replace avoids. An operator's PATCH body is
 * always a complete, unambiguous statement of "this is the chain now".
 * Validation happens before anything is written — a rejected PATCH leaves
 * the previously-persisted chain completely untouched.
 */

import type { PrismaClient } from '../../../prisma/generated/client/index.js';
import { buildChain, ChainConfigurationError, type Provider } from '@webaudit/ai-executor';
import { recordAuditLog } from './audit-log.js';

/** See the module note above: this carries `buildChain`'s own real message. */
export class ProviderChainInvalidError extends Error {
  override readonly name = 'ProviderChainInvalidError';
}

export interface ProviderChainEntryInput {
  readonly vendor: string;
  readonly model: string;
  /** Defaults to true. See the model's own schema.prisma comment. */
  readonly isEnabled?: boolean;
}

export interface ProviderChainEntrySummary {
  readonly vendor: string;
  readonly model: string;
  readonly position: number;
  readonly isEnabled: boolean;
}

/** Reads the persisted chain in fallback order. Empty until ever configured. */
export async function listProviderChain(
  db: PrismaClient,
): Promise<readonly ProviderChainEntrySummary[]> {
  const rows = await db.providerChainEntry.findMany({ orderBy: { position: 'asc' } });
  return rows.map((row) => ({
    vendor: row.vendor,
    model: row.model,
    position: row.position,
    isEnabled: row.isEnabled,
  }));
}

/**
 * A `Provider`-shaped stub for validation only. `buildChain` (chain.ts) reads
 * only `vendor` and `model` off each entry — `generate` is never called, and
 * throwing from it if it somehow were is safer than returning a fabricated
 * success.
 */
function toValidationProvider(entry: ProviderChainEntryInput): Provider {
  return {
    vendor: entry.vendor,
    model: entry.model,
    generate() {
      throw new Error(
        'This Provider is a validation-only stub built from an admin-submitted ' +
          'chain configuration and must never be invoked.',
      );
    },
  };
}

export interface ReplaceProviderChainInput {
  /** The operator performing this mutation — the audit row's `actorId`. */
  readonly operatorId: string;
  /** The full, ordered, replacement chain. Order in this array is the fallback order. */
  readonly entries: readonly ProviderChainEntryInput[];
}

/**
 * Replaces the entire persisted chain, validated first with the real
 * `buildChain` guard. Throws `ProviderChainInvalidError` (never persisting
 * anything) if the submitted chain would fail the same check
 * `createExecutorFromEnv` runs at boot. Always writes exactly one
 * `AuditLogEntry` on a successful replace.
 */
export async function replaceProviderChain(
  db: PrismaClient,
  input: ReplaceProviderChainInput,
): Promise<readonly ProviderChainEntrySummary[]> {
  try {
    buildChain(input.entries.map(toValidationProvider));
  } catch (error) {
    if (error instanceof ChainConfigurationError) {
      throw new ProviderChainInvalidError(error.message);
    }
    throw error;
  }

  const before = await listProviderChain(db);

  // Replace-the-set, in one transaction, so a reader never observes an
  // empty intermediate state between the delete and the recreate (same
  // reasoning as setCapabilityPlanRestrictions).
  await db.$transaction([
    db.providerChainEntry.deleteMany({}),
    ...(input.entries.length > 0
      ? [
          db.providerChainEntry.createMany({
            data: input.entries.map((entry, position) => ({
              vendor: entry.vendor,
              model: entry.model,
              position,
              isEnabled: entry.isEnabled ?? true,
            })),
          }),
        ]
      : []),
  ]);

  const after = await listProviderChain(db);

  await recordAuditLog(db, {
    actorId: input.operatorId,
    action: 'providers.chain_replace',
    subjectType: 'ProviderChain',
    before: { chain: before },
    after: { chain: after },
  });

  return after;
}
