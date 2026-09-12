# Pages and Routes

> **Generated file — do not edit.** Regenerate with `$docs-update`.
> Everything below is read from the project source; edits here are lost on the next run.

Every route the frontend serves and what renders it.

| Route | Render | Components | Data sources | File |
| --- | --- | --- | --- | --- |
| `/` | client | Areas, Button, Card, Difference, Eyebrow, FinalCta | — | `apps/web/app/(public)/page.tsx` |
| `/admin` | server | AHead, Card, Stat | — | `apps/web/app/(admin)/admin/page.tsx` |
| `/admin/billing` | client | AHead, Button, Card, MarginReport, Stat, Table | `../../../../lib/api` | `apps/web/app/(admin)/admin/billing/page.tsx` |
| `/admin/capabilities` | client | AHead, Badge, Button, Card, File, HTMLFormElement | `../../../../lib/api` | `apps/web/app/(admin)/admin/capabilities/page.tsx` |
| `/admin/log` | client | AHead, Badge, Button, Table | `../../../../lib/api` | `apps/web/app/(admin)/admin/log/page.tsx` |
| `/admin/plans` | client | AHead, AdminPlanInput, Badge, Button, Card, Table | `../../../../lib/api` | `apps/web/app/(admin)/admin/plans/page.tsx` |
| `/admin/providers` | client | AHead, Button, Card, Table | `../../../../lib/api.js` | `apps/web/app/(admin)/admin/providers/page.tsx` |
| `/admin/queue` | client | AHead, Badge, Button, Table | `../../../../lib/api` | `apps/web/app/(admin)/admin/queue/page.tsx` |
| `/admin/scans` | client | AHead, Badge, Button, Table | `../../../../lib/api` | `apps/web/app/(admin)/admin/scans/page.tsx` |
| `/admin/settings` | server | AHead, Card | — | `apps/web/app/(admin)/admin/settings/page.tsx` |
| `/admin/users` | client | AHead, AdminUserDetail, AdminUserSummary, Badge, Button, HTMLFormElement | `../../../../lib/api` | `apps/web/app/(admin)/admin/users/page.tsx` |
| `/billing` | client | Badge, Button, Card, CreditBalanceView, DrewFrom, PageHead | `../../../lib/api` | `apps/web/app/(dashboard)/billing/page.tsx` |
| `/billing/receipts/:id` | client | PageHead | `../../../../../lib/api` | `apps/web/app/(dashboard)/billing/receipts/[id]/page.tsx` |
| `/fixes` | client | FixesBoard, FixesPageContent, PageHead, Record, Suspense | `../../../lib/api` | `apps/web/app/(dashboard)/fixes/page.tsx` |
| `/forgot-password` | client | AuthFrame, Button, Field | `../../../lib/api` | `apps/web/app/(auth)/forgot-password/page.tsx` |
| `/login` | client | AuthFrame, Button, Divider, Field, Input | `../../../lib/api` | `apps/web/app/(auth)/login/page.tsx` |
| `/pricing` | client | Badge, Button, CostTable, Eyebrow, PublicPage, TierGrid | — | `apps/web/app/(public)/pricing/page.tsx` |
| `/progress` | server | PageHead | — | `apps/web/app/(dashboard)/progress/page.tsx` |
| `/readiness` | client | Button, Card, PageHead, ReadinessPageContent, ReadinessStatus, ReadinessVerdict | `../../../lib/api` | `apps/web/app/(dashboard)/readiness/page.tsx` |
| `/report` | server | PageHead | — | `apps/web/app/(dashboard)/report/page.tsx` |
| `/reports/:id` | client | Button, Card, IssueCard, ModuleStatus, ModuleStatusProps, PageHead | `../../../../lib/api` | `apps/web/app/(dashboard)/reports/[id]/page.tsx` |
| `/reset-password` | client | AuthFrame, Button, Field, ResetPageInner, Suspense | `../../../lib/api` | `apps/web/app/(auth)/reset-password/page.tsx` |
| `/scan` | client | PageHead, ScanForm | — | `apps/web/app/(dashboard)/scan/page.tsx` |
| `/scan/:id` | client | PageHead, ScanProgress | `../../../../lib/api` | `apps/web/app/(dashboard)/scan/[id]/page.tsx` |
| `/settings` | client | Badge, Button, Card, CurrentUser, Input, PageHead | `../../../lib/api` | `apps/web/app/(dashboard)/settings/page.tsx` |
| `/signup` | client | AuthFrame, Button, Divider, Field | `../../../lib/api` | `apps/web/app/(auth)/signup/page.tsx` |
| `/usage` | client | Button, Card, PageHead, UsageSummary | `../../../lib/api` | `apps/web/app/(dashboard)/usage/page.tsx` |
| `/verify-email` | client | AuthFrame, Button, Outcome, Suspense, TokenOutcome, VerifyPageInner | `../../../lib/api` | `apps/web/app/(auth)/verify-email/page.tsx` |
