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
import type { ReactNode } from 'react';
import { Card, Input, type InputProps } from '../ui';
import { PublicPage } from '../public';
import { useT } from '../../app/theme';
import styles from './AuthFrame.module.css';

export interface AuthFrameProps {
  title: string;
  lead?: string;
  children?: ReactNode;
  foot?: ReactNode;
}

export function AuthFrame({ title, lead, children, foot }: AuthFrameProps): React.ReactElement {
  const [, lang] = useT();

  return (
    <PublicPage tint="var(--surface-raised)">
      <div dir={lang === 'ar' ? 'ltr' : undefined} className={styles.wrap}>
        <div className={styles.inner}>
          <Card padding={30}>
            <h1 className={styles.title}>{title}</h1>
            {lead !== undefined && <p className={styles.lead}>{lead}</p>}
            {children}
          </Card>
          {foot !== undefined && <div className={styles.foot}>{foot}</div>}
        </div>
      </div>
    </PublicPage>
  );
}

export interface FieldProps extends InputProps {
  label: string;
}

export function Field({ label, ...rest }: FieldProps): React.ReactElement {
  return (
    <label className={styles.field}>
      <div className={styles.fieldLabel}>{label}</div>
      <Input {...rest} />
    </label>
  );
}

export function Divider(): React.ReactElement {
  const [t] = useT();
  return (
    <div className={styles.divider}>
      <div className={styles.dividerLine} />
      <span className={styles.dividerText}>{t('auth_or')}</span>
      <div className={styles.dividerLine} />
    </div>
  );
}
