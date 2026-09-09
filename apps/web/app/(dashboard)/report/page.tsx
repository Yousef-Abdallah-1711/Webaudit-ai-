/**
 * The sidebar's "Report" nav entry has no scan id to point at — a report
 * only exists per scan (`/reports/[id]`). Before this file existed the link
 * 404'd; this names the same "nothing selected" state `readiness/page.tsx`
 * already shows for its own id-less case, rather than inventing a
 * different empty pattern.
 */
import { PageHead } from '../../../components/dashboard';

export default function ReportPlaceholderPage(): React.ReactElement {
  return (
    <div>
      <PageHead
        eyebrow="Report"
        title="No report selected"
        meta="Open a completed scan's live-progress page to see its report."
      />
    </div>
  );
}
