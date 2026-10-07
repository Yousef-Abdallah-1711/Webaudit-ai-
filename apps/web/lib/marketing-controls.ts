/** Shared state styling for interactive controls on approved Fahes marketing surfaces. */
export const marketingInputControl = [
  'border-solid border-[color:var(--border-marketing-control)]',
  'bg-surface-marketing-raised text-marketing-primary placeholder:text-marketing-muted',
  'transition-colors motion-reduce:transition-none',
  'hover:border-brand-electric focus:border-brand-electric focus:shadow-none',
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-electric focus-visible:outline-offset-2',
  'aria-[invalid=true]:border-sev-critical aria-[invalid=true]:hover:border-sev-critical',
  'aria-[invalid=true]:focus:border-sev-critical aria-[invalid=true]:focus-visible:outline-sev-critical',
  'disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:border-[color:var(--border-marketing-control)]',
].join(' ');
