/**
 * A source tree that is deficient in the ways T175-T177 measure, written to a
 * real temporary directory.
 *
 * The three source capabilities read through `ctx.readFile` and `ctx.glob`,
 * both of which are confined by **realpath** against a workspace root
 * (`capability-sdk/src/context.ts`). A fake context that returned canned bytes
 * would exercise the capabilities and skip the confinement, which is the half
 * most worth exercising — so this writes real files and lets the real context
 * read them, exactly as `deficient-site.ts` serves a real page rather than a
 * canned response.
 *
 * Every deficiency below is deliberate and is named in the comment beside it.
 * A fixture whose failures are incidental drifts silently: someone tidies it,
 * the capability finds nothing, and `fingerprint-stable` starts skipping
 * instead of failing.
 */

import { mkdtemp, mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { CodeFile, CodeTree } from '@webaudit/capability-sdk';

export interface FixtureSource {
  readonly root: string;
  readonly tree: CodeTree;
  close(): Promise<void>;
}

/** Readable, unminified, and comfortably past the 512 KB single-asset budget. */
function bulkyReadableScript(): string {
  const lines: string[] = ['// Built by a bundler that was never configured to minify.'];
  for (let index = 0; index < 12_000; index += 1) {
    lines.push(`export function helper${String(index)}(value) {`);
    lines.push(`  return value + ${String(index)};`);
    lines.push('}');
  }
  lines.push('//# sourceMappingURL=app.js.map');
  return lines.join('\n');
}

/** Over the distinct-colour limit and over the !important ratio, on purpose. */
function sprawlingStylesheet(): string {
  const rules: string[] = [];
  for (let index = 0; index < 80; index += 1) {
    const colour = (0x100000 + index * 0x1a2b).toString(16).slice(-6);
    rules.push(`.tone-${String(index)} { color: #${colour}; }`);
  }
  for (let index = 0; index < 30; index += 1) {
    rules.push(`.override-${String(index)} { display: block !important; }`);
  }
  return rules.join('\n');
}

const PACKAGE_JSON = JSON.stringify(
  {
    name: 'deficient-project',
    version: '1.0.0',
    dependencies: {
      // A published advisory, pinned exactly so the version is knowable.
      lodash: '4.17.15',
      // No exact version at all — resolves to whatever the registry offers.
      chalk: '*',
      // Deprecated, and not a vulnerability. A separate, lower finding.
      request: '2.88.2',
    },
  },
  null,
  2,
);

async function listFiles(root: string, relative: readonly string[]): Promise<readonly CodeFile[]> {
  return Promise.all(
    relative.map(async (path) => ({
      path,
      sizeBytes: (await stat(join(root, path))).size,
    })),
  );
}

export async function createDeficientSource(): Promise<FixtureSource> {
  const root = await mkdtemp(join(tmpdir(), 'webaudit-source-'));

  await mkdir(join(root, 'dist'), { recursive: true });
  await mkdir(join(root, 'styles'), { recursive: true });

  const script = bulkyReadableScript();
  // No lockfile is written beside it — that absence is itself a finding.
  await writeFile(join(root, 'package.json'), PACKAGE_JSON, 'utf8');
  await writeFile(join(root, 'dist/app.js'), script, 'utf8');
  await writeFile(
    join(root, 'dist/app.js.map'),
    JSON.stringify({ version: 3, sources: ['../src/app.ts'], mappings: '' }),
    'utf8',
  );
  await writeFile(join(root, 'styles/main.css'), sprawlingStylesheet(), 'utf8');

  const files = await listFiles(root, [
    'package.json',
    'dist/app.js',
    'dist/app.js.map',
    'styles/main.css',
  ]);

  return {
    root,
    tree: { files, frameworks: [] },
    close: () => rm(root, { recursive: true, force: true }),
  };
}
