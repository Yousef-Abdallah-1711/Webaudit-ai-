'use client';

/**
 * T129/T241 — the real "new scan" screen. `app/(dashboard)/scan/page.tsx`
 * shipped at T241 as an explicit scaffold ("a Phase 3 task ports the real
 * scan page here"), and `ScanForm` itself shipped real at T129 — but nothing
 * ever mounted one into the other, so `/scan`, the sidebar's only entry
 * point for starting an audit and also `login`'s post-auth redirect target,
 * rendered a static placeholder heading with no form. Found while writing
 * the onboarding E2E journey (a fresh user clicking "Sign in" landed on
 * dead UI), fixed alongside it rather than filed for later.
 */
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { PageHead } from '../../../components/dashboard';
import { ScanForm } from '../../../components/scan/ScanForm';
import { readAndClearHeroScanUrl } from '../../../lib/hero-scan-handoff';

export default function ScanPage(): React.ReactElement {
  const router = useRouter();
  const t = useTranslations('scan');
  const handoffRead = useRef(false);
  const [handoff, setHandoff] = useState<{ ready: false } | { ready: true; url: string | undefined }>(
    { ready: false },
  );

  useEffect(() => {
    if (handoffRead.current) return;
    handoffRead.current = true;
    setHandoff({ ready: true, url: readAndClearHeroScanUrl() ?? undefined });
  }, []);

  return (
    <div>
      <PageHead eyebrow={t('scan_eyebrow')} title={t('scan_title')} />
      {handoff.ready && (
        <ScanForm
          {...(handoff.url === undefined ? {} : { initialUrl: handoff.url })}
          onStart={(scanId) => {
            router.push(`/scan/${scanId}`);
          }}
        />
      )}
    </div>
  );
}
