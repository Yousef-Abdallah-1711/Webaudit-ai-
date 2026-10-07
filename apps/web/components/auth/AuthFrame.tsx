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
import { Button, Input, type ButtonProps, type InputProps } from '../ui';
import { cn } from '../../lib/cn';
import { focusRingBrand, marketingPrimaryCta } from '../../lib/marketing-cta';
import { marketingInputControl } from '../../lib/marketing-controls';

/** Auth actions reuse the public CTA recipe and keep a visible brand focus ring. */
export function AuthPrimaryButton(props: ButtonProps): React.ReactElement {
  return (
    <Button
      {...props}
      variant="primary"
      className={cn(marketingPrimaryCta, focusRingBrand, props.className)}
    />
  );
}

/** Secondary auth actions share the public control border and keyboard focus treatment. */
export function AuthSecondaryButton(props: ButtonProps): React.ReactElement {
  return (
    <Button
      {...props}
      variant="secondary"
      className={cn(
        'border-[color:var(--border-marketing-control)] bg-surface-marketing-raised font-marketing text-marketing-primary [&:hover:not(:disabled)]:bg-surface-marketing [&:hover:active:not(:disabled)]:bg-surface-raised',
        focusRingBrand,
        props.className,
      )}
    />
  );
}

/** Auth fields use the same semantic resting, hover, focus and invalid states as the public scanner. */
export function AuthInput({ className, ...props }: InputProps): React.ReactElement {
  return <Input {...props} className={cn('font-marketing', marketingInputControl, className)} />;
}

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
      <div className="mb-1.5 text-marketing-body font-marketing font-medium text-marketing-primary">
        {label}
      </div>
      <AuthInput {...inputProps} />
    </label>
  );
}

export function Divider(): React.ReactElement {
  const t = useTranslations('auth');
  return (
    <div className="my-5 flex items-center gap-3">
      <div className="h-px flex-1 bg-border-marketing" />
      <span className="text-marketing-description font-marketing text-marketing-muted">
        {t('or')}
      </span>
      <div className="h-px flex-1 bg-border-marketing" />
    </div>
  );
}
