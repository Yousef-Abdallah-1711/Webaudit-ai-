/**
 * Ported from design-system/components/core/Input.jsx (T237).
 *
 * Focus moved from `useState` + `onFocus`/`onBlur` to CSS `:focus` — the same
 * kind of state-to-CSS conversion T237 calls out for Button, applied here for
 * the same reason: `Input.prompt.md` says "focus is a 1px #fa7014 ring and
 * nothing else", which `:focus` alone is enough to express.
 */
import type { ChangeEventHandler, HTMLInputTypeAttribute } from 'react';
import styles from './Input.module.css';

export interface InputProps {
  /** Inline prefix, e.g. "https://" — reserves the measured 64px left padding */
  prefix?: string;
  placeholder?: string;
  value?: string;
  onChange?: ChangeEventHandler<HTMLInputElement>;
  type?: HTMLInputTypeAttribute;
  fullWidth?: boolean;
  /** Red hairline border; pair with a message, never colour alone */
  invalid?: boolean;
  /** Mono face for machine-truth values (headers, selectors, paths) */
  mono?: boolean;
}

export function Input({
  prefix,
  placeholder,
  value,
  onChange,
  type = 'text',
  fullWidth = true,
  invalid = false,
  mono = false,
  ...rest
}: InputProps): React.ReactElement {
  const wrapClasses = [styles.wrap, fullWidth ? styles.fullWidth : undefined]
    .filter(Boolean)
    .join(' ');
  const fieldClasses = [
    styles.field,
    prefix !== undefined ? styles.withPrefix : undefined,
    invalid ? styles.invalid : undefined,
    mono ? styles.mono : undefined,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={wrapClasses}>
      {prefix !== undefined && <span className={styles.prefix}>{prefix}</span>}
      <input
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        className={fieldClasses}
        {...rest}
      />
    </div>
  );
}
