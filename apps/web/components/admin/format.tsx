/**
 * Ported from design-system/ui_kits/admin/AdminScreens.jsx's top-of-file
 * `mono`/`num` helpers (T244) — used by `Scans`, `Providers`, and `Log`.
 * Plain functions returning an element, called inline (`{mono(r[0])}`),
 * matching how the source itself uses them — not JSX components.
 */
import type { ReactNode } from 'react';

export function mono(s: ReactNode): ReactNode {
  return <span className={'font-mono text-[0.8125rem]'}>{s}</span>;
}

export function num(s: ReactNode): ReactNode {
  return <span className={'font-mono text-[0.8125rem] tabular-nums'}>{s}</span>;
}
