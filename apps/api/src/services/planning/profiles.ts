/**
 * Scan profiles (scan-profile-contract.md, FR-002/FR-003/FR-004).
 *
 * A published `ScanProfileVersion` is never updated: a new version is a new row
 * (the guard is the absence of any update path plus the `(profile, version)` unique key).
 */

import type { ModuleType } from '@webaudit/types';
import type { SafetyDb } from '../safety/db.js';
import { inTransaction } from '../safety/db.js';
import { EXECUTION_UNIT_CLASSES, type ExecutionUnitClass } from './graph.js';

export class ScanProfileError extends Error {
  constructor(
    readonly code: 'INVALID_PROFILE' | 'NOT_FOUND' | 'SLUG_TAKEN',
    message: string,
  ) {
    super(message);
    this.name = 'ScanProfileError';
  }
}

export type DomainExecutionClasses = Partial<Record<ModuleType, ExecutionUnitClass[]>>;

export interface ProfileVersionInput {
  defaultDomains: ModuleType[];
  domainExecutionClasses: DomainExecutionClasses;
  advancedConfigSchema?: Record<string, unknown>;
}

const SLUG = /^[a-z][a-z0-9-]{1,62}$/;
const CLASS_SET: ReadonlySet<string> = new Set(EXECUTION_UNIT_CLASSES);

/** Contract rule 3: every default domain maps to at least one known class; nothing is mapped that is not a default. */
export function assertValidProfileVersion(input: ProfileVersionInput): void {
  if (input.defaultDomains.length === 0) {
    throw new ScanProfileError('INVALID_PROFILE', 'defaultDomains must not be empty');
  }
  if (new Set(input.defaultDomains).size !== input.defaultDomains.length) {
    throw new ScanProfileError('INVALID_PROFILE', 'defaultDomains contains a duplicate');
  }
  for (const domain of input.defaultDomains) {
    const classes = input.domainExecutionClasses[domain];
    if (classes === undefined || classes.length === 0) {
      throw new ScanProfileError('INVALID_PROFILE', `domain ${domain} has no execution class`);
    }
    for (const cls of classes) {
      if (!CLASS_SET.has(cls))
        throw new ScanProfileError('INVALID_PROFILE', `unknown class ${String(cls)}`);
    }
    if (new Set(classes).size !== classes.length) {
      throw new ScanProfileError('INVALID_PROFILE', `domain ${domain} lists a class twice`);
    }
  }
  for (const domain of Object.keys(input.domainExecutionClasses)) {
    if (!(input.defaultDomains as string[]).includes(domain)) {
      throw new ScanProfileError(
        'INVALID_PROFILE',
        `domain ${domain} is mapped but not a default domain`,
      );
    }
  }
}

export interface ProfileVersionView {
  id: string;
  scanProfileId: string;
  version: number;
  defaultDomains: ModuleType[];
  domainExecutionClasses: DomainExecutionClasses;
  advancedConfigSchema: Record<string, unknown> | null;
}

function view(row: {
  id: string;
  scanProfileId: string;
  version: number;
  defaultDomains: string[];
  domainExecutionClasses: unknown;
  advancedConfigSchema: unknown;
}): ProfileVersionView {
  return {
    id: row.id,
    scanProfileId: row.scanProfileId,
    version: row.version,
    defaultDomains: row.defaultDomains as ModuleType[],
    domainExecutionClasses: row.domainExecutionClasses as DomainExecutionClasses,
    advancedConfigSchema: (row.advancedConfigSchema as Record<string, unknown> | null) ?? null,
  };
}

const toJson = (v: unknown) => v as never;

/** System-defined profiles only (no customer-facing profile product, contract). Version 1 is created with the profile. */
export async function createScanProfile(
  db: SafetyDb,
  slug: string,
  input: ProfileVersionInput,
): Promise<{ scanProfileId: string; version: ProfileVersionView }> {
  if (!SLUG.test(slug)) throw new ScanProfileError('INVALID_PROFILE', 'invalid slug');
  assertValidProfileVersion(input);
  return inTransaction(db, async (tx) => {
    if ((await tx.scanProfile.findUnique({ where: { slug }, select: { id: true } })) !== null) {
      throw new ScanProfileError('SLUG_TAKEN', 'slug already exists');
    }
    const profile = await tx.scanProfile.create({ data: { slug, isSystemDefined: true } });
    const row = await tx.scanProfileVersion.create({
      data: {
        scanProfileId: profile.id,
        version: 1,
        defaultDomains: input.defaultDomains,
        domainExecutionClasses: toJson(input.domainExecutionClasses),
        ...(input.advancedConfigSchema === undefined
          ? {}
          : { advancedConfigSchema: toJson(input.advancedConfigSchema) }),
      },
    });
    return { scanProfileId: profile.id, version: view(row) };
  });
}

/** A new version row (previous max + 1); the unique key makes a concurrent publish fail rather than overwrite. */
export async function publishScanProfileVersion(
  db: SafetyDb,
  scanProfileId: string,
  input: ProfileVersionInput,
): Promise<ProfileVersionView> {
  assertValidProfileVersion(input);
  return inTransaction(db, async (tx) => {
    if (
      (await tx.scanProfile.findUnique({ where: { id: scanProfileId }, select: { id: true } })) ===
      null
    ) {
      throw new ScanProfileError('NOT_FOUND', 'profile not found');
    }
    const latest = await tx.scanProfileVersion.aggregate({
      where: { scanProfileId },
      _max: { version: true },
    });
    const row = await tx.scanProfileVersion.create({
      data: {
        scanProfileId,
        version: (latest._max.version ?? 0) + 1,
        defaultDomains: input.defaultDomains,
        domainExecutionClasses: toJson(input.domainExecutionClasses),
        ...(input.advancedConfigSchema === undefined
          ? {}
          : { advancedConfigSchema: toJson(input.advancedConfigSchema) }),
      },
    });
    return view(row);
  });
}

/** Omitting `version` resolves the latest; the caller snapshots the returned id (FR-003). */
export async function resolveScanProfileVersion(
  db: SafetyDb,
  scanProfileId: string,
  version?: number,
): Promise<ProfileVersionView> {
  const row =
    version === undefined
      ? await db.scanProfileVersion.findFirst({
          where: { scanProfileId },
          orderBy: { version: 'desc' },
        })
      : await db.scanProfileVersion.findUnique({
          where: { scanProfileId_version: { scanProfileId, version } },
        });
  if (row === null) throw new ScanProfileError('NOT_FOUND', 'profile version not found');
  return view(row);
}
