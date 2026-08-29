/**
 * T083 — the prompts, checked for the properties the architecture depends on
 * rather than for their prose.
 *
 * A prompt cannot be unit-tested for quality. What it can be tested for is the
 * constraints around it: that every area has one, that none invites the model to
 * invent findings (Principle III, FR-032), and that the paired schemas cannot
 * accept a response that would let a judgement pass as a measurement or a
 * recommendation exist with no check behind it.
 */

import { describe, expect, it } from 'vitest';
import { MODULE_TYPES } from '@webaudit/types';
import {
  MODULE_PROMPTS,
  SHARED_PREAMBLE,
  masterReportPrompt,
  masterReportSchema,
  moduleInsightSchema,
} from '../../src/prompts/index.js';

describe('every area has a prompt', () => {
  it('covers all five module types and nothing else', () => {
    expect(Object.keys(MODULE_PROMPTS).sort()).toEqual([...MODULE_TYPES].sort());
  });

  it('gives each one a distinct task id the executor can key on', () => {
    const tasks = Object.values(MODULE_PROMPTS).map((p) => p.task);
    expect(new Set(tasks).size).toBe(tasks.length);
    expect(tasks).toContain('module:security');
    expect(masterReportPrompt.task).toBe('master-report');
  });

  it('declares a non-zero token estimate, because FR-082 compares against it', () => {
    for (const [module, prompt] of Object.entries(MODULE_PROMPTS)) {
      expect(prompt.estimatedTokens, module).toBeGreaterThan(0);
    }
    expect(masterReportPrompt.estimatedTokens).toBeGreaterThan(0);
  });

  it('carries the shared rules into every area', () => {
    for (const [module, prompt] of Object.entries(MODULE_PROMPTS)) {
      expect(prompt.systemPrompt, module).toContain(SHARED_PREAMBLE);
      expect(prompt.systemPrompt, module).toContain(`Area: ${module}`);
    }
  });
});

describe('Principle III - no prompt asks the model to measure', () => {
  const all = [
    ...Object.values(MODULE_PROMPTS).map((p) => p.systemPrompt),
    masterReportPrompt.systemPrompt,
  ];

  it('tells the model it is explaining measurements, not making them', () => {
    for (const prompt of all) {
      expect(prompt).toMatch(/do not report new defects/i);
      expect(prompt).toMatch(/cannot observe/i);
    }
  });

  it('permits an empty answer, so a clean area does not acquire filler', () => {
    for (const prompt of all) {
      expect(prompt).toMatch(/Do not manufacture/i);
    }
  });

  it('tells the model what a redaction placeholder means', () => {
    // R8 leaves [[REDACTED:KIND:n]] in the prompt. A model that has not been
    // told what that is will either ignore it or speculate about it.
    for (const prompt of all) {
      expect(prompt).toContain('[[REDACTED:');
      expect(prompt).toMatch(/never speculate about its/i);
    }
  });
});

describe('the module insight schema', () => {
  it('calls them insights, not findings', () => {
    // The name is the guardrail. A field called `findings` invites exactly the
    // confusion FR-032 exists to prevent.
    const shape = Object.keys(moduleInsightSchema.shape);
    expect(shape).toContain('insights');
    expect(shape).not.toContain('findings');
  });

  it('accepts a well-formed response', () => {
    const parsed = moduleInsightSchema.safeParse({
      summary: 'Two headers are missing and one dependency is stale.',
      insights: [
        {
          relatesToCheckIds: ['headers.csp'],
          title: 'CSP matters more here than usual',
          explanation: 'This page reflects a query parameter into the DOM.',
          consequence: 'A reflected script would execute with no policy to stop it.',
          severity: 'HIGH',
        },
      ],
      priorityOrder: ['headers.csp', 'headers.hsts'],
    });
    expect(parsed.success).toBe(true);
  });

  it('accepts a genuinely empty answer', () => {
    const parsed = moduleInsightSchema.safeParse({
      summary: 'Nothing measured in this area needs interpretation.',
      insights: [],
      priorityOrder: [],
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects an insight with no consequence, the half that gets skipped', () => {
    const parsed = moduleInsightSchema.safeParse({
      summary: 'x',
      insights: [{ relatesToCheckIds: [], title: 't', explanation: 'e', severity: 'LOW' }],
      priorityOrder: [],
    });
    expect(parsed.success).toBe(false);
  });

  it('rejects an invented severity rather than coercing it', () => {
    const parsed = moduleInsightSchema.safeParse({
      summary: 'x',
      insights: [
        {
          relatesToCheckIds: [],
          title: 't',
          explanation: 'e',
          consequence: 'c',
          severity: 'VERY BAD',
        },
      ],
      priorityOrder: [],
    });
    expect(parsed.success).toBe(false);
  });
});

describe('the master report schema', () => {
  it('requires a checkId on every next step', () => {
    // FR-059 routes re-verification by checkId. A step without one cannot be
    // verified, cannot be marked fixed, and cannot turn green.
    const parsed = masterReportSchema.safeParse({
      headline: 'Two things need attention.',
      nextSteps: [{ module: 'SECURITY', action: 'Rotate the key', reason: 'It is public' }],
      crossCuttingThemes: [],
      coverageGaps: [],
    });
    expect(parsed.success).toBe(false);
  });

  it('accepts a report that cites its checks', () => {
    const parsed = masterReportSchema.safeParse({
      headline: 'A committed credential is the urgent item.',
      nextSteps: [
        {
          checkId: 'redaction.secret-in-source',
          module: 'SECURITY',
          action: 'Rotate the AWS key and remove it from configuration',
          reason: 'It is readable by anyone with repository access',
        },
      ],
      crossCuttingThemes: [
        {
          theme: 'One build configuration causes findings in three areas',
          modules: ['PERFORMANCE', 'SEO'],
          explanation: 'Source maps and unminified bundles ship to production.',
        },
      ],
      coverageGaps: [
        { module: 'TESTING', reason: 'No source was attached, so no suite could be read.' },
      ],
    });
    expect(parsed.success).toBe(true);
  });

  it('requires a theme to span at least two areas, or it is not cross-cutting', () => {
    const parsed = masterReportSchema.safeParse({
      headline: 'x',
      nextSteps: [],
      crossCuttingThemes: [{ theme: 't', modules: ['SEO'], explanation: 'e' }],
      coverageGaps: [],
    });
    expect(parsed.success).toBe(false);
  });

  it('has no field for an overall score', () => {
    // The score is computed from the areas that completed and excludes the ones
    // that did not (FR-053). A model-supplied number would contradict it.
    const shape = Object.keys(masterReportSchema.shape);
    expect(shape).not.toContain('score');
    expect(shape).not.toContain('overallScore');
  });

  it('instructs the model to declare coverage gaps rather than omit them', () => {
    expect(masterReportPrompt.systemPrompt).toMatch(/coverageGaps is not optional/i);
    expect(masterReportPrompt.systemPrompt).toMatch(/DEGRADED/);
    expect(masterReportPrompt.systemPrompt).toMatch(/NOT_APPLICABLE/);
    expect(masterReportPrompt.systemPrompt).toMatch(/pending verification/i);
  });

  it('forbids computing a score in words as well as in schema', () => {
    expect(masterReportPrompt.systemPrompt).toMatch(/Do NOT compute or estimate/);
  });
});
