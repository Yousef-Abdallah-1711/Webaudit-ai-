/**
 * T175-T177 — what the three source-only capabilities actually find.
 *
 * The conformance suite proves they are shaped like capabilities and contained
 * like capabilities. It cannot prove they *measure* anything: `fingerprint-
 * stable` legally skips when a capability produces no findings, so a capability
 * that quietly returned `[]` for every input would pass conformance completely.
 * This file is the other half — real files on disk, the real confined context,
 * and an assertion on which checks fired.
 *
 * The negative cases matter as much. A dependency scanner that reports every
 * project is not a scanner, so each capability is also run against a clean tree
 * and asserted silent.
 */

import { mkdtemp, mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createCodeLayerContext } from '@webaudit/capability-sdk';
import type { AuditCapability, CapabilityInput, CodeFile } from '@webaudit/capability-sdk';
import dependencyScanner from '@webaudit/capability-dependency-scanner';
import bundleAnalyzer from '@webaudit/capability-bundle-analyzer';
import cssAnalyzer from '@webaudit/capability-css-analyzer';
import { createDeficientSource, type FixtureSource } from '../fixtures/deficient-source.js';

let deficient: FixtureSource;
let clean: { root: string; files: readonly CodeFile[] };

async function listing(root: string, paths: readonly string[]): Promise<readonly CodeFile[]> {
  return Promise.all(
    paths.map(async (path) => ({ path, sizeBytes: (await stat(join(root, path))).size })),
  );
}

beforeAll(async () => {
  deficient = await createDeficientSource();

  const root = await mkdtemp(join(tmpdir(), 'webaudit-clean-'));
  await mkdir(join(root, 'dist'), { recursive: true });
  await writeFile(
    join(root, 'package.json'),
    JSON.stringify({ name: 'tidy', dependencies: { lodash: '4.17.21' } }),
    'utf8',
  );
  await writeFile(join(root, 'pnpm-lock.yaml'), "lockfileVersion: '9.0'\n", 'utf8');
  await writeFile(join(root, 'dist/app.js'), 'const a=1;export default a;', 'utf8');
  await writeFile(join(root, 'styles.css'), '.a{color:#111}\n.b{color:#222}\n', 'utf8');
  clean = {
    root,
    files: await listing(root, ['package.json', 'pnpm-lock.yaml', 'dist/app.js', 'styles.css']),
  };
});

afterAll(async () => {
  await deficient.close();
  await rm(clean.root, { recursive: true, force: true });
});

function inputFor(files: readonly CodeFile[]): CapabilityInput {
  return { code: { files, frameworks: [] }, priorModuleResults: {}, controlLevel: 'NONE' };
}

async function checkIdsFrom(
  capability: AuditCapability,
  root: string,
  files: readonly CodeFile[],
): Promise<readonly string[]> {
  const controller = new AbortController();
  const ctx = createCodeLayerContext({
    signal: controller.signal,
    capabilityId: capability.id,
    workspaceRoot: root,
  });
  const findings = await capability.runCodeLayer!(inputFor(files), ctx);
  return findings.map((finding) => finding.checkId).sort();
}

describe('dependency-scanner (T175)', () => {
  it('reports the advisory, the floating range, the deprecation, and the missing lockfile', async () => {
    const ids = await checkIdsFrom(dependencyScanner, deficient.root, deficient.tree.files);

    expect(ids).toContain('dependency.known-vulnerable');
    expect(ids).toContain('dependency.floating-range');
    expect(ids).toContain('dependency.deprecated-package');
    expect(ids).toContain('dependency.no-lockfile');
  });

  it('does not report a fixed version that merely shares a package name', async () => {
    // The clean tree pins lodash at 4.17.21, the version the advisory is fixed
    // in. Matching on package name alone would report it; matching on version
    // must not.
    const ids = await checkIdsFrom(dependencyScanner, clean.root, clean.files);
    expect(ids).toEqual([]);
  });

  it('is not applicable to an audit with no source attached (FR-021)', () => {
    expect(dependencyScanner.canRun({ priorModuleResults: {}, controlLevel: 'NONE' })).toBe(false);
  });
});

describe('bundle-analyzer (T176)', () => {
  it('reports weight, missing minification, and the published source map', async () => {
    const ids = await checkIdsFrom(bundleAnalyzer, deficient.root, deficient.tree.files);

    expect(ids).toContain('bundle.oversize-script');
    expect(ids).toContain('bundle.unminified-output');
    expect(ids).toContain('bundle.source-map-published');
  });

  it('says nothing about a small minified asset', async () => {
    expect(await checkIdsFrom(bundleAnalyzer, clean.root, clean.files)).toEqual([]);
  });

  it('ignores a large module outside build output', () => {
    // A big file in `src/` is a large module, not a large download. Reporting
    // it would make the check noise on every well-structured project.
    const files: CodeFile[] = [{ path: 'src/generated/schema.js', sizeBytes: 4_000_000 }];
    expect(bundleAnalyzer.canRun(inputFor(files))).toBe(false);
  });
});

describe('css-analyzer (T177)', () => {
  it('reports !important overuse and colour sprawl', async () => {
    const ids = await checkIdsFrom(cssAnalyzer, deficient.root, deficient.tree.files);

    expect(ids).toContain('css.important-overuse');
    expect(ids).toContain('css.colour-sprawl');
  });

  it('says nothing about a small, disciplined stylesheet', async () => {
    expect(await checkIdsFrom(cssAnalyzer, clean.root, clean.files)).toEqual([]);
  });
});

describe('re-verification when the workspace is gone (FR-090, FR-063)', () => {
  it.each([
    ['dependency-scanner', dependencyScanner, 'dependency.no-lockfile', 'package.json'],
    ['bundle-analyzer', bundleAnalyzer, 'bundle.oversize-script', 'dist/app.js'],
    ['css-analyzer', cssAnalyzer, 'css.colour-sprawl', 'styles/main.css'],
  ] as const)(
    '%s reports UNVERIFIABLE rather than guessing green',
    async (_name, capability, checkId, location) => {
      const controller = new AbortController();
      // No `workspaceRoot`: exactly the context the re-verification runner
      // builds once a scan has ended and its source has been destroyed.
      const ctx = createCodeLayerContext({
        signal: controller.signal,
        capabilityId: capability.id,
      });

      const result = await capability.reverify!({ checkId, location }, ctx);

      expect(result.outcome).toBe('UNVERIFIABLE');
      expect(result.outcome === 'UNVERIFIABLE' && result.reason).toMatch(/FR-090|destroyed/);
    },
  );
});
