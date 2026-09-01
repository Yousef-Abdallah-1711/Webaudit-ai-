/**
 * T174 — turning an ARCHIVE or REPOSITORY target into a scan workspace and a
 * `CodeTree`, which is the last thing standing between US4's three source
 * capabilities and a real audit.
 *
 * Everything upstream of here already exists: `createScanWorkspace` (T103) owns
 * the directory and its destruction, `@webaudit/safe-archive` (T172) owns the
 * extraction rules, `repo-clone.ts` owns the GitHub half. This module is the
 * join, and it has three responsibilities that are worth naming because each
 * one is a bug if it is missing.
 *
 * **1. It is idempotent across phase jobs.** A scan runs as three or more
 * separate queue jobs, each a fresh process invocation of the phase handler. If
 * this function re-downloaded and re-extracted for every phase, a repository
 * audit would fetch the same zipball three times, and — worse — a target whose
 * default branch moved between phase 1 and phase 3 would be audited as two
 * different codebases, so a SECURITY finding could reference a line that the
 * PERFORMANCE area never saw. So: an already-populated workspace is reused, and
 * the download happens exactly once per scan. `createScanWorkspace`'s
 * `existing` flag is not enough on its own to decide that — a workspace can
 * exist and be empty if a previous attempt died between `mkdir` and the first
 * write — so emptiness is what is actually checked.
 *
 * **2. The `CodeTree` is a listing, never contents.** That is the SDK's own
 * decision (`contract.ts`: "Handing over a map of every file's contents would
 * mean holding an entire repository in memory per capability"), and it is what
 * lets `canRun` be a pure function over metadata — which is exactly what T170
 * depends on, since a capability that had to read a file to decide
 * applicability could not answer at all when no source is attached.
 *
 * **3. Nothing here is trusted.** The listing walks a directory that was
 * populated from a hostile archive. It does not follow symlinks — there are
 * none, because the guard refuses them — and it skips anything that is not a
 * regular file, so a device node created by some future extractor would be
 * absent from the tree rather than handed to a capability to open.
 */

import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import type { CodeFile, CodeTree } from '@webaudit/capability-sdk';
import { githubTokenFor, type GithubFetch, type UploadStorage } from '@webaudit/api/intake';
import type { PrismaClient } from '@webaudit/api/prisma-client';
import { extractArchive } from '@webaudit/safe-archive';
import { createScanWorkspace, type ScanWorkspace } from '../workspace/create.js';
import { materialiseRepository } from './repo-clone.js';

/**
 * Directories never walked into.
 *
 * Not a security boundary — the extraction guard is that. This is about the
 * listing being useful: a repository's `node_modules` can hold two hundred
 * thousand files, and a `CodeTree` that large makes every `canRun` slow and
 * every capability's glob meaningless. `dependency-scanner` reads manifests and
 * lockfiles, not installed packages.
 */
const SKIPPED_DIRECTORIES = new Set([
  '.git',
  'node_modules',
  '.pnpm-store',
  'vendor',
  '.venv',
  '__pycache__',
  '.next/cache',
  '.turbo',
  '.cache',
]);

/** A hard stop on the listing, independent of the archive entry limit. */
const MAX_LISTED_FILES = 20_000;

async function isEmptyDirectory(path: string): Promise<boolean> {
  try {
    return (await readdir(path)).length === 0;
  } catch {
    return true;
  }
}

async function listFiles(root: string): Promise<CodeFile[]> {
  const files: CodeFile[] = [];
  const queue: string[] = [root];

  while (queue.length > 0 && files.length < MAX_LISTED_FILES) {
    const dir = queue.shift()!;
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      continue; // Unreadable directory. Absent from the tree, never fatal.
    }

    for (const entry of entries) {
      if (files.length >= MAX_LISTED_FILES) break;
      const absolute = join(dir, entry.name);

      if (entry.isDirectory()) {
        if (SKIPPED_DIRECTORIES.has(entry.name)) continue;
        queue.push(absolute);
        continue;
      }
      // Not `!entry.isFile()`: a symlink reports neither, and the point is to
      // include only what is certainly a regular file.
      if (!entry.isFile()) continue;

      try {
        const info = await stat(absolute);
        files.push({
          path: relative(root, absolute).split(sep).join('/'),
          sizeBytes: info.size,
        });
      } catch {
        continue;
      }
    }
  }

  return files;
}

/**
 * Advisory stack detection, from manifests only.
 *
 * `CodeTree.frameworks` is documented as "Advisory — never a reason to fail",
 * so this is allowed to be shallow and is allowed to be wrong. It reads one
 * `package.json` at the root and nothing else; a monorepo with Next.js in a
 * sub-package reports nothing, which is a worse answer than walking every
 * manifest and a much better one than a capability believing a framework is
 * present because a string appeared somewhere in the tree.
 */
async function detectFrameworks(root: string, files: readonly CodeFile[]): Promise<string[]> {
  const found = new Set<string>();

  const has = (path: string): boolean => files.some((file) => file.path === path);
  if (has('wp-config.php')) found.add('wordpress');
  if (has('composer.json')) found.add('php');
  if (has('requirements.txt') || has('pyproject.toml')) found.add('python');
  if (has('go.mod')) found.add('go');
  if (has('Gemfile')) found.add('ruby');

  if (has('package.json')) {
    found.add('node');
    try {
      const raw: unknown = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
      const manifest = raw as {
        dependencies?: Record<string, unknown>;
        devDependencies?: Record<string, unknown>;
      };
      const names = new Set([
        ...Object.keys(manifest.dependencies ?? {}),
        ...Object.keys(manifest.devDependencies ?? {}),
      ]);
      for (const [dependency, framework] of [
        ['next', 'nextjs'],
        ['nuxt', 'nuxt'],
        ['react', 'react'],
        ['vue', 'vue'],
        ['svelte', 'svelte'],
        ['@angular/core', 'angular'],
        ['astro', 'astro'],
        ['tailwindcss', 'tailwind'],
        ['express', 'express'],
      ] as const) {
        if (names.has(dependency)) found.add(framework);
      }
    } catch {
      // A malformed package.json is a finding for `dependency-scanner` to
      // report, not a reason to fail materialisation.
    }
  }

  return [...found];
}

export interface MaterialiseDeps {
  /** `WORKSPACE_BASE_DIR`. The confinement root as well as the parent. */
  readonly baseDir: string;
  /** Where a staged ARCHIVE upload is read from. */
  readonly uploadStorage: UploadStorage;
  readonly githubFetch?: GithubFetch;
}

export interface MaterialisedSource {
  readonly workspace: ScanWorkspace;
  readonly code: CodeTree;
}

export interface MaterialiseScan {
  readonly id: string;
  readonly userId: string;
  readonly target: { readonly inputType: string; readonly canonicalValue: string };
}

/**
 * Attach the scan's source, or return null when there is none to attach.
 *
 * Null for a URL target is the normal case and is what makes T170 true: no
 * workspace is created, `CapabilityInput.code` stays absent, and the three
 * source capabilities answer `canRun` false and land in NOT_APPLICABLE with a
 * `PRECONDITIONS` reason rather than failing.
 */
export async function materialiseSource(
  db: PrismaClient,
  scan: MaterialiseScan,
  deps: MaterialiseDeps,
): Promise<MaterialisedSource | null> {
  const { inputType, canonicalValue } = scan.target;
  if (inputType !== 'ARCHIVE' && inputType !== 'REPOSITORY') return null;

  const workspace = await createScanWorkspace({
    baseDir: deps.baseDir,
    scanId: scan.id,
    db,
  });

  try {
    // The idempotence gate. An earlier phase of this same scan already
    // populated the directory; downloading again would be waste at best and a
    // moving target at worst.
    if (await isEmptyDirectory(workspace.path)) {
      if (inputType === 'ARCHIVE') {
        const bytes = await deps.uploadStorage.get(canonicalValue);
        await extractArchive(bytes, { destRoot: workspace.path });
      } else {
        const token = await githubTokenFor(db, scan.userId);
        await materialiseRepository({
          token,
          fullName: canonicalValue,
          destRoot: workspace.path,
          ...(deps.githubFetch === undefined ? {} : { fetchImpl: deps.githubFetch }),
        });
      }
    }

    const files = await listFiles(workspace.path);
    return {
      workspace,
      code: { files, frameworks: await detectFrameworks(workspace.path, files) },
    };
  } catch (error) {
    // FR-090 / SC-015: a workspace that was created and then failed to fill is
    // still a workspace holding whatever partially landed, and the terminal
    // teardown observer only fires on a state transition this failure has not
    // reached yet. Destroy it here, then let the failure propagate — the phase
    // handler turns it into a FAILED scan, which refunds.
    await workspace.destroy();
    throw error;
  }
}
