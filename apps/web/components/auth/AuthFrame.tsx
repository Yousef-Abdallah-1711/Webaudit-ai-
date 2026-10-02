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

export interface FieldProps extends InputProps {
  label: string;
}

export function Field({ label, ...rest }: FieldProps): React.ReactElement {
  const inputProps = {
    ...rest,
    ...(rest.type === 'email' ? { dir: 'ltr' as const } : {}),
  };

  return (
    <label className="block">
      <div className="mb-1.5 type-small !font-medium text-text-primary">{label}</div>
      <Input {...inputProps} />
    </label>
  );
}

export function Divider(): React.ReactElement {
  const t = useTranslations('auth');
  return (
    <div className="my-5 flex items-center gap-3">
      <div className="h-px flex-1 bg-border-default" />
      <span className="type-small text-text-muted">{t('or')}</span>
      <div className="h-px flex-1 bg-border-default" />
    </div>
  );
}
