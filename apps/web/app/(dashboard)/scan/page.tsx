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
import { useRouter } from 'next/navigation';
import { PageHead } from '../../../components/dashboard';
import { ScanForm } from '../../../components/scan/ScanForm';

export default function ScanPage(): React.ReactElement {
  const router = useRouter();
  return (
    <div>
      <PageHead eyebrow="Dashboard" title="What should we audit?" />
      <ScanForm
        onStart={(scanId) => {
          router.push(`/scan/${scanId}`);
        }}
      />
    </div>
  );
}
