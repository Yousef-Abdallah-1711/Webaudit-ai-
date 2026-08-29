/**
 * T243 — the operator shell, ported from design-system/ui_kits/admin/AdminShell.jsx.
 *
 * Import from here, not from a component's own file directly — same
 * discipline as apps/web/components/ui/index.ts, components/report/index.ts,
 * components/public/index.ts, and components/dashboard/index.ts.
 */
export {
  AdminShell,
  type AdminShellProps,
  AHead,
  type AHeadProps,
  Table,
  type TableProps,
  type TableColumn,
  Stat,
  type StatProps,
} from './AdminShell';
export { mono, num } from './format';
