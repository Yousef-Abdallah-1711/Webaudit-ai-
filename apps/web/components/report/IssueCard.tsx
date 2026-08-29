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
import { SeverityBadge, type SeverityBadgeProps } from './SeverityBadge';
import { AttributionMark, type AttributionMarkProps } from './AttributionMark';
import styles from './IssueCard.module.css';

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
  const [copied, setCopied] = useState(false);

  function copy(): void {
    setCopied(true);
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
          {copied ? 'Copied' : 'Copy fix prompt'}
        </button>
      )}
    </div>
  );
}
