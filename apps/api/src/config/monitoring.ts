import * as Sentry from '@sentry/node';

export interface MonitoringEvent {
  request?: {
    headers?: Record<string, string>;
    cookies?: Record<string, unknown>;
    data?: unknown;
  };
  breadcrumbs?: Array<{ data?: Record<string, unknown>; [key: string]: unknown }>;
  [key: string]: unknown;
}

const SENSITIVE_HEADERS = new Set(['authorization', 'cookie', 'set-cookie', 'x-api-key']);

/** Remove credentials and session material before an event leaves the process. */
export function scrubSentryEvent(event: MonitoringEvent): MonitoringEvent {
  const headers = event.request?.headers;
  if (headers !== undefined) {
    for (const key of Object.keys(headers)) {
      if (SENSITIVE_HEADERS.has(key.toLowerCase())) delete headers[key];
    }
  }
  if (event.request !== undefined) {
    delete event.request.cookies;
    delete event.request.data;
  }
  if (event.breadcrumbs !== undefined) {
    event.breadcrumbs = event.breadcrumbs.map((breadcrumb) =>
      breadcrumb.data === undefined
        ? breadcrumb
        : { ...breadcrumb, data: scrubObject(breadcrumb.data) },
    );
  }
  return event;
}

function scrubObject(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) =>
      SENSITIVE_HEADERS.has(key.toLowerCase()) ? [key, '[REDACTED]'] : [key, item],
    ),
  );
}

/** Initialise Sentry when configured; local/test runs remain deterministic. */
export function initMonitoring(): boolean {
  const dsn = process.env['SENTRY_DSN'];
  if (dsn === undefined || dsn.trim() === '') return false;
  Sentry.init({
    dsn,
    environment: process.env['SENTRY_ENVIRONMENT'] ?? process.env['NODE_ENV'] ?? 'development',
    tracesSampleRate: 0,
    beforeSend: (event) =>
      scrubSentryEvent(event as unknown as MonitoringEvent) as unknown as typeof event,
    sendDefaultPii: false,
  });
  return true;
}

/**
 * T023 — FR-M03's 9 alert conditions, as one real, shared capture point.
 *
 * Before this, `initMonitoring()` wired the SDK but nothing anywhere ever
 * called it — Sentry would have received zero events regardless of a real
 * outage. Every condition tags `alert_condition` with one of the 9 fixed
 * names below, so Sentry's own issue-alert rules and dashboards (T024) can
 * group and route on it without inventing a second taxonomy. A no-op (not a
 * throw) when Sentry is not configured — matches every other monitoring
 * call in this codebase degrading safely in dev/test.
 */
export const ALERT_CONDITIONS = [
  'api_error_rate',
  'auth_failure_spike',
  'payment_webhook_failure',
  'email_send_failure',
  'queue_processing_failure',
  'ai_chain_exhaustion',
  'db_connectivity_failure',
  'redis_connectivity_failure',
  'cost_runaway',
] as const;
export type AlertCondition = (typeof ALERT_CONDITIONS)[number];

export function captureAlert(
  condition: AlertCondition,
  message: string,
  context?: Record<string, unknown>,
): void {
  Sentry.captureMessage(message, {
    level: 'error',
    tags: { alert_condition: condition },
    ...(context === undefined ? {} : { extra: context }),
  });
}
