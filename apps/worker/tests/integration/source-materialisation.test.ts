/**
 * T174 — an ARCHIVE or REPOSITORY target becoming a real workspace.
 *
 * Filesystem assertions throughout, for the same reason `workspace.test.ts`
 * gives: a suite that watched for an `extractArchive` call would pass against
 * an implementation that extracted to the wrong place, or extracted twice, or
 * left the zipball's `owner-repo-<sha>/` wrapper in every path.
 *
 * Four properties, each of which is a real bug if it is missing:
 *
 *   1. **The tree is where a capability will look for it** — `package.json` at
 *      the workspace root, and the `CodeTree` listing agrees with the disk.
 *   2. **A repository zipball loses its wrapper directory.** Without
 *      `stripComponents: 1` every path carries a commit hash, so every source
 *      finding's fingerprint changes on every commit and R3's stability
 *      guarantee is quietly gone.
 *   3. **Materialising twice downloads once.** Each phase of a scan is a
 *      separate job; re-fetching per phase would audit a moving target.
 *   4. **A failed materialisation leaves nothing behind.** FR-090 does not
 *      exempt the case where the source never fully arrived.
 */

import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MODE_DIRECTORY, MODE_REGULAR, buildZip } from '@webaudit/safe-archive/testing';
import type { UploadStorage } from '@webaudit/api/intake';
import type { PrismaClient } from '../../src/db.js';
import { materialiseSource } from '../../src/intake/materialise.js';
import {
  RepositoryConnectionRevokedError,
  RepositoryUnavailableError,
  materialiseRepository,
} from '../../src/intake/repo-clone.js';

const SCAN_ID = 'scan_ck7j9zx1q0000abcd';
const ARCHIVE_KEY = `uploads/user_1/${'a'.repeat(64)}.zip`;

let base: string;

/** Only what `materialiseSource` touches: the workspace path record. */
function stubDb(): PrismaClient {
  return { scan: { update: () => Promise.resolve({}) } } as unknown as PrismaClient;
}

function projectZip(prefix = ''): Buffer {
  return buildZip(
    [
      { path: `${prefix}`, mode: MODE_DIRECTORY },
      {
        path: `${prefix}package.json`,
        content: '{"name":"demo","dependencies":{"next":"14.0.0"}}',
        mode: MODE_REGULAR,
      },
      { path: `${prefix}src/app.css`, content: 'body { color: red }\n', mode: MODE_REGULAR },
    ].filter((entry) => entry.path !== ''),
  );
}

function storageServing(bytes: Buffer): UploadStorage & { readonly gets: string[] } {
  const gets: string[] = [];
  return {
    gets,
    put: () => Promise.reject(new Error('materialisation never writes to upload storage')),
    get: (key) => {
      gets.push(key);
      return Promise.resolve(new Uint8Array(bytes));
    },
    remove: () => Promise.resolve(),
  };
}

beforeEach(async () => {
  base = await mkdtemp(join(tmpdir(), 'webaudit-source-'));
});
afterEach(async () => {
  await rm(base, { recursive: true, force: true });
});

const archiveScan = {
  id: SCAN_ID,
  userId: 'user_1',
  target: { inputType: 'ARCHIVE', canonicalValue: ARCHIVE_KEY },
};

describe('materialising an ARCHIVE target', () => {
  it('extracts into the scan workspace and lists what it extracted', async () => {
    const storage = storageServing(projectZip('project/'));
    const source = await materialiseSource(stubDb(), archiveScan, {
      baseDir: base,
      uploadStorage: storage,
    });

    expect(source).not.toBeNull();
    const root = source!.workspace.path;
    expect(root.startsWith(base)).toBe(true);

    // The archive's own top-level directory is preserved for an upload — only a
    // repository zipball's synthetic wrapper is stripped, because only that one
    // is synthetic.
    await expect(stat(join(root, 'project', 'package.json'))).resolves.toBeDefined();

    const paths = source!.code.files.map((file) => file.path).sort();
    expect(paths).toEqual(['project/package.json', 'project/src/app.css']);
    expect(source!.code.files.every((file) => file.sizeBytes > 0)).toBe(true);
  });

  it('returns null for a URL target and creates no workspace at all', async () => {
    const source = await materialiseSource(
      stubDb(),
      { id: SCAN_ID, userId: 'user_1', target: { inputType: 'URL', canonicalValue: 'https://x/' } },
      { baseDir: base, uploadStorage: storageServing(projectZip()) },
    );

    expect(source).toBeNull();
    await expect(stat(join(base, SCAN_ID))).rejects.toThrow();
  });

  it('fetches once across repeated calls, so every phase audits the same tree', async () => {
    const storage = storageServing(projectZip('project/'));
    const deps = { baseDir: base, uploadStorage: storage };

    const first = await materialiseSource(stubDb(), archiveScan, deps);
    const second = await materialiseSource(stubDb(), archiveScan, deps);

    expect(storage.gets).toHaveLength(1);
    expect(second!.workspace.path).toBe(first!.workspace.path);
    expect(second!.code.files).toHaveLength(2);
  });

  it('destroys the workspace when the source cannot be fetched', async () => {
    const failing: UploadStorage = {
      put: () => Promise.reject(new Error('unused')),
      get: () => Promise.reject(new Error('the staged object is gone')),
      remove: () => Promise.resolve(),
    };

    await expect(
      materialiseSource(stubDb(), archiveScan, { baseDir: base, uploadStorage: failing }),
    ).rejects.toThrow(/staged object is gone/);

    // Not merely empty — absent. A directory left behind is a directory the
    // orphan sweep has to reason about.
    await expect(stat(join(base, SCAN_ID))).rejects.toThrow();
  });

  it('refuses a hostile archive rather than extracting it', async () => {
    const hostile = buildZip([{ path: '../escape.txt', content: 'nope', mode: MODE_REGULAR }]);

    await expect(
      materialiseSource(stubDb(), archiveScan, {
        baseDir: base,
        uploadStorage: storageServing(hostile),
      }),
    ).rejects.toThrow(/PATH_ESCAPES_ROOT/);

    await expect(stat(join(base, SCAN_ID))).rejects.toThrow();
    await expect(stat(join(base, 'escape.txt'))).rejects.toThrow();
  });
});

describe('materialising a REPOSITORY target', () => {
  const repoScan = {
    id: SCAN_ID,
    userId: 'user_1',
    target: { inputType: 'REPOSITORY', canonicalValue: 'acme/storefront' },
  };

  /** A GitHub stand-in serving a zipball shaped exactly like the real one. */
  function githubServing(bytes: Buffer, status = 200) {
    const calls: string[] = [];
    const fetchImpl = (url: string) => {
      calls.push(url);
      return Promise.resolve({
        url,
        status,
        headers: {},
        redirects: [],
        bytes: () => new Uint8Array(bytes),
        text: () => '',
      });
    };
    return { fetchImpl, calls };
  }

  it('strips the zipball wrapper so paths do not carry the commit hash', async () => {
    // What GitHub actually serves: everything under `owner-repo-<sha>/`.
    const github = githubServing(projectZip('acme-storefront-8f2c1ab/'));
    const destRoot = join(base, SCAN_ID);

    const result = await materialiseRepository({
      token: 'ghp_test',
      fullName: 'acme/storefront',
      destRoot,
      fetchImpl: github.fetchImpl,
    });

    expect(github.calls).toEqual(['https://api.github.com/repos/acme/storefront/zipball']);
    expect([...result.files].sort()).toEqual(['package.json', 'src/app.css']);
    // The assertion that matters: root-relative, no hash anywhere.
    expect(await readFile(join(destRoot, 'package.json'), 'utf8')).toContain('"demo"');
  });

  it('names the ref when one is given', async () => {
    const github = githubServing(projectZip('acme-storefront-8f2c1ab/'));
    await materialiseRepository({
      token: 'ghp_test',
      fullName: 'acme/storefront',
      ref: 'release-2',
      destRoot: join(base, SCAN_ID),
      fetchImpl: github.fetchImpl,
    });
    expect(github.calls[0]).toBe('https://api.github.com/repos/acme/storefront/zipball/release-2');
  });

  it('reports a 401 as a revoked connection, not as a missing repository', async () => {
    const github = githubServing(Buffer.alloc(0), 401);
    await expect(
      materialiseRepository({
        token: 'ghp_stale',
        fullName: 'acme/storefront',
        destRoot: join(base, SCAN_ID),
        fetchImpl: github.fetchImpl,
      }),
    ).rejects.toBeInstanceOf(RepositoryConnectionRevokedError);
  });

  it('reports any other failure as the repository being unavailable', async () => {
    const github = githubServing(Buffer.alloc(0), 404);
    await expect(
      materialiseRepository({
        token: 'ghp_test',
        fullName: 'acme/storefront',
        destRoot: join(base, SCAN_ID),
        fetchImpl: github.fetchImpl,
      }),
    ).rejects.toBeInstanceOf(RepositoryUnavailableError);
  });

  it('refuses a repository name that is not owner/repo without fetching', async () => {
    const github = githubServing(projectZip('x/'));
    await expect(
      materialiseRepository({
        token: 'ghp_test',
        fullName: '../../etc',
        destRoot: join(base, SCAN_ID),
        fetchImpl: github.fetchImpl,
      }),
    ).rejects.toBeInstanceOf(RepositoryUnavailableError);
    expect(github.calls).toEqual([]);
  });

  it('will not audit a repository for a user with no connection, and fetches nothing', async () => {
    const github = githubServing(projectZip('x/'));
    const db = {
      scan: { update: () => Promise.resolve({}) },
      user: { findUnique: () => Promise.resolve({ githubTokenEnc: null, githubTokenIv: null }) },
    } as unknown as PrismaClient;

    await expect(
      materialiseSource(db, repoScan, {
        baseDir: base,
        uploadStorage: storageServing(projectZip('x/')),
        githubFetch: github.fetchImpl,
      }),
    ).rejects.toThrow(/No repository account is connected/);
    expect(github.calls).toEqual([]);
    await expect(stat(join(base, SCAN_ID))).rejects.toThrow();
  });
});
