/**
 * T249 — `discoverManifestsInRoot`, extracted from `apps/api`'s
 * `discover.ts` so `apps/worker` can resolve which capabilities exist from
 * the same real directory walk instead of a hardcoded per-module table
 * (Constitution I). `apps/api/tests/adverse/capability-trust.test.ts`
 * already covers the full R10 confinement suite through the dual-root
 * `discoverCapabilities` wrapper; this is the single-root primitive's own
 * direct coverage.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { discoverManifestsInRoot } from '../../src/discover.js';

let root = '';

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

async function plant(id: string, extra: Readonly<Record<string, unknown>> = {}): Promise<void> {
  const dir = join(root, id);
  await mkdir(join(dir, 'dist'), { recursive: true });
  await writeFile(join(dir, 'dist', 'index.js'), 'export default {};\n', 'utf8');
  await writeFile(
    join(dir, 'capability.manifest.json'),
    JSON.stringify({ id, ...BASE_MANIFEST, ...extra }, null, 2),
    'utf8',
  );
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'webaudit-discover-'));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('discoverManifestsInRoot', () => {
  it('finds a valid capability and resolves its entrypoint to an absolute path', async () => {
    await plant('headers-checker');
    const result = await discoverManifestsInRoot(root);
    expect(result.found).toHaveLength(1);
    expect(result.found[0]?.id).toBe('headers-checker');
    expect(result.found[0]?.entrypointPath).toMatch(/dist[/\\]index\.js$/);
    expect(result.rejected).toEqual([]);
  });

  it('reads module and layer straight from the manifest, not from any caller-side table', async () => {
    await plant('meta-checker', { module: 'SEO', layer: 'AI', estimatedTokens: 100 });
    const result = await discoverManifestsInRoot(root);
    expect(result.found[0]?.manifest.module).toBe('SEO');
    expect(result.found[0]?.manifest.layer).toBe('AI');
  });

  it('rejects a directory with no manifest', async () => {
    await mkdir(join(root, 'not-a-capability'), { recursive: true });
    const result = await discoverManifestsInRoot(root);
    expect(result.found).toEqual([]);
    expect(result.rejected[0]?.reason).toMatch(/manifest/i);
  });

  it('rejects a manifest id that disagrees with its directory name', async () => {
    await mkdir(join(root, 'actual-name', 'dist'), { recursive: true });
    await writeFile(join(root, 'actual-name', 'dist', 'index.js'), 'export default {};\n', 'utf8');
    await writeFile(
      join(root, 'actual-name', 'capability.manifest.json'),
      JSON.stringify({ id: 'claimed-name', ...BASE_MANIFEST }),
      'utf8',
    );
    const result = await discoverManifestsInRoot(root);
    expect(result.found).toEqual([]);
    expect(result.rejected[0]?.reason).toMatch(/director/i);
  });

  it('rejects an entrypoint that climbs out of the capability directory', async () => {
    await plant('climber', { entrypoint: '../../../etc/passwd' });
    const result = await discoverManifestsInRoot(root);
    expect(result.found).toEqual([]);
    expect(result.rejected[0]?.reason).toMatch(/\.\.|relative/);
  });

  it('reports a trust-claiming manifest without acting on it', async () => {
    await plant('liar', { trust: 'VENDORED' });
    const result = await discoverManifestsInRoot(root);
    expect(result.found).toHaveLength(1);
    expect(result.trustClaims).toEqual([{ id: 'liar', keys: ['trust'] }]);
    expect(result.found[0]?.manifest).not.toHaveProperty('trust');
  });

  it('tolerates a root that does not exist', async () => {
    const result = await discoverManifestsInRoot(join(root, 'does-not-exist'));
    expect(result.found).toEqual([]);
    expect(result.rejected).toEqual([]);
  });
});
