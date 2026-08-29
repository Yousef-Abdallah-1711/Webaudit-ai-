/**
 * Principle I's single coupling point.
 *
 * Core imports from here. Nothing here imports a capability, and nothing here
 * names one — the registry in `apps/api/src/services/registry/` resolves
 * capabilities by module and layer only.
 */

export type {
  AuditCapability,
  AuditPage,
  CapabilityFinding,
  CapabilityInput,
  CodeFile,
  CodeLayerContext,
  CodeTree,
  DesignIntent,
  ImageRef,
  Logger,
  ModuleSummary,
  ReverifyRequest,
  ReverifyResult,
  SafeFetchInit,
  SafeResponse,
} from './contract.js';

export {
  MANIFEST_FILENAME,
  assertNoTrustClaim,
  manifestSchema,
  parseManifest,
} from './manifest.js';
export type { CapabilityManifest, ManifestProblem, ParseResult } from './manifest.js';

export { WorkspaceEscapeError, createCodeLayerContext, workspacePathFor } from './context.js';
export type { ContextOptions, LogSink } from './context.js';

export { containCapabilityCall, describeThrown } from './contain.js';
export type { ContainOptions, Contained } from './contain.js';

export { currentCapabilityId, runAsCapability } from './capability-context.js';

export { CONFORMANCE_CHECKS, runConformanceSuite } from './conformance/suite.js';
export type {
  CheckResult,
  ConformanceCheck,
  ConformanceDeps,
  ConformanceReport,
} from './conformance/suite.js';
