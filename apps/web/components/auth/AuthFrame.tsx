'use client';

/**
 * T128 — the shared frame the 5 auth pages sit inside.
 *
 * Ported from `AuthFrame`/`Field`/`Divider` in `design-system/ui_kits/
 * marketing/AuthPages.jsx` — internal helpers in the source file rather than
 * separately documented components, but real ports rather than authored
 * fresh: same 420px card centered in a tinted `PublicPage`, same label-above-
 * input field wrapper, same "or" divider.
 */
import { useTranslations } from 'next-intl';
import { Input, type InputProps } from '../ui';
import styles from './AuthFrame.module.css';

export interface FieldProps extends InputProps {
  label: string;
}

export function Field({ label, ...rest }: FieldProps): React.ReactElement {
  const inputProps = {
    ...rest,
    ...(rest.type === 'email' ? { dir: 'ltr' as const } : {}),
  };

  return (
    <label className={styles.field}>
      <div className={styles.fieldLabel}>{label}</div>
      <Input {...inputProps} />
    </label>
  );
}

export function Divider(): React.ReactElement {
  const t = useTranslations('auth');
  return (
    <div className={styles.divider}>
      <div className={styles.dividerLine} />
      <span className={styles.dividerText}>{t('or')}</span>
      <div className={styles.dividerLine} />
    </div>
  );
}
