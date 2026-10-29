import { fork, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const entry = fileURLToPath(new URL('../../src/execution-runtime/child-entry.ts', import.meta.url));
const adapter = new URL('../helpers/test-adapter-child.ts', import.meta.url).href;
let child: ChildProcess | undefined;

afterEach(async () => {
  const current = child;
  child = undefined;
  if (current === undefined || current.exitCode !== null || current.signalCode !== null) return;
  current.kill('SIGKILL');
  await new Promise<void>((resolve) => current.once('exit', () => resolve()));
});

describe('execution child host disconnect', () => {
  it('exits when its host disappears during a hanging adapter call', async () => {
    const env: NodeJS.ProcessEnv = { NODE_ENV: 'test' };
    for (const key of ['PATH', 'PATHEXT', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP']) {
      const value = process.env[key];
      if (value !== undefined) env[key] = value;
    }

    child = fork(entry, [], {
      cwd: process.cwd(),
      env,
      execArgv: ['--import', 'tsx'],
      serialization: 'advanced',
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
    });
    const running = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('execution child did not start')), 5000);
      child?.on('message', (message: unknown) => {
        if (
          typeof message === 'object' &&
          message !== null &&
          'type' in message &&
          message.type === 'progress'
        ) {
          clearTimeout(timer);
          resolve();
        }
      });
      child?.once('error', reject);
    });
    child.send({
      type: 'start',
      moduleUrl: adapter,
      exportName: 'runTestAdapterChild',
      unit: { id: 'disconnect-test', configuration: { behavior: { kind: 'PROCESS_HANG' } } },
    });
    await running;

    const exited = new Promise<number | null>((resolve) =>
      child?.once('exit', (code) => resolve(code)),
    );
    child.disconnect();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const code = await Promise.race([
      exited,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error('execution child remained alive after host disconnect')),
          5000,
        );
      }),
    ]).finally(() => {
      if (timeout !== undefined) clearTimeout(timeout);
    });
    expect(code).not.toBeNull();
    child = undefined;
  }, 12_000);
});
