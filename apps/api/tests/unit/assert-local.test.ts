/**
 * FR-023 (T074) — `assertCapabilitiesAreLocal`'s own fail-closed guarantee had
 * zero direct test coverage anywhere in this monorepo before this file: every
 * other test that reconciles capabilities only ever exercises the case where
 * every entrypoint is genuinely present, so the one thing this module exists
 * to catch — a capability whose manifest reconciled but whose code is not on
 * disk (a partial checkout, a `.gitignore`d build output, a vendoring script
 * that copied the manifest and not the entry file) — had never actually been
 * proven to throw.
 *
 * Discovery runs for real against the real `packages/capabilities-vendored`
 * root rather than a hand-built fixture manifest, so this doubles as a live
 * check that every vendored capability's entrypoint is genuinely on disk —
 * the exact thing a partial checkout or a stale `.gitignore`d build artifact
 * would otherwise only surface as a silent, empty audit area in production.
 */
import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { discoverCapabilities } from '../../src/services/registry/discover.js';
import {
  assertCapabilitiesAreLocal,
  checkCapabilitiesAreLocal,
  CapabilityNotLocalError,
} from '../../src/services/registry/assert-local.js';

const VENDORED_ROOT = fileURLToPath(
  new URL('../../../../packages/capabilities-vendored', import.meta.url),
);
// Deliberately never created — `discoverManifestsInRoot` already treats a
// missing root as "found nothing" (`discover.ts`'s own note), so this proves
// that path rather than any real installed capability.
const EMPTY_INSTALLED_ROOT = fileURLToPath(new URL('../../../../var/capabilities-installed', import.meta.url));

async function discoverReal() {
  const result = await discoverCapabilities({
    vendoredRoot: VENDORED_ROOT,
    installedRoot: EMPTY_INSTALLED_ROOT,
  });
  expect(result.capabilities.length, 'the real vendored root must discover something real').toBeGreaterThan(0);
  return result.capabilities;
}

describe('FR-023 — assertCapabilitiesAreLocal fails closed on a missing entrypoint', () => {
  it('passes cleanly against the real, currently-checked-out vendored capabilities', async () => {
    const discovered = await discoverReal();
    const report = await assertCapabilitiesAreLocal(discovered);
    expect(report.missing).toEqual([]);
    expect(report.checked).toBe(discovered.length);
  });

  it('checkCapabilitiesAreLocal reports a missing entrypoint without throwing', async () => {
    const discovered = await discoverReal();
    const tampered = [
      { ...discovered[0]!, entrypointPath: `${discovered[0]!.entrypointPath}.does-not-exist` },
      ...discovered.slice(1),
    ];

    const report = await checkCapabilitiesAreLocal(tampered);

    expect(report.checked).toBe(tampered.length);
    expect(report.missing).toEqual([
      { id: tampered[0]!.id, path: tampered[0]!.entrypointPath },
    ]);
  });

  it('assertCapabilitiesAreLocal throws CapabilityNotLocalError naming every missing capability, not just the first', async () => {
    const discovered = await discoverReal();
    expect(discovered.length, 'need at least two real capabilities for this case').toBeGreaterThanOrEqual(2);
    const tampered = discovered.map((capability, index) =>
      index < 2 ? { ...capability, entrypointPath: `${capability.entrypointPath}.does-not-exist` } : capability,
    );

    const error = await assertCapabilitiesAreLocal(tampered).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(CapabilityNotLocalError);
    const notLocal = error as CapabilityNotLocalError;
    expect(notLocal.missing).toHaveLength(2);
    expect(notLocal.missing.map((m) => m.id).sort()).toEqual(
      [tampered[0]!.id, tampered[1]!.id].sort(),
    );
    expect(notLocal.message).toContain(tampered[0]!.id);
    expect(notLocal.message).toContain(tampered[1]!.id);
  });
});
