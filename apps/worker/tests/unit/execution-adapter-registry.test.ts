import { describe, expect, it } from 'vitest';
import type { ExecutionAdapter } from '../../src/execution-runtime/adapter.js';
import { createAdapterRegistry } from '../../src/execution-runtime/adapter.js';

describe('execution adapter registry', () => {
  it('rejects a non-passive engine without an expiry termination hook', () => {
    const adapter = {
      engineId: 'browser-engine',
      executionUnitClass: 'BROWSER',
      leaseClass: 'L',
      childModuleUrl: new URL('../helpers/test-adapter-child.ts', import.meta.url).href,
      childExportName: 'runTestAdapterChild',
    } as ExecutionAdapter;

    expect(() => createAdapterRegistry([adapter])).toThrow(/onUnitExpired/);
  });
});
