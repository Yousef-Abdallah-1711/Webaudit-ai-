'use client';

import { Wordmark } from '../public';
import { LangToggle, ThemeToggle } from '../../app/theme';

/** Focused auth navigation with only the home wordmark and display controls. */
export function MinimalAuthHeader(): React.ReactElement {
  return (
    <header className="relative z-[1] border-solid border-x-0 border-t-0 border-b-hairline border-border-default bg-surface-page">
      <div className="mx-auto flex min-h-control w-full max-w-app-shell items-center justify-between gap-3 px-6 max-sm:px-4">
        <a href="/" className="no-underline">
          <Wordmark />
        </a>
        <div className="flex items-center gap-2">
          <LangToggle />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
