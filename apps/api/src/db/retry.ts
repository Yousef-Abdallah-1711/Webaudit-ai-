/**
 * Bounded retry for transient PostgreSQL transaction conflicts.
 *
 * 40001 serialization_failure and 40P01 deadlock_detected are not defects —
 * they are the database telling us to try again. A caller that does not retry
 * turns an ordinary concurrent request into a user-visible failure, which for a
 * credit debit means "something went wrong" when two audits happen to start in
 * the same moment.
 */

const RETRYABLE = new Set(['40001', '40P01']);
const MAX_ATTEMPTS = 5;

function isRetryable(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const e = err as { code?: unknown; message?: unknown };
  if (typeof e.code === 'string' && RETRYABLE.has(e.code)) return true;
  // Prisma wraps raw-query errors and surfaces the SQLSTATE in the message.
  return (
    typeof e.message === 'string' && [...RETRYABLE].some((c) => (e.message as string).includes(c))
  );
}

export async function withRetry<T>(fn: () => Promise<T>, label: string): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (!isRetryable(err)) throw err;
      lastError = err;
      // Jittered backoff: without jitter, contending transactions retry in
      // lockstep and collide again.
      const delay = 5 * 2 ** (attempt - 1) + Math.floor(Math.random() * 10);
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  throw new Error(
    `${label}: still conflicting after ${MAX_ATTEMPTS} attempts: ${String(lastError)}`,
  );
}
