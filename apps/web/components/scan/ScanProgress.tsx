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
 */
import { useEffect, useMemo, useState } from 'react';
import type { ModuleState, ModuleType, ScanEvent, ScanState } from '@webaudit/types';
import { Button } from '../ui';
import { PageHead } from '../dashboard';
import { ModuleStatus, ProgressRow, type ModuleStatusProps } from '../report';
import { getAccessToken, getScan } from '../../lib/api';
import { connectRealtime } from '../../lib/realtime';
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
    </div>
  );
}
