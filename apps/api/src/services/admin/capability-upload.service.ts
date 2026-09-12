/**
 * T226 — real dispatch to `apps/sandbox-runner` for an operator-uploaded
 * capability bundle, replacing T216's unconditional 503.
 *
 * **Scope boundary, stated explicitly because it is easy to assume more
 * happened than actually did**: `uploadCapability` below does NOT write a
 * `Capability` database row, and does NOT make the uploaded bundle
 * executable by any real scan. `apps/api/src/services/registry/
 * reconcile.ts`'s own module note establishes the actual mechanism for a
 * capability to exist: "Disk is the source of existence. The database is
 * the source of enablement" — a real capability is discovered from a
 * filesystem root (`discover.ts`) at startup/reconciliation, and there is
 * currently no code path anywhere in this codebase that writes an uploaded
 * bundle to that discovery root. `specs/001-webaudit-mvp-baseline/
 * data-model.md`'s `Capability` model has no field for arbitrary uploaded
 * bundle content either — it is one row per manifest, keyed by the
 * manifest's own `id`, populated by discovery. This function delivers
 * exactly what T226's Definition of Done asks for: a genuine, sandboxed
 * conformance verdict from the real isolation mechanism, in place of the
 * previous unconditional 503.
 *
 * **T253 closes that gap.** A `passed: true` verdict now writes the bundle
 * bytes and a real, synthesized `capability.manifest.json` to
 * `installedRoot/<capabilityId>/` (the same directory `apps/worker`'s
 * `capability-loader.ts` and this app's own `discover.ts` already walk),
 * then calls `reconcileNow` — the same reconciliation `boot.ts` runs at
 * process start, now callable on demand — so the `Capability` row exists
 * with `trust: 'INSTALLED'` before this HTTP response returns, not at the
 * next restart. A `passed: false` verdict writes nothing: an operator who
 * uploaded something that failed conformance gets a report to act on, not
 * a half-installed capability sitting on disk.
 *
 * The manifest this synthesizes is deliberately narrow: `requiresCode:
 * false`, `requiresScreenshot: false`, `requiredControlLevel: 'NONE'`,
 * `estimatedTokens: 0`. Nothing in the upload flow collects richer values
 * from the operator, and `estimatedTokens: 0` is the only value
 * `manifestSchema` accepts for a CODE-layer capability (Principle III) —
 * the only shape `apps/worker`'s sandbox dispatch (T253, `RUN_CODE_LAYER`)
 * actually runs today. An AI-layer or BOTH-layer upload would fail
 * `manifestSchema`'s own non-zero-token requirement and simply not
 * reconcile into a row; there is no sandboxed AI-layer dispatch built yet
 * for an installed capability to run under, so this is a real, current
 * scope boundary rather than a bug to route around here.
 */
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { runConformanceCheck } from '@webaudit/sandbox-runner/conformance';
import { SANDBOX_LIMITS } from '@webaudit/config';
import type { CapabilityInput, ConformanceReport } from '@webaudit/capability-sdk';
import { MANIFEST_FILENAME } from '@webaudit/capability-sdk';
import type { PrismaClient } from '../../../prisma/generated/client/index.js';
import { getSandboxRunnerUrl } from '../../config/sandbox.js';
import { defaultInstalledRoot, reconcileNow } from '../registry/boot.js';
import { recordAuditLog } from './audit-log.js';

/** The fixed name `harness.ts`'s own `runConformance` gives an uploaded bundle's synthesized manifest entrypoint. */
const INSTALLED_BUNDLE_FILENAME = 'bundle.js';

/**
 * `runConformanceCheck`'s own outcome type, not re-imported from
 * `@webaudit/sandbox-runner`'s protocol module directly — the package only
 * exposes `.` and `./conformance` as public subpaths (its `package.json`
 * `exports`), and reaching into `../protocol.js` from outside the package
 * would bypass that boundary for the sake of one type alias. Deriving it
 * from `runConformanceCheck`'s real return type keeps this file honest
 * about which surface it actually depends on.
 */
type ConformanceOutcome = Awaited<ReturnType<typeof runConformanceCheck>>;
type SandboxFailureReason = Extract<ConformanceOutcome, { readonly ok: false }>['reason'];

/**
 * Raised when the sandbox itself could not produce a real conformance
 * verdict — a network failure reaching `sandbox-runner`, or a
 * `SandboxResponse` with `ok: false` for any reason (`TIMEOUT`,
 * `MEMORY_EXCEEDED`, `CRASHED`, `CONTRACT_VIOLATION`, `FORBIDDEN_ACCESS`,
 * `BUNDLE_INVALID`). Every one of those means the platform's own
 * dispatch/sandbox mechanism had a problem evaluating this bundle — a
 * materially different, less informative outcome than a genuine
 * `ConformanceReport { passed: false }`, where the sandbox worked fine and
 * the *capability* failed a specific, named check. The route maps this to
 * 503 `SANDBOX_UNAVAILABLE`; a real `ConformanceReport { passed: false }`
 * is a 200 with content the caller can act on.
 */
export class SandboxUnavailableError extends Error {
  override readonly name = 'SandboxUnavailableError';
  constructor(
    /** The underlying `SandboxFailure` reason, or `'NETWORK_ERROR'` when the HTTP call itself never completed. */
    readonly reason: SandboxFailureReason | 'NETWORK_ERROR',
    readonly detail?: string,
  ) {
    super(
      `Sandbox could not produce a conformance verdict (${reason}${detail === undefined ? '' : `: ${detail}`}).`,
    );
  }
}

export interface UploadCapabilityInput {
  readonly operatorId: string;
  readonly bundle: Buffer;
  /** T251 — the operator's own name/version for the uploaded bundle; see `UploadedCapabilityManifest`. */
  readonly manifest: { readonly name: string; readonly version: string };
}

export interface UploadCapabilityResult {
  readonly capabilityId: string;
  readonly passed: boolean;
  readonly report: ConformanceReport;
}

/**
 * The minimal `CapabilityInput` a conformance run is exercised against.
 * Mirrors the fixture `packages/capabilities-vendored/tests/
 * conformance.test.ts` already uses for the same purpose — a real
 * `targetUrl`, no code tree (this is not a source-backed capability check),
 * an empty `priorModuleResults`. No `controlLevel` (T252 removed it from
 * `CapabilityInput` entirely — gating on it is the runner's job, never the
 * capability's, so conformance has nothing of the kind to supply here).
 */
function sampleCapabilityInput(): CapabilityInput {
  return {
    targetUrl: 'https://example.com/',
    priorModuleResults: {},
  };
}

/**
 * T253. Writes the bundle and a real manifest to `installedRoot/<id>/`,
 * then reconciles immediately — the write happens first so a reconcile
 * that runs concurrently with a slow disk never sees a manifest with no
 * bundle behind it.
 */
async function installCapability(
  db: PrismaClient,
  report: ConformanceReport,
  input: UploadCapabilityInput,
): Promise<void> {
  const dir = path.join(defaultInstalledRoot(), report.capabilityId);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, INSTALLED_BUNDLE_FILENAME), input.bundle);
  await writeFile(
    path.join(dir, MANIFEST_FILENAME),
    JSON.stringify(
      {
        id: report.capabilityId,
        name: input.manifest.name,
        version: input.manifest.version,
        module: report.module,
        layer: report.layer,
        entrypoint: INSTALLED_BUNDLE_FILENAME,
        requiresCode: false,
        requiresScreenshot: false,
        requiredControlLevel: 'NONE',
        estimatedTokens: 0,
      },
      null,
      2,
    ),
  );
  await reconcileNow(db);
}

/**
 * Runs the real conformance suite, inside the real sandbox, against an
 * operator-uploaded bundle — FR-029, "under the same restriction" a
 * capability's own `runCodeLayer` executes under.
 *
 * `getSandboxRunnerUrl()` is called here, not at module load: if
 * `SANDBOX_RUNNER_URL` is unset, `SandboxRunnerNotConfiguredError` propagates
 * uncaught to the route, which maps it to the same 503 `SANDBOX_UNAVAILABLE`
 * shape T216 already used — no unsandboxed fallback, ever (Constitution
 * Principle V / R1).
 */
export async function uploadCapability(
  db: PrismaClient,
  input: UploadCapabilityInput,
): Promise<UploadCapabilityResult> {
  const sandboxRunnerUrl = getSandboxRunnerUrl();

  let outcome: ConformanceOutcome;
  try {
    outcome = await runConformanceCheck(sandboxRunnerUrl, {
      requestId: randomUUID(),
      capabilityBundle: input.bundle,
      sampleInput: sampleCapabilityInput(),
      limits: SANDBOX_LIMITS,
      manifest: input.manifest,
    });
  } catch (error) {
    // A real network failure (connection refused, DNS failure, etc.) throws
    // before ever producing a `SandboxResponse` — this is the "configured
    // but unreachable" case, distinct from "not configured at all" above.
    throw new SandboxUnavailableError(
      'NETWORK_ERROR',
      error instanceof Error ? error.message : String(error),
    );
  }

  if (!outcome.ok) {
    throw new SandboxUnavailableError(outcome.reason, outcome.detail);
  }

  await recordAuditLog(db, {
    actorId: input.operatorId,
    action: 'capability.upload_conformance_checked',
    subjectType: 'Capability',
    subjectId: outcome.report.capabilityId,
    before: null,
    after: { passed: outcome.report.passed, resultsCount: outcome.report.results.length },
  });

  if (outcome.report.passed) {
    await installCapability(db, outcome.report, input);
  }

  return {
    capabilityId: outcome.report.capabilityId,
    passed: outcome.report.passed,
    report: outcome.report,
  };
}
