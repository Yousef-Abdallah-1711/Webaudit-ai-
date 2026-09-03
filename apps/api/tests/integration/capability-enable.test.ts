/**
 * T204 — SC-010: "a capability enabled by an operator reaches customers with
 * no deploy."
 *
 * This proves it against the real, database-backed consumption path rather
 * than re-querying the database and asserting on the raw column:
 * `CapabilityRegistry.build` (T070) reads `Capability.isEnabled` fresh from
 * the database every time it is called, and `resolveSnapshot` (T071) is the
 * one place that turns "enabled or not" into "does this check run" — a
 * disabled capability is filtered out of the snapshot entirely (see that
 * file's own module comment: "the one case where filtering is right", i.e.
 * an operator-disabled capability is absent, not reported-unavailable).
 * Nothing here re-implements that logic; this test calls the exact
 * production functions the orchestrator calls at the start of every scan.
 *
 * The other half of SC-010 — that a *running* orchestrator, with a live
 * queue and executor, actually skips a disabled capability's execution and
 * still completes the scan — is already proven end-to-end by
 * `apps/worker/tests/integration/orchestrator-capability-enabled.test.ts`
 * (see its own header: it exists precisely because a prior defect let a
 * disabled capability keep running until the next deploy). This file does
 * not duplicate that heavier machinery (queues, executor, module runner); it
 * proves the same fact one layer down, at the registry/snapshot boundary
 * this admin surface's `setCapabilityEnabled` actually writes to — with no
 * process restart and no redeploy between the write and the read, which is
 * the entire point of SC-010's "no deploy" framing.
 */

import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { closeDb, resetDb, seedPlans, testDb as db } from '../helpers/db.js';
import { CapabilityRegistry } from '../../src/services/registry/registry.js';
import { resolveSnapshot } from '../../src/services/registry/snapshot.js';
import type { DiscoveredCapability } from '../../src/services/registry/discover.js';
import { setCapabilityEnabled } from '../../src/services/admin/capabilities.service.js';

const CAPABILITY_ID = 'admin-enable-probe';

/**
 * What discovery would have found on disk for this capability. Only `.id`
 * and `.entrypointPath` are actually read by `CapabilityRegistry.build`
 * (registry.ts's own comment: everything else about a served capability
 * comes from the database row, not from the disk side of the intersection),
 * but the type is the real `DiscoveredCapability`, not a loosened stand-in.
 */
function discovered(): DiscoveredCapability {
  return {
    id: CAPABILITY_ID,
    trust: 'VENDORED',
    directory: '/stub/admin-enable-probe',
    entrypointPath: '/stub/admin-enable-probe/index.js',
    manifest: {
      id: CAPABILITY_ID,
      name: 'Admin Enable Probe',
      version: '1.0.0',
      module: 'SECURITY',
      layer: 'CODE',
      entrypoint: 'index.js',
      requiresCode: false,
      requiresScreenshot: false,
      requiredControlLevel: 'NONE',
      estimatedTokens: 0,
    },
  };
}

async function seedCapability(isEnabled: boolean): Promise<void> {
  await db.capability.create({
    data: {
      id: CAPABILITY_ID,
      name: 'Admin Enable Probe',
      version: '1.0.0',
      module: 'SECURITY',
      layer: 'CODE',
      trust: 'VENDORED',
      requiresCode: false,
      requiresScreenshot: false,
      requiredControlLevel: 'NONE',
      estimatedTokens: 0,
      isEnabled,
    },
  });
}

/** Would the orchestrator, resolving a fresh snapshot right now, run this check? */
async function isServed(): Promise<boolean> {
  const registry = await CapabilityRegistry.build(db, [discovered()]);
  const snapshot = resolveSnapshot(registry, {
    planId: 'free',
    controlLevel: 'NONE',
    hasCode: false,
    hasScreenshot: false,
    requestedModules: ['SECURITY'],
  });
  return snapshot.entries.some((e) => e.capabilityId === CAPABILITY_ID);
}

describe('SC-010 - an operator toggle reaches the registry with no deploy', () => {
  beforeEach(async () => {
    await resetDb();
    await seedPlans();
  });
  afterAll(closeDb);

  it('excludes a disabled capability, includes it once enabled, excludes it again once disabled', async () => {
    await seedCapability(false);
    expect(await isServed(), 'starts disabled: must be excluded').toBe(false);

    await setCapabilityEnabled(db, {
      operatorId: 'op-1',
      capabilityId: CAPABILITY_ID,
      isEnabled: true,
    });
    // No restart, no redeploy: the very next registry build (same process,
    // same connection) sees it. That gap is what SC-010 is about.
    expect(await isServed(), 'enabled: must now be included').toBe(true);

    await setCapabilityEnabled(db, {
      operatorId: 'op-1',
      capabilityId: CAPABILITY_ID,
      isEnabled: false,
    });
    expect(await isServed(), 're-disabled: must be excluded again').toBe(false);

    const entries = await db.auditLogEntry.findMany({
      where: { subjectType: 'Capability', subjectId: CAPABILITY_ID },
      orderBy: { createdAt: 'asc' },
    });
    expect(entries.length).toBe(2);
    expect(entries[0]?.action).toBe('capability.update');
    expect(entries[1]?.action).toBe('capability.update');
  });
});
