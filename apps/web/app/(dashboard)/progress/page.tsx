/**
 * The sidebar's "Progress" nav entry has no scan id to point at — live
 * progress only makes sense for a specific scan (`/scan/[id]`). Before this
 * file existed the link 404'd; this names the same "nothing selected" state
 * `readiness/page.tsx` already shows for its own id-less case, rather than
 * inventing a different empty pattern.
 */
import { PageHead } from '../../../components/dashboard';

export default function ProgressPage(): React.ReactElement {
  return (
    <div>
      <PageHead
        eyebrow="Live scan"
        title="No scan in progress"
        meta="Start a new scan to see live progress here."
      />
    </div>
  );
}
