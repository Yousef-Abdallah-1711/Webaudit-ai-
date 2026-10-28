/**
 * Shared fixtures for the SPEC 008 suites. Everything runs against the isolated
 * `webaudit_test` database through the real `f07_*` functions; nothing is mocked.
 */

import type { ExecutionClass, TargetEnvironmentClassification } from '@webaudit/types';
import { testDb } from './db.js';
import { attestControl } from '../../src/services/control-gate/attest.js';
import type { ControlProbe } from '../../src/services/control-gate/verify.js';
import { createAuthorization } from '../../src/services/authorization/create.js';
import { classifyEnvironment } from '../../src/services/authorization/classify-environment.js';
import type { AdmissionRequest } from '../../src/services/safety/admission.js';

const probe: ControlProbe = {
  fetchFile: () => Promise.reject(new Error('probe must not be used')),
  resolveTxt: () => Promise.reject(new Error('probe must not be used')),
};

export const WEB_DESTINATION = { host: 'example.com', path: '/', scheme: 'https', port: null };

export async function makeUser(email: string, opts: { operator?: boolean } = {}): Promise<string> {
  const user = await testDb.user.create({
    data: { email, emailVerifiedAt: new Date(), isOperator: opts.operator === true },
  });
  return user.id;
}

export interface SafetyWorld {
  userId: string;
  targetId: string;
  grantId: string;
}

export async function makeWorld(
  email: string,
  opts: {
    requestBudget?: number;
    concurrencyBudget?: number;
    durationBudget?: number;
    classes?: ExecutionClass[];
    restriction?: TargetEnvironmentClassification[];
    classification?: TargetEnvironmentClassification;
  } = {},
): Promise<SafetyWorld> {
  const userId = await makeUser(email);
  const target = await testDb.target.create({
    data: {
      userId,
      inputType: 'URL',
      canonicalValue: 'https://example.com',
      displayName: 'example',
    },
  });
  await attestControl(testDb, { targetId: target.id, userId });
  await classifyEnvironment(testDb, {
    targetId: target.id,
    actingUserId: userId,
    classification: opts.classification ?? 'STAGING',
  });
  const grant = await createAuthorization(
    testDb,
    {
      targetId: target.id,
      requestingUserId: userId,
      executionClasses: opts.classes ?? ['BROWSER'],
      scope: { targetKind: 'WEB', includedHosts: ['example.com'], includedPathPrefixes: [''] },
      environmentRestriction: opts.restriction ?? ['STAGING'],
      budgets: {
        requestBudget: opts.requestBudget ?? 100,
        concurrencyBudget: opts.concurrencyBudget ?? 5,
        durationBudget: opts.durationBudget ?? 3600,
      },
    },
    probe,
  );
  return { userId, targetId: target.id, grantId: grant.id };
}

let counter = 0;
export function admissionRequest(
  world: SafetyWorld,
  overrides: Partial<AdmissionRequest> = {},
): AdmissionRequest {
  counter += 1;
  return {
    targetId: world.targetId,
    executionClass: 'BROWSER',
    destination: WEB_DESTINATION,
    executionId: `exec-${String(counter)}`,
    idempotencyKey: `key-${String(counter)}`,
    consumes: { request: true, concurrency: true },
    ...overrides,
  };
}

export async function counterOf(grantId: string) {
  return testDb.budgetCounter.findUnique({ where: { targetAuthorizationId: grantId } });
}

export async function liveLeaseCount(grantId: string): Promise<number> {
  return testDb.admissionLease.count({
    where: { targetAuthorizationId: grantId, releasedAt: null, reclaimedAt: null },
  });
}

export async function auditTypes(where: Record<string, unknown> = {}): Promise<string[]> {
  const rows = await testDb.executionAuditEvent.findMany({
    where,
    orderBy: [{ timestamp: 'asc' }, { id: 'asc' }],
    select: { eventType: true },
  });
  return rows.map((r) => r.eventType);
}
