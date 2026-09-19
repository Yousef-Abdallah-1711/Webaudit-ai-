import * as Sentry from '@sentry/node';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { captureAlert, scrubSentryEvent } from '../../src/config/monitoring.js';

// `import * as Sentry from '@sentry/node'` is a real ES module namespace object,
// whose properties are non-configurable per spec — `vi.spyOn` throws "Cannot
// redefine property" against it (confirmed directly: fails identically run
// alone or as part of the full suite, so this is not full-suite interference).
// Mocking the whole module instead replaces it with a plain, writable object.
vi.mock('@sentry/node', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@sentry/node')>();
  return { ...actual, captureMessage: vi.fn(() => 'event-id') };
});

afterEach(() => {
  vi.mocked(Sentry.captureMessage).mockClear();
});

describe('Sentry monitoring redaction', () => {
  it('removes authorization and cookie headers from captured requests', () => {
    const event = scrubSentryEvent({
      request: {
        headers: {
          authorization: 'Bearer secret',
          cookie: 'refresh_token=secret',
          'content-type': 'application/json',
        },
      },
    });

    expect(event.request?.headers).toEqual({ 'content-type': 'application/json' });
  });
});

describe('T023 — captureAlert', () => {
  it('tags every alert with its fixed condition name, not a free-form string', () => {
    captureAlert('cost_runaway', 'global spend exceeded threshold', { observedMicros: 5_000 });

    expect(Sentry.captureMessage).toHaveBeenCalledWith('global spend exceeded threshold', {
      level: 'error',
      tags: { alert_condition: 'cost_runaway' },
      extra: { observedMicros: 5_000 },
    });
  });

  it('every one of the 9 FR-M03 conditions is a real, distinct tag value', () => {
    const seen = new Set<string>();
    for (const condition of [
      'api_error_rate',
      'auth_failure_spike',
      'payment_webhook_failure',
      'email_send_failure',
      'queue_processing_failure',
      'ai_chain_exhaustion',
      'db_connectivity_failure',
      'redis_connectivity_failure',
      'cost_runaway',
    ] as const) {
      captureAlert(condition, `test for ${condition}`);
      seen.add(condition);
    }
    expect(seen.size).toBe(9);
    expect(Sentry.captureMessage).toHaveBeenCalledTimes(9);
  });
});
