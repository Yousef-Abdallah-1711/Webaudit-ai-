import { Redis } from 'ioredis';
import { PrismaClient } from '@webaudit/api/prisma-client';
import { createMemoryArtifactStore } from '@webaudit/api/evidence';
import { assertIsolatedTestDatabaseUrl } from '../../../api/tests/helpers/isolated-database.js';
import {
  createAdapterRegistry,
  createExecWorkers,
  createExecutionJobHandler,
} from '../../src/execution-runtime/index.js';
import type { ExecutionAdapter } from '../../src/execution-runtime/adapter.js';

const testDatabaseUrl = assertIsolatedTestDatabaseUrl(process.env['TEST_DATABASE_URL']);
const [host, rawPort] = (process.env['EXEC_TEST_REDIS'] ?? '').split(':');
const port = Number(rawPort);
if (host === undefined || host === '' || !Number.isInteger(port)) {
  throw new Error('EXEC_TEST_REDIS must be a disposable host:port');
}
const prefix = process.argv[2];
if (prefix === undefined) throw new Error('BullMQ prefix is required');

const connection = { host, port, maxRetriesPerRequest: null as null };
const db = new PrismaClient({ datasources: { db: { url: testDatabaseUrl } }, log: [] });
const publisher = new Redis(connection);
const adapter: ExecutionAdapter = {
  engineId: 'engine.x',
  executionUnitClass: 'BROWSER',
  leaseClass: 'L',
  childModuleUrl: new URL('./test-adapter-child.ts', import.meta.url).href,
  childExportName: 'runTestAdapterChild',
  onUnitExpired: () => Promise.resolve('TERMINATED'),
  admissionRequestFor: (unit) => ({
    targetId: unit.targetId,
    executionClass: 'BROWSER',
    destination: { host: 'example.com', path: '/', scheme: 'https', port: null },
    executionId: unit.id,
    idempotencyKey: unit.idempotencyKey,
    consumes: { request: true, concurrency: true },
  }),
};
const handle = createExecutionJobHandler({
  db: db as never,
  registry: createAdapterRegistry([adapter]),
  artifactStore: createMemoryArtifactStore(),
  publisher,
  hostInstanceId: `crashable-${String(process.pid)}`,
  loopIntervalMs: 100,
});
const workers = createExecWorkers({
  connection,
  prefix,
  classes: ['BROWSER'],
  handle,
  concurrency: 1,
  lockDurationMs: 1000,
  stalledIntervalMs: 1000,
  onFailed: () => undefined,
  onError: (error) => process.send?.({ type: 'error', message: error.message }),
});

workers.workers[0]?.once('ready', () => process.send?.({ type: 'ready' }));

process.once('SIGTERM', () => {
  void Promise.all([workers.close(), publisher.quit(), db.$disconnect()]).finally(() =>
    process.exit(0),
  );
});
