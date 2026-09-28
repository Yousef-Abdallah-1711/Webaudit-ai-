// Phase 8 (production-without-Paymob-or-AI master plan) — the worker holds
// no inbound port by design (a pure BullMQ consumer, reached only via
// Redis — infrastructure/deploy.md's own note), so an HTTP HEALTHCHECK is
// not an option. `apps/worker/src/index.ts` already writes a real Redis
// heartbeat key (`worker:heartbeat:<WORKER_ID>`, `writeHeartbeat`) on an
// interval, self-expiring via a Redis-side TTL — this script reads that
// exact key with `ioredis` (already a direct worker dependency, not a new
// one) and reports healthy only if it is present, i.e. genuinely fresh: a
// hung or crashed worker stops refreshing it and the key expires on its
// own, no separate staleness check needed here.
import Redis from 'ioredis';

const workerId = process.env.WORKER_ID ?? '';
if (workerId === '') {
  console.error('docker-healthcheck: WORKER_ID is not set — cannot name this replica\'s heartbeat key.');
  process.exit(1);
}

const redis = new Redis(process.env.REDIS_URL ?? 'redis://127.0.0.1:6379', {
  maxRetriesPerRequest: 1,
  connectTimeout: 3000,
  lazyConnect: true,
});

try {
  await redis.connect();
  const value = await redis.get(`worker:heartbeat:${workerId}`);
  await redis.quit();
  process.exit(value !== null ? 0 : 1);
} catch {
  process.exit(1);
}
