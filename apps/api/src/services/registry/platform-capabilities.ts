/**
 * Engineering-review finding C1 — the `module-ai:<module>` sentinel rows.
 *
 * `apps/worker`'s `persistModuleResult` writes one `CapabilityExecution` row
 * per module for the module's own AI call, keyed `module-ai:<module>` so the
 * cost is attributable (SC-009) without inventing a split across the
 * capabilities that fed the prompt. `CapabilityExecution.capabilityId` is a
 * required FK to `Capability.id`, and these ids are not discoverable — no
 * directory under `packages/capabilities-vendored/` produces them — so
 * `reconcileCapabilities` (disk → db) never creates them and the write fails
 * with `CapabilityExecution_capabilityId_fkey` the moment any module's AI
 * layer emits an invocation (UI, via `impeccable`).
 *
 * They are platform-owned reference rows, not third-party capabilities: one
 * per `ModuleType`, `layer: 'AI'`, `trust: 'VENDORED'`. `reconcile.ts` will
 * list them under `absent` (they are not on disk) and `CapabilityRegistry`
 * will not serve them — both correct. This function only guarantees the FK
 * target exists. It is idempotent and safe to call on every boot.
 */

import { MODULE_TYPES } from '@webaudit/types';
import type { PrismaClient } from '../../../prisma/generated/client/index.js';

/** The synthetic capability id `persist.ts` uses for a module's AI execution. */
export function moduleAiCapabilityId(module: string): string {
  return `module-ai:${module.toLowerCase()}`;
}

export async function ensurePlatformCapabilities(
  db: Pick<PrismaClient, 'capability'>,
): Promise<void> {
  for (const module of MODULE_TYPES) {
    const id = moduleAiCapabilityId(module);
    await db.capability.upsert({
      where: { id },
      create: {
        id,
        name: `${module} AI layer`,
        version: '1.0.0',
        module,
        layer: 'AI',
        trust: 'VENDORED',
        // Never load-generating; the AI layer only interprets what was measured.
        requiredControlLevel: 'NONE',
        // Not operator-toggleable — disabling "the AI layer" is not a
        // per-capability decision, it is `AI_MODE`.
        isEnabled: true,
      },
      // `layer`/`module` are the identity of the sentinel; nothing about it
      // drifts, so an existing row is left exactly as it is.
      update: {},
    });
  }
}
