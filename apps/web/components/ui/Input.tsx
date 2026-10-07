/**
 * Ported from design-system/components/core/Input.jsx (T237).
 *
 * Focus moved from `useState` + `onFocus`/`onBlur` to CSS `:focus` — the same
 * kind of state-to-CSS conversion T237 calls out for Button, applied here for
 * the same reason: `Input.prompt.md` says "focus is a 1px #fa7014 ring and
 * nothing else", which `:focus` alone is enough to express.
 */
import type { ChangeEventHandler, HTMLInputTypeAttribute } from 'react';
import { cn } from '../../lib/cn';

export interface InputProps {
  /** Inline prefix, e.g. "https://" — reserves the measured 64px left padding */
  prefix?: string;
  placeholder?: string;
  autoComplete?: string;
  value?: string;
  onChange?: ChangeEventHandler<HTMLInputElement>;
  type?: HTMLInputTypeAttribute;
  fullWidth?: boolean;
  /** Red hairline border; pair with a message, never colour alone */
  invalid?: boolean;
  /** Disabled controls stay recognizable while refusing input. */
  disabled?: boolean;
  /** Additional semantic surface/state classes for a composed input. */
  className?: string;
  /** Mono face for machine-truth values (headers, selectors, paths) */
  mono?: boolean;
  readOnly?: boolean;
  dir?: 'ltr' | 'rtl' | 'auto';
  /** For an input with no visible, associated `<label>` — e.g. login's password field. */
  'aria-label'?: string;
}

export function Input({
  prefix,
  placeholder,
  value,
  onChange,
  type = 'text',
  fullWidth = true,
  invalid = false,
  disabled = false,
  mono = false,
  readOnly = false,
  className,
  ...rest
}: InputProps): React.ReactElement {
  const wrapClasses = cn('relative', fullWidth && 'w-full');
  const fieldClasses = cn(
    // eslint-disable-next-line no-restricted-syntax -- 14px is the existing Input text size
    'box-border h-12 w-full rounded-control border border-hairline border-solid border-border-subtle bg-surface-field px-3 py-1 font-sans text-[14px] text-text-primary outline-none transition-colors focus:shadow-focus',
    prefix !== undefined && 'ps-16',
    mono && 'font-mono',
    className,
    invalid && 'border-sev-critical',
  );

  return (
    <div className={wrapClasses}>
      {prefix !== undefined && (
        <span className="pointer-events-none absolute start-3 top-0 flex h-12 items-center font-mono type-small text-text-muted">
          {prefix}
        </span>
      )}
      <input
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        disabled={disabled}
        aria-invalid={invalid || undefined}
        readOnly={readOnly}
        className={fieldClasses}
        {...rest}
      />
    </div>
  );
}
