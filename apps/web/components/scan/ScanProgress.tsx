'use client';

/**
 * T130 — live scan progress, ported from `ProgressScreen` in
 * `design-system/ui_kits/app/Screens.jsx`, composing the freshly-ported
 * `ProgressRow` (T130) and the already-ported `ModuleStatus` (T132/T240).
 *
 * **Real elapsed time and real per-area state, not the source's demo
 * timer.** The source ticks a local counter from an arbitrary starting
 * number purely as a stand-in; here, elapsed time is computed from
 * `Scan.startedAt` (fetched once, then ticked locally — FR-044's progress
 * bar, not a fresh network call every second) and each area's state comes
 * from real `module:started`/`module:complete` events over `lib/
 * realtime.ts`'s `connectRealtime` (FR-033: areas land independently).
 *
 * **Preserves the safe-to-close line** via `ProgressRow`'s own
 * `safeToClose` default — nothing here overrides it.
 *
 * **T201: swaps to `UIQuestionnaire` while `scanState === 'AWAITING_
 * QUESTIONNAIRE'`**, using the same `scanState` this component already
 * tracks from `scan:state` events rather than reading the `questionnaire:
 * needed` payload itself — the event's `scanId` is all this component
 * needs, and `UIQuestionnaire` fetches its own question/deadline detail
 * over `GET /scans/:id/questionnaire` (the resync pattern FR-047 already
 * establishes here for `refetch`).
 *
 * **How the form goes away, honestly — the three sides are not equal.**
 * `scan:state` is published by `apps/worker` alone
 * (`orchestrator/phases.ts`'s `moveAndAnnounce`); `apps/api` only *subscribes*
 * to that Redis channel and fans it out to sockets (`realtime/fanout.ts`) and
 * has no publisher of its own. So:
 *
 *   - **This tab answering or skipping** ends the pause via `onResolved` ->
 *     `refetch`, which re-reads the scan over HTTP. That is the real
 *     mechanism, and it is immediate.
 *   - **The server-side deadline** (`questionnaire-timeout-handler.ts`) runs
 *     inside the worker, so its transition really does emit `scan:state` and
 *     this component really does react to the push.
 *   - **Another tab answering** does NOT produce a push: the resume happened
 *     in `apps/api`, which publishes nothing. This tab learns on its own next
 *     resync (`onResync` -> `refetch`, on reconnect) — not from an event. Its
 *     `POST` then answers 409 `QUESTIONNAIRE_ALREADY_RESOLVED`, which
 *     `UIQuestionnaire` already treats as success. Making that case a push
 *     needs an event publisher in `apps/api` that does not exist today;
 *     recorded rather than implied.
 */
import { useEffect, useMemo, useState } from 'react';
import type { ModuleState, ModuleType, ScanEvent, ScanState } from '@webaudit/types';
import { Button } from '../ui';
import { PageHead } from '../dashboard';
import { ModuleStatus, ProgressRow, type ModuleStatusProps } from '../report';
import { getAccessToken, getScan } from '../../lib/api';
import { connectRealtime } from '../../lib/realtime';
import { UIQuestionnaire } from './UIQuestionnaire';
import styles from './ScanProgress.module.css';

type UiState = ModuleStatusProps['state'];

const TO_UI_STATE: Readonly<Record<ModuleState, NonNullable<UiState>>> = {
  PENDING: 'waiting',
  RUNNING: 'running',
  COMPLETE: 'complete',
  DEGRADED: 'degraded',
  // ModuleStatus has no distinct "failed" visual — degraded is the closest
  // honest read ("something is wrong with this area"), never "complete".
  FAILED: 'degraded',
  NOT_APPLICABLE: 'not-applicable',
};

const SCAN_TERMINAL = new Set<ScanState>(['COMPLETED', 'FAILED', 'CANCELLED', 'TIMED_OUT']);

const MODULE_LABEL: Readonly<Record<ModuleType, string>> = {
  PERFORMANCE: 'Performance',
  SECURITY: 'Security',
  UI: 'Design',
  TESTING: 'Testing',
  SEO: 'Search visibility',
};

function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const mm = Math.floor(totalSeconds / 60);
  const ss = String(totalSeconds % 60).padStart(2, '0');
  return `${String(mm)}:${ss}`;
}

export interface ScanProgressProps {
  scanId: string;
  hostname: string;
  onCancel?: () => void;
  onDone?: () => void;
}

export function ScanProgress({
  scanId,
  hostname,
  onCancel,
  onDone,
}: ScanProgressProps): React.ReactElement {
  const [modules, setModules] = useState<readonly ModuleType[]>([]);
  const [moduleStates, setModuleStates] = useState<Partial<Record<ModuleType, UiState>>>({});
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [scanState, setScanState] = useState<ScanState>('QUEUED');

  // Authoritative baseline (FR-047): fetched once on mount, and again after
  // every realtime resubscribe — a client that missed events while
  // disconnected must not trust its own stale in-memory state.
  const refetch = useMemo(
    () => (): void => {
      void getScan(scanId).then(({ scan }) => {
        setModules(scan.requestedModules as ModuleType[]);
        setStartedAt(scan.startedAt === null ? null : new Date(scan.startedAt).getTime());
        setScanState(scan.state as ScanState);
      });
    },
    [scanId],
  );

  useEffect(() => {
    refetch();
    const client = connectRealtime({
      scanId,
      getToken: getAccessToken,
      onResync: refetch,
      onEvent: (event: ScanEvent) => {
        if (event.type === 'module:started') {
          setModuleStates((s) => ({ ...s, [event.module]: 'running' }));
        } else if (event.type === 'module:complete') {
          setModuleStates((s) => ({ ...s, [event.module]: TO_UI_STATE[event.state] }));
        } else if (event.type === 'scan:state') {
          setScanState(event.state);
        }
      },
    });
    return () => {
      client.close();
    };
  }, [scanId, refetch]);

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => {
      clearInterval(timer);
    };
  }, []);

  const done = modules.filter((m) => moduleStates[m] !== undefined && moduleStates[m] !== 'waiting' && moduleStates[m] !== 'running').length;
  const running = modules.find((m) => moduleStates[m] === 'running');
  const finished = SCAN_TERMINAL.has(scanState);
  const elapsed = startedAt === null ? '0:00' : formatElapsed(now - startedAt);

  return (
    <div>
      <PageHead
        eyebrow="Live scan"
        title={hostname}
        meta={`scan ${scanId.slice(0, 8)}`}
        actions={
          !finished ? (
            <Button variant="secondary" size="sm" {...(onCancel ? { onClick: onCancel } : {})}>
              Cancel scan
            </Button>
          ) : undefined
        }
      />
      {scanState === 'AWAITING_QUESTIONNAIRE' ? (
        // T201/FR-040: the mid-audit design-intent pause. `refetch` doubles
        // as the "resolved" callback — the same authoritative re-fetch this
        // component already uses on reconnect (FR-047), so the moment the
        // user answers or skips, scanState is re-read from the database
        // rather than assumed.
        <UIQuestionnaire scanId={scanId} onResolved={refetch} />
      ) : (
        <div className={styles.stack}>
          <ProgressRow
            phase={
              finished
                ? 'Audit complete'
                : running !== undefined
                  ? `Running ${MODULE_LABEL[running].toLowerCase()} checks`
                  : 'Preparing'
            }
            elapsed={elapsed}
            done={done}
            total={modules.length || 1}
          />
          {modules.map((module) => (
            <ModuleStatus
              key={module}
              area={MODULE_LABEL[module]}
              state={moduleStates[module] ?? 'waiting'}
            />
          ))}
          {finished && (
            <div className={styles.done}>
              <Button {...(onDone ? { onClick: onDone } : {})}>Open report</Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
