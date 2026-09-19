export interface HeartbeatRedis {
  set(key: string, value: string, mode: 'PX', ttlMs: number): Promise<unknown>;
}

export function heartbeatKey(workerId: string): string {
  return `worker:heartbeat:${workerId}`;
}

export async function writeHeartbeat(
  redis: HeartbeatRedis,
  workerId: string,
  ttlMs: number,
): Promise<void> {
  await redis.set(heartbeatKey(workerId), new Date().toISOString(), 'PX', ttlMs);
}
