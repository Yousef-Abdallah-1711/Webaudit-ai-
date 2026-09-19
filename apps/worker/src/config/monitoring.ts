import * as Sentry from '@sentry/node';

export interface MonitoringEvent {
  request?: { headers?: Record<string, string>; cookies?: Record<string, unknown>; data?: unknown };
  breadcrumbs?: Array<{ data?: Record<string, unknown>; [key: string]: unknown }>;
  [key: string]: unknown;
}

const SENSITIVE = new Set(['authorization', 'cookie', 'set-cookie', 'x-api-key']);

export function scrubSentryEvent(event: MonitoringEvent): MonitoringEvent {
  const headers = event.request?.headers;
  if (headers !== undefined) {
    for (const key of Object.keys(headers))
      if (SENSITIVE.has(key.toLowerCase())) delete headers[key];
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
      SENSITIVE.has(key.toLowerCase()) ? [key, '[REDACTED]'] : [key, item],
    ),
  );
}

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
 * T023 — FR-M03's 9 alert conditions, one real shared capture point (mirrors
 * `apps/api/src/config/monitoring.ts`'s identical helper -- this file is
 * already an independent copy of that one's scrub/init logic, so the same
 * duplication convention applies here rather than a new cross-package
 * import). Before this, `initMonitoring()` wired the SDK but nothing in this
 * process ever called it. No-op when Sentry is not configured.
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
