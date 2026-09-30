/**
 * The sidebar's "Report" nav entry has no scan id to point at — a report
 * only exists per scan (`/reports/[id]`). Before this file existed the link
 * 404'd; this names the same "nothing selected" state `readiness/page.tsx`
 * already shows for its own id-less case, rather than inventing a
 * different empty pattern.
 */
import { useTranslations } from 'next-intl';
import { PageHead } from '../../../components/dashboard';

export default function ReportPlaceholderPage(): React.ReactElement {
  const t = useTranslations('reports');
  return (
    <div>
      <PageHead
        eyebrow={t('report_label')}
        title={t('report_placeholder_title')}
        meta={t('report_placeholder_meta')}
      />
    </div>
  );
}
