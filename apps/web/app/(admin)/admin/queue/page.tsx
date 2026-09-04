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
  const [jobs, setJobs] = useState<readonly AdminJobSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const { jobs: fetched } = await getAdminQueueJobs();
      setJobs(fetched);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'The queue could not be loaded.');
    }
  }, []);

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
        setError(err instanceof ApiError ? err.message : 'That did not go through.');
      } finally {
        setBusy(false);
      }
    },
    [refresh],
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
        eyebrow="Platform"
        title="Queue"
        meta="six plan-derived priority levels · BullMQ"
        actions={
          <>
            <Button variant="secondary" size="sm">
              Pause intake
            </Button>
            <Button size="sm">Retry stalled</Button>
          </>
        }
      />

      {error !== null && <p className={styles.error}>{error}</p>}

      <Table
        cols={[
          { label: 'Job', width: 130 },
          { label: 'Queue', width: 180 },
          { label: 'Name', width: 130 },
          { label: 'State', width: 110 },
          { label: 'Attempts', width: 90 },
          { label: 'Waiting since', width: 120 },
          { label: '', width: 150 },
        ]}
        rows={jobs.map((job) => [
          mono(job.id),
          job.queue,
          mono(job.name),
          <Badge key="state" tone={stateTone(job.state)}>
            {job.state}
          </Badge>,
          num(String(job.attemptsMade)),
          num(new Date(job.timestamp).toLocaleTimeString()),
          <span key="actions" className={styles.actions}>
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => {
                onRetry(job.id);
              }}
            >
              Retry
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => {
                onCancel(job.id);
              }}
            >
              Cancel
            </Button>
          </span>,
        ])}
      />

      <p className={styles.note}>
        A questionnaire pause holds no worker slot. Stalled jobs are terminated by the timeout
        sweep and only delivered areas are charged.
      </p>
    </div>
  );
}
