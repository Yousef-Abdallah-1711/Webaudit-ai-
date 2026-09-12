/**
 * T249 — `capabilityIdForCheck`/`resolveReverifyCapability` now derive
 * ownership from each loaded capability's own `checkNamespaces` declaration
 * instead of a hardcoded namespace-to-capability-id table (Constitution I).
 * These tests exercise the real vendored capabilities via the real
 * `loadCapabilities`, not fakes — proving the actual declared namespaces on
 * disk resolve correctly, not just a test fixture's.
 */
import { describe, expect, it } from 'vitest';
import {
  capabilityIdForCheck,
  resolveReverifyCapability,
} from '../../src/reverify/resolve-check.js';
import { loadCapabilities } from '../../src/orchestrator/capability-loader.js';

describe('capabilityIdForCheck', () => {
  it('finds the real owasp-checker for a real owasp.* checkId, from real loaded capabilities', async () => {
    const capabilities = await loadCapabilities('SECURITY');
    expect(capabilityIdForCheck('owasp.cookie-missing-secure', capabilities)).toBe('owasp-checker');
  });

  it('finds the real data-leak-scanner for a redaction.* checkId (delegated detection)', async () => {
    const capabilities = await loadCapabilities('SECURITY');
    expect(capabilityIdForCheck('redaction.secret-in-source', capabilities)).toBe(
      'data-leak-scanner',
    );
  });

  it('returns null for a namespace no loaded capability declares', () => {
    expect(capabilityIdForCheck('ai.security.judgment', [])).toBeNull();
  });
});

describe('resolveReverifyCapability (real capabilities, real reverify method)', () => {
  it('resolves ssl-analyzer for a real ssl.* checkId and returns something with a reverify method', async () => {
    const capability = await resolveReverifyCapability(
      { module: 'SECURITY', checkId: 'ssl.hsts-missing' },
      loadCapabilities,
    );
    expect(capability?.id).toBe('ssl-analyzer');
    expect(typeof capability?.reverify).toBe('function');
  });

  it('resolves nothing for an unowned checkId namespace', async () => {
    const capability = await resolveReverifyCapability(
      { module: 'SECURITY', checkId: 'nonexistent-namespace.some-check' },
      loadCapabilities,
    );
    expect(capability).toBeNull();
  });
});
