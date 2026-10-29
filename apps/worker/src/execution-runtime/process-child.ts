import { fork, type ChildProcess, type Serializable } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import type { ForkedChild, UnitObservation } from '@webaudit/api/execution-runtime';
import type { AdapterContext, AdapterUnit } from './adapter.js';

export interface ChildResourceUsage {
  readonly userCPUTimeMicros: number;
  readonly systemCPUTimeMicros: number;
  readonly maxRSSNativeUnits: number;
  readonly rssBytesAtCompletion: number;
  readonly platform: NodeJS.Platform;
}

export interface ChildRunResult {
  readonly observation: UnitObservation;
  readonly resourceUsage: ChildResourceUsage | null;
}

type RpcRequest = {
  type: 'rpc';
  requestId: number;
  method: 'authorizeEffect' | 'confirmEffect' | 'recordEvidence' | 'safetyCheckpoint';
  args: unknown[];
};

type ChildMessage =
  | RpcRequest
  | { type: 'progress'; tick: Parameters<AdapterContext['progress']>[0] }
  | { type: 'result'; observation: unknown; resourceUsage: unknown }
  | { type: 'failure' };

type RpcResponse = {
  type: 'rpc-result';
  requestId: number;
  ok: boolean;
  value?: unknown;
  error?: { name: string; message: string };
};

export interface IsolatedExecutionChild extends ForkedChild {
  run(
    moduleUrl: string,
    exportName: string,
    unit: AdapterUnit,
    context: AdapterContext,
    onCheckpointStop: () => void,
  ): Promise<ChildRunResult>;
}

/** Start one clean OS process with no database, Redis, storage, or provider credentials in its environment. */
export function forkExecutionChild(): IsolatedExecutionChild {
  const source = import.meta.url.endsWith('.ts');
  const entry = fileURLToPath(
    new URL(source ? './child-entry.ts' : './child-entry.js', import.meta.url),
  );
  const safeEnv: NodeJS.ProcessEnv = {
    NODE_ENV: process.env['NODE_ENV'] ?? 'development',
  };
  for (const key of ['PATH', 'PATHEXT', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'NODE_ENV']) {
    const value = process.env[key];
    if (value !== undefined) safeEnv[key] = value;
  }
  const child = fork(entry, [], {
    cwd: process.cwd(),
    env: safeEnv,
    execArgv: source ? ['--import', 'tsx'] : [],
    serialization: 'advanced',
    stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
  });
  return createHandle(child);
}

function createHandle(child: ChildProcess): IsolatedExecutionChild {
  const pending = new Map<number, { resolve(value: unknown): void; reject(error: Error): void }>();
  let execution: { resolve(value: ChildRunResult): void; reject(error: Error): void } | undefined;
  let termination: Promise<void> | undefined;

  child.on('message', (raw: unknown) => {
    if (isRpcResponse(raw)) {
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
    if (isProgressMessage(raw)) {
      context?.progress(raw.tick);
      return;
    }
    if (isRpcRequest(raw)) {
      void handleRpc(raw);
      return;
    }
    if (isResultMessage(raw)) {
      const observation = parseObservation(raw.observation);
      if (observation === null)
        execution?.reject(new Error('execution child returned invalid observation'));
      else
        execution?.resolve({ observation, resourceUsage: parseResourceUsage(raw.resourceUsage) });
      execution = undefined;
      return;
    }
    if (isFailureMessage(raw)) {
      execution?.reject(new Error('execution child failed'));
      execution = undefined;
      return;
    }
    execution?.reject(new Error('execution child sent an invalid IPC message'));
    execution = undefined;
  });

  let context: AdapterContext | undefined;
  let requestHostStop: (() => void) | undefined;
  const handleRpc = async (request: RpcRequest): Promise<void> => {
    const current = context;
    if (current === undefined) return;
    try {
      let value: unknown;
      if (request.method === 'authorizeEffect') {
        value = await current.authorizeEffect(String(request.args[0]), Number(request.args[1]));
      } else if (request.method === 'confirmEffect') {
        value = await current.confirmEffect(String(request.args[0]), Number(request.args[1]));
      } else if (request.method === 'recordEvidence') {
        value = await current.recordEvidence(
          request.args[0] as Parameters<AdapterContext['recordEvidence']>[0],
          request.args[1],
          request.args[2] as string | undefined,
        );
      } else if (request.method === 'safetyCheckpoint') {
        if (request.args.length !== 0) throw new Error('invalid safety checkpoint request');
        value = await current.safetyCheckpoint();
      } else {
        throw new Error('unsupported execution child RPC method');
      }
      await send(child, { type: 'rpc-result', requestId: request.requestId, ok: true, value });
      if (request.method === 'safetyCheckpoint' && isCheckpointStop(value)) requestHostStop?.();
    } catch (error) {
      await send(child, {
        type: 'rpc-result',
        requestId: request.requestId,
        ok: false,
        error: {
          name: error instanceof Error ? error.name : 'Error',
          message: error instanceof Error ? error.message : 'parent RPC failed',
        },
      }).catch(() => undefined);
    }
  };

  child.once('error', (error) => {
    execution?.reject(error);
    execution = undefined;
    for (const request of pending.values()) request.reject(error);
    pending.clear();
  });
  child.once('exit', (code, signal) => {
    const error = new Error(`execution child exited (${signal ?? code ?? 'unknown'})`);
    execution?.reject(error);
    execution = undefined;
    for (const request of pending.values()) request.reject(error);
    pending.clear();
  });

  return {
    async run(moduleUrl, exportName, unit, adapterContext, onCheckpointStop) {
      if (execution !== undefined) throw new Error('execution child already started');
      context = adapterContext;
      requestHostStop = onCheckpointStop;
      const result = new Promise<ChildRunResult>((resolve, reject) => {
        execution = { resolve, reject };
      });
      await send(child, { type: 'start', moduleUrl, exportName, unit });
      return result;
    },
    terminate() {
      termination ??= new Promise<void>((resolve, reject) => {
        if (child.exitCode !== null || child.signalCode !== null) return resolve();
        const onExit = (): void => resolve();
        child.once('exit', onExit);
        if (!child.kill('SIGKILL')) {
          child.removeListener('exit', onExit);
          if (child.exitCode !== null || child.signalCode !== null) resolve();
          else reject(new Error('execution child SIGKILL was not accepted'));
        }
      });
      return termination;
    },
  };
}

function send(child: ChildProcess, message: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!child.connected) return reject(new Error('execution child IPC is disconnected'));
    child.send(message as Serializable, (error) => (error ? reject(error) : resolve()));
  });
}

function isCheckpointStop(value: unknown): boolean {
  return isRecord(value) && value['outcome'] === 'STOP';
}

function parseObservation(value: unknown): UnitObservation | null {
  if (typeof value !== 'object' || value === null || !('source' in value)) return null;
  const source = value.source;
  const allowed = [
    'ENGINE_RESULT',
    'ENGINE_EXCEPTION',
    'HARD_STOP_DEADLINE',
    'F07_STOP',
    'INFRASTRUCTURE_ERROR',
    'TARGET_UNREACHABLE',
    'INVALID_CONFIGURATION',
    'EXTERNAL_DEPENDENCY_ERROR',
  ];
  if (typeof source === 'string' && allowed.includes(source)) return { source } as UnitObservation;
  if (
    source === 'CUSTOMER_CODE_EXIT' &&
    Number.isInteger((value as { exitCode?: unknown }).exitCode)
  ) {
    return { source, exitCode: (value as unknown as { exitCode: number }).exitCode };
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isRpcRequest(value: unknown): value is RpcRequest {
  if (!isRecord(value) || value['type'] !== 'rpc' || !Number.isSafeInteger(value['requestId']))
    return false;
  if (!Array.isArray(value['args'])) return false;
  const method = value['method'];
  if (method === 'safetyCheckpoint') return value['args'].length === 0;
  if (method === 'authorizeEffect' || method === 'confirmEffect') {
    return (
      value['args'].length === 2 &&
      typeof value['args'][0] === 'string' &&
      value['args'][0].length > 0 &&
      value['args'][0].length <= 128 &&
      Number.isSafeInteger(value['args'][1]) &&
      Number(value['args'][1]) >= 0
    );
  }
  if (method === 'recordEvidence') {
    return (
      value['args'].length >= 2 &&
      value['args'].length <= 3 &&
      typeof value['args'][0] === 'string' &&
      value['args'][0].length > 0 &&
      (value['args'].length < 3 ||
        value['args'][2] === undefined ||
        typeof value['args'][2] === 'string')
    );
  }
  return false;
}

function isRpcResponse(value: unknown): value is RpcResponse {
  return (
    isRecord(value) &&
    value['type'] === 'rpc-result' &&
    Number.isSafeInteger(value['requestId']) &&
    typeof value['ok'] === 'boolean'
  );
}

function isProgressMessage(value: unknown): value is Extract<ChildMessage, { type: 'progress' }> {
  if (!isRecord(value) || value['type'] !== 'progress' || !isRecord(value['tick'])) return false;
  const tick = value['tick'];
  return (
    typeof tick['label'] === 'string' &&
    tick['label'].length <= 200 &&
    (tick['completedUnits'] === undefined ||
      (Number.isSafeInteger(tick['completedUnits']) && Number(tick['completedUnits']) >= 0)) &&
    (tick['totalUnits'] === undefined ||
      (Number.isSafeInteger(tick['totalUnits']) && Number(tick['totalUnits']) >= 0)) &&
    (tick['indeterminate'] === undefined || typeof tick['indeterminate'] === 'boolean')
  );
}

function isResultMessage(value: unknown): value is Extract<ChildMessage, { type: 'result' }> {
  return (
    isRecord(value) &&
    value['type'] === 'result' &&
    'observation' in value &&
    'resourceUsage' in value
  );
}

function parseResourceUsage(value: unknown): ChildResourceUsage | null {
  if (!isRecord(value)) return null;
  const numberFields = [
    'userCPUTimeMicros',
    'systemCPUTimeMicros',
    'maxRSSNativeUnits',
    'rssBytesAtCompletion',
  ] as const;
  if (
    !numberFields.every((field) => Number.isFinite(value[field]) && Number(value[field]) >= 0) ||
    typeof value['platform'] !== 'string' ||
    ![
      'win32',
      'linux',
      'darwin',
      'freebsd',
      'openbsd',
      'sunos',
      'aix',
      'android',
      'cygwin',
    ].includes(value['platform'])
  ) {
    return null;
  }
  return {
    userCPUTimeMicros: Number(value['userCPUTimeMicros']),
    systemCPUTimeMicros: Number(value['systemCPUTimeMicros']),
    maxRSSNativeUnits: Number(value['maxRSSNativeUnits']),
    rssBytesAtCompletion: Number(value['rssBytesAtCompletion']),
    platform: value['platform'] as NodeJS.Platform,
  };
}

function isFailureMessage(value: unknown): value is Extract<ChildMessage, { type: 'failure' }> {
  return isRecord(value) && value['type'] === 'failure';
}
