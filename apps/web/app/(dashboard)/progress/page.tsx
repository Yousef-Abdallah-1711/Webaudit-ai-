/**
 * The sidebar's "Progress" nav entry has no scan id to point at — live
 * progress only makes sense for a specific scan (`/scan/[id]`). Before this
 * file existed the link 404'd; this names the same "nothing selected" state
 * `readiness/page.tsx` already shows for its own id-less case, rather than
 * inventing a different empty pattern.
 */
import { useTranslations } from 'next-intl';
import { PageHead } from '../../../components/dashboard';

export default function ProgressPage(): React.ReactElement {
  const t = useTranslations('scan');
  return (
    <div>
      <PageHead
        eyebrow={t('progress_eyebrow')}
        title={t('progress_no_scan_title')}
        meta={t('progress_no_scan_meta')}
      />
    </div>
  );
}
