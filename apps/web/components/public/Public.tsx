'use client';

/**
 * Ported from design-system/ui_kits/marketing/Public.jsx (T240).
 *
 * `useT()` is a hook, so anything that calls it — every component here —
 * has to be a Client Component.
 *
 * `Wordmark`, `PublicHeader`, `PublicFooter`, `PublicPage` — one file, same
 * as the source. Static styling moved to `Public.module.css` (raw px/hex
 * inline style objects fail this repo's adherence lint, T245); the header
 * nav's active-vs-inactive weight/colour and the footer's per-column data
 * stay dynamic, matching the source.
 *
 * Link targets translated from the source's static-preview `.html` files to
 * real routes: `index.html` → `/`, `Pricing.html` → `/pricing` (T193, not
 * yet built — a live link to a page that 404s until then, same as the
 * source linking to a sibling static file that may not exist yet either),
 * `Login.html`/`Register.html` → `/login`/`/register` (T128, same). The
 * source's own `nav_docs`/`nav_changelog` and every footer column link were
 * already `#` placeholders — left as `#`. The dashboard/admin footer links
 * point at `../app/` and `../admin/` in the source, i.e. the other two
 * deployable units this repo hasn't decided route paths for yet (T241/T243)
 * — left as `#` rather than guessing a path those tasks might not choose.
 */
import type { ReactElement } from 'react';
import { Button } from '../ui';
import { LangToggle, ThemeToggle, useT } from '../../app/theme';
import type { StringKey } from '../../lib/strings';
import styles from './Public.module.css';

export interface WordmarkProps {
  size?: number;
}

export function Wordmark({ size = 19 }: WordmarkProps): ReactElement {
  return (
    <div dir="ltr" className={styles.wordmark} style={{ fontSize: size }}>
      Web<span className={styles.wordmarkAccent}>Audit</span> AI
    </div>
  );
}

const NAV: readonly (readonly [href: string, key: StringKey])[] = [
  ['/', 'nav_product'],
  ['/pricing', 'nav_pricing'],
  ['#', 'nav_docs'],
  ['#', 'nav_changelog'],
];

export interface PublicHeaderProps {
  active?: StringKey;
}

export function PublicHeader({ active }: PublicHeaderProps): ReactElement {
  const [t] = useT();

  return (
    <header className={styles.header}>
      <div className={styles.headerInner}>
        <a href="/" className={styles.wordmarkLink}>
          <Wordmark />
        </a>
        <nav className={styles.nav}>
          {NAV.map(([href, key]) => (
            <a
              key={key}
              href={href}
              className={
                active === key ? `${styles.navLink} ${styles.navLinkActive}` : styles.navLink
              }
            >
              {t(key)}
            </a>
          ))}
        </nav>
        <div className={styles.headerActions}>
          <LangToggle />
          <ThemeToggle />
          <Button variant="ghost" size="sm" href="/login">
            {t('signin')}
          </Button>
          <Button size="sm" href="/register">
            {t('start_free')}
          </Button>
        </div>
      </div>
    </header>
  );
}

const FOOTER_COLUMNS: readonly (readonly [StringKey, readonly StringKey[]])[] = [
  ['foot_product', ['a_seo', 'loop_eyebrow', 'n_readiness']],
  ['foot_pricing', ['foot_pricing', 'credits', 'top_up']],
  ['foot_company', ['nav_docs', 'nav_changelog', 'foot_zero']],
];

export function PublicFooter(): ReactElement {
  const [t] = useT();

  return (
    <footer className={styles.footer}>
      <div className={styles.footerGrid}>
        <div>
          <Wordmark size={17} />
          <p className={styles.footerTag}>{t('foot_tag')}</p>
        </div>
        {FOOTER_COLUMNS.map(([heading, items]) => (
          <div key={heading}>
            <div className={styles.footerColTitle}>{t(heading)}</div>
            <div className={styles.footerColLinks}>
              {items.map((item) => (
                <a key={item} href="#">
                  {t(item)}
                </a>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className={styles.footerBottom}>
        <span className={styles.footerCopy}>© 2026 WebAudit AI</span>
        <a href="#" className={styles.footerLink}>
          {t('foot_dashboard')}
        </a>
        <a href="#" className={styles.footerLink}>
          {t('foot_admin')}
        </a>
        <span dir="ltr" className={styles.footerZero}>
          {t('foot_zero')}
        </span>
      </div>
    </footer>
  );
}

export interface PublicPageProps {
  active?: StringKey;
  tint?: string;
  children?: React.ReactNode;
}

export function PublicPage({ active, tint, children }: PublicPageProps): ReactElement {
  return (
    <div className={styles.page} style={tint !== undefined ? { background: tint } : undefined}>
      <PublicHeader {...(active !== undefined ? { active } : {})} />
      <main className={styles.pageMain}>{children}</main>
      <PublicFooter />
    </div>
  );
}
