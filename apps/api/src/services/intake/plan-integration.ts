/**
 * N01 (DEC-072 profile selection, DEC-073 flag-gated cutover): the seam between `POST /scans` and the SPEC 009 plan
 * resolver. Entirely behind `SCAN_EXECUTION_PLANS=on`; absent that, `createScan` never reaches this module for a
 * default request and the legacy flow is byte-for-byte unchanged.
 *
 * What a client may say is only a profile NAME. It never names an engine, an execution class or a grant. A profile is
 * accepted only when every class it needs has a registered engine on the API side and is passive (the passive baseline
 * registry today): anything else is refused BEFORE any debit with PROFILE_UNAVAILABLE, so nothing is charged and nothing
 * is enqueued that could never execute. SPEC 010-012 engines are not implemented here.
 */

import type { ModuleType } from '@webaudit/types';
import type { PrismaClient } from '../../../prisma/generated/client/index.js';
import { isAuthorized } from '../authorization/check.js';
import {
  isPassiveClass,
  resolvePlan,
  type EngineRegistry,
  type ExecutionUnitClass,
} from '../planning/index.js';

/** The explicit, documented default: every requested domain as one passive baseline unit (FR-040). */
export const DEFAULT_SCAN_PROFILE = 'PASSIVE_BASELINE';
export const PROFILE_NAME = /^[A-Za-z][A-Za-z0-9_-]{1,62}$/;

export class UnsupportedProfileError extends Error {
  override readonly name = 'UnsupportedProfileError';
  constructor() {
    super('That scan profile is not supported.');
  }
}

export class ProfileUnavailableError extends Error {
  override readonly name = 'ProfileUnavailableError';
  constructor(readonly reason: 'EXECUTION_PLANS_DISABLED' | 'NO_ENGINE_AVAILABLE') {
    super('That scan profile is not available yet. Nothing was charged.');
  }
}

export class PlanRefusedError extends Error {
  override readonly name = 'PlanRefusedError';
  constructor(readonly reason: string) {
    super('The scan could not be planned. No charge was made.');
  }
}

export interface PlanIntegration {
  readonly registry: EngineRegistry;
  readonly now?: () => Date;
}

export type SelectedProfile =
  { kind: 'CUSTOM'; domains: ModuleType[] } | { kind: 'NAMED'; scanProfileId: string };

/** Pre-debit: validates the requested profile name against the registry. Throws; never charges. */
export async function selectProfile(
  db: PrismaClient,
  integration: PlanIntegration | undefined,
  profile: string | undefined,
  modules: readonly ModuleType[],
): Promise<SelectedProfile | null> {
  const name = profile ?? DEFAULT_SCAN_PROFILE;
  if (!PROFILE_NAME.test(name)) throw new UnsupportedProfileError();
  if (integration === undefined) {
    // Flag OFF: the legacy flow is unchanged for the default; any other named profile cannot run, so it is refused.
    if (name === DEFAULT_SCAN_PROFILE) return null;
    throw new ProfileUnavailableError('EXECUTION_PLANS_DISABLED');
  }
  if (name === DEFAULT_SCAN_PROFILE) {
    assertPassiveCovered(integration.registry, modules);
    return { kind: 'CUSTOM', domains: [...modules] };
  }
  const row = await db.scanProfile.findFirst({
    where: { slug: name, isSystemDefined: true },
    select: { id: true, versions: { orderBy: { version: 'desc' }, take: 1 } },
  });
  const version = row?.versions[0];
  if (row === null || version === undefined) throw new UnsupportedProfileError();
  const domains = version.defaultDomains as ModuleType[];
  const classMap = version.domainExecutionClasses as Partial<
    Record<ModuleType, ExecutionUnitClass[]>
  >;
  // The passive completer pairs each unit with a requested module; a profile reaching beyond the request cannot finish.
  if (!domains.every((d) => modules.includes(d)))
    throw new ProfileUnavailableError('NO_ENGINE_AVAILABLE');
  assertPassiveCovered(integration.registry, domains, classMap);
  return { kind: 'NAMED', scanProfileId: row.id };
}

function assertPassiveCovered(
  registry: EngineRegistry,
  domains: readonly ModuleType[],
  classMap?: Partial<Record<ModuleType, ExecutionUnitClass[]>>,
): void {
  for (const d of domains) {
    const wanted: ExecutionUnitClass[] = classMap?.[d] ?? ['PASSIVE_HTTP'];
    for (const cls of wanted) {
      // Non-passive classes need an engine host that no production adapter provides yet (SPEC 010-012): deferred.
      if (!isPassiveClass(cls) || registry.templatesFor(d, cls).length === 0) {
        throw new ProfileUnavailableError('NO_ENGINE_AVAILABLE');
      }
    }
  }
}

/** Post-debit, pre-enqueue: persists the INITIAL plan. A refusal is thrown so the caller refunds and fails the scan. */
export async function resolveScanPlan(
  db: PrismaClient,
  integration: PlanIntegration,
  scanId: string,
  targetId: string,
  selected: SelectedProfile,
): Promise<void> {
  const plan = await resolvePlan(
    { db, registry: integration.registry, isAuthorized: (i) => isAuthorized(db, i) },
    {
      targetId,
      profile:
        selected.kind === 'CUSTOM'
          ? { kind: 'CUSTOM', domains: selected.domains }
          : { kind: 'NAMED', scanProfileId: selected.scanProfileId },
    },
    'INITIAL',
    (integration.now ?? (() => new Date()))(),
    { scanId },
  );
  if (plan.state === 'REFUSED') throw new PlanRefusedError(plan.refusalReason);
}
