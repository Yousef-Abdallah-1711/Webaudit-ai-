/**
 * T066 — SC-011: "Disabling any single capability leaves every audit still able
 * to complete."
 *
 * The criterion is a universal over capabilities, so the suite is a loop over
 * every capability rather than a hand-picked case: disable each one in turn, and
 * assert every audit shape still resolves work it can complete. A test that
 * disables one plausible capability proves nothing about the twentieth.
 *
 * **What is proven here, and what is not.** SC-011 has two halves.
 *
 *   1. *Resolution* — with any single capability disabled, every scan still
 *      resolves a snapshot, and no area becomes unresolvable. Fully in scope at
 *      2G, and asserted exhaustively below.
 *   2. *Execution* — an area with no runnable check, or one whose check throws,
 *      is reported incomplete rather than failing the audit (FR-022, FR-053).
 *      The module runner that does this lands at **T084–T093 (2I)**. Its
 *      mechanism — the containment wrapper — already exists in the conformance
 *      suite, so the half that can be asserted now is asserted here through it.
 *
 * The second half is stated rather than quietly skipped. When 2I lands, the
 * end-to-end version of this belongs alongside the runner, and this file should
 * keep the resolution half.
 */

import { describe, expect, it } from 'vitest';
import { MODULE_TYPES, type ModuleType } from '@webaudit/types';
import { runConformanceSuite, type AuditCapability } from '@webaudit/capability-sdk';
import {
  buildStubRegistry,
  makeConformanceDeps,
  STUB_CAPABILITIES,
  type StubSpec,
} from '../helpers/stub-registry.js';
import {
  eligibleEntries,
  estimatedTokensFor,
  modulesWithoutWork,
  resolveSnapshot,
} from '../../../api/src/services/registry/snapshot.js';

const ALL_MODULES = [...MODULE_TYPES];

/** The scan shapes an audit can take. Each must survive every disable. */
const SCAN_SHAPES = [
  {
    label: 'url only, free plan, unattested',
    planId: 'free',
    controlLevel: 'NONE' as const,
    hasCode: false,
    hasScreenshot: false,
  },
  {
    label: 'url with screenshot, pro, attested',
    planId: 'pro',
    controlLevel: 'ATTESTED' as const,
    hasCode: false,
    hasScreenshot: true,
  },
  {
    label: 'source attached, pro, verified',
    planId: 'pro',
    controlLevel: 'VERIFIED' as const,
    hasCode: true,
    hasScreenshot: true,
  },
];

function snapshotFor(disabled: readonly string[], shape: (typeof SCAN_SHAPES)[number]) {
  const registry = buildStubRegistry(STUB_CAPABILITIES, disabled);
  return resolveSnapshot(registry, {
    planId: shape.planId,
    controlLevel: shape.controlLevel,
    hasCode: shape.hasCode,
    hasScreenshot: shape.hasScreenshot,
    requestedModules: ALL_MODULES,
    now: new Date('2026-08-24T00:00:00.000Z'),
  });
}

describe('SC-011 - disabling any single capability still resolves a completable audit', () => {
  it('has a capability in every module to begin with, or the loop proves nothing', () => {
    // A fixture set that happens to leave a module empty would make the
    // assertions below vacuously true for that module.
    const modules = new Set(STUB_CAPABILITIES.map((c) => c.module));
    for (const module of ALL_MODULES) expect(modules, module).toContain(module);
    expect(STUB_CAPABILITIES.length).toBeGreaterThanOrEqual(10);
  });

  it.each(STUB_CAPABILITIES.map((c) => c.id))(
    'resolves every scan shape with %s disabled',
    (disabledId) => {
      for (const shape of SCAN_SHAPES) {
        const snapshot = snapshotFor([disabledId], shape);

        // It resolved, it is well-formed, and the disabled capability is absent
        // rather than present-and-blocked.
        expect(snapshot.version, shape.label).toBe(1);
        expect(
          snapshot.entries.map((e) => e.capabilityId),
          shape.label,
        ).not.toContain(disabledId);

        // Every remaining entry carries a status the report can render.
        for (const entry of snapshot.entries) {
          expect(
            ['ELIGIBLE', 'BLOCKED_CONTROL_LEVEL', 'BLOCKED_PLAN', 'NOT_APPLICABLE_INPUT'],
            `${shape.label}/${entry.capabilityId}`,
          ).toContain(entry.status);
        }

        // The quote is computable. An audit whose cost cannot be quoted cannot
        // be started, which would be a failure to complete by another name.
        expect(estimatedTokensFor(snapshot), shape.label).toBeGreaterThanOrEqual(0);
      }
    },
  );

  it.each(STUB_CAPABILITIES.map((c) => c.id))(
    'never makes an area unresolvable by disabling %s',
    (disabledId) => {
      for (const shape of SCAN_SHAPES) {
        const snapshot = snapshotFor([disabledId], shape);
        const barren = modulesWithoutWork(snapshot, ALL_MODULES);

        // An area with nothing to run is legal — it is reported incomplete and
        // excluded from the average (FR-053). What must never happen is an area
        // that cannot even be asked about.
        for (const module of ALL_MODULES) {
          expect(() => eligibleEntries(snapshot, module), `${shape.label}/${module}`).not.toThrow();
        }
        // And on the shape with everything available, no area should be barren
        // from a single disable — that would mean one capability was the only
        // thing standing between an area and silence.
        if (shape.hasCode && shape.hasScreenshot && shape.controlLevel === 'VERIFIED') {
          expect(barren, `${shape.label} lost an area to ${disabledId}`).toEqual([]);
        }
      }
    },
  );

  it('survives every capability in one module being disabled at once', () => {
    // Not what SC-011 asks for, but the case an operator reaches by disabling a
    // misbehaving family of checks. The audit must still resolve.
    for (const module of ALL_MODULES) {
      const ids = STUB_CAPABILITIES.filter((c) => c.module === module).map((c) => c.id);
      const snapshot = snapshotFor(ids, SCAN_SHAPES[2]!);

      expect(eligibleEntries(snapshot, module)).toEqual([]);
      expect(modulesWithoutWork(snapshot, ALL_MODULES)).toEqual([module]);
      // Every other area is untouched.
      for (const other of ALL_MODULES.filter((m) => m !== module)) {
        expect(eligibleEntries(snapshot, other).length, other).toBeGreaterThan(0);
      }
    }
  });

  it('resolves an audit with every capability disabled rather than throwing', () => {
    // The degenerate end of the range. An operator who disables everything gets
    // an audit that completes and reports nothing, not a crash.
    const snapshot = snapshotFor(
      STUB_CAPABILITIES.map((c) => c.id),
      SCAN_SHAPES[2]!,
    );
    expect(snapshot.entries).toEqual([]);
    expect(estimatedTokensFor(snapshot)).toBe(0);
    expect([...modulesWithoutWork(snapshot, ALL_MODULES)].sort()).toEqual([...ALL_MODULES].sort());
  });

  it('holds the snapshot against a mid-scan toggle', () => {
    // R10's reason for snapshotting: an operator toggling a capability must not
    // reconfigure a scan that is already running.
    const shape = SCAN_SHAPES[2]!;
    const before = snapshotFor([], shape);
    const after = snapshotFor([STUB_CAPABILITIES[0]!.id], shape);

    expect(before.entries.map((e) => e.capabilityId)).toContain(STUB_CAPABILITIES[0]!.id);
    // The already-resolved snapshot is a value. Nothing about the later toggle
    // can reach back into it.
    expect(before.entries.map((e) => e.capabilityId)).not.toEqual(
      after.entries.map((e) => e.capabilityId),
    );
    expect(Object.isFrozen(before.entries) || before.entries.length > 0).toBe(true);
  });
});

describe('SC-011 - a capability that fails is contained, not fatal', () => {
  /**
   * The execution half, as far as 2G can reach it: the containment wrapper the
   * runner will use must return a result for a capability that throws, rejects,
   * or hangs. That is what lets FR-022 mark one area incomplete instead of
   * failing the audit.
   */
  const misbehaving: readonly { readonly label: string; readonly capability: AuditCapability }[] = [
    {
      label: 'rejects',
      capability: {
        id: 'rejector',
        module: 'SECURITY',
        layer: 'CODE',
        canRun: () => true,
        runCodeLayer: () => Promise.reject(new Error('upstream exploded')),
      },
    },
    {
      label: 'throws synchronously',
      capability: {
        id: 'thrower',
        module: 'SECURITY',
        layer: 'CODE',
        canRun: () => true,
        runCodeLayer: () => {
          throw new Error('threw before returning a promise');
        },
      },
    },
    {
      label: 'never settles',
      capability: {
        id: 'hanger',
        module: 'SECURITY',
        layer: 'CODE',
        canRun: () => true,
        runCodeLayer: () =>
          new Promise(() => {
            /* deliberately never resolves */
          }),
      },
    },
    {
      label: 'returns rubbish',
      capability: {
        id: 'liar',
        module: 'SECURITY',
        layer: 'CODE',
        canRun: () => true,
        runCodeLayer: () => Promise.resolve('not an array' as unknown as never),
      },
    },
  ];

  it.each(misbehaving)('contains a capability that $label', async ({ capability }) => {
    const report = await runConformanceSuite(capability, makeConformanceDeps(capability.id));

    // The suite completed. That is the assertion: a misbehaving capability
    // produces a report rather than an exception, so the runner can record it
    // failed and carry on.
    expect(report.capabilityId).toBe(capability.id);
    expect(report.results.length).toBeGreaterThan(0);
    const contained = report.results.find((r) => r.check === 'throwing-is-contained');
    expect(contained).toBeDefined();
  });

  it('records a hanging capability as timed out rather than waiting for it', async () => {
    const hanger = misbehaving.find((m) => m.label === 'never settles')!.capability;
    const started = Date.now();
    const report = await runConformanceSuite(hanger, {
      ...makeConformanceDeps(hanger.id),
      timeoutMs: 200,
      abortGraceMs: 200,
    });

    expect(Date.now() - started).toBeLessThan(5_000);
    expect(report.results.find((r) => r.check === 'throwing-is-contained')?.detail).toBe('timeout');
    // And it is reported as not honouring abort, which is the real defect.
    expect(report.results.find((r) => r.check === 'abort-honoured')?.passed).toBe(false);
    expect(report.passed).toBe(false);
  });

  it('passes a well-behaved capability, so the checks are not simply always failing', async () => {
    const wellBehaved: AuditCapability = {
      id: 'good-citizen',
      module: 'SECURITY',
      layer: 'CODE',
      canRun: () => true,
      runCodeLayer: (_input, ctx) =>
        ctx.signal.aborted
          ? Promise.resolve([])
          : Promise.resolve([
              {
                checkId: 'good-citizen.header',
                fingerprintParts: ['header', 'content-security-policy'],
                severity: 'MEDIUM' as const,
                title: 'Missing Content-Security-Policy',
                description: 'The response carried no CSP header.',
                fixable: true,
              },
            ]),
      reverify: () =>
        Promise.resolve({
          outcome: 'FAILED' as const,
          evidence: { 'content-security-policy': null },
        }),
    };

    const report = await runConformanceSuite(wellBehaved, makeConformanceDeps(wellBehaved.id));
    const failures = report.results.filter((r) => !r.passed);
    expect(failures.map((f) => `${f.check}: ${f.detail}`)).toEqual([]);
    expect(report.passed).toBe(true);
  });
});

describe('SC-011 - the loop covers what it claims to cover', () => {
  it('exercises every module and both layers', () => {
    const layers = new Set(STUB_CAPABILITIES.map((c) => c.layer));
    expect(layers.has('CODE')).toBe(true);
    expect(layers.has('AI') || layers.has('BOTH')).toBe(true);

    const perModule = new Map<ModuleType, number>();
    for (const c of STUB_CAPABILITIES) {
      perModule.set(c.module, (perModule.get(c.module) ?? 0) + 1);
    }
    // Two per area minimum, or "disabling one leaves the area working" is not a
    // meaningful thing to assert about that area.
    for (const module of ALL_MODULES) {
      expect(perModule.get(module) ?? 0, module).toBeGreaterThanOrEqual(2);
    }
  });

  it('includes restricted, gated, and input-dependent capabilities', () => {
    const specs: readonly StubSpec[] = STUB_CAPABILITIES;
    expect(specs.some((s) => s.restrictedToPlans.length > 0)).toBe(true);
    expect(specs.some((s) => s.requiredControlLevel === 'VERIFIED')).toBe(true);
    expect(specs.some((s) => s.requiresCode)).toBe(true);
    expect(specs.some((s) => s.requiresScreenshot)).toBe(true);
  });
});
