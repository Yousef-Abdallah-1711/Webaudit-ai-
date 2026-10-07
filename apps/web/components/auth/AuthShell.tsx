import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import styles from './AuthShell.special.module.css';

export interface AuthShellProps {
  form: ReactNode;
  context?: ReactNode;
}

/** Shared split layout for the pre-authentication entry pages. */
export function AuthShell({ form, context }: AuthShellProps): React.ReactElement {
  return (
    <div
      className={`grid grid-cols-[minmax(0,0.46fr)_minmax(0,0.54fr)] [grid-template-areas:'context_form'] items-stretch gap-12 w-full ${context === undefined ? 'max-w-[42rem]' : 'max-w-app-shell'} min-h-[36rem] mx-auto py-12 px-6 ${styles.rtlLayout}${context === undefined ? ` ${styles.rtlSingleColumn} grid-cols-[minmax(0,1fr)] [grid-template-areas:'form']` : ''} max-auth-collapse:grid-cols-[minmax(0,1fr)] max-auth-collapse:[grid-template-areas:'form'_'context'] max-auth-collapse:gap-8 max-auth-collapse:min-h-0 max-auth-collapse:max-w-[42rem] max-auth-collapse:py-8 max-md:py-6 max-md:px-4 max-sm:[&_.formSurface]:p-6 max-auth-compact:[&_.formSurface]:p-4`}
    >
      <div className="[grid-area:form] flex min-w-0 items-center justify-center">{form}</div>
      {context !== undefined && (
        <div className="[grid-area:context] flex min-w-0 items-center max-md:hidden">{context}</div>
      )}
    </div>
  );
}

export interface AuthFormPanelProps {
  title?: string;
  lead?: string;
  children?: ReactNode;
  foot?: ReactNode;
}

export function AuthFormPanel({
  title,
  lead,
  children,
  foot,
}: AuthFormPanelProps): React.ReactElement {
  return (
    <section
      className="w-full max-w-md max-auth-collapse:max-w-none"
      {...(title !== undefined ? { 'aria-labelledby': 'auth-form-title' } : {})}
    >
      <div className="w-full">
        <div className="formSurface rounded-marketing-card border-solid border-hairline border-border-marketing bg-surface-marketing-raised p-8">
          {title !== undefined && (
            <h1
              id="auth-form-title"
              className="m-0 mb-2 text-marketing-demo-heading font-marketing font-extrabold text-marketing-primary"
            >
              {title}
            </h1>
          )}
          {lead !== undefined && (
            <p className="m-0 mb-6 text-marketing-body font-marketing text-marketing-secondary text-pretty">
              {lead}
            </p>
          )}
          {children}
        </div>
        {foot !== undefined && (
          <div className="mt-4 text-center text-marketing-body font-marketing text-marketing-secondary [&_a]:text-brand-marketing-contrast">
            {foot}
          </div>
        )}
      </div>
    </section>
  );
}

export interface AuthContextHeaderProps {
  label: string;
  title: string;
  description: string;
}

/** Heading for the illustrative product context panel. */
export function AuthContextHeader({
  label,
  title,
  description,
}: AuthContextHeaderProps): React.ReactElement {
  return (
    <header className="mb-6">
      <p className="m-0 text-marketing-label font-marketing font-semibold text-marketing-inverse-muted">
        {label}
      </p>
      <h2 className="m-0 mt-4 text-marketing-demo-heading font-marketing font-extrabold text-marketing-inverse text-balance">
        {title}
      </h2>
      <p className="m-0 mt-3 text-marketing-body font-marketing text-marketing-inverse-muted text-pretty">
        {description}
      </p>
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
const STATUS_COPY: Record<
  ReadinessStatus,
  'context_status_pass' | 'context_status_blocked' | 'context_status_warning'
> = {
  pass: 'context_status_pass',
  blocked: 'context_status_blocked',
  warning: 'context_status_warning',
};
const STATUS_CLASSES: Record<ReadinessStatus, string> = {
  pass: 'bg-sev-resolved-bg text-sev-resolved',
  blocked: 'bg-sev-high-bg text-sev-high',
  warning: 'bg-sev-medium-bg text-sev-medium',
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
    <aside
      className="mx-auto w-full max-w-[34rem] rounded-marketing-card bg-surface-hero p-8 text-marketing-inverse max-auth-collapse:max-w-none"
      aria-label={t('context_title')}
    >
      <AuthContextHeader
        label={t('context_sample_label')}
        title={t('context_title')}
        description={t('context_intro')}
      />
      <div className="rounded-marketing-principle border border-solid border-border-marketing-evidence bg-surface-marketing-raised p-5 text-marketing-primary">
        <div className="flex flex-wrap items-center justify-between gap-3 border-solid border-x-0 border-t-0 border-b-hairline border-border-marketing-evidence pb-3 text-marketing-body font-marketing font-semibold text-marketing-secondary">
          <span>{t('context_gate')}</span>
          <strong className="text-sev-high">{t('context_not_ready')}</strong>
        </div>
        <ul className="m-0 list-none p-0">
          {READINESS_AREAS.map(([key, status]) => (
            <li
              className="flex min-w-0 flex-wrap items-center justify-between gap-3 border-solid border-x-0 border-t-0 border-b-hairline border-border-marketing-evidence py-2 text-marketing-body font-marketing"
              key={key}
            >
              <span className="min-w-0 [overflow-wrap:anywhere]">{t(key)}</span>
              <span
                className={`shrink-0 rounded-pill px-2 py-1 text-marketing-description font-marketing font-semibold ${STATUS_CLASSES[status]}`}
              >
                {t(STATUS_COPY[status])}
              </span>
            </li>
          ))}
        </ul>
        <div className="pt-4 text-marketing-body font-marketing">
          <h3 className="m-0 text-marketing-trust-heading font-marketing font-bold text-marketing-primary">
            {t('context_blockers')}
          </h3>
          <ul className="m-0 mt-3 grid list-none gap-2 p-0 text-sev-high">
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
  return (
    <div
      className="text-marketing-body font-marketing text-sev-critical"
      role="alert"
      aria-live="assertive"
    >
      {children}
    </div>
  );
}
