/**
 * T231 — structured logging with a redacted sink, for FR-091: "System MUST
 * ... MUST NOT reveal [credentials] in logs, error messages, or AI prompts."
 *
 * **Scope, stated honestly.** This module is one thing: a small, auditable
 * factory that produces a JSON-line logger and passes every string it is
 * given through `@webaudit/redaction`'s `redactText` before it reaches
 * stdout/stderr. It is wired into the three real process entrypoints this
 * monorepo has — `apps/api/src/index.ts`, `apps/worker/src/index.ts`, and
 * `apps/sandbox-runner/src/serve.ts` — replacing their plain `console.warn`/
 * `console.error` startup and shutdown lines. It does **not** attempt to
 * rewrite every `console.*` call site across the codebase (`packages/
 * capability-sdk/src/context.ts` already has its own purpose-built
 * `createLogger`, scoped to the untrusted capability boundary — see its
 * module note — and is left as-is). `apps/probe-pool` has no real process
 * entrypoint yet (`package.json`'s `dev` script is still `echo 'not
 * implemented'`; `src/index.ts` exports only `SERVICE_NAME`), so there is
 * nothing to wire a logger into there — that is a gap for whichever task
 * gives probe-pool a real bootstrap, not this one.
 *
 * **Why this lives in `packages/config` and not `packages/redaction`.**
 * `packages/redaction`'s `package.json` depends only on `@webaudit/types` —
 * it does not depend on `@webaudit/config` — so `packages/config` taking a
 * dependency on `@webaudit/redaction` introduces no cycle. `packages/config`
 * is also already the shared home for cross-service values with no home of
 * their own (`constants.ts`, `queues.ts`), which a small structured-logging
 * helper is.
 *
 * **Why not `console.log`/`console.info`.** This repo's root
 * `eslint.config.js` sets `'no-console': ['warn', { allow: ['warn',
 * 'error'] }]` — only `console.warn` and `console.error` are permitted
 * outside test files. Routing every level through `console.*` would make
 * `debug`/`info` a lint violation. Writing the serialised line directly to
 * `process.stdout`/`process.stderr` instead satisfies both "debug/info to
 * stdout, warn/error to stderr" and the lint rule, without asking for an
 * exception to it.
 *
 * **No log-levels config, no transports, no external dependency.** One
 * function, one shape, one redaction pass. A logging framework is not what
 * FR-091 asked for.
 */

import { redactText } from '@webaudit/redaction';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/** Plain, JSON-serialisable field values. Nested one level (or a few) deep. */
export type LogFieldValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | readonly LogFieldValue[]
  | { readonly [key: string]: LogFieldValue };

export type LogFields = Readonly<Record<string, LogFieldValue>>;

export interface Logger {
  debug(message: string, fields?: LogFields): void;
  info(message: string, fields?: LogFields): void;
  warn(message: string, fields?: LogFields): void;
  error(message: string, fields?: LogFields): void;
}

/**
 * Reserved keys of the stable output shape. A field with one of these names
 * is dropped rather than allowed to overwrite the real value — a capability
 * or a call site that happens to pass `{ timestamp: ... }` must not be able
 * to forge the line's own `level` or `service`.
 */
const RESERVED_KEYS = new Set(['timestamp', 'level', 'service', 'message']);

/**
 * How many levels of nested object/array a field value is walked into before
 * this gives up on structure and redacts the flattened remainder instead.
 * Deep enough for a realistic field ({ request: { headers: {...} } }),
 * shallow enough that a pathological or circular value cannot recurse
 * forever.
 */
const MAX_FIELD_DEPTH = 6;

function redactValue(value: unknown, depth: number): unknown {
  if (typeof value === 'string') return redactText(value);
  if (value === null || value === undefined) return value;
  if (typeof value !== 'object') return value; // number, boolean, bigint, ...

  if (depth >= MAX_FIELD_DEPTH) {
    // Too deep to walk structurally. Flatten and redact the remainder rather
    // than emitting it untouched — an unredacted credential buried past the
    // depth limit is still a leak.
    return redactText(safeStringify(value));
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item, depth + 1));
  }
  if (value instanceof Date) return value.toISOString();

  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    out[key] = redactValue(val, depth + 1);
  }
  return out;
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    // A circular structure or a BigInt somewhere. Fall back to something that
    // can still be redacted rather than throwing out of a logging call.
    return String(value);
  }
}

function redactFields(fields: LogFields | undefined): Record<string, unknown> {
  if (fields === undefined) return {};
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (RESERVED_KEYS.has(key)) continue;
    out[key] = redactValue(value, 1);
  }
  return out;
}

/**
 * One JSON line per call, `{ timestamp, level, service, message, ...fields }`.
 * `debug`/`info` go to stdout, `warn`/`error` to stderr — written directly to
 * the stream rather than through `console.*` (see the module note).
 */
export function createLogger(service: string): Logger {
  const emit =
    (level: LogLevel) =>
    (message: string, fields?: LogFields): void => {
      const line: Record<string, unknown> = {
        timestamp: new Date().toISOString(),
        level,
        service,
        message: redactText(message),
        ...redactFields(fields),
      };
      const serialised = `${JSON.stringify(line)}\n`;
      if (level === 'warn' || level === 'error') {
        process.stderr.write(serialised);
      } else {
        process.stdout.write(serialised);
      }
    };

  return {
    debug: emit('debug'),
    info: emit('info'),
    warn: emit('warn'),
    error: emit('error'),
  };
}
