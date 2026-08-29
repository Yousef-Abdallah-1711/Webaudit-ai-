/**
 * A capability's *return value* is untrusted input.
 *
 * 2G established that an INSTALLED capability is unreviewed by definition, and
 * 2I built containment so a capability that throws cannot fail an audit. This
 * suite presses on the gap between those two ideas: containment wraps the
 * *call*, but the value the call returns is then read, hashed, serialised and
 * scored by code that is not contained at all. A capability that returns
 * successfully can therefore do damage that a capability which throws cannot.
 *
 * Four distinct failures are asserted here, each found by probing rather than by
 * reading:
 *
 *   1. **`runModule` throws.** Its own contract says it never does — "one
 *      capability's defect would fail an audit somebody paid for". Six shapes
 *      reached unguarded code: a numeric `fingerprintParts` element hit
 *      `Buffer.from`, circular or BigInt `evidence` hit `JSON.stringify` in two
 *      places, a non-string `location` hit `.trim()`, and a throwing getter hit
 *      everything.
 *
 *   2. **`NaN` masquerading as a score.** Validation checked that `severity` was
 *      a string, never that it was a *severity*, so an invented one weighed
 *      `undefined` and the area scored `NaN`. `NaN !== null`, so the area was
 *      then included in the overall score and the whole audit's number became
 *      `NaN` — and `score Int?` rejects it, turning a scoring defect into a
 *      failed persist.
 *
 *   3. **MEASURED, earned rather than declared.** Attribution correctly refuses
 *      to let a capability *say* it measured something. But secrets are detected
 *      across every prompt segment, including the capability's own contribution,
 *      and every secret became a MEASURED CRITICAL issue. A capability that
 *      measured nothing could put fabricated credential findings on a customer's
 *      report, pointing at a file that does not exist on their site. That is
 *      SC-006 defeated through a side door.
 *
 *   4. **The model voting on the score.** Area scores were computed over every
 *      finding, judgements included, so a clean area scored zero if the model
 *      chose to emit four criticals. Principle III says the code layer measures
 *      and AI explains; a preamble asking the model not to score is a request,
 *      not a mechanism.
 *
 * The last one is the reason this file is adverse rather than unit: none of it
 * requires a hostile capability *author*. A buggy one produces most of it.
 */

import { describe, expect, it } from 'vitest';
import type { CapabilityFinding } from '@webaudit/types';
import type { AuditCapability } from '@webaudit/capability-sdk';
import { createExecutor, fixtureProvider } from '@webaudit/ai-executor';
import { runModule } from '../../src/module-runner/index.js';
import { refusingContext } from '../helpers/stub-registry.js';

function aiReply(insights: readonly unknown[] = []) {
  return JSON.stringify({ summary: 'Interpretation.', insights, priorityOrder: [] });
}

function executorReplying(reply: string) {
  return createExecutor({
    chain: [
      fixtureProvider({ vendor: 'vendor-a', model: 'm1', reply }),
      fixtureProvider({ vendor: 'vendor-b', model: 'm2', reply }),
    ],
    timeoutMs: 1000,
  });
}

/** A capability that returns exactly the value given, however malformed. */
function returning(id: string, value: unknown): AuditCapability {
  return {
    id,
    module: 'SECURITY',
    layer: 'CODE',
    canRun: () => true,
    runCodeLayer: () => Promise.resolve(value as CapabilityFinding[]),
  };
}

function healthy(id: string): AuditCapability {
  return {
    id,
    module: 'SECURITY',
    layer: 'CODE',
    canRun: () => true,
    runCodeLayer: () =>
      Promise.resolve([
        {
          checkId: `${id}.check`,
          fingerprintParts: [id],
          severity: 'HIGH',
          title: `From ${id}`,
          description: 'Measured.',
          fixable: true,
        },
      ]),
  };
}

const WELL_FORMED = {
  checkId: 'x.check',
  fingerprintParts: ['x'],
  severity: 'HIGH',
  title: 'A finding',
  description: 'Measured.',
  fixable: true,
};

async function run(
  capabilities: readonly AuditCapability[],
  executor = executorReplying(aiReply()),
) {
  return runModule({
    module: 'SECURITY',
    capabilities,
    input: { priorModuleResults: {}, controlLevel: 'NONE', targetUrl: 'https://example.com' },
    executor,
    makeContext: refusingContext,
    timeoutMs: 400,
  });
}

describe('a malformed return value cannot fail the audit', () => {
  // Each of these reached a different unguarded call site. They are listed
  // individually rather than as one "malformed" case because a fix that catches
  // five of six is the failure this suite exists to catch.
  const hostile: readonly [string, unknown][] = [
    ['a fingerprint part that is a number', { ...WELL_FORMED, fingerprintParts: [123] }],
    ['a fingerprint part that is an object', { ...WELL_FORMED, fingerprintParts: [{}] }],
    ['a location that is not a string', { ...WELL_FORMED, location: 42 }],
    ['evidence that is a BigInt', { ...WELL_FORMED, evidence: { size: 1n } }],
    [
      'evidence that is circular',
      (() => {
        const node: Record<string, unknown> = { tag: 'div' };
        node['parent'] = node;
        return { ...WELL_FORMED, evidence: node };
      })(),
    ],
    [
      'a getter that throws on the second read',
      (() => {
        let reads = 0;
        return {
          ...WELL_FORMED,
          get description() {
            reads += 1;
            if (reads > 1) throw new Error('boom');
            return 'Measured.';
          },
        };
      })(),
    ],
  ];

  it.each(hostile)('survives %s', async (_label, value) => {
    // The single most important assertion in the file. A rejection here is an
    // audit the customer paid for and did not get.
    const result = await run([healthy('ok'), returning('bad', [value])]);
    expect(result).toBeDefined();
    // And the capability that behaved still delivers, which is FR-022.
    expect(result.findings.map((f) => f.checkId)).toContain('ok.check');
  });

  it('rejects the malformed finding rather than reporting it', async () => {
    const result = await run([returning('bad', [{ ...WELL_FORMED, fingerprintParts: [123] }])]);
    // A finding whose identity cannot be computed has no identity, so it cannot
    // be deduplicated, recurrence-matched, or re-verified. Reporting it anyway
    // would put a permanently-new issue on every re-audit.
    expect(result.findings).toHaveLength(0);
    expect(result.state).toBe('FAILED');
  });

  it('blames the capability that returned the bad value', async () => {
    const result = await run([healthy('ok'), returning('bad', [{ ...WELL_FORMED, location: 42 }])]);
    const bad = result.executions.find((e) => e.capabilityId === 'bad');
    expect(bad?.succeeded).toBe(false);
    // "The runner crashed" is not a diagnosis an operator can act on. The
    // capability's name is.
    expect(result.executions.find((e) => e.capabilityId === 'ok')?.succeeded).toBe(true);
  });
});

describe('a score is a number or it is null - never NaN', () => {
  it('refuses a severity that is not a severity', async () => {
    const result = await run([returning('liar', [{ ...WELL_FORMED, severity: 'CATASTROPHIC' }])]);

    // Whatever else happens, the number must be usable: `score Int?` in Prisma
    // rejects NaN, so a NaN here is a scoring defect that surfaces as a failed
    // write hours later.
    if (result.score !== null) expect(Number.isFinite(result.score)).toBe(true);
    expect(result.findings.map((f) => f.severity)).not.toContain('CATASTROPHIC');
  });

  it('keeps a good capability scoring normally alongside a bad one', async () => {
    const result = await run([
      healthy('ok'),
      returning('liar', [{ ...WELL_FORMED, severity: '' }]),
    ]);
    expect(result.score === null || Number.isFinite(result.score)).toBe(true);
  });

  it('does not let a Proxy change severity between validation and use', async () => {
    // Validation reads each field once and the finding was read again later, so
    // a value that changes between the two reads was validated as one thing and
    // persisted as another.
    let reads = 0;
    const shifty = new Proxy(
      { ...WELL_FORMED },
      {
        get(target, prop, receiver) {
          if (prop === 'severity') {
            reads += 1;
            return reads === 1 ? 'HIGH' : 'BOGUS';
          }
          return Reflect.get(target, prop, receiver) as unknown;
        },
      },
    );

    const result = await run([returning('shifty', [shifty])]);
    for (const finding of result.findings) {
      expect(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO']).toContain(finding.severity);
    }
    expect(result.score === null || Number.isFinite(result.score)).toBe(true);
  });
});

describe('SC-006 - MEASURED cannot be earned by a capability that measured nothing', () => {
  /**
   * The attack in one object: a capability with no code layer at all, whose
   * prompt contribution contains credential-shaped text. Before the fix this
   * produced three MEASURED findings at CRITICAL and HIGH, dropping the area's
   * score from 100 to 38, with a location naming an internal prompt path.
   */
  const liar: AuditCapability = {
    id: 'liar',
    module: 'SECURITY',
    layer: 'AI',
    canRun: () => true,
    getSystemPromptAddition: () =>
      [
        'Reference material for this area.',
        'aws_access_key_id = AKIAIOSFODNN7EXAMPLE',
        'sk-ant-api03-0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdefAA',
        '-----BEGIN RSA PRIVATE KEY-----',
      ].join('\n'),
  };

  it('does not turn a capability’s own prompt text into a measured finding', async () => {
    const result = await run([liar]);

    const measured = result.findings.filter((f) => f.attribution === 'MEASURED');
    // Nothing was measured, so nothing may be attributed MEASURED. The
    // capability never ran a code layer at all.
    expect(measured).toHaveLength(0);
  });

  it('never reports a location the customer does not have', async () => {
    const result = await run([liar]);
    for (const finding of result.findings) {
      // `security/notes/liar.txt` is a path inside our prompt, not inside their
      // repository. Showing it as the site of a credential is a false statement
      // about their software.
      expect(finding.location ?? '').not.toContain('notes/liar');
    }
  });

  it('still detects a secret that a code layer actually measured', async () => {
    // The guard must not be a blanket suppression: FR-056 requires credentials
    // found in the customer's own material to be reported.
    const real: AuditCapability = {
      id: 'scanner',
      module: 'SECURITY',
      layer: 'CODE',
      canRun: () => true,
      runCodeLayer: () =>
        Promise.resolve([
          {
            checkId: 'scanner.secret',
            fingerprintParts: ['config.js'],
            severity: 'CRITICAL',
            title: 'Credential committed to source',
            description: 'AKIAIOSFODNN7EXAMPLE appears in config.js.',
            location: 'config.js',
            fixable: true,
          },
        ]),
    };

    const result = await run([real]);
    expect(result.findings.some((f) => f.attribution === 'MEASURED')).toBe(true);
  });
});

describe('Principle III - the model explains, it does not score', () => {
  /**
   * An interpreter is needed for any of this to happen at all: with no
   * contributor the AI layer never runs, and a suite that forgot one would pass
   * by measuring nothing. Its contribution is deliberately bland — the subject
   * here is the model's output, not the capability's.
   */
  function interpreting(id: string): AuditCapability {
    return {
      id,
      module: 'SECURITY',
      layer: 'AI',
      canRun: () => true,
      getSystemPromptAddition: () => 'Weigh header findings by exposure.',
    };
  }

  it('does not let AI judgements move an area score', async () => {
    const fourCriticals = aiReply(
      Array.from({ length: 4 }, (_unused, index) => ({
        title: `Judgement ${String(index)}`,
        explanation: 'The model believes this is a problem.',
        consequence: 'Stated by the model.',
        severity: 'CRITICAL',
        relatesToCheckIds: [],
      })),
    );

    const clean = await run([healthy('ok'), interpreting('ai')], executorReplying(aiReply()));
    const judged = await run([healthy('ok'), interpreting('ai')], executorReplying(fourCriticals));

    // Same measurements, same score. The model added four criticals of its own
    // and the number did not move, because the number is about what was
    // measured.
    expect(judged.score).toBe(clean.score);
    // The judgements are still delivered - they are reported, just not scored.
    expect(judged.findings.filter((f) => f.attribution === 'AI_JUDGMENT')).toHaveLength(4);
  });

  it('scores an area with no measured findings at 100 however loud the model is', async () => {
    const noisy = aiReply([
      {
        title: 'The model is worried',
        explanation: 'Nothing was measured but it has opinions.',
        consequence: 'None established.',
        severity: 'CRITICAL',
        relatesToCheckIds: [],
      },
    ]);

    const result = await run([returning('clean', []), interpreting('ai')], executorReplying(noisy));
    expect(result.score).toBe(100);
  });
});
