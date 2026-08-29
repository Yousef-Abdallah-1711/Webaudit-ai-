/**
 * T247 — the icon subset, vendored.
 *
 * **What "remove the unpkg CDN dependency" turned out to mean.** The task
 * assumes the portable component/screen sources reach for Lucide by name from
 * `https://unpkg.com/lucide@latest` — `design-system/readme.md`'s
 * Iconography section says exactly that. An exhaustive search
 * (`grep -rli lucide design-system/`) found the opposite: every `.jsx`
 * component and screen already embeds a raw inline `<svg><path d="...">` with
 * no CDN call anywhere. The CDN reference lives only in the design system's
 * own separate live-preview HTML scaffolding (each ui_kit's `index.html`,
 * every `*.card.html`) — tooling for viewing the source without a build step, never
 * part of what T237–T244/T248 port. There is no live dependency to remove
 * from anything this repository ships.
 *
 * What the task's destination (`apps/web/components/ui/icons/`) is still
 * worth building: `design-system/ui_kits/app/Sidebar.jsx` and
 * `ui_kits/admin/AdminShell.jsx` each define their own local icon-path map
 * (`I`/`AI`) and helper (`Ico`/`AIco`) — nineteen distinct glyphs between the
 * two, four of them the *same path repeated under a different name*
 * (`toggle` in both shells; `usage`/`overview` both draw the bar-chart glyph
 * `AttributionMark`'s `measured` icon also uses; `billing`/`plans` share one
 * path; `report`/`log` share another). T241 and T243 need these; one
 * consolidated, de-duplicated, named module is what a Lucide import would
 * have given them, ported faithfully from the exact paths the design already
 * ships rather than fetched fresh from the npm package — "port, never
 * author" applied to which shapes are authoritative.
 *
 * Names below are the glyph's visual identity (closest Lucide icon name),
 * not any one screen's label for it — `usage` and `overview` are two
 * screens' names for the same picture, so the shared export is `barChart`
 * and each screen's own nav-item label carries the domain meaning.
 */

export const ICON_PATHS = {
  plus: 'M12 5v14M5 12h14',
  loader: 'M12 3a9 9 0 1 0 9 9M12 7v5l3 2',
  fileText: 'M7 3h7l5 5v13H7Zm7 0v5h5M10 13h7M10 17h5',
  check: 'm4 12 5 5L20 6',
  minus: 'M5 12h14',
  flag: 'M6 21V4h12l-2 4 2 4H6',
  barChart: 'M4 20V10m5 10V4m5 16v-7m5 7V8',
  creditCard: 'M3 7h18v12H3Zm0 4h18M7 15h4',
  userCircle: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-8 8a8 8 0 0 1 16 0',
  shield: 'M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7Z',
  menu: 'M4 6h16M4 12h16M4 18h16',
  chevronRight: 'm9 6 6 6-6 6',
  layoutGrid: 'M4 4h7v7H4Zm9 0h7v7h-7ZM4 13h7v7H4Zm9 0h7v7h-7Z',
  layers: 'M12 3v6m0 6v6M5 8l7 4 7-4M5 16l7-4 7 4',
  list: 'M4 6h16M4 12h16M4 18h10',
  trendingUp: 'M4 18 10 12l4 4 6-8m0 0h-5m5 0v5',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14Zm5.5 12.5L21 21',
  settings:
    'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6Zm8 3-1.4 3.4 1 2-2 2-2-1L12 20l-1.4-1.6-2 1-2-2 1-2L4 12l1.6-1.4-1-2 2-2 2 1L12 4l1.4 1.6 2-1 2 2-1 2Z',
  logOut: 'M15 4h4v16h-4M11 8l-4 4 4 4M7 12h9',
} as const;

export type IconName = keyof typeof ICON_PATHS;
