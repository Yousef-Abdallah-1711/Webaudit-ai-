/**
 * T076 — R9: "validates every response against the schema — a schema failure is
 * a provider failure and advances the chain", and the contract's guarantee 3:
 * "Malformed output is never partially accepted."
 *
 * The temptation this suite exists to refuse is repair. When a model returns
 * nine good findings and one with `severity: "very bad"`, the obliging thing is
 * to keep the nine. That is how an AI-layer response becomes a report nobody can
 * account for: the dropped finding is invisible, the kept ones came from a
 * response the model got wrong, and the audit says nothing about either. So a
 * response either validates whole or the provider is treated as having failed —
 * and the next vendor gets the same prompt.
 *
 * Also asserted here, because it is the same boundary: `run` refuses anything
 * that is not a `RedactedPrompt`. 2F built `isRedactedPrompt` for this call site,
 * and the brand alone cannot stop `as unknown as RedactedPrompt`.
 */

import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { assemblePrompt } from '@webaudit/redaction';
import { createExecutor } from '../src/executor.js';
import { UnredactedPromptError } from '../src/executor.js';
import type { Provider, ProviderResponse } from '../src/provider.js';

const FINDINGS = z.object({
  findings: z.array(
    z.object({
      title: z.string(),
      severity: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO']),
    }),
  ),
});

function prompt() {
  return assemblePrompt({
    instructions: 'Report security findings as JSON.',
    segments: [{ label: 'markup', path: 'index.html', content: '<html></html>' }],
  }).prompt;
}

/** A provider that returns exactly what the test tells it to, once per call. */
function scripted(vendor: string, model: string, replies: readonly string[]): Provider {
  let index = 0;
  const provider: Provider & { calls: number } = {
    vendor,
    model,
    calls: 0,
    generate: () => {
      provider.calls += 1;
      const text = replies[Math.min(index, replies.length - 1)] ?? '';
      index += 1;
      return Promise.resolve<ProviderResponse>({
        outcome: 'SUCCESS',
        text,
        promptTokens: 100,
        outputTokens: 50,
      });
    },
  };
  return provider;
}

const VALID = JSON.stringify({ findings: [{ title: 'Missing CSP', severity: 'MEDIUM' }] });

describe('a schema-invalid response advances the chain', () => {
  it('moves to the next vendor and returns its valid answer', async () => {
    const first = scripted('vendor-a', 'm1', ['{"findings":[{"title":"x","severity":"NOPE"}]}']);
    const second = scripted('vendor-b', 'm2', [VALID]);
    const executor = createExecutor({ chain: [first, second] });

    const result = await executor.run({
      task: 'module:security',
      prompt: prompt(),
      schema: FINDINGS,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(result.value.findings[0]?.title).toBe('Missing CSP');

    // Both were asked, in order, once each.
    expect(result.invocations.map((i) => [i.provider, i.outcome])).toEqual([
      ['vendor-a', 'SCHEMA_INVALID'],
      ['vendor-b', 'SUCCESS'],
    ]);
  });

  it('records the failed attempt with its real token counts, not zeroes', async () => {
    // The attempt cost money. FR-039 records every interaction, and a schema
    // failure that records nothing makes the provider look free.
    const executor = createExecutor({
      chain: [scripted('vendor-a', 'm1', ['not json at all']), scripted('vendor-b', 'm2', [VALID])],
    });

    const result = await executor.run({ task: 'module:seo', prompt: prompt(), schema: FINDINGS });
    const failed = result.invocations[0]!;
    expect(failed.outcome).toBe('SCHEMA_INVALID');
    expect(failed.promptTokens).toBe(100);
    expect(failed.outputTokens).toBe(50);
    expect(failed.chainPosition).toBe(0);
  });

  it('never partially accepts: one bad item discards the whole response', async () => {
    const nineGoodOneBad = JSON.stringify({
      findings: [
        ...Array.from({ length: 9 }, (_unused, i) => ({
          title: `finding ${String(i)}`,
          severity: 'LOW' as const,
        })),
        { title: 'the tenth', severity: 'very bad' },
      ],
    });
    const executor = createExecutor({
      chain: [scripted('vendor-a', 'm1', [nineGoodOneBad]), scripted('vendor-b', 'm2', [VALID])],
    });

    const result = await executor.run({ task: 'module:ui', prompt: prompt(), schema: FINDINGS });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    // The nine survivors are nowhere. The answer came entirely from vendor-b.
    expect(result.value.findings).toHaveLength(1);
    expect(result.value.findings[0]?.title).toBe('Missing CSP');
    expect(JSON.stringify(result.value)).not.toContain('finding 0');
  });

  it('does not retry the same provider on a schema failure', async () => {
    // A retry loop at the call site is explicitly prohibited by the contract,
    // and a model that got the shape wrong tends to get it wrong again.
    const first = scripted('vendor-a', 'm1', ['{}', '{}', VALID]) as Provider & { calls: number };
    const executor = createExecutor({ chain: [first, scripted('vendor-b', 'm2', [VALID])] });

    await executor.run({ task: 'module:testing', prompt: prompt(), schema: FINDINGS });
    expect(first.calls).toBe(1);
  });

  it.each([
    ['empty string', ''],
    ['prose instead of JSON', 'Certainly! Here are the findings you asked for.'],
    ['a JSON array where an object was required', '[]'],
    ['a JSON scalar', '42'],
    ['truncated JSON', '{"findings":[{"title":"x","sever'],
    ['the right shape nested one level too deep', '{"data":{"findings":[]}}'],
    ['null', 'null'],
  ])('treats %s as a provider failure', async (_label, reply) => {
    const executor = createExecutor({
      chain: [scripted('vendor-a', 'm1', [reply]), scripted('vendor-b', 'm2', [VALID])],
    });
    const result = await executor.run({
      task: 'module:security',
      prompt: prompt(),
      schema: FINDINGS,
    });

    expect(result.invocations[0]?.outcome).toBe('SCHEMA_INVALID');
    expect(result.ok).toBe(true);
  });

  it('accepts JSON wrapped in a markdown fence, which is a formatting quirk not a failure', async () => {
    // Models fence JSON constantly. Failing over for that would burn the whole
    // chain on a cosmetic difference and cost twice for one answer.
    const fenced = '```json\n' + VALID + '\n```';
    const only = scripted('vendor-a', 'm1', [fenced]);
    const executor = createExecutor({ chain: [only, scripted('vendor-b', 'm2', ['{}'])] });

    const result = await executor.run({ task: 'module:seo', prompt: prompt(), schema: FINDINGS });
    expect(result.ok).toBe(true);
    expect(result.invocations).toHaveLength(1);
    expect(result.invocations[0]?.outcome).toBe('SUCCESS');
  });

  it('exhausts the chain when every vendor returns rubbish', async () => {
    const executor = createExecutor({
      chain: [scripted('vendor-a', 'm1', ['{}']), scripted('vendor-b', 'm2', ['also not it'])],
    });

    const result = await executor.run({ task: 'module:ui', prompt: prompt(), schema: FINDINGS });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.reason).toBe('CHAIN_EXHAUSTED');
    expect(result.invocations).toHaveLength(2);
    expect(result.invocations.every((i) => i.outcome === 'SCHEMA_INVALID')).toBe(true);
  });
});

describe('SC-016 - the executor accepts only a RedactedPrompt', () => {
  it('refuses a forged prompt object', async () => {
    const executor = createExecutor({
      chain: [scripted('vendor-a', 'm1', [VALID]), scripted('vendor-b', 'm2', [VALID])],
    });

    const forged = {
      text: 'Review this: AKIAIOSFODNN7EXAMPLE',
      placeholders: [],
      redactionCount: 0,
    };

    await expect(
      executor.run({
        task: 'module:security',
        prompt: forged as never,
        schema: FINDINGS,
      }),
    ).rejects.toBeInstanceOf(UnredactedPromptError);
  });

  it('refuses a raw string', async () => {
    const executor = createExecutor({
      chain: [scripted('vendor-a', 'm1', [VALID]), scripted('vendor-b', 'm2', [VALID])],
    });
    await expect(
      executor.run({ task: 'x', prompt: 'just a string' as never, schema: FINDINGS }),
    ).rejects.toBeInstanceOf(UnredactedPromptError);
  });

  it('refuses a prompt that has been through a queue', async () => {
    // Registry membership is per-object. This is the shape of the mistake: the
    // orchestrator serialises a job, the worker revives it, and the prompt is no
    // longer the one redaction produced.
    const revived: unknown = JSON.parse(JSON.stringify(prompt()));
    const executor = createExecutor({
      chain: [scripted('vendor-a', 'm1', [VALID]), scripted('vendor-b', 'm2', [VALID])],
    });

    await expect(
      executor.run({ task: 'x', prompt: revived as never, schema: FINDINGS }),
    ).rejects.toBeInstanceOf(UnredactedPromptError);
  });

  it('reaches no provider at all when the prompt is refused', async () => {
    const first = scripted('vendor-a', 'm1', [VALID]) as Provider & { calls: number };
    const executor = createExecutor({ chain: [first, scripted('vendor-b', 'm2', [VALID])] });

    await expect(
      executor.run({ task: 'x', prompt: 'nope' as never, schema: FINDINGS }),
    ).rejects.toBeInstanceOf(UnredactedPromptError);
    expect(first.calls).toBe(0);
  });

  it('accepts what the assembler produced', async () => {
    const executor = createExecutor({
      chain: [scripted('vendor-a', 'm1', [VALID]), scripted('vendor-b', 'm2', [VALID])],
    });
    const result = await executor.run({ task: 'x', prompt: prompt(), schema: FINDINGS });
    expect(result.ok).toBe(true);
  });
});
