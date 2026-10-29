import type { AdapterContext, AdapterUnit } from './adapter.js';

import type { ChildCheckpointResult } from './adapter.js';

type ParentMessage =
  | { type: 'start'; moduleUrl: string; exportName: string; unit: AdapterUnit }
  | {
      type: 'rpc-result';
      requestId: number;
      ok: boolean;
      value?: unknown;
      error?: { name: string; message: string };
    };
type ChildMessage =
  | {
      type: 'rpc';
      requestId: number;
      method: 'authorizeEffect' | 'confirmEffect' | 'recordEvidence' | 'safetyCheckpoint';
      args: unknown[];
    }
  | { type: 'progress'; tick: Parameters<AdapterContext['progress']>[0] }
  | { type: 'result'; observation: unknown; resourceUsage: ChildResourceUsage }
  | { type: 'failure' };

interface ChildResourceUsage {
  userCPUTimeMicros: number;
  systemCPUTimeMicros: number;
  maxRSSNativeUnits: number;
  rssBytesAtCompletion: number;
  platform: NodeJS.Platform;
}

let started = false;
let disconnectingNormally = false;
let nextRequestId = 0;
const pending = new Map<number, { resolve(value: unknown): void; reject(error: Error): void }>();

process.once('disconnect', () => {
  // A live adapter may hold sockets or timers after its host has crashed. The
  // host can no longer enforce its hard stop, so fail closed at the process boundary.
  if (!disconnectingNormally) process.exit(1);
});

process.on('message', (raw: ParentMessage) => {
  if (raw.type === 'rpc-result') {
    const request = pending.get(raw.requestId);
    if (request === undefined) return;
    pending.delete(raw.requestId);
    if (raw.ok) request.resolve(raw.value);
    else {
      const error = new Error(raw.error?.message ?? 'parent RPC failed');
      error.name = raw.error?.name ?? 'Error';
      request.reject(error);
    }
    return;
  }
  if (started || raw.type !== 'start') return;
  started = true;
  void execute(raw);
});

async function execute(message: Extract<ParentMessage, { type: 'start' }>): Promise<void> {
  const resourceUsageBefore = process.resourceUsage();
  const controller = new AbortController();
  const rpc = <T>(
    method: 'authorizeEffect' | 'confirmEffect' | 'recordEvidence' | 'safetyCheckpoint',
    ...args: unknown[]
  ): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      const requestId = ++nextRequestId;
      pending.set(requestId, { resolve, reject });
      send({ type: 'rpc', requestId, method, args });
    });
  const context: AdapterContext = {
    unit: message.unit,
    signal: controller.signal,
    authorizeEffect: (kind, ordinal) => rpc('authorizeEffect', kind, ordinal) as never,
    confirmEffect: (kind, ordinal) => rpc('confirmEffect', kind, ordinal) as never,
    recordEvidence: (kind, payload, contentType) =>
      rpc('recordEvidence', kind, payload, contentType) as never,
    safetyCheckpoint: () => rpc<ChildCheckpointResult>('safetyCheckpoint'),
    progress: (tick) => send({ type: 'progress', tick }),
  };

  try {
    // This file URL was validated as a local, reviewed module by the parent's adapter registry.
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const loaded: Record<string, unknown> = await import(message.moduleUrl);
    const run = loaded[message.exportName];
    if (typeof run !== 'function') throw new Error('execution child export is missing');
    const observation = await (run as (context: AdapterContext) => Promise<unknown>)(context);
    send({ type: 'result', observation, resourceUsage: measureResourceUsage(resourceUsageBefore) });
  } catch {
    send({
      type: 'result',
      observation: { source: 'ENGINE_EXCEPTION' },
      resourceUsage: measureResourceUsage(resourceUsageBefore),
    });
  } finally {
    disconnectingNormally = true;
    setImmediate(() => process.disconnect());
  }
}

function measureResourceUsage(before: NodeJS.ResourceUsage): ChildResourceUsage {
  const after = process.resourceUsage();
  return {
    userCPUTimeMicros: Math.max(0, after.userCPUTime - before.userCPUTime),
    systemCPUTimeMicros: Math.max(0, after.systemCPUTime - before.systemCPUTime),
    maxRSSNativeUnits: after.maxRSS,
    rssBytesAtCompletion: process.memoryUsage().rss,
    platform: process.platform,
  };
}

function send(message: ChildMessage): void {
  if (process.connected) process.send?.(message);
}
