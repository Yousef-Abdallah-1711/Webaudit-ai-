import type { Queue } from 'bullmq';
import type { PrismaClient } from '@webaudit/api/prisma-client';
import { purgeExpiredAuthTokens } from '../../../api/src/services/auth/cleanup.service.js';
import { JOB_NAMES } from '../queue/workers.js';

const DEFAULT_INTERVAL_MS = 24 * 60 * 60_000;

function intervalMs(): number {
  const raw = Number(process.env['AUTH_TOKEN_CLEANUP_INTERVAL_MS']);
  return Number.isFinite(raw) && raw >= 60_000 ? raw : DEFAULT_INTERVAL_MS;
}

export async function scheduleAuthTokenCleanup(queue: Queue): Promise<void> {
  await queue.upsertJobScheduler(
    'auth-token-cleanup',
    { every: intervalMs() },
    {
      name: JOB_NAMES.authTokenCleanup,
      data: { kind: 'auth-token-cleanup' as const },
      opts: { removeOnComplete: true, removeOnFail: 50 },
    },
  );
}

export function createAuthTokenCleanupHandler(db: PrismaClient): () => Promise<void> {
  return async () => {
    const result = await purgeExpiredAuthTokens(db);
    const deleted = result.emailTokens + result.refreshTokens + result.emailSendAttempts;
    if (deleted > 0) {
      console.warn(
        `[auth-token-cleanup] deleted ${String(result.emailTokens)} email tokens, ` +
          `${String(result.refreshTokens)} refresh tokens, and ` +
          `${String(result.emailSendAttempts)} email-send attempts.`,
      );
    }
  };
}
