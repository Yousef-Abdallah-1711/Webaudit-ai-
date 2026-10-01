'use client';

/**
 * T128 — shared auth form primitives (`Field` and `Divider`).
 *
 * Ported from `AuthFrame`/`Field`/`Divider` in `design-system/ui_kits/
 * marketing/AuthPages.jsx`. The page frame moved into `AuthShell`; these
 * helpers remain together because they are small shared form primitives
 * used across the auth routes.
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
