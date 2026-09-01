/**
 * showcase-esaalnybot — the standalone audit runner.
 *
 * Drives the REAL WebAudit AI audit capabilities against a live URL and writes
 * the measured results to `data/audit.json`. Nothing here is mocked:
 *
 *  - The 13 capabilities are the real `packages/capabilities-vendored/*` packages
 *    (`src/capabilities.ts` mirrors `apps/worker/src/orchestrator/capability-loader.ts`).
 *  - Resolution, concurrent isolated execution, `globalThis.fetch` poisoning,
 *    per-area state and per-area scoring all reuse the product's own
 *    `apps/worker/src/module-runner/*` modules verbatim — imported, not copied.
 *  - `ctx.fetch` is the product's SSRF-guarded `safeFetch`.
 *  - `ctx.withPage` is backed by the product's real Playwright browser pool
 *    (`apps/probe-pool/src/browser/pool.ts`), so the Core Web Vitals / page-weight
 *    / layout-overflow checks that are inert in the product's URL-only pipeline
 *    today produce real measured data here.
 *
 * What is NOT run here: the runtime AI layer (`ai-executor`). No LLM key is
 * configured. The executive summary / per-area narrative / prioritisation are
 * authored separately (see `src/ai-narrative.ts`) strictly from these measured
 * findings and are labelled as such in the report and dashboard.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import type { AuditCapability, CapabilityInput } from '@webaudit/capability-sdk';
import { createCodeLayerContext } from '@webaudit/capability-sdk';
import type { ModuleSummary } from '@webaudit/capability-sdk';
import { isScorable, worstSeverity } from '@webaudit/scoring';
import { overallScore } from '@webaudit/scoring';
import type { ModuleType, Severity } from '@webaudit/types';
import { SEVERITIES } from '@webaudit/types';

import { resolveApplicable } from '../../apps/worker/src/module-runner/resolve.js';
import { runCodeLayer } from '../../apps/worker/src/module-runner/code-layer.js';
import { resolveModuleState } from '../../apps/worker/src/module-runner/state.js';
import {
  attributeMeasured,
  type AttributedFinding,
} from '../../apps/worker/src/module-runner/attribute.js';
import { createBrowserPool, type BrowserPool } from '../../apps/probe-pool/src/browser/pool.js';

import { MODULE_LABEL, MODULE_ORDER, loadCapabilities } from './capabilities.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '..', 'data', 'audit.json');

const TARGET = process.argv[2] ?? 'https://app.esaalnybot.tech/';
const MODULE_TIMEOUT_MS = 90_000;

// The SSRF guard refuses a target that is not on the public internet unless it
// is explicitly allow-listed. app.esaalnybot.tech is a normal public host, so
// this is only a safety net for local testing against a fixture.
if (process.env['SAFE_NET_ALLOW_TARGETS'] === undefined) {
  try {
    const host = new URL(TARGET).origin;
    if (/(^https?:\/\/(localhost|127\.|0\.0\.0\.0|\[::1\]))/.test(host)) {
      process.env['SAFE_NET_ALLOW_TARGETS'] = host;
    }
  } catch {
    /* handled below */
  }
}

interface CapabilityRunRecord {
  readonly id: string;
  readonly layer: AuditCapability['layer'];
  readonly ran: boolean;
  readonly succeeded: boolean;
  readonly findingCount: number;
  readonly durationMs: number;
  readonly error: string | null;
  readonly skippedReason: string | null;
  readonly egressViolations: readonly string[];
}

interface AreaResult {
  readonly module: ModuleType;
  readonly label: string;
  readonly state: string;
  readonly score: number | null;
  readonly scorable: boolean;
  readonly degradedReason: string | null;
  readonly skippedReason: string | null;
  readonly worstSeverity: Severity | null;
  readonly capabilities: readonly CapabilityRunRecord[];
  readonly aiLayerContext: string | null;
  readonly findings: readonly SerializedFinding[];
}

interface SerializedFinding {
  readonly module: ModuleType;
  readonly area: string;
  readonly checkId: string;
  readonly fingerprint: string;
  readonly severity: Severity;
  readonly attribution: AttributedFinding['attribution'];
  readonly title: string;
  readonly explanation: string;
  readonly consequence: string;
  readonly location: string | null;
  readonly evidence: Readonly<Record<string, unknown>> | null;
  readonly fixPrompt: string;
  readonly fixable: boolean;
}

function log(msg: string): void {
  process.stdout.write(`${msg}\n`);
}

async function makeBrowserPool(): Promise<{ pool: BrowserPool | null; note: string }> {
  try {
    const pool = await createBrowserPool({ headless: true });
    // Prove it actually works before trusting it for the run.
    await pool.withPage(async (page) => {
      await page.goto('about:blank');
      return page.title();
    });
    return { pool, note: 'real headless Chromium (Playwright)' };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      pool: null,
      note: `unavailable (${message}); ctx.withPage checks degrade to ctx.fetch-only, exactly as the product's URL-only pipeline does today`,
    };
  }
}

async function runArea(
  module: ModuleType,
  capabilities: readonly AuditCapability[],
  input: CapabilityInput,
  pageProvider: (<T>(fn: (page: import('@webaudit/capability-sdk').AuditPage) => Promise<T>) => Promise<T>) | undefined,
): Promise<AreaResult> {
  const makeContext = (signal: AbortSignal, capabilityId: string) =>
    createCodeLayerContext({
      signal,
      capabilityId,
      ...(pageProvider === undefined ? {} : { pageProvider }),
    });

  const { applicable, skipped } = await resolveApplicable({ capabilities, input });

  const outcomes = await runCodeLayer({
    applicable,
    input,
    makeContext,
    timeoutMs: MODULE_TIMEOUT_MS,
  });

  const measured = outcomes.flatMap((o) => [...o.findings]);
  const attributed = attributeMeasured(measured, { module, targetId: input.targetUrl ?? TARGET });

  const state = resolveModuleState({
    applicableCount: applicable.length,
    outcomes,
    skipped,
    findings: attributed,
    aiDegraded: false,
  });

  // AI-layer capabilities (e.g. impeccable) contribute prompt text only — capture
  // it so the report can show what the AI layer would have received.
  const aiContexts: string[] = [];
  for (const entry of applicable) {
    const cap = entry.capability;
    if (typeof cap.getSystemPromptAddition === 'function') {
      aiContexts.push(`[${cap.id}] system: ${cap.getSystemPromptAddition()}`);
    }
    if (typeof cap.getContextData === 'function') {
      try {
        aiContexts.push(`[${cap.id}] context: ${cap.getContextData(measured, input)}`);
      } catch {
        /* advisory only */
      }
    }
  }

  const capRecords: CapabilityRunRecord[] = [];
  for (const cap of capabilities) {
    const outcome = outcomes.find((o) => o.capabilityId === cap.id);
    const skip = skipped.find((s) => s.capabilityId === cap.id);
    const isApplicable = applicable.some((a) => a.capability.id === cap.id);
    capRecords.push({
      id: cap.id,
      layer: cap.layer,
      ran: outcome !== undefined,
      succeeded: outcome?.succeeded ?? false,
      findingCount: outcome?.findings.length ?? 0,
      durationMs: outcome?.durationMs ?? 0,
      error: outcome?.errorMessage ?? null,
      skippedReason: skip?.detail ?? (isApplicable || outcome ? null : 'not applicable'),
      egressViolations: outcome?.egressViolations ?? [],
    });
  }

  const findings: SerializedFinding[] = attributed.map((f) => ({
    module,
    area: MODULE_LABEL[module],
    checkId: f.checkId,
    fingerprint: f.fingerprint,
    severity: f.severity,
    attribution: f.attribution,
    title: f.title,
    explanation: f.explanation,
    consequence: f.consequence,
    location: f.location ?? null,
    evidence: (f.evidence as Readonly<Record<string, unknown>> | undefined) ?? null,
    fixPrompt: f.fixPrompt,
    fixable: f.fixable,
  }));

  return {
    module,
    label: MODULE_LABEL[module],
    state: state.state,
    score: state.score,
    scorable: isScorable(state.state),
    degradedReason: state.degradedReason ?? null,
    skippedReason: state.skippedReason ?? null,
    worstSeverity: worstSeverity(attributed),
    capabilities: capRecords,
    aiLayerContext: aiContexts.length > 0 ? aiContexts.join('\n\n') : null,
    findings,
  };
}

async function main(): Promise<void> {
  const startedAt = new Date();
  log(`\n  WebAudit AI — showcase run`);
  log(`  target: ${TARGET}`);

  new URL(TARGET); // throws early on a bad target

  const { pool, note } = await makeBrowserPool();
  log(`  browser: ${note}\n`);
  const pageProvider = pool === undefined || pool === null ? undefined : pool.withPage.bind(pool);

  const areas: AreaResult[] = [];
  const priorModuleResults: Partial<Record<ModuleType, ModuleSummary>> = {};

  try {
    for (const module of MODULE_ORDER) {
      const label = MODULE_LABEL[module];
      process.stdout.write(`  ▸ ${label.padEnd(18)} `);
      const capabilities = await loadCapabilities(module);

      const input: CapabilityInput = {
        targetUrl: TARGET,
        priorModuleResults: { ...priorModuleResults },
        controlLevel: 'NONE',
      };

      const area = await runArea(module, capabilities, input, pageProvider);
      areas.push(area);

      priorModuleResults[module] = {
        state: area.state as ModuleSummary['state'],
        score: area.score,
        findingCount: area.findings.length,
        worstSeverity: area.worstSeverity,
      };

      const scoreText = area.score === null ? ' n/a ' : String(area.score).padStart(3);
      log(
        `${area.state.padEnd(13)} score ${scoreText}   ${String(area.findings.length).padStart(2)} findings`,
      );
    }
  } finally {
    if (pool) await pool.close().catch(() => undefined);
  }

  const completedAt = new Date();

  const overall = overallScore(
    areas.map((a) => ({
      module: a.module,
      state: a.state as import('@webaudit/types').ModuleState,
      score: a.score,
    })),
  );

  const allFindings = areas.flatMap((a) => a.findings);
  const counts = Object.fromEntries(
    SEVERITIES.map((s) => [s, allFindings.filter((f) => f.severity === s).length]),
  ) as Record<Severity, number>;

  const doc = {
    meta: {
      target: TARGET,
      startedAt: startedAt.toISOString(),
      completedAt: completedAt.toISOString(),
      durationMs: completedAt.getTime() - startedAt.getTime(),
      engine:
        'showcase-esaalnybot standalone runner — real @webaudit/capabilities-vendored (13) + real module-runner + real safe-net + real Playwright browser pool',
      browser: note,
      aiLayer:
        'NOT run at runtime (no LLM key). Executive summary, per-area narrative and prioritisation authored by Claude strictly from the measured findings below — labelled AI_NARRATIVE, distinct from the per-finding MEASURED / AI_JUDGMENT attribution the runner assigns.',
      capabilityCount: areas.reduce((n, a) => n + a.capabilities.length, 0),
    },
    overall: {
      score: overall.score,
      scoredModules: overall.scoredModules,
      unscoredModules: overall.unscoredModules,
    },
    counts,
    areas,
    // Filled in by src/ai-narrative.ts after this runs.
    aiNarrative: null as unknown,
  };

  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, `${JSON.stringify(doc, null, 2)}\n`, 'utf8');

  log(`\n  overall score: ${overall.score ?? 'n/a'} / 100`);
  log(
    `  findings: ${allFindings.length}  (` +
      SEVERITIES.filter((s) => counts[s] > 0)
        .map((s) => `${counts[s]} ${s.toLowerCase()}`)
        .join(', ') +
      `)`,
  );
  log(`  written: ${OUT}\n`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
