/**
 * N02 — production adapter boundary. The registry is empty unless an adapter is explicitly registered, every
 * registration is contract-validated, and no production source reaches the deterministic test adapter.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { ExecutionAdapter } from '../../src/execution-runtime/adapter.js';
import { createAdapterRegistry } from '../../src/execution-runtime/adapter.js';

const CHILD = new URL('../helpers/test-adapter-child.ts', import.meta.url).href;

function adapter(overrides: Partial<ExecutionAdapter> = {}): ExecutionAdapter {
  return {
    engineId: 'registry-test-engine',
    executionUnitClass: 'BROWSER',
    leaseClass: 'L',
    childModuleUrl: CHILD,
    childExportName: 'runTestAdapterChild',
    admissionRequestFor: () => {
      throw new Error('not used');
    },
    onUnitExpired: () => Promise.resolve('TERMINATED'),
    ...overrides,
  } as ExecutionAdapter;
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (name === 'node_modules' || name === 'generated') return [];
    return statSync(full).isDirectory()
      ? sourceFiles(full)
      : /\.(ts|tsx)$/.test(name)
        ? [full]
        : [];
  });
}

describe('production adapter registry boundary (N02)', () => {
  it('is empty by default and with an explicit empty list', () => {
    expect(createAdapterRegistry().list()).toEqual([]);
    expect(createAdapterRegistry([]).list()).toEqual([]);
    expect(createAdapterRegistry().find('registry-test-engine')).toBeUndefined();
  });

  it('registers only what is passed explicitly', () => {
    const registry = createAdapterRegistry([adapter()]);
    expect(registry.list().map((a) => a.engineId)).toEqual(['registry-test-engine']);
    expect(registry.find('registry-test-engine')).toBeDefined();
  });

  it('rejects a duplicate engine id', () => {
    expect(() => createAdapterRegistry([adapter(), adapter()])).toThrow(/duplicate/);
  });

  it('rejects a child module that is not a local file module', () => {
    expect(() =>
      createAdapterRegistry([adapter({ childModuleUrl: 'https://example.invalid/engine.js' })]),
    ).toThrow(/local file module/);
  });

  it('rejects a child module outside the workspace', () => {
    expect(() =>
      createAdapterRegistry([
        adapter({
          childModuleUrl: pathToFileURL(path.resolve(process.cwd(), '..', 'outside', 'engine.js'))
            .href,
        }),
      ]),
    ).toThrow(/inside the workspace/);
  });

  it('rejects an invalid hard-stop margin', () => {
    expect(() => createAdapterRegistry([adapter({ hardStopMarginMs: 0 })])).toThrow(
      /hardStopMarginMs/,
    );
  });

  it('rejects a class with no dispatch queue', () => {
    expect(() => createAdapterRegistry([adapter({ executionUnitClass: 'PASSIVE_HTTP' })])).toThrow(
      /no dispatch queue/,
    );
  });

  it('no production source imports test helpers or the deterministic test adapter', () => {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const roots = [path.resolve(here, '../../src'), path.resolve(here, '../../../api/src')];
    const offenders: string[] = [];
    for (const file of roots.flatMap(sourceFiles)) {
      const text = readFileSync(file, 'utf8');
      if (/from\s+['"][^'"]*(\/tests\/|test-adapter)[^'"]*['"]/.test(text)) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });
});
