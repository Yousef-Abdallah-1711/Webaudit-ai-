'use client';

/**
 * Ported from design-system/components/report/IssueCard.jsx (T133).
 *
 * IssueCard.prompt.md: "Copy-the-fix-prompt is a real, always-visible
 * button — it is the most-used control in the product and must never be a
 * hover-revealed icon." Nothing here gates it behind `:hover` or a tooltip;
 * it renders whenever `prompt` is present, exactly like the source.
 *
 * `AttributionMark` is placed the same way the source does — pushed to the
 * end of the header row — never inside a `title`-only or hover-revealed
 * wrapper, per its own `.prompt.md` (FR-032: 100% of delivered issues must
 * carry visible attribution).
 */
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { SeverityBadge, type SeverityBadgeProps } from './SeverityBadge';
import { AttributionMark, type AttributionMarkProps } from './AttributionMark';
const styles = {
  card: 'bg-surface-card border border-solid border-hairline border-border-default !border-s-[0.1875rem] border-s-transparent rounded-card px-5 py-[1.125rem] font-sans',
  head: 'flex items-center gap-[0.625rem] mb-[0.625rem] flex-wrap',
  area: 'font-sans text-[0.875rem] leading-5 font-normal text-text-muted',
  attribution: 'ms-auto',
  title: 'text-[1.0625rem] font-semibold text-text-strong mb-1.5',
  location: 'font-mono text-[0.8125rem] text-text-zinc mb-[0.625rem] break-all',
  description: 'm-0 mb-[0.875rem] font-sans text-[0.875rem] leading-5 font-normal text-text-secondary max-w-[62ch] text-pretty',
  copyBtn: 'h-9 px-4 rounded-control border border-solid border-hairline border-border-default bg-surface-page text-text-primary font-sans text-[0.875rem] font-medium cursor-pointer transition-colors',
  copyBtnCopied: '!bg-sev-resolved-bg !text-sev-resolved',
} as const;

const SEVERITY_RULE: Record<NonNullable<SeverityBadgeProps['level']>, string> = {
  critical: 'var(--sev-critical)',
  high: 'var(--sev-high)',
  medium: 'var(--sev-medium)',
  low: 'var(--sev-low)',
  info: 'var(--sev-info)',
  resolved: 'var(--sev-resolved)',
};

export interface IssueCardProps {
  severity?: SeverityBadgeProps['level'];
  title: string;
  /** Selector, header name, or file path — rendered in mono */
  location?: string;
  description?: string;
  /** FR-032: required on every delivered issue */
  attribution?: AttributionMarkProps['kind'];
  /** The paste-ready remediation prompt; presence renders the copy button */
  prompt?: string;
  area?: string;
  onCopy?: (prompt: string) => void;
}

export function IssueCard({
  severity = 'high',
  title,
  location,
  description,
  attribution = 'measured',
  prompt,
  area,
  onCopy,
}: IssueCardProps): React.ReactElement {
  const t = useTranslations('reports');
  const [copied, setCopied] = useState(false);

  function copy(): void {
    setCopied(true);
    void navigator.clipboard?.writeText(prompt ?? '').catch(() => {
      // Clipboard permission can be denied; the prompt remains selectable in the card.
    });
    onCopy?.(prompt ?? '');
    setTimeout(() => {
      setCopied(false);
    }, 1600);
  }

  return (
    <div className={styles.card} style={{ borderInlineStartColor: SEVERITY_RULE[severity] }}>
      <div className={styles.head}>
        <SeverityBadge level={severity} />
        {area !== undefined && <span className={styles.area}>{area}</span>}
        <span className={styles.attribution}>
          <AttributionMark kind={attribution} />
        </span>
      </div>
      <div className={styles.title}>{title}</div>
      {location !== undefined && (
        <div dir="ltr" className={styles.location}>
          {location}
        </div>
      )}
      {description !== undefined && <p className={styles.description}>{description}</p>}
      {prompt !== undefined && prompt !== '' && (
        <button
          type="button"
          onClick={copy}
          className={copied ? `${styles.copyBtn} ${styles.copyBtnCopied}` : styles.copyBtn}
        >
          {copied ? t('report_copied') : t('report_copy_prompt')}
        </button>
      )}
    </div>
  );
}
