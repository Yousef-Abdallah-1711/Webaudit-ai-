/**
 * T241 — the customer app shell, wrapping every route under (dashboard).
 *
 * Thin wrapper: all the actual porting is in
 * apps/web/components/dashboard/Sidebar.tsx (AppShell) — same split as
 * apps/web/app/(public)/page.tsx importing PublicPage from
 * apps/web/components/public/.
 */
import { AppShell } from '../../components/dashboard';

export default function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>): React.ReactElement {
  return <AppShell>{children}</AppShell>;
}
