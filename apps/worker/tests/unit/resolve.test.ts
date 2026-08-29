import { describe, it, expect } from 'vitest';
import type { AuditCapability, CapabilityInput } from '@webaudit/capability-sdk';
import { resolveApplicable } from '../../src/module-runner/resolve.js';

describe('resolveApplicable', () => {
  describe('control-level gating (FR-017)', () => {
    it('skips a capability whose requiredControlLevel exceeds the target level', async () => {
      // Setup: a capability that requires VERIFIED control, with a target at ATTESTED
      const capability: AuditCapability = {
        id: 'test-capability',
        module: 'SECURITY',
        layer: 'CODE',
        canRun: () => true, // Synchronous, would pass but should never be called
      };

      const input: CapabilityInput = {
        controlLevel: 'ATTESTED', // Target has ATTESTED, not VERIFIED
        priorModuleResults: {},
      };

      const resolution = await resolveApplicable({
        capabilities: [capability],
        input,
        requiredControlLevels: {
          'test-capability': 'VERIFIED', // This capability requires VERIFIED
        },
      });

      // Should be skipped with CONTROL_LEVEL reason
      expect(resolution.applicable).toHaveLength(0);
      expect(resolution.skipped).toHaveLength(1);
      expect(resolution.skipped[0]).toEqual({
        capabilityId: 'test-capability',
        reason: 'CONTROL_LEVEL',
        detail: expect.stringContaining('VERIFIED'),
      });
    });

    it('allows a capability when target level matches required level', async () => {
      const capability: AuditCapability = {
        id: 'test-capability',
        module: 'SECURITY',
        layer: 'CODE',
        canRun: () => true,
      };

      const input: CapabilityInput = {
        controlLevel: 'VERIFIED',
        priorModuleResults: {},
      };

      const resolution = await resolveApplicable({
        capabilities: [capability],
        input,
        requiredControlLevels: {
          'test-capability': 'VERIFIED', // Exactly matches
        },
      });

      // Should be applicable (passed control check and canRun check)
      expect(resolution.applicable).toHaveLength(1);
      expect(resolution.skipped).toHaveLength(0);
      expect(resolution.applicable[0]?.capability.id).toBe('test-capability');
    });

    it('allows a capability when target level exceeds required level', async () => {
      const capability: AuditCapability = {
        id: 'test-capability',
        module: 'SECURITY',
        layer: 'CODE',
        canRun: () => true,
      };

      const input: CapabilityInput = {
        controlLevel: 'VERIFIED', // Target has VERIFIED
        priorModuleResults: {},
      };

      const resolution = await resolveApplicable({
        capabilities: [capability],
        input,
        requiredControlLevels: {
          'test-capability': 'ATTESTED', // Only requires ATTESTED
        },
      });

      // Should be applicable
      expect(resolution.applicable).toHaveLength(1);
      expect(resolution.skipped).toHaveLength(0);
    });

    it('treats missing requiredControlLevel as NONE', async () => {
      const capability: AuditCapability = {
        id: 'test-capability',
        module: 'SECURITY',
        layer: 'CODE',
        canRun: () => true,
      };

      const input: CapabilityInput = {
        controlLevel: 'NONE', // Unverified target
        priorModuleResults: {},
      };

      const resolution = await resolveApplicable({
        capabilities: [capability],
        input,
        // No requiredControlLevels provided → defaults to NONE
      });

      // Should be applicable (NONE is always satisfied)
      expect(resolution.applicable).toHaveLength(1);
      expect(resolution.skipped).toHaveLength(0);
    });

    it('respects the exact control-level ordering: NONE < ATTESTED < VERIFIED', async () => {
      const capabilities: AuditCapability[] = [
        { id: 'cap1', module: 'SECURITY', layer: 'CODE', canRun: () => true },
        { id: 'cap2', module: 'SECURITY', layer: 'CODE', canRun: () => true },
        { id: 'cap3', module: 'SECURITY', layer: 'CODE', canRun: () => true },
      ];

      const input: CapabilityInput = {
        controlLevel: 'ATTESTED',
        priorModuleResults: {},
      };

      const resolution = await resolveApplicable({
        capabilities,
        input,
        requiredControlLevels: {
          'cap1': 'NONE', // ATTESTED >= NONE → allowed
          'cap2': 'ATTESTED', // ATTESTED >= ATTESTED → allowed
          'cap3': 'VERIFIED', // ATTESTED < VERIFIED → skipped
        },
      });

      expect(resolution.applicable).toHaveLength(2);
      expect(resolution.applicable.map((c) => c.capability.id)).toEqual(['cap1', 'cap2']);
      expect(resolution.skipped).toHaveLength(1);
      expect(resolution.skipped[0]?.capabilityId).toBe('cap3');
    });
  });
});
