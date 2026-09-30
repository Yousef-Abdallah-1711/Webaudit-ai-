'use client';

/**
 * T214 — the operator queue screen, ported from
 * design-system/ui_kits/admin/AdminScreens.jsx's `Queue`. Route is
 * `/admin/queue` per `design/screen-map.md`'s routing table.
 *
 * The mock's rows are entirely invented: its `Target`/`Phase`/`Priority`
 * columns don't correspond to anything BullMQ actually returns for a
 * generic job. The real `AdminJobSummary` (`GET /admin/queue`, T209) reports
 * only what's genuinely common across the platform's three queues —
 * `scanPhase` (`{scanId, phase, modules, attempt}`), `reverify`
 * (`{issueId}`), and `maintenance` (`{scanId}` or similar) — each with a
 * different job-data shape, so there is no single "target" or "phase" field
 * to show. Columns here are Job id, Queue, Name (the job-kind, e.g.
 * `phase`, `reverify`, `workspace-teardown`), State, Attempts, and "Waiting
 * since" (BullMQ's own job-creation `timestamp`, epoch ms).
 *
 * Retry and Cancel are wired to the real `POST /admin/queue/:jobId/retry`
 * and `/cancel`. Either mutation changes which BullMQ list a job sits in,
 * so success re-fetches the whole list rather than patching one row's state
 * locally. A 409 (`JOB_NOT_RETRYABLE`; `JOB_NOT_CANCELABLE`, which also
 * covers `active` jobs and the two system-internal job kinds —
 * `workspace-teardown` and `questionnaire-deadline` — that have no operator
 * backstop if their queue record disappears) surfaces through the same
 * error banner as any other refusal. This page does not special-case or
 * hide the buttons for those jobs; the real refusal is what's shown.
 *
 * The mock's "Pause intake" and "Retry stalled" header actions have no
 * backing endpoint — same precedent as `AdminProvidersPage`'s "Add
 * provider" — so both stay rendered with no `onClick`.
 */
import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Badge, Button } from '../../../../components/ui';
import { AHead, mono, num, Table } from '../../../../components/admin';
import {
  ApiError,
  cancelAdminQueueJob,
  getAdminQueueJobs,
  retryAdminQueueJob,
  type AdminJobSummary,
} from '../../../../lib/api';
import styles from './page.module.css';

function stateTone(state: AdminJobSummary['state']): 'accent' | 'success' | 'neutral' {
  if (state === 'active') return 'accent';
  if (state === 'completed') return 'success';
  return 'neutral';
}

export default function AdminQueuePage(): React.ReactElement {
  const t = useTranslations('admin');
  const [jobs, setJobs] = useState<readonly AdminJobSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const stateLabels: Readonly<Record<AdminJobSummary['state'], string>> = {
    waiting: t('status_waiting'),
    prioritized: t('status_prioritized'),
    active: t('status_active'),
    delayed: t('status_delayed'),
    failed: t('status_failed'),
    completed: t('status_completed'),
  };

  const refresh = useCallback(async () => {
    try {
      const { jobs: fetched } = await getAdminQueueJobs();
      setJobs(fetched);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('queue_load_error'));
    }
  }, [t]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const run = useCallback(
    async (fn: () => Promise<unknown>) => {
      setBusy(true);
      setError(null);
      try {
        await fn();
        await refresh();
      } catch (err) {
        setError(err instanceof ApiError ? err.message : t('action_did_not_go_through'));
      } finally {
        setBusy(false);
      }
    },
    [refresh, t],
  );

  const onRetry = (jobId: string): void => {
    void run(() => retryAdminQueueJob(jobId));
  };

  const onCancel = (jobId: string): void => {
    void run(() => cancelAdminQueueJob(jobId));
  };

  return (
    <div>
      <AHead
        eyebrow={t('group_platform')}
        title={t('queue')}
        meta={t('queue_meta')}
        actions={
          <>
            <Button variant="secondary" size="sm">
              {t('queue_pause_intake')}
            </Button>
            <Button size="sm">{t('queue_retry_stalled')}</Button>
          </>
        }
      />

      {error !== null && <p className={styles.error}>{error}</p>}

      <Table
        cols={[
          { label: t('table_job'), width: 130 },
          { label: t('queue'), width: 180 },
          { label: t('table_name'), width: 130 },
          { label: t('table_state'), width: 110 },
          { label: t('table_attempts'), width: 90 },
          { label: t('table_waiting_since'), width: 120 },
          { label: '', width: 150 },
        ]}
        rows={jobs.map((job) => [
          mono(job.id),
          job.queue,
          mono(job.name),
          <Badge key="state" tone={stateTone(job.state)}>
            {stateLabels[job.state]}
          </Badge>,
          num(t('number_value', { value: job.attemptsMade })),
          num(t('time_value', { time: new Date(job.timestamp) })),
          <span key="actions" className={styles.actions}>
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => {
                onRetry(job.id);
              }}
            >
              {t('retry')}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => {
                onCancel(job.id);
              }}
            >
              {t('cancel')}
            </Button>
          </span>,
        ])}
      />

      <p className={styles.note}>{t('queue_note')}</p>
    </div>
  );
}
