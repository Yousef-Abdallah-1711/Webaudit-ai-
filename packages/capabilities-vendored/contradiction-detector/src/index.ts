/**
 * T142 — contradiction-detector: a self-consistency check over what the
 * *other* areas already concluded, not a new probe of the target at all.
 *
 * **No network, no page — `input.priorModuleResults` is the entire input.**
 * The architecture doc places this alongside `playwright-runner` under
 * TESTING (a fitting home: it is a check on the audit's own output, the
 * same "green means verified" discipline Principle VII asks of everything
 * else). `ModuleSummary` deliberately carries only aggregate facts — state,
 * score, finding count, worst severity — never individual findings (see
 * `contract.ts`'s own note on `ModuleSummary`), so what this capability can
 * honestly detect is limited to relationships *between those aggregates*
 * that should never hold given how scoring and state resolution work
 * elsewhere in this codebase:
 *
 *   - a module reporting findings with no worst severity at all,
 *   - a module scoring itself in the "healthy" range despite carrying a
 *     CRITICAL or HIGH finding, and
 *   - a module reporting FAILED (which `MODULE_STATES_SCORED` and
 *     `state.ts` both mean as "nothing was measured") while still carrying
 *     findings.
 *
 * Every one of these would be a defect in the scoring or state-resolution
 * pipeline itself if it ever fired for real — this is a QA-of-QA capability,
 * not a claim about the target's own site.
 */

import type {
  AuditCapability,
  CapabilityFinding,
  CapabilityInput,
} from '@webaudit/capability-sdk';
import type { ModuleType } from '@webaudit/types';

/** Above this, a module's own score reads as "healthy" — an odd claim next to a severe finding. */
const HEALTHY_SCORE_FLOOR = 90;

function finding(
  checkId: string,
  severity: CapabilityFinding['severity'],
  title: string,
  description: string,
  consequence: string,
  module: ModuleType,
  evidence: Readonly<Record<string, unknown>>,
): CapabilityFinding {
  return {
    checkId,
    fingerprintParts: [checkId, module],
    severity,
    title,
    description,
    consequence,
    fixable: false,
    evidence,
  };
}

function runCodeLayer(input: CapabilityInput): Promise<CapabilityFinding[]> {
  const findings: CapabilityFinding[] = [];

  for (const [moduleKey, summary] of Object.entries(input.priorModuleResults)) {
    const module = moduleKey as ModuleType;
    if (summary === undefined) continue;

    if (summary.findingCount > 0 && summary.worstSeverity === null) {
      findings.push(
        finding(
          'contradiction.severity-missing-with-findings',
          'MEDIUM',
          `${module}: findings recorded with no worst severity`,
          `The ${module} area reports ${String(summary.findingCount)} finding(s) but no worst ` +
            'severity, which should not be possible if any finding was actually recorded.',
          'This audit’s own results are internally inconsistent, which undermines trust in ' +
            'every number this report shows.',
          module,
          { module, findingCount: summary.findingCount },
        ),
      );
    }

    if (
      (summary.worstSeverity === 'CRITICAL' || summary.worstSeverity === 'HIGH') &&
      summary.score !== null &&
      summary.score >= HEALTHY_SCORE_FLOOR
    ) {
      findings.push(
        finding(
          'contradiction.high-score-despite-severe-finding',
          'MEDIUM',
          `${module}: high score despite a ${summary.worstSeverity} finding`,
          `The ${module} area scored ${String(summary.score)} while its worst finding is ` +
            `${summary.worstSeverity}, a combination that reads as contradictory to a reader ` +
            'comparing the score against the findings list.',
          'A high score next to a severe finding can make a reader trust the score and skip ' +
            'past a finding that actually needs attention.',
          module,
          { module, score: summary.score, worstSeverity: summary.worstSeverity },
        ),
      );
    }

    if (summary.state === 'FAILED' && summary.findingCount > 0) {
      findings.push(
        finding(
          'contradiction.failed-state-with-findings',
          'MEDIUM',
          `${module}: FAILED state with findings recorded`,
          `The ${module} area is marked FAILED (nothing measured) but reports ` +
            `${String(summary.findingCount)} finding(s).`,
          'FAILED is meant to mean this area measured nothing; findings alongside it are a ' +
            'contradiction a reader would reasonably notice.',
          module,
          { module, findingCount: summary.findingCount },
        ),
      );
    }
  }

  return Promise.resolve(findings);
}

export const contradictionDetector: AuditCapability = {
  id: 'contradiction-detector',
  module: 'TESTING',
  layer: 'CODE',
  canRun: (input: CapabilityInput): boolean =>
    Object.keys(input.priorModuleResults).length > 0,
  runCodeLayer,
};

export default contradictionDetector;
