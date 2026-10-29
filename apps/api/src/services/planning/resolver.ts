/**
 * Plan Resolver (execution-plan-contract.md, FR-005/006/007/011/029, U-1 step 4a).
 *
 * Deterministic and fail-closed: every refusal — F01, graph, deadline, a missing engine, an internal
 * error — comes back as `state: REFUSED`, never as an exception and never as a default `RESOLVED`.
 * Tenant ownership is re-derived from the Scan / reverified Issue, never taken from the caller.
 * The plan and its whole graph are written in one transaction.
 */

import { randomUUID } from 'node:crypto';
import type { ExecutionClass, ModuleType } from '@webaudit/types';
import type { Prisma } from '../../../prisma/generated/client/index.js';
import type { AuthzResult } from '../authorization/check.js';
import type { AuthorizationCheckInput } from '../authorization/check.js';
import type { SafetyDb } from '../safety/db.js';
import { inTransaction } from '../safety/db.js';
import {
  DEFAULT_CUSTOM_DOMAIN_CLASSES,
  type EngineRegistry,
  type EngineTemplateUnit,
} from './engine-registry.js';
import {
  isPassiveClass,
  topologicalOrder,
  validateExecutionGraph,
  PlanGraphError,
  type ExecutionUnitClass,
  type GraphEdge,
} from './graph.js';
import {
  computePlanDeadline,
  DEFAULT_PLAN_DEADLINE_CONSTANTS,
  PlanDeadlineError,
  type DeadlineUnit,
  type GrantRef,
  type PlanDeadlineConstants,
} from './plan-deadline.js';
import {
  type DomainExecutionClasses,
  resolveScanProfileVersion,
  ScanProfileError,
} from './profiles.js';
import { findSecretKey, parseScanConfiguration } from './scan-configuration.js';

export type PlanKind = 'INITIAL' | 'REVERIFY';

export interface ResolvePlanDeps {
  db: SafetyDb;
  registry: EngineRegistry;
  /** F01 `isAuthorized`, injected so a test can prove it is called fresh (FR-007). */
  isAuthorized: (input: AuthorizationCheckInput) => Promise<AuthzResult>;
  constants?: PlanDeadlineConstants;
}

export interface ResolvePlanSubject {
  /** INITIAL: the scan the plan belongs to. REVERIFY: the finding being re-checked. */
  scanId?: string;
  reverifyIssueId?: string;
  /**
   * REVERIFY only: the execution class the reverified finding's check belongs to. The finding-to-class
   * mapping is each engine spec's to declare, so the caller supplies it; absent means the passive baseline.
   */
  reverifyClass?: ExecutionUnitClass;
}

export interface PlannedUnit {
  id: string;
  key: string;
  executionUnitClass: ExecutionUnitClass;
  engineId: string;
  status: 'PLANNED' | 'SKIPPED';
  targetAuthorizationId: string | null;
}

export type ResolvedPlan =
  | {
      state: 'RESOLVED';
      planId: string;
      replayed: boolean;
      deadlineMs: number;
      scanProfileVersionId: string | null;
      units: PlannedUnit[];
      edges: Array<{ unitId: string; dependsOnUnitId: string }>;
    }
  | { state: 'REFUSED'; refusalReason: string; planId: string | null; replayed: boolean };

interface Destination {
  host: string;
  path: string;
  scheme: string;
  port: number | null;
}

class Refusal extends Error {}

const refuse = (reason: string): never => {
  throw new Refusal(reason);
};

/** The origin a resolution-time check is representative of; the per-destination check recurs at dispatch (FR-022a). */
export function destinationFromUrl(raw: string): Destination | null {
  try {
    const u = new URL(raw);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    return {
      host: u.hostname.toLowerCase(),
      path: u.pathname === '' ? '/' : u.pathname,
      scheme: u.protocol.slice(0, -1),
      port: u.port === '' ? null : Number(u.port),
    };
  } catch {
    return null;
  }
}

interface Expanded {
  id: string;
  template: EngineTemplateUnit;
  domain: ModuleType;
  skipped: string | null;
}

export async function resolvePlan(
  deps: ResolvePlanDeps,
  rawConfig: unknown,
  kind: PlanKind,
  now: Date,
  subject: ResolvePlanSubject,
): Promise<ResolvedPlan> {
  const constants = deps.constants ?? DEFAULT_PLAN_DEADLINE_CONSTANTS;
  let userId: string | null = null;
  try {
    // FR-011: exactly one initial plan per scan — a repeat call returns the stored result.
    if (kind === 'INITIAL' && subject.scanId !== undefined) {
      const existing = await readExisting(deps.db, subject.scanId);
      if (existing !== null) return existing;
    }
    const parsed = parseScanConfiguration(rawConfig);
    if (!parsed.ok) return await persistRefusal(deps.db, kind, subject, null, null, parsed.reason);
    const config = parsed.config;

    // Tenant + destination are re-derived from owned rows, never from the caller.
    const derived = await deriveOwnership(deps.db, kind, subject, config.targetId);
    userId = derived.userId;

    // Step 1: domains and per-domain class requirement.
    let domains: ModuleType[];
    let classMap: DomainExecutionClasses;
    let scanProfileVersionId: string | null = null;
    let perDomain: Record<string, unknown> = {};
    if (kind === 'REVERIFY' && config.profile.kind !== 'CUSTOM') {
      return await persistRefusal(
        deps.db,
        kind,
        subject,
        userId,
        null,
        'INVALID_CONFIGURATION: REVERIFY takes one custom domain',
      );
    }
    if (config.profile.kind === 'NAMED') {
      const version = await resolveScanProfileVersion(
        deps.db,
        config.profile.scanProfileId,
        config.profile.scanProfileVersion,
      );
      domains = version.defaultDomains;
      classMap = version.domainExecutionClasses;
      scanProfileVersionId = version.id;
      perDomain = config.profile.perDomainConfig ?? {};
    } else {
      domains = config.profile.domains;
      classMap =
        kind === 'REVERIFY' && subject.reverifyClass !== undefined
          ? { [domains[0] as ModuleType]: [subject.reverifyClass] }
          : DEFAULT_CUSTOM_DOMAIN_CLASSES;
      perDomain = config.profile.perDomainConfig ?? {};
    }
    if (kind === 'REVERIFY' && domains.length !== 1) {
      return await persistRefusal(
        deps.db,
        kind,
        subject,
        userId,
        null,
        'INVALID_CONFIGURATION: REVERIFY takes exactly one domain',
      );
    }
    if (findSecretKey(perDomain) !== null) refuse('INVALID_CONFIGURATION: secret-looking key');

    // Step 2/3: one fresh F01 call per distinct non-passive class (never cached across calls); refuse the whole plan on any refusal.
    const classes = [...new Set(domains.flatMap((d) => classMap[d] ?? []))] as ExecutionUnitClass[];
    for (const d of domains)
      if ((classMap[d] ?? []).length === 0)
        refuse(`INVALID_CONFIGURATION: domain ${d} has no execution class`);
    const grantByClass = new Map<ExecutionUnitClass, string>();
    for (const cls of [...classes].sort()) {
      if (isPassiveClass(cls)) continue;
      if (derived.destination === null) refuse(`DESTINATION_UNRESOLVED:${cls}`);
      const result = await deps.isAuthorized({
        targetId: config.targetId,
        userId: derived.userId,
        executionClass: cls as ExecutionClass,
        destination: derived.destination as Destination,
        now,
      });
      if (result.outcome !== 'AUTHORIZED') {
        refuse(`${(result as { reason: string }).reason}:${cls}`);
      }
      grantByClass.set(cls, (result as { grantId: string }).grantId);
    }

    // Step 4: expand to units and edges from the engines' own templates (no template ⇒ no engine ⇒ refuse).
    const expanded: Expanded[] = [];
    const idByKey = new Map<string, string>();
    for (const domain of [...domains].sort()) {
      for (const cls of [...(classMap[domain] ?? [])].sort()) {
        const templates = deps.registry.templatesFor(domain, cls);
        if (templates.length === 0) refuse(`NO_ENGINE_REGISTERED:${domain}:${cls}`);
        const local = new Map<string, string>();
        for (const t of templates) {
          const id = randomUUID();
          local.set(t.key, id);
          const skipped = t.skipWhen === undefined ? null : t.skipWhen(perDomain[domain]);
          expanded.push({ id, template: t, domain, skipped });
          idByKey.set(`${domain}\u0000${t.key}`, id);
        }
      }
    }
    const edges: GraphEdge[] = [];
    for (const e of expanded) {
      for (const dep of e.template.dependsOnKeys ?? []) {
        const target = idByKey.get(`${e.domain}\u0000${dep}`);
        if (target === undefined) refuse(`INVALID_CONFIGURATION: unknown dependency ${dep}`);
        edges.push({ unitId: e.id, dependsOnUnitId: target as string });
      }
    }
    // A unit that waits on a skipped unit can never run; it is skipped too ("false means skipped, never failed").
    for (let changed = true; changed;) {
      changed = false;
      const skippedIds = new Set(expanded.filter((x) => x.skipped !== null).map((x) => x.id));
      for (const e of expanded) {
        if (e.skipped !== null) continue;
        const blocker = edges.find((x) => x.unitId === e.id && skippedIds.has(x.dependsOnUnitId));
        if (blocker !== undefined) {
          e.skipped = 'PREDECESSOR_SKIPPED';
          changed = true;
        }
      }
    }

    // Step 5: validate the graph. Cyclic / dangling input is this spec's own defect class.
    const graphUnits = expanded.map((e) => ({
      id: e.id,
      executionUnitClass: e.template.executionUnitClass,
    }));
    try {
      validateExecutionGraph(graphUnits, edges);
      topologicalOrder(graphUnits, edges);
    } catch (error) {
      if (error instanceof PlanGraphError)
        refuse(error.code === 'CYCLE' ? 'cyclic dependency graph' : `INVALID_GRAPH:${error.code}`);
      throw error;
    }

    // Step 4a: the U-1 deadline over the units that will actually run and the grants they hold.
    const live = expanded.filter((e) => e.skipped === null);
    const liveIds = new Set(live.map((e) => e.id));
    const deadlineUnits: DeadlineUnit[] = live.map((e) => ({
      id: e.id,
      executionUnitClass: e.template.executionUnitClass,
      timeoutPolicyMs: e.template.timeoutPolicyMs,
      hardStopMarginMs: e.template.hardStopMarginMs,
      maxAttempts: e.template.maxAttempts,
    }));
    const grantIds = [
      ...new Set(
        live
          .map((e) => grantByClass.get(e.template.executionUnitClass))
          .filter((g): g is string => g !== undefined),
      ),
    ];
    const grantRows = await Promise.all(
      grantIds.map(async (id) => {
        const row = await deps.db.targetAuthorization.findUnique({
          where: { id },
          select: { expiresAt: true },
        });
        if (row === null) refuse('GRANT_NOT_FOUND');
        return { id, expiresAt: (row as { expiresAt: Date }).expiresAt } satisfies GrantRef;
      }),
    );
    const deadline = computePlanDeadline(
      deadlineUnits,
      edges.filter((e) => liveIds.has(e.unitId) && liveIds.has(e.dependsOnUnitId)),
      grantRows,
      now,
      constants,
    );
    if ('refused' in deadline) refuse(deadline.refused);
    const ok = deadline as { deadlineMs: number; breakdown: unknown };

    // Step 6: snapshot — one transaction, plan + graph together.
    const planId = randomUUID();
    const units: PlannedUnit[] = expanded.map((e) => ({
      id: e.id,
      key: e.template.key,
      executionUnitClass: e.template.executionUnitClass,
      engineId: e.template.engineId,
      status: e.skipped === null ? 'PLANNED' : 'SKIPPED',
      targetAuthorizationId: isPassiveClass(e.template.executionUnitClass)
        ? null
        : (grantByClass.get(e.template.executionUnitClass) ?? null),
    }));
    try {
      await inTransaction(deps.db, async (tx) => {
        await tx.scanPlan.create({
          data: {
            id: planId,
            kind,
            userId: derived.userId,
            ...(subject.scanId !== undefined && kind === 'INITIAL'
              ? { scanId: subject.scanId }
              : {}),
            ...(subject.reverifyIssueId !== undefined && kind === 'REVERIFY'
              ? { reverifyIssueId: subject.reverifyIssueId }
              : {}),
            scanProfileVersionId,
            state: 'RESOLVED',
            resolvedAt: now,
            deadlineMs: ok.deadlineMs,
            deadlineBreakdown: ok.breakdown as Prisma.InputJsonValue,
          },
        });
        for (const e of expanded) {
          const unitClass = e.template.executionUnitClass;
          await tx.executionUnit.create({
            data: {
              id: e.id,
              scanPlanId: planId,
              userId: derived.userId,
              targetId: config.targetId,
              targetAuthorizationId: isPassiveClass(unitClass)
                ? null
                : (grantByClass.get(unitClass) ?? null),
              executionUnitClass: unitClass,
              engineId: e.template.engineId,
              configuration: (e.template.configuration ?? {}) as Prisma.InputJsonValue,
              priority: e.template.priority,
              timeoutPolicyMs: e.template.timeoutPolicyMs,
              retryPolicy: { maxAttempts: e.template.maxAttempts, eligibleFailureClasses: [] },
              requiresSafetyCheckpoint: !isPassiveClass(unitClass) && unitClass !== 'TELEMETRY',
              idempotencyKey: `${e.id}:1`,
              status: e.skipped === null ? 'PLANNED' : 'SKIPPED',
              ...(e.skipped === null ? {} : { skippedReason: e.skipped }),
              createdAt: now,
            },
          });
        }
        for (const edge of edges) {
          await tx.executionDependency.create({
            data: { executionUnitId: edge.unitId, dependsOnExecutionUnitId: edge.dependsOnUnitId },
          });
        }
      });
    } catch (error) {
      // A concurrent resolver for the same scan won (unique index): return its plan, never a second one.
      if (
        kind === 'INITIAL' &&
        subject.scanId !== undefined &&
        (error as { code?: string }).code === 'P2002'
      ) {
        const existing = await readExisting(deps.db, subject.scanId);
        if (existing !== null) return existing;
      }
      throw error;
    }
    return {
      state: 'RESOLVED',
      planId,
      replayed: false,
      deadlineMs: ok.deadlineMs,
      scanProfileVersionId,
      units,
      edges: edges.map((e) => ({ unitId: e.unitId, dependsOnUnitId: e.dependsOnUnitId })),
    };
  } catch (error) {
    const reason =
      error instanceof Refusal
        ? error.message
        : error instanceof ScanProfileError
          ? `INVALID_CONFIGURATION: ${error.code}`
          : error instanceof PlanDeadlineError
            ? 'INTERNAL_ERROR:deadline'
            : 'INTERNAL_ERROR';
    return persistRefusal(deps.db, kind, subject, userId, null, reason);
  }
}

async function deriveOwnership(
  db: SafetyDb,
  kind: PlanKind,
  subject: ResolvePlanSubject,
  targetId: string,
): Promise<{ userId: string; destination: Destination | null }> {
  if (kind === 'INITIAL') {
    if (subject.scanId === undefined) return refuse('INVALID_CONFIGURATION: scanId required');
    const scan = await db.scan.findUnique({
      where: { id: subject.scanId },
      select: { userId: true, targetId: true },
    });
    if (scan === null || scan.targetId !== targetId) return refuse('SCAN_NOT_FOUND');
    const target = await db.target.findFirst({
      where: { id: targetId, userId: scan.userId },
      select: { canonicalValue: true },
    });
    if (target === null) return refuse('TARGET_NOT_FOUND');
    return { userId: scan.userId, destination: destinationFromUrl(target.canonicalValue) };
  }
  if (subject.reverifyIssueId === undefined)
    return refuse('INVALID_CONFIGURATION: reverifyIssueId required');
  const issue = await db.issue.findUnique({
    where: { id: subject.reverifyIssueId },
    select: { location: true, scan: { select: { userId: true, targetId: true } } },
  });
  if (issue === null || issue.scan.targetId !== targetId) return refuse('ISSUE_NOT_FOUND');
  // The reverified finding's own location is the destination (execution-plan-contract step 2), not the origin.
  const target = await db.target.findFirst({
    where: { id: targetId, userId: issue.scan.userId },
    select: { canonicalValue: true },
  });
  if (target === null) return refuse('TARGET_NOT_FOUND');
  const base = destinationFromUrl(target.canonicalValue);
  const located =
    issue.location === null
      ? null
      : destinationFromUrl(new URL(issue.location, target.canonicalValue).toString());
  return { userId: issue.scan.userId, destination: located ?? base };
}

async function readExisting(db: SafetyDb, scanId: string): Promise<ResolvedPlan | null> {
  const plan = await db.scanPlan.findFirst({
    where: { scanId, kind: 'INITIAL' },
    include: { executionUnits: { include: { dependencies: true } } },
  });
  if (plan === null) return null;
  if (plan.state === 'REFUSED') {
    return {
      state: 'REFUSED',
      refusalReason: plan.refusalReason ?? 'REFUSED',
      planId: plan.id,
      replayed: true,
    };
  }
  return {
    state: 'RESOLVED',
    planId: plan.id,
    replayed: true,
    deadlineMs: plan.deadlineMs ?? 0,
    scanProfileVersionId: plan.scanProfileVersionId,
    units: plan.executionUnits.map((u) => ({
      id: u.id,
      key: u.engineId,
      executionUnitClass: u.executionUnitClass,
      engineId: u.engineId,
      status: u.status === 'SKIPPED' ? 'SKIPPED' : 'PLANNED',
      targetAuthorizationId: u.targetAuthorizationId,
    })),
    edges: plan.executionUnits.flatMap((u) =>
      u.dependencies.map((d) => ({
        unitId: d.executionUnitId,
        dependsOnUnitId: d.dependsOnExecutionUnitId,
      })),
    ),
  };
}

/** A refusal is recorded (best effort) and always returned; a persistence failure still returns REFUSED. */
async function persistRefusal(
  db: SafetyDb,
  kind: PlanKind,
  subject: ResolvePlanSubject,
  userId: string | null,
  _profile: null,
  reason: string,
): Promise<ResolvedPlan> {
  const subjectOk =
    kind === 'INITIAL' ? subject.scanId !== undefined : subject.reverifyIssueId !== undefined;
  if (userId === null || !subjectOk)
    return { state: 'REFUSED', refusalReason: reason, planId: null, replayed: false };
  try {
    const plan = await db.scanPlan.create({
      data: {
        kind,
        userId,
        ...(kind === 'INITIAL'
          ? { scanId: subject.scanId as string }
          : { reverifyIssueId: subject.reverifyIssueId as string }),
        state: 'REFUSED',
        refusalReason: reason.slice(0, 500),
      },
    });
    return { state: 'REFUSED', refusalReason: reason, planId: plan.id, replayed: false };
  } catch {
    if (kind === 'INITIAL' && subject.scanId !== undefined) {
      try {
        const existing = await readExisting(db, subject.scanId);
        if (existing !== null) return existing;
      } catch {
        /* fall through: report the refusal itself */
      }
    }
    return { state: 'REFUSED', refusalReason: reason, planId: null, replayed: false };
  }
}
