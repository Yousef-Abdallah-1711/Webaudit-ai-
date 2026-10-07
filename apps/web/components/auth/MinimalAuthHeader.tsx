'use client';

import { Wordmark } from '../public';
import { LangToggle, ThemeToggle } from '../../app/theme';

/**
 * Focused auth navigation uses the public brand and controls without duplicating
 * the sign-in/signup actions or opening the public mobile navigation drawer.
 */
export function MinimalAuthHeader(): React.ReactElement {
  return (
    <header className="relative z-20 bg-surface-marketing">
      <div className="mx-auto flex h-[var(--height-landing-header)] w-[calc(100%-4rem)] max-w-marketing-header items-center justify-between gap-3 text-marketing-primary max-marketing-mobile:w-[calc(100%-2rem)]">
        <a
          href="/"
          className="inline-flex py-3 -my-3 no-underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-marketing"
        >
          <Wordmark />
        </a>
        <div className="flex items-center gap-2">
          <LangToggle className="text-marketing-primary hover:bg-surface-marketing-raised focus-visible:outline-brand-marketing" />
          <ThemeToggle className="text-marketing-primary hover:bg-surface-marketing-raised focus-visible:outline-brand-marketing" />
        </div>
      </div>
    </header>
  );
}
