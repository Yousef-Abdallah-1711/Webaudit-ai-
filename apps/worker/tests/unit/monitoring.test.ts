import * as Sentry from '@sentry/node';
import { describe, expect, it, vi } from 'vitest';
import { captureAlert, scrubSentryEvent } from '../../src/config/monitoring.js';

// `import * as Sentry` is a real ES module namespace object, whose properties
// are non-configurable per spec — `vi.spyOn` throws "Cannot redefine
// property" against it (confirmed directly against apps/api's identical
// pattern). Mocking the whole module replaces it with a plain, writable
// object instead.
vi.mock('@sentry/node', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sentry/node')>();
  return { ...actual, captureMessage: vi.fn(() => 'event-id') };
});

describe('worker Sentry monitoring redaction', () => {
  it('removes credentials from captured request headers', () => {
    const event = scrubSentryEvent({
      request: { headers: { authorization: 'Bearer secret', cookie: 'session=secret' } },
    });

    expect(event.request?.headers).toEqual({});
  });
});

describe('T023 — captureAlert (worker)', () => {
  it('tags a queue-processing failure with its fixed condition name', () => {
    captureAlert('queue_processing_failure', 'job failed permanently', { jobId: 'j1' });

    expect(Sentry.captureMessage).toHaveBeenCalledWith('job failed permanently', {
      level: 'error',
      tags: { alert_condition: 'queue_processing_failure' },
      extra: { jobId: 'j1' },
    });
  });
});
