/** Shared state styling for interactive controls on approved Fahes marketing surfaces. */
const marketingInputControlStates = [
  'transition-colors motion-reduce:transition-none',
  'aria-[invalid=true]:border-sev-critical aria-[invalid=true]:hover:border-sev-critical',
  'aria-[invalid=true]:focus:border-sev-critical aria-[invalid=true]:focus-visible:outline-sev-critical',
  'disabled:cursor-not-allowed disabled:opacity-60',
];

export const marketingInputControl = [
  'border-solid border-[color:var(--border-marketing-control)]',
  ...marketingInputControlStates,
  'disabled:hover:border-[color:var(--border-marketing-control)]',
  'bg-surface-marketing-raised text-marketing-primary placeholder:text-marketing-muted',
  'hover:border-brand-electric focus:border-brand-electric focus:shadow-none',
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-electric focus-visible:outline-offset-2',
].join(' ');

/** Dark-scanner fields use the same control boundary and semantic states on a dark inset. */
export const marketingDarkInputControl = [
  'border-solid border-[color:var(--border-marketing-scanner)]',
  ...marketingInputControlStates,
  'disabled:hover:border-[color:var(--border-marketing-scanner)]',
  'border',
  'bg-surface-dark text-marketing-inverse placeholder:text-marketing-inverse-muted',
  'hover:border-brand-marketing focus:border-brand-marketing focus:shadow-none',
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-highlight focus-visible:outline-offset-2',
].join(' ');
