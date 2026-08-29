/**
 * T243 — the operator shell, wrapping every route under (admin).
 *
 * Thin wrapper: all the actual porting is in
 * apps/web/components/admin/AdminShell.tsx — same split as
 * apps/web/app/(dashboard)/layout.tsx importing AppShell from
 * apps/web/components/dashboard/.
 */
import { AdminShell } from '../../components/admin';

export default function AdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>): React.ReactElement {
  return <AdminShell>{children}</AdminShell>;
}
