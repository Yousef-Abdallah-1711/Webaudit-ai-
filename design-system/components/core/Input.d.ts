import * as React from 'react';
/** 48px field with a hairline border and a 64px left inset when a prefix affordance is shown. */
export interface InputProps {
  /** Inline prefix, e.g. "https://" — reserves the measured 64px left padding */
  prefix?: string;
  placeholder?: string;
  value?: string;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  type?: string;
  fullWidth?: boolean;
  /** Red hairline border; pair with a message, never colour alone */
  invalid?: boolean;
  /** Mono face for machine-truth values (headers, selectors, paths) */
  mono?: boolean;
}
export function Input(props: InputProps): JSX.Element;
