import { describe, expect, it, vi } from 'vitest';
import { dispatch, JOB_NAMES } from '../../src/queue/workers.js';

describe('workspace-teardown job', () => {
  it('routes to the workspaceTeardown handler with the scan id', async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    await dispatch(
      { name: JOB_NAMES.workspaceTeardown, queueName: 'maintenance', data: { scanId: 'scan_1' } },
      { workspaceTeardown: handler },
    );
    expect(handler).toHaveBeenCalledWith(
      { scanId: 'scan_1' },
      expect.objectContaining({ name: 'workspace-teardown' }),
    );
  });

  it('throws JobNotImplementedError when no handler is wired', async () => {
    const { JobNotImplementedError } = await import('../../src/queue/workers.js');
    await expect(
      dispatch(
        { name: JOB_NAMES.workspaceTeardown, queueName: 'maintenance', data: { scanId: 'scan_1' } },
        {},
      ),
    ).rejects.toThrow(JobNotImplementedError);
  });
});
