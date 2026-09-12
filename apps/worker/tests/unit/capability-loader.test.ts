/**
 * T249 — `loadCapabilities` now discovers capabilities from the real
 * `packages/capabilities-vendored/` filesystem tree instead of a hardcoded
 * per-module `import()` table (Constitution I / Open Decision #13). These
 * tests exercise the real discovery + dynamic import against the real
 * vendored directory, matching this codebase's "real code over mocks"
 * convention — a fake fixture tree would prove nothing about whether the
 * actual sixteen vendored capabilities still load correctly.
 */
import { describe, expect, it } from 'vitest';
import { loadCapabilities } from '../../src/orchestrator/capability-loader.js';

describe('loadCapabilities', () => {
  it('discovers all five real SECURITY capabilities from disk', async () => {
    const capabilities = await loadCapabilities('SECURITY');
    const ids = capabilities.map((c) => c.id).sort();
    expect(ids).toEqual(
      [
        'data-leak-scanner',
        'dependency-scanner',
        'headers-checker',
        'owasp-checker',
        'ssl-analyzer',
      ].sort(),
    );
  });

  it('discovers all two real SEO capabilities from disk', async () => {
    const capabilities = await loadCapabilities('SEO');
    expect(capabilities.map((c) => c.id).sort()).toEqual(
      ['content-checker', 'meta-checker'].sort(),
    );
  });

  it('every loaded capability actually declares the module it was requested for', async () => {
    const capabilities = await loadCapabilities('SECURITY');
    expect(capabilities.length).toBeGreaterThan(0);
    for (const capability of capabilities) expect(capability.module).toBe('SECURITY');
  });

  it('omits a capability not in the enabled set, without touching the others', async () => {
    const all = await loadCapabilities('SECURITY');
    const enabled = new Set(all.map((c) => c.id).filter((id) => id !== 'headers-checker'));
    const filtered = await loadCapabilities('SECURITY', enabled);
    expect(filtered.map((c) => c.id)).not.toContain('headers-checker');
    expect(filtered.length).toBe(all.length - 1);
  });

  it('returns nothing when the enabled set is empty', async () => {
    const filtered = await loadCapabilities('SECURITY', new Set());
    expect(filtered).toEqual([]);
  });
});
