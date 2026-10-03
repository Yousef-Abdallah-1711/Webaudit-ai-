'use client';

/**
 * Ported from design-system/ui_kits/admin/AdminShell.jsx (T243).
 *
 * `AdminSidebar`, `AdminShell`, `AHead`, `Table`, `Stat` — one file, same
 * as the source. Same routing translation as `components/dashboard/
 * Sidebar.tsx` (T241): `view`/`setView` (in-memory state in the static
 * preview) became `usePathname()` against real routes. Nav routes follow
 * `design/screen-map.md`'s routing table exactly: `/admin/{queue,scans,
 * capabilities,providers,users,plans,billing,log,settings}` — except
 * `overview`, which stays at `/admin` itself (this task's own target,
 * `app/(admin)/admin/page.tsx`). Two of these (`capabilities`, `billing`)
 * were corrected in Session 5 (T212/T213): this file originally used `caps`
 * and `margin`, which never matched screen-map.md's table and would have
 * 404'd once those two real pages were built at their documented routes.
 *
 * The "back to dashboard" link points at `/scan`, the customer sidebar's
 * own first nav item (T241) — a reasonable default, not a contract. The
 * "Public site" link points at `/`, the one link here with a real,
 * already-decided target (T240's landing page).
 *
 * The source's `const [theme,setTheme]=useTheme()` in `AdminShell` is
 * dead: neither binding is read anywhere in its JSX — `<ThemeToggle/>`
 * subscribes to the same store independently. Not ported; this repo's
 * `noUnusedLocals` would refuse it, and porting dead code isn't "port,
 * never author" so much as porting a source-level oversight.
 *
 * `Table`'s `cols[].width` is `number | '1fr'`, not the source's raw CSS
 * strings (`'7.5rem'`) — this repo's raw-px lint rule (T245) forbids that
 * literal in a `.tsx` file, and T244's screens each declare several. `Table`
 * appends `px` itself, the same move as `Card`'s `padding: number` (T237).
 */
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { PRODUCT_NAME } from '@webaudit/config';
import { Badge, Card, Eyebrow } from '../ui';
import { Icon, type IconName } from '../ui/icons';
import { ThemeToggle } from '../../app/theme';
import { useAuth } from '../auth/AuthProvider';

interface NavEntry {
  readonly key: string;
  readonly href: string;
  readonly label:
    | 'overview'
    | 'queue'
    | 'scans'
    | 'capabilities'
    | 'providers'
    | 'users'
    | 'plans'
    | 'margin'
    | 'audit_log'
    | 'settings';
  readonly icon: IconName;
}

const NAV_GROUPS: readonly (readonly [
  'group_platform' | 'group_catalogue' | 'group_commerce' | 'group_governance',
  readonly NavEntry[],
])[] = [
  [
    'group_platform',
    [
      { key: 'overview', href: '/admin', label: 'overview', icon: 'barChart' },
      { key: 'queue', href: '/admin/queue', label: 'queue', icon: 'list' },
      { key: 'scans', href: '/admin/scans', label: 'scans', icon: 'search' },
    ],
  ],
  [
    'group_catalogue',
    [
      { key: 'caps', href: '/admin/capabilities', label: 'capabilities', icon: 'layoutGrid' },
      { key: 'providers', href: '/admin/providers', label: 'providers', icon: 'layers' },
    ],
  ],
  [
    'group_commerce',
    [
      { key: 'users', href: '/admin/users', label: 'users', icon: 'userCircle' },
      { key: 'plans', href: '/admin/plans', label: 'plans', icon: 'creditCard' },
      { key: 'margin', href: '/admin/billing', label: 'margin', icon: 'trendingUp' },
    ],
  ],
  [
    'group_governance',
    [
      { key: 'log', href: '/admin/log', label: 'audit_log', icon: 'fileText' },
      { key: 'settings', href: '/admin/settings', label: 'settings', icon: 'settings' },
    ],
  ],
];

/**
 * "Overview" lives at `/admin` itself, the same path every other admin nav
 * entry is nested under — a plain prefix match would mark it active on
 * every admin route, not just its own. It gets an exact match instead;
 * every other entry keeps matching its own nested routes too.
 */
function isActive(pathname: string, href: string): boolean {
  if (href === '/admin') return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

interface ANavItemProps {
  open: boolean;
  active: boolean;
  label: string;
  icon: IconName;
  href: string;
}

function ANavItem({ open, active, label, icon, href }: ANavItemProps): React.ReactElement {
  const classes = [
    'flex h-[2.375rem] w-full items-center justify-center gap-[0.6875rem] rounded-control border-0 bg-transparent p-0 text-start font-sans text-[0.875rem] font-normal text-gray-400 no-underline shadow-none cursor-pointer transition-colors hover:bg-white/5',
    open ? 'justify-start px-3' : undefined,
    active
      ? 'border-0 bg-white/10 font-semibold text-text-on-accent shadow-[inset_2px_0_0_var(--accent)] hover:bg-white/10'
      : undefined,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <a href={href} title={open ? undefined : label} className={classes}>
      <Icon name={icon} />
      {open && <span className={'overflow-hidden whitespace-nowrap'}>{label}</span>}
    </a>
  );
}

interface AdminSidebarProps {
  open: boolean;
  setOpen: (open: boolean) => void;
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

function AdminSidebar({
  open,
  setOpen,
  mobileOpen = false,
  onMobileClose = () => {},
}: AdminSidebarProps): React.ReactElement {
  const pathname = usePathname();
  const t = useTranslations('admin');
  const contentOpen = open || mobileOpen;

  const sidebarClasses = [
    'sticky top-0 flex h-screen w-[3.75rem] shrink-0 flex-col overflow-hidden border-y-0 border-s-0 border-e-hairline border-solid border-gray-700 bg-gray-800 transition-[width] duration-150 ease-[var(--easing)] [@media(max-width:40rem)]:fixed [@media(max-width:40rem)]:inset-s-0 [@media(max-width:40rem)]:inset-y-0 [@media(max-width:40rem)]:z-[950] [@media(max-width:40rem)]:h-auto [@media(max-width:40rem)]:!w-[min(15.5rem,85vw)] [@media(max-width:40rem)]:-translate-x-full [@media(max-width:40rem)]:transition-transform [@media(max-width:40rem)]:rtl:translate-x-full',
    contentOpen ? '[@media(min-width:40.0625rem)]:!w-[15.5rem]' : undefined,
    mobileOpen ? '[@media(max-width:40rem)]:translate-x-0' : undefined,
  ]
    .filter(Boolean)
    .join(' ');
  const headClasses = [
    'flex h-[3.75rem] shrink-0 items-center justify-center gap-2 p-0',
    contentOpen ? 'justify-start px-3' : undefined,
  ]
    .filter(Boolean)
    .join(' ');
  const navScrollClasses = [
    'min-h-0 flex-1 overflow-y-auto px-2 py-1.5',
    contentOpen ? 'px-2.5' : undefined,
  ]
    .filter(Boolean)
    .join(' ');
  const footClasses = [
    'flex shrink-0 flex-col gap-2 border-x-0 border-b-0 border-t-hairline border-solid border-gray-700 px-2 py-3',
    contentOpen ? 'px-3' : undefined,
  ]
    .filter(Boolean)
    .join(' ');
  const footRowClasses = [
    'flex items-center justify-center gap-2',
    contentOpen ? 'justify-start' : undefined,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <aside id="admin-sidebar" className={sidebarClasses}>
      <div className={headClasses}>
        <button
          type="button"
          onClick={() => {
            if (mobileOpen) {
              onMobileClose();
            } else {
              setOpen(!open);
            }
          }}
          id="admin-sidebar-mobile-close"
          aria-label={t(mobileOpen || open ? 'sidebar_collapse' : 'sidebar_expand')}
          title={t(mobileOpen || open ? 'sidebar_collapse' : 'sidebar_expand')}
          className={
            'grid h-[2.125rem] w-[2.125rem] shrink-0 place-items-center rounded-control border-0 bg-transparent text-gray-400 cursor-pointer'
          }
        >
          <Icon name="menu" size={19} />
        </button>
        {contentOpen && (
          <div className={'flex items-center gap-2 whitespace-nowrap'}>
            <div
              className={'text-[0.9375rem] font-bold tracking-[-0.01875rem] text-text-on-accent'}
            >
              <span className={'text-accent'}>{PRODUCT_NAME}</span>
            </div>
            <span
              className={
                'border border-hairline border-solid border-accent px-[0.3125rem] py-px font-mono text-[0.625rem] tracking-[0.0625rem] text-accent uppercase'
              }
            >
              {t('operator')}
            </span>
          </div>
        )}
      </div>

      <div className={navScrollClasses}>
        {NAV_GROUPS.map(([group, items]) => (
          <div key={group} className={'mb-4'}>
            {contentOpen ? (
              <div
                className={
                  'px-3 pb-1.5 font-sans text-[0.625rem] font-bold tracking-[0.09375rem] text-gray-500 uppercase'
                }
              >
                {t(group)}
              </div>
            ) : (
              <div className={'mx-1.5 mb-2 h-px bg-gray-700'} />
            )}
            <div className={'flex flex-col gap-0.5'}>
              {items.map((item) => (
                <ANavItem
                  key={item.key}
                  open={contentOpen}
                  active={isActive(pathname, item.href)}
                  label={t(item.label)}
                  icon={item.icon}
                  href={item.href}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className={footClasses}>
        {contentOpen && (
          <div className={'font-mono text-[0.6875rem] text-gray-500'}>{t('actions_recorded')}</div>
        )}
        <div className={footRowClasses}>
          <a
            href="/scan"
            title={t('back_dashboard')}
            className={
              'grid h-[2.125rem] w-[2.125rem] place-items-center rounded-control border border-hairline border-solid border-gray-700 text-gray-400 no-underline'
            }
          >
            <Icon name="logOut" size={16} />
          </a>
          {contentOpen && (
            <a href="/" className={'type-small text-gray-400 no-underline'}>
              {t('public_site')}
            </a>
          )}
        </div>
      </div>
    </aside>
  );
}

export interface AdminShellProps {
  children?: ReactNode;
}

export function AdminShell({ children }: AdminShellProps): React.ReactElement {
  const t = useTranslations('admin');
  const [open, setOpen] = useState(true);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const mobileTriggerRef = useRef<HTMLButtonElement>(null);
  const mobileDrawerWasOpenRef = useRef(false);
  const { user } = useAuth();

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const desktopViewport = window.matchMedia('(min-width: 40.0625rem)');
    const closeOnDesktop = (): void => {
      if (desktopViewport.matches) setMobileDrawerOpen(false);
    };
    closeOnDesktop();
    desktopViewport.addEventListener('change', closeOnDesktop);
    return () => desktopViewport.removeEventListener('change', closeOnDesktop);
  }, []);

  useEffect(() => {
    if (!mobileDrawerOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [mobileDrawerOpen]);

  useEffect(() => {
    if (mobileDrawerOpen) {
      mobileDrawerWasOpenRef.current = true;
      document.getElementById('admin-sidebar-mobile-close')?.focus();
      return;
    }

    if (!mobileDrawerWasOpenRef.current) return;
    mobileDrawerWasOpenRef.current = false;
    mobileTriggerRef.current?.focus();
  }, [mobileDrawerOpen]);

  useEffect(() => {
    if (!mobileDrawerOpen) return;
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setMobileDrawerOpen(false);
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [mobileDrawerOpen]);

  return (
    <div className={'flex min-h-screen bg-surface-sunken'}>
      <AdminSidebar
        open={open}
        setOpen={setOpen}
        mobileOpen={mobileDrawerOpen}
        onMobileClose={() => setMobileDrawerOpen(false)}
      />
      {mobileDrawerOpen && (
        <div
          className={
            'fixed inset-0 z-[900] hidden border-0 bg-[color-mix(in_srgb,var(--text-strong)_42%,transparent)] p-0 cursor-pointer [@media(max-width:40rem)]:block'
          }
          aria-hidden="true"
          onClick={() => setMobileDrawerOpen(false)}
        />
      )}
      <div className={'min-w-0 flex-1'} inert={mobileDrawerOpen}>
        <button
          ref={mobileTriggerRef}
          type="button"
          className={`${'grid h-[2.125rem] w-[2.125rem] shrink-0 place-items-center rounded-control border-0 bg-transparent text-gray-400 cursor-pointer'} ${'hidden [@media(max-width:40rem)]:fixed [@media(max-width:40rem)]:inset-s-2 [@media(max-width:40rem)]:top-16 [@media(max-width:40rem)]:z-[850] [@media(max-width:40rem)]:bg-surface-raised [@media(max-width:40rem)]:grid'}`}
          aria-label={t('mobile_open_menu')}
          aria-controls="admin-sidebar"
          aria-expanded={mobileDrawerOpen}
          onClick={() => setMobileDrawerOpen(true)}
        >
          <Icon name="menu" />
        </button>
        <div
          className={
            'flex h-[3.25rem] items-center gap-3 border-x-0 border-b-hairline border-t-0 border-solid border-border-default bg-surface-page px-6 [@media(max-width:40rem)]:h-auto [@media(max-width:40rem)]:min-h-12 [@media(max-width:40rem)]:flex-wrap [@media(max-width:40rem)]:gap-1 [@media(max-width:40rem)]:px-3 [@media(max-width:40rem)]:py-2 [@media(max-width:40rem)]:ps-[calc(var(--space-12)+var(--space-1))]'
          }
        >
          <span
            className={
              'font-mono text-[0.75rem] text-text-muted [@media(max-width:40rem)]:min-w-0 [@media(max-width:40rem)]:flex-[1_1_100%] [@media(max-width:40rem)]:[overflow-wrap:anywhere]'
            }
          >
            {t('operator_header', { email: user?.email ?? t('unavailable') })}
          </span>
          <span
            className={
              'ms-auto flex items-center gap-2.5 [@media(max-width:40rem)]:flex-wrap [@media(max-width:40rem)]:gap-1'
            }
          >
            <Badge>{t('workers_unavailable')}</Badge>
            <Badge>{t('queue_unavailable')}</Badge>
            <ThemeToggle />
          </span>
        </div>
        <main className={'px-6 pt-7 pb-16'}>
          <div className={'mx-auto max-w-app-shell'}>{children}</div>
        </main>
      </div>
    </div>
  );
}

export interface AHeadProps {
  eyebrow: string;
  title: string;
  meta?: string;
  actions?: ReactNode;
}

export function AHead({ eyebrow, title, meta, actions }: AHeadProps): React.ReactElement {
  return (
    <div className={'mb-[1.375rem] flex flex-wrap items-end gap-4'}>
      <div>
        <Eyebrow tone="accent">{eyebrow}</Eyebrow>
        <h1 className={'mt-2 mb-0 type-h3 text-text-strong'}>{title}</h1>
        {meta !== undefined && (
          <div className={'mt-1.5 font-mono text-[0.8125rem] text-text-secondary'}>{meta}</div>
        )}
      </div>
      <div className={'ms-auto flex gap-2.5'}>{actions}</div>
    </div>
  );
}

export interface TableColumn {
  readonly label: string;
  /** A number of px, or the literal '1fr' for the column that should fill remaining space. */
  readonly width: number | '1fr';
}

export interface TableProps {
  cols: readonly TableColumn[];
  rows: readonly (readonly ReactNode[])[];
}

export function Table({ cols, rows }: TableProps): React.ReactElement {
  const gridTemplateColumns = cols
    .map((c) => (c.width === '1fr' ? c.width : `${String(c.width)}px`))
    .join(' ');

  return (
    <div
      className={
        'overflow-x-auto overflow-y-hidden rounded-card border border-hairline border-solid border-border-default bg-surface-page'
      }
    >
      <div
        className={
          'grid gap-4 border-x-0 border-b-hairline border-t-0 border-solid border-border-default bg-surface-raised px-5 py-3'
        }
        style={{ gridTemplateColumns }}
      >
        {cols.map((col) => (
          <span
            key={col.label}
            className={
              'font-sans text-[0.6875rem] font-bold tracking-[0.05rem] text-text-muted uppercase'
            }
          >
            {col.label}
          </span>
        ))}
      </div>
      {rows.map((row, i) => (
        <div
          key={i}
          className={
            i > 0
              ? `${'grid items-center gap-4 border-0 border-t-0 px-5 py-[0.8125rem]'} ${'border-x-0 border-b-0 border-t-hairline border-solid border-border-default'}`
              : 'grid items-center gap-4 border-0 border-t-0 px-5 py-[0.8125rem]'
          }
          style={{ gridTemplateColumns }}
        >
          {row.map((cell, j) => (
            <div key={j} dir="auto" className={'min-w-0 overflow-hidden text-ellipsis type-small'}>
              {cell}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

export interface StatProps {
  label: string;
  value: string;
  sub?: string;
  tone?: string;
}

export function Stat({ label, value, sub, tone }: StatProps): React.ReactElement {
  return (
    <Card padding={20} eyebrow={label}>
      <div
        className={'type-h3 tabular-nums text-text-strong'}
        style={tone !== undefined ? { color: tone } : undefined}
      >
        {value}
      </div>
      {sub !== undefined && <div className={'mt-1.5 type-small text-text-secondary'}>{sub}</div>}
    </Card>
  );
}
