/**
 * T-control-gate-3 — a real, DB-backed `resolveRequiredControlLevel`.
 *
 * The contract (established by `scans.refusals.test.ts`) is one control
 * level per module type: "the level below which nothing in this module can
 * run" — the *minimum* `requiredControlLevel` among that module's enabled
 * capabilities, since if the target's level reaches that minimum, at least
 * one capability in the module unlocks and the module should not be treated
 * as wholly gated out.
 */

import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { closeDb, resetDb, seedPlans, testDb } from '../helpers/db.js';
import { buildResolveRequiredControlLevel } from '../../src/services/registry/resolve-required-control-level.js';

beforeEach(async () => {
  await resetDb();
  await seedPlans();
});
afterAll(closeDb);

describe('buildResolveRequiredControlLevel', () => {
  it('returns NONE for a module whose capabilities all require NONE', async () => {
    await testDb.capability.create({
      data: {
        id: 'headers-checker',
        name: 'Headers Checker',
        version: '1.0.0',
        module: 'SECURITY',
        layer: 'CODE',
        trust: 'VENDORED',
        requiredControlLevel: 'NONE',
        isEnabled: true,
      },
    });
    const resolve = buildResolveRequiredControlLevel(testDb);
    expect(await resolve('SECURITY')).toBe('NONE');
  });

  it("returns the minimum required level across a module's capabilities", async () => {
    await testDb.capability.create({
      data: {
        id: 'fake-strict',
        name: 'Fake Strict',
        version: '1.0.0',
        module: 'SECURITY',
        layer: 'CODE',
        trust: 'VENDORED',
        requiredControlLevel: 'VERIFIED',
        isEnabled: true,
      },
    });
    await testDb.capability.create({
      data: {
        id: 'fake-lenient',
        name: 'Fake Lenient',
        version: '1.0.0',
        module: 'SECURITY',
        layer: 'CODE',
        trust: 'VENDORED',
        requiredControlLevel: 'NONE',
        isEnabled: true,
      },
    });
    const resolve = buildResolveRequiredControlLevel(testDb);
    // At least one capability (fake-lenient) needs nothing — the module as a
    // whole is not "fully gated", so the minimum (NONE) is the right answer.
    expect(await resolve('SECURITY')).toBe('NONE');
  });

  it('returns VERIFIED when every capability in the module requires it', async () => {
    await testDb.capability.create({
      data: {
        id: 'fake-strict-only',
        name: 'Fake Strict Only',
        version: '1.0.0',
        module: 'SECURITY',
        layer: 'CODE',
        trust: 'VENDORED',
        requiredControlLevel: 'VERIFIED',
        isEnabled: true,
      },
    });
    const resolve = buildResolveRequiredControlLevel(testDb);
    expect(await resolve('SECURITY')).toBe('VERIFIED');
  });

  it('ignores a disabled capability when computing the minimum', async () => {
    await testDb.capability.create({
      data: {
        id: 'fake-strict-disabled',
        name: 'Fake Strict Disabled',
        version: '1.0.0',
        module: 'SECURITY',
        layer: 'CODE',
        trust: 'VENDORED',
        requiredControlLevel: 'VERIFIED',
        isEnabled: false,
      },
    });
    await testDb.capability.create({
      data: {
        id: 'fake-lenient-2',
        name: 'Fake Lenient 2',
        version: '1.0.0',
        module: 'SECURITY',
        layer: 'CODE',
        trust: 'VENDORED',
        requiredControlLevel: 'ATTESTED',
        isEnabled: true,
      },
    });
    const resolve = buildResolveRequiredControlLevel(testDb);
    expect(await resolve('SECURITY')).toBe('ATTESTED');
  });

  it('returns NONE for a module with no registered capabilities at all', async () => {
    const resolve = buildResolveRequiredControlLevel(testDb);
    expect(await resolve('TESTING')).toBe('NONE');
  });
});
