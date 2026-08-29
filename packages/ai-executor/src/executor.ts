/**
 * T079 — the ordered fallback walk. Returns a typed degradation; never throws
 * for a provider failure.
 *
 * R9: "Chain exhaustion returns a typed degradation, not an exception, so the
 * module runner can mark the area `DEGRADED` and still deliver measured findings
 * (FR-035, SC-012)." Contract guarantee 5 says the same: "Exhaustion returns
 * `ok: false`, never throws."
 *
 * That is the whole shape of this file. An exception would travel up through the
 * module runner and the orchestrator, and every layer between here and the user
 * would need a catch that knows a provider outage is survivable. One of them
 * would not have it, and an audit the user paid for would fail because a third
 * party was busy. A return value cannot be forgotten: `ok` has to be read before
 * `value` exists.
 *
 * **The one thing that does throw** is an unredacted prompt. That is not a
 * provider outage, it is an SC-016 violation and a programming error, and
 * degrading it would deliver a report as though nothing were wrong. 2F built
 * `isRedactedPrompt` for this call site — the compile-time brand stops honest
 * code, and only the runtime registry check stops `as unknown as RedactedPrompt`.
 *
 * **Every attempt is recorded, including the failures** (FR-039). A provider
 * that was tried and refused still consumed something and still tells an
 * operator about an outage; an attempt that leaves no row is an outage nobody
 * notices until the bill changes.
 */

import type { z } from 'zod';
import { isRedactedPrompt, type RedactedPrompt } from '@webaudit/redaction';
import { redactText } from '@webaudit/redaction';
import type { AiOutcome } from '@webaudit/types';
import { buildChain } from './chain.js';
import { costMicrosOf, type Provider } from './provider.js';
import { validateResponse } from './validate.js';

export class UnredactedPromptError extends Error {
  override readonly name = 'UnredactedPromptError';
  constructor() {
    super(
      'The AI executor accepts only a RedactedPrompt built by @webaudit/redaction. ' +
        'A raw string, a hand-built object, or a prompt revived from a queue payload is refused ' +
        '(SC-016, R8). Assemble the prompt where the work happens rather than passing one through ' +
        'a queue.',
    );
  }
}

/** One attempt, as it will be written to `AiInvocation` (FR-039). */
export interface AiInvocationRecord {
  readonly provider: string;
  readonly model: string;
  /** 0 is the primary. Above 0 means a fallback carried the request. */
  readonly chainPosition: number;
  readonly promptTokens: number;
  readonly outputTokens: number;
  readonly latencyMs: number;
  readonly costMicros: number;
  readonly outcome: AiOutcome;
  /** Redacted before it is stored: a provider error can echo the prompt back. */
  readonly errorMessage?: string;
}

export type AiResult<T> =
  | { readonly ok: true; readonly value: T; readonly invocations: readonly AiInvocationRecord[] }
  | {
      readonly ok: false;
      readonly reason: 'CHAIN_EXHAUSTED';
      readonly invocations: readonly AiInvocationRecord[];
    };

export interface AiRequest<T> {
  /** `module:security`, `master-report`, … Used for logging and drift keys. */
  readonly task: string;
  readonly prompt: RedactedPrompt;
  readonly schema: z.ZodType<T>;
  /** Attributes cost to a capability execution — Principle VI, SC-009. */
  readonly executionId?: string;
  readonly scanId?: string;
  readonly maxOutputTokens?: number;
  readonly signal?: AbortSignal;
}

export interface ExecutorOptions {
  readonly chain: readonly Provider[];
  /** Per-attempt budget. Each provider gets its own; the chain is not bounded. */
  readonly timeoutMs?: number;
  readonly maxOutputTokens?: number;
  /** Injected so a test can assert latency without a real clock. */
  readonly now?: () => number;
}

export interface AiExecutor {
  run<T>(request: AiRequest<T>): Promise<AiResult<T>>;
  readonly chain: readonly Provider[];
}

const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_OUTPUT_TOKENS = 16_000;

interface Attempt {
  readonly outcome: AiOutcome;
  readonly text: string;
  readonly promptTokens: number;
  readonly outputTokens: number;
  readonly errorMessage?: string;
}

/**
 * Call one provider, converting every failure mode into an `Attempt`.
 *
 * Synchronous throws, rejections, and hangs all become data here rather than
 * propagating, which is what lets the walk below be a plain loop.
 */
async function attempt(
  provider: Provider,
  text: string,
  timeoutMs: number,
  maxOutputTokens: number,
  outerSignal: AbortSignal | undefined,
): Promise<Attempt> {
  const deadline = AbortSignal.timeout(timeoutMs);
  const signal = outerSignal === undefined ? deadline : AbortSignal.any([outerSignal, deadline]);

  const timedOut = new Promise<Attempt>((resolve) => {
    const onAbort = (): void =>
      resolve({
        outcome: deadline.aborted ? 'TIMEOUT' : 'ERROR',
        text: '',
        promptTokens: 0,
        outputTokens: 0,
        errorMessage: deadline.aborted
          ? `no response within ${String(timeoutMs)}ms`
          : 'the request was cancelled',
      });
    if (signal.aborted) onAbort();
    else signal.addEventListener('abort', onAbort, { once: true });
  });

  const called = (async (): Promise<Attempt> => {
    try {
      // `await` inside the try, so an adapter that throws synchronously is
      // caught here rather than escaping the race.
      const response = await provider.generate({ text, signal, maxOutputTokens });
      return {
        outcome: response.outcome,
        text: response.text,
        promptTokens: response.promptTokens,
        outputTokens: response.outputTokens,
        ...(response.errorMessage === undefined ? {} : { errorMessage: response.errorMessage }),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        outcome: 'ERROR',
        text: '',
        promptTokens: 0,
        outputTokens: 0,
        errorMessage: message,
      };
    }
  })();

  return Promise.race([called, timedOut]);
}

export function createExecutor(options: ExecutorOptions): AiExecutor {
  // Validated here, at construction, which is boot for every real caller.
  const chain = buildChain(options.chain);
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const defaultMaxOutput = options.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS;
  const now = options.now ?? (() => Date.now());

  return {
    chain,

    async run<T>(request: AiRequest<T>): Promise<AiResult<T>> {
      // Before anything else, and before any adapter sees a byte.
      if (!isRedactedPrompt(request.prompt)) throw new UnredactedPromptError();

      const invocations: AiInvocationRecord[] = [];
      const maxOutputTokens = request.maxOutputTokens ?? defaultMaxOutput;

      for (const [chainPosition, provider] of chain.entries()) {
        const startedAt = now();
        const result = await attempt(
          provider,
          request.prompt.text,
          timeoutMs,
          maxOutputTokens,
          request.signal,
        );
        const latencyMs = Math.max(0, now() - startedAt);

        // **Billed by what was consumed, not by whether we liked the answer.**
        //
        // The first rule here was `outcome === 'SUCCESS'`, on the reasoning that
        // a refused call is recorded at zero rather than at a guess. The
        // reasoning is right and the rule did not implement it: two adapters
        // return *real, non-guessed* token counts on a non-SUCCESS outcome —
        // OpenAI when `finish_reason` is `length`, Claude when `stop_reason` is
        // `refusal`. Those are the tokens the vendor's invoice will carry, and
        // the truncated one is the most expensive call the chain can make,
        // because its output ran all the way to the ceiling. Recording it at
        // zero is not conservatism, it is a ledger that disagrees with the
        // invoice by real money, silently, until someone reconciles.
        //
        // So the test is whether the provider told us what it consumed. A
        // timeout or a connection refusal reports nothing and still records
        // zero, which is the case the original rule was written for and which
        // `usableCount` in `costMicrosOf` keeps honest.
        const reportedUsage = result.promptTokens > 0 || result.outputTokens > 0;
        const costMicros = reportedUsage
          ? costMicrosOf(provider.pricing, result.promptTokens, result.outputTokens)
          : 0;

        const record = (outcome: AiOutcome, errorMessage?: string): AiInvocationRecord => ({
          provider: provider.vendor,
          model: provider.model,
          chainPosition,
          promptTokens: result.promptTokens,
          outputTokens: result.outputTokens,
          latencyMs,
          costMicros,
          outcome,
          // A provider error message can quote the request back at us, and this
          // string is stored and logged (FR-091).
          ...(errorMessage === undefined ? {} : { errorMessage: redactText(errorMessage) }),
        });

        if (result.outcome !== 'SUCCESS') {
          invocations.push(record(result.outcome, result.errorMessage));
          continue;
        }

        const validated = validateResponse(result.text, request.schema);
        if (!validated.ok) {
          // The line R9 draws: a schema failure *is* a provider failure. Recorded
          // with its real token counts, because the attempt cost money.
          invocations.push(record('SCHEMA_INVALID', validated.problem));
          continue;
        }

        invocations.push(record('SUCCESS'));
        return { ok: true, value: validated.value, invocations };
      }

      // Every vendor tried, none served. Typed, not thrown.
      return { ok: false, reason: 'CHAIN_EXHAUSTED', invocations };
    },
  };
}
