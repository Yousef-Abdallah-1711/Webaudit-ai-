/**
 * T067 — R10 / FR-027: "Trust level comes from which root a capability was found
 * in, never from its own manifest. A capability cannot declare itself trusted."
 *
 * This is the one CLAUDE.md lists among the things that are easy to get wrong:
 * "Trust comes from the discovery root, never from a manifest." The failure mode
 * is quiet — an unreviewed capability that registers as VENDORED runs outside the
 * sandbox, and SC-017 stops meaning anything — so the assertions here are about
 * a capability *trying* and failing, not about the happy path.
 *
 * Four ways to try it, all of which must fail:
 *
 *   1. `"trust": "VENDORED"` in the manifest of an installed capability.
 *   2. The other spellings someone would reach for next — `trustLevel`,
 *      `trusted`, `isTrusted`, `verified`, `reviewed`.
 *   3. A symlink from the installed store into the vendored root, so the *path*
 *      claims what the manifest cannot.
 *   4. Reconciliation: writing a trust value into the database that disagrees
 *      with the root the capability was found in.
 */

import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { closeDb, resetDb, seedPlans, testDb } from '../helpers/db.js';
import { discoverCapabilities } from '../../src/services/registry/discover.js';
import { reconcileCapabilities } from '../../src/services/registry/reconcile.js';

let vendoredRoot = '';
let installedRoot = '';
let scratch = '';

const BASE_MANIFEST = {
  name: 'Security Headers Checker',
  version: '1.0.0',
  module: 'SECURITY',
  layer: 'CODE',
  entrypoint: 'dist/index.js',
  requiresCode: false,
  requiredControlLevel: 'NONE',
  estimatedTokens: 0,
} as const;

async function plant(
  root: string,
  id: string,
  extra: Readonly<Record<string, unknown>> = {},
): Promise<string> {
  const dir = join(root, id);
  await mkdir(join(dir, 'dist'), { recursive: true });
  await writeFile(join(dir, 'dist', 'index.js'), 'export default {};\n', 'utf8');
  await writeFile(
    join(dir, 'capability.manifest.json'),
    JSON.stringify({ id, ...BASE_MANIFEST, ...extra }, null, 2),
    'utf8',
  );
  return dir;
}

beforeEach(async () => {
  await resetDb();
  await seedPlans();
  scratch = await mkdtemp(join(tmpdir(), 'webaudit-trust-'));
  vendoredRoot = join(scratch, 'vendored');
  installedRoot = join(scratch, 'installed');
  await mkdir(vendoredRoot, { recursive: true });
  await mkdir(installedRoot, { recursive: true });
});

afterEach(async () => {
  await rm(scratch, { recursive: true, force: true });
});

afterAll(closeDb);

async function discover() {
  return discoverCapabilities({ vendoredRoot, installedRoot });
}

describe('R10 - trust is derived from the discovery root', () => {
  it('calls a capability in the vendored root VENDORED', async () => {
    await plant(vendoredRoot, 'headers-checker');
    const found = await discover();
    expect(found.capabilities).toHaveLength(1);
    expect(found.capabilities[0]?.trust).toBe('VENDORED');
  });

  it('calls a capability in the installed root INSTALLED', async () => {
    await plant(installedRoot, 'headers-checker');
    const found = await discover();
    expect(found.capabilities[0]?.trust).toBe('INSTALLED');
  });

  it('changes trust when the same capability moves root', async () => {
    await plant(installedRoot, 'headers-checker');
    expect((await discover()).capabilities[0]?.trust).toBe('INSTALLED');

    await rm(join(installedRoot, 'headers-checker'), { recursive: true });
    await plant(vendoredRoot, 'headers-checker');
    expect((await discover()).capabilities[0]?.trust).toBe('VENDORED');
  });
});

describe('R10 - a manifest cannot declare itself trusted', () => {
  it('ignores an explicit trust field', async () => {
    await plant(installedRoot, 'liar', { trust: 'VENDORED' });
    const found = await discover();

    expect(found.capabilities[0]?.trust).toBe('INSTALLED');
    // The attempt is reported even though it changed nothing: a capability
    // reaching for trust is a fact about that capability.
    expect(found.trustClaims).toEqual([{ id: 'liar', keys: ['trust'] }]);
  });

  it.each([
    ['trustLevel', { trustLevel: 'VENDORED' }],
    ['trusted', { trusted: true }],
    ['isTrusted', { isTrusted: true }],
    ['verified', { verified: true }],
    ['reviewed', { reviewed: true }],
  ])('ignores %s', async (key, extra) => {
    await plant(installedRoot, 'liar', extra);
    const found = await discover();

    expect(found.capabilities[0]?.trust).toBe('INSTALLED');
    expect(found.trustClaims[0]?.keys).toContain(key);
  });

  it('never lets a trust claim reach the parsed manifest', async () => {
    await plant(installedRoot, 'liar', { trust: 'VENDORED', trusted: true });
    const found = await discover();

    const manifest = found.capabilities[0]?.manifest as Record<string, unknown> | undefined;
    expect(manifest).toBeDefined();
    for (const key of ['trust', 'trustLevel', 'trusted', 'isTrusted', 'verified', 'reviewed']) {
      expect(manifest, key).not.toHaveProperty(key);
    }
  });

  it('does not let a vendored-looking id or originalSource confer trust', async () => {
    await plant(installedRoot, 'vendored-headers-checker', {
      originalSource: 'https://github.com/webaudit/capabilities-vendored',
      vendoredAt: '2026-01-01',
      license: 'MIT',
    });
    expect((await discover()).capabilities[0]?.trust).toBe('INSTALLED');
  });
});

describe('R10 - the path cannot claim what the manifest cannot', () => {
  it('refuses a capability whose real path leaves its root', async () => {
    // The interesting attack: the directory is *inside* the vendored root, but
    // its contents are somewhere the reviewer never looked. A discovery that
    // trusts the entry name would call this VENDORED.
    const outside = join(scratch, 'elsewhere');
    await plant(outside, 'smuggled');
    // `junction` on Windows: a directory symlink there needs elevation, and a
    // hostile suite that only runs as administrator is a suite that does not run.
    await symlink(
      join(outside, 'smuggled'),
      join(vendoredRoot, 'smuggled'),
      process.platform === 'win32' ? 'junction' : 'dir',
    );

    const found = await discover();

    expect(found.capabilities).toHaveLength(0);
    expect(found.rejected.map((r) => r.id)).toContain('smuggled');
    expect(found.rejected[0]?.reason).toMatch(/outside/i);
  });

  it('refuses a capability whose entrypoint is a link to somewhere else', async () => {
    // The subtler version of the attack above. The capability *directory* is
    // exactly where it claims to be — that check already passes — but a path
    // component inside it is a link, so the file the manifest names is not the
    // file that actually gets read.
    //
    // The module's own docstring promises this is confirmed "for the same
    // reason the directory is confirmed", but the implementation only checked
    // that `manifest.entrypoint` was lexically relative (no `..`, not
    // absolute) — the same check the schema already runs. A path with no `..`
    // in it can still escape if a directory along the way is a link, which is
    // exactly what defeated the smuggled-directory case above and precisely
    // why that case is realpath-checked. The entrypoint was not.
    const outside = join(scratch, 'outside-payload');
    await mkdir(outside, { recursive: true });
    await writeFile(join(outside, 'index.js'), 'export default { PAYLOAD: true };\n', 'utf8');

    const capDir = join(installedRoot, 'victim');
    await mkdir(capDir, { recursive: true });
    // `dist` is not a directory here — it is a link to somewhere with no
    // relationship to this capability at all.
    await symlink(outside, join(capDir, 'dist'), process.platform === 'win32' ? 'junction' : 'dir');
    await writeFile(
      join(capDir, 'capability.manifest.json'),
      JSON.stringify({ id: 'victim', ...BASE_MANIFEST, entrypoint: 'dist/index.js' }),
      'utf8',
    );

    const found = await discover();

    expect(found.capabilities).toHaveLength(0);
    expect(found.rejected.map((r) => r.id)).toContain('victim');
    expect(found.rejected[0]?.reason).toMatch(/entrypoint/i);
  });

  it('refuses a manifest whose id does not match its directory', async () => {
    // Otherwise two directories can claim one id, and which one wins depends on
    // readdir order — a coin flip deciding whether the reviewed copy runs.
    const dir = join(installedRoot, 'actual-name');
    await mkdir(join(dir, 'dist'), { recursive: true });
    await writeFile(join(dir, 'dist', 'index.js'), 'export default {};\n', 'utf8');
    await writeFile(
      join(dir, 'capability.manifest.json'),
      JSON.stringify({ id: 'claimed-name', ...BASE_MANIFEST }),
      'utf8',
    );

    const found = await discover();
    expect(found.capabilities).toHaveLength(0);
    expect(found.rejected[0]?.reason).toMatch(/director/i);
  });

  it('prefers the vendored copy when both roots hold the same id, and says so', async () => {
    await plant(vendoredRoot, 'headers-checker');
    await plant(installedRoot, 'headers-checker');

    const found = await discover();

    // Reviewed code wins. The alternative — installed shadowing vendored — is a
    // way to replace a reviewed capability by dropping a directory next to it.
    expect(found.capabilities).toHaveLength(1);
    expect(found.capabilities[0]?.trust).toBe('VENDORED');
    expect(found.shadowed).toEqual(['headers-checker']);
  });
});

describe('R10 - reconciliation writes the derived trust, not the claimed one', () => {
  it('persists INSTALLED for a capability that asked for VENDORED', async () => {
    await plant(installedRoot, 'liar', { trust: 'VENDORED' });
    await reconcileCapabilities(testDb, await discover());

    const row = await testDb.capability.findUniqueOrThrow({ where: { id: 'liar' } });
    expect(row.trust).toBe('INSTALLED');
  });

  it('corrects a stored trust value that no longer matches the root', async () => {
    // The state a bad migration or a hand-edited row would leave behind.
    await plant(installedRoot, 'headers-checker');
    await reconcileCapabilities(testDb, await discover());
    await testDb.capability.update({
      where: { id: 'headers-checker' },
      data: { trust: 'VENDORED' },
    });

    await reconcileCapabilities(testDb, await discover());
    const row = await testDb.capability.findUniqueOrThrow({ where: { id: 'headers-checker' } });
    expect(row.trust).toBe('INSTALLED');
  });

  it('never resets an operator disable', async () => {
    // SC-010: enablement is the operator's, and a restart is not a decision.
    await plant(vendoredRoot, 'headers-checker');
    await reconcileCapabilities(testDb, await discover());
    await testDb.capability.update({
      where: { id: 'headers-checker' },
      data: { isEnabled: false },
    });

    await reconcileCapabilities(testDb, await discover());
    const row = await testDb.capability.findUniqueOrThrow({ where: { id: 'headers-checker' } });
    expect(row.isEnabled).toBe(false);
  });

  it('updates metadata a new version changed', async () => {
    await plant(vendoredRoot, 'headers-checker');
    await reconcileCapabilities(testDb, await discover());

    await rm(join(vendoredRoot, 'headers-checker'), { recursive: true });
    await plant(vendoredRoot, 'headers-checker', {
      name: 'Security Headers Checker v2',
      version: '2.0.0',
      requiredControlLevel: 'ATTESTED',
    });
    await reconcileCapabilities(testDb, await discover());

    const row = await testDb.capability.findUniqueOrThrow({ where: { id: 'headers-checker' } });
    expect(row.version).toBe('2.0.0');
    expect(row.name).toBe('Security Headers Checker v2');
    expect(row.requiredControlLevel).toBe('ATTESTED');
  });

  it('leaves a removed capability row alone rather than deleting its cost history', async () => {
    // `CapabilityExecution.capability` has no cascade, so a delete would either
    // fail or destroy the per-capability cost attribution Principle VI needs.
    // Disk is the source of existence; the database is the source of enablement.
    await plant(vendoredRoot, 'headers-checker');
    await reconcileCapabilities(testDb, await discover());

    await rm(join(vendoredRoot, 'headers-checker'), { recursive: true });
    const afterRemoval = await reconcileCapabilities(testDb, await discover());

    expect(afterRemoval.absent).toEqual(['headers-checker']);
    expect(await testDb.capability.count()).toBe(1);
  });
});

describe('discovery refuses what it cannot validate', () => {
  it('skips a directory with no manifest', async () => {
    await mkdir(join(installedRoot, 'not-a-capability'), { recursive: true });
    const found = await discover();
    expect(found.capabilities).toHaveLength(0);
    expect(found.rejected[0]?.reason).toMatch(/manifest/i);
  });

  it('rejects an unparseable manifest', async () => {
    const dir = join(installedRoot, 'broken');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'capability.manifest.json'), '{ not json', 'utf8');
    const found = await discover();
    expect(found.rejected[0]?.reason).toMatch(/json|parse/i);
  });

  it('rejects an entrypoint that climbs out of the capability directory', async () => {
    await plant(installedRoot, 'climber', { entrypoint: '../../../api/src/app.js' });
    const found = await discover();
    expect(found.capabilities).toHaveLength(0);
    expect(found.rejected[0]?.reason).toMatch(/\.\.|relative/);
  });

  it('rejects a CODE-layer capability that budgets tokens', async () => {
    await plant(installedRoot, 'contradiction', { layer: 'CODE', estimatedTokens: 5000 });
    const found = await discover();
    expect(found.capabilities).toHaveLength(0);
    expect(found.rejected[0]?.reason).toMatch(/zero tokens|Principle III/i);
  });

  it('tolerates a missing root instead of failing to boot', async () => {
    // A fresh deployment has no installed store yet. Refusing to start would
    // make installing the first capability a chicken-and-egg problem.
    const found = await discoverCapabilities({
      vendoredRoot,
      installedRoot: join(scratch, 'does-not-exist'),
    });
    expect(found.capabilities).toHaveLength(0);
    expect(found.rejected).toHaveLength(0);
  });
});
