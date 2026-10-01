import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { PublicPage } from '../public';
import styles from './AuthShell.module.css';

export interface AuthShellProps {
  form: ReactNode;
  context?: ReactNode;
}

/** Shared split layout for the pre-authentication entry pages. */
export function AuthShell({ form, context }: AuthShellProps): React.ReactElement {
  return (
    <PublicPage tint="var(--surface-raised)">
      <div className={styles.layout}>
        <div className={styles.formSlot}>{form}</div>
        {context !== undefined && <div className={styles.contextSlot}>{context}</div>}
      </div>
    </PublicPage>
  );
}

export interface AuthFormPanelProps {
  title: string;
  lead: string;
  children: ReactNode;
  foot?: ReactNode;
}

export function AuthFormPanel({ title, lead, children, foot }: AuthFormPanelProps): React.ReactElement {
  return (
    <section className={styles.formPanel} aria-labelledby="auth-form-title">
      <div className={styles.formInner}>
        <div className={styles.formSurface}>
          <h1 id="auth-form-title" className={styles.formTitle}>{title}</h1>
          <p className={styles.formLead}>{lead}</p>
          {children}
        </div>
        {foot !== undefined && <div className={styles.formFoot}>{foot}</div>}
      </div>
    </section>
  );
}

export interface AuthHeaderProps {
  label: string;
  title: string;
  description: string;
}

/** Header for the illustrative product context, beneath the full public header. */
export function AuthHeader({ label, title, description }: AuthHeaderProps): React.ReactElement {
  return (
    <header className={styles.contextHeader}>
      <p className={styles.sampleLabel}>{label}</p>
      <h2 className={styles.contextTitle}>{title}</h2>
      <p className={styles.contextIntro}>{description}</p>
    </header>
  );
}

type ReadinessStatus = 'pass' | 'blocked' | 'warning';
type ContextAreaKey =
  | 'context_performance'
  | 'context_security'
  | 'context_design'
  | 'context_testing'
  | 'context_search';
const STATUS_COPY: Record<ReadinessStatus, 'context_status_pass' | 'context_status_blocked' | 'context_status_warning'> = {
  pass: 'context_status_pass',
  blocked: 'context_status_blocked',
  warning: 'context_status_warning',
};
const READINESS_AREAS: readonly (readonly [ContextAreaKey, ReadinessStatus])[] = [
  ['context_performance', 'pass'],
  ['context_security', 'pass'],
  ['context_design', 'blocked'],
  ['context_testing', 'pass'],
  ['context_search', 'warning'],
];

export function AuthContextPanel(): React.ReactElement {
  const t = useTranslations('auth');
  return (
    <aside className={styles.contextPanel} aria-label={t('context_title')}>
      <AuthHeader
        label={t('context_sample_label')}
        title={t('context_title')}
        description={t('context_intro')}
      />
      <div className={styles.readiness}>
        <div className={styles.readinessDecision}>
          <span>{t('context_gate')}</span>
          <strong>{t('context_not_ready')}</strong>
        </div>
        <ul className={styles.areaList}>
          {READINESS_AREAS.map(([key, status]) => (
            <li className={styles.area} key={key}>
              <span>{t(key)}</span>
              <span className={`${styles.status} ${styles[status]}`}>{t(STATUS_COPY[status])}</span>
            </li>
          ))}
        </ul>
        <div className={styles.blockers}>
          <h3>{t('context_blockers')}</h3>
          <ul>
            <li>{t('context_blocker_design')}</li>
            <li>{t('context_blocker_search')}</li>
          </ul>
        </div>
      </div>
    </aside>
  );
}

export interface AuthStatusProps {
  children: ReactNode;
}

export function AuthStatus({ children }: AuthStatusProps): React.ReactElement {
  return <div className={styles.statusMessage} role="alert" aria-live="assertive">{children}</div>;
}
