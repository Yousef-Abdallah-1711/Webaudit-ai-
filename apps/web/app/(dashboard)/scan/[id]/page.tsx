'use client';

/**
 * T130 — the live-progress screen, per `design/screen-map.md`'s "Live
 * progress | /scan/[id]". `ScanProgress` itself shipped real at T130 but,
 * like `ScanForm` (see `../page.tsx`'s own note), was never mounted into a
 * route — this closes that gap. `hostname` has no dedicated endpoint; `GET
 * /scans/:id` was extended to include `target.displayName` for exactly this
 * screen rather than adding a second round trip.
 */
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { PageHead } from '../../../../components/dashboard';
import { ScanProgress } from '../../../../components/scan/ScanProgress';
import { cancelScan, getScan } from '../../../../lib/api';

export default function ScanProgressPage(): React.ReactElement {
  const params = useParams<{ id: string }>();
  const scanId = params.id;
  const router = useRouter();
  const [hostname, setHostname] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getScan(scanId).then(({ scan }) => {
      if (!cancelled) setHostname(scan.target?.displayName ?? scanId);
    });
    return () => {
      cancelled = true;
    };
  }, [scanId]);

  if (hostname === null) {
    return (
      <div>
        <PageHead eyebrow="Live scan" title="Loading…" />
      </div>
    );
  }

  return (
    <ScanProgress
      scanId={scanId}
      hostname={hostname}
      onCancel={() => {
        void cancelScan(scanId).then(() => router.push('/scan'));
      }}
      onDone={() => {
        router.push(`/reports/${scanId}`);
      }}
    />
  );
}
