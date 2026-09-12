import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { assemblePrompt } from '@webaudit/redaction';
import { computePromptVersion } from '../../src/prompt-version.js';
import { createExecutor, fixtureProvider } from '../../src/index.js';

describe('computePromptVersion', () => {
  it('is stable for the same instructions text', () => {
    const a = computePromptVersion('You are auditing SECURITY.');
    const b = computePromptVersion('You are auditing SECURITY.');
    expect(a).toBe(b);
  });

  it('changes when the instructions text changes', () => {
    const a = computePromptVersion('You are auditing SECURITY.');
    const b = computePromptVersion('You are auditing SECURITY carefully.');
    expect(a).not.toBe(b);
  });
});

describe('AiExecutor records promptVersion on every invocation', () => {
  it('passes the requested promptVersion through to the recorded invocation', async () => {
    const executor = createExecutor({
      chain: [
        fixtureProvider({ vendor: 'fixture-a', model: 'stub-1', reply: '{"ok":true}' }),
        fixtureProvider({ vendor: 'fixture-b', model: 'stub-2' }),
      ],
    });
    const prompt = assemblePrompt({
      instructions: 'Return a JSON object.',
      segments: [{ label: 'input', path: 'input.txt', content: 'hello' }],
    }).prompt;

    const result = await executor.run({
      task: 'test',
      prompt,
      schema: z.object({ ok: z.boolean() }),
      promptVersion: 'abc123',
    });

    expect(result.invocations[0]?.promptVersion).toBe('abc123');
  });
});
