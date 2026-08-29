/**
 * T143 — AnnotatedScreenshot: findings marked on a captured page.
 *
 * **Original design, not a port — a documented exception, not a
 * precedent.** `design/screen-map.md` recorded "No artboard" for this
 * surface through T142, and the constitution's Design Adherence section is
 * explicit: "A surface with no entry in `design/screen-map.md` has no
 * approved design. It MUST NOT be invented — request a design instead."
 * Two things happened before this file did: a full content search of
 * `design-system/` (including its machine-generated `_ds_manifest.json`,
 * the authoritative component inventory) turned up nothing resembling a
 * screenshot-with-markers surface, and the user then explicitly authorized
 * an original design for this one surface — the constitution's own
 * governance clause for this ("deviating from a principle requires a
 * documented exception... and an issue to remove it"). See `research.md`'s
 * decision record for the full account. This is not licence to invent any
 * other surface; the next blocked one still gets asked about, not guessed.
 *
 * **Reuses everything that already exists rather than inventing more than
 * this one gap requires**: severity tokens and `SeverityBadge` exactly as
 * `IssueCard` (T133) does, and the same "never hide meaningful content
 * behind hover" principle `IssueCard.prompt.md` and `AttributionMark.
 * prompt.md` both state explicitly for their own surfaces — every
 * annotation is listed in an always-visible legend below the image, never
 * only as a hover tooltip on a pin.
 *
 * **Not wired into the live report page.** No scan populates a screenshot
 * today — `CapabilityInput.screenshot` has no producer
 * (`screenshot-capture`'s own module note, T139) and no finding carries
 * positional data (`CapabilityFinding.location` is free text, never a
 * coordinate). Wiring this component in belongs with whatever task builds
 * the screenshot capture → storage → report pipeline; inventing that
 * pipeline here would be exactly the ahead-of-signal work
 * `capability-loader.ts`'s own note already declined to do for T116's
 * browser-pool transport, for the same reason.
 */
import type { SeverityBadgeProps } from './SeverityBadge';
import { SeverityBadge } from './SeverityBadge';
import styles from './AnnotatedScreenshot.module.css';

type Severity = NonNullable<SeverityBadgeProps['level']>;

const PIN_COLOR: Record<Severity, string> = {
  critical: 'var(--sev-critical)',
  high: 'var(--sev-high)',
  medium: 'var(--sev-medium)',
  low: 'var(--sev-low)',
  info: 'var(--sev-info)',
  resolved: 'var(--sev-resolved)',
};

const PIN_BACKGROUND: Record<Severity, string> = {
  critical: 'var(--sev-critical-bg)',
  high: 'var(--sev-high-bg)',
  medium: 'var(--sev-medium-bg)',
  low: 'var(--sev-low-bg)',
  info: 'var(--sev-info-bg)',
  resolved: 'var(--sev-resolved-bg)',
};

export interface ScreenshotAnnotation {
  readonly id: string;
  /** Position within the screenshot, as a percentage (0-100) — correct at any render size. */
  readonly xPercent: number;
  readonly yPercent: number;
  readonly severity: Severity;
  readonly title: string;
  readonly description?: string;
}

export interface AnnotatedScreenshotProps {
  /** Absent until the screenshot pipeline exists — renders the unavailable state. */
  screenshotUrl?: string;
  annotations?: readonly ScreenshotAnnotation[];
  /** Required: describes the captured page for anyone not seeing the image. */
  alt: string;
}

export function AnnotatedScreenshot({
  screenshotUrl,
  annotations = [],
  alt,
}: AnnotatedScreenshotProps): React.ReactElement {
  return (
    <div className={styles.wrapper}>
      <div className={styles.heading}>Page screenshot</div>
      {screenshotUrl === undefined ? (
        <p className={styles.unavailable}>Screenshot capture is not available for this scan yet.</p>
      ) : (
        <>
          <div className={styles.frame}>
            {/* A scan-supplied R2 URL, not a static asset next/image needs to optimise. */}
            <img src={screenshotUrl} alt={alt} className={styles.image} />
            {annotations.map((annotation, index) => (
              <span
                key={annotation.id}
                className={styles.pin}
                style={{
                  insetInlineStart: `${String(annotation.xPercent)}%`,
                  insetBlockStart: `${String(annotation.yPercent)}%`,
                  borderColor: PIN_COLOR[annotation.severity],
                  color: PIN_COLOR[annotation.severity],
                  background: PIN_BACKGROUND[annotation.severity],
                }}
                aria-hidden="true"
              >
                {index + 1}
              </span>
            ))}
          </div>
          {annotations.length > 0 && (
            <ol className={styles.legend}>
              {annotations.map((annotation, index) => (
                <li key={annotation.id} className={styles.legendItem}>
                  <span className={styles.legendNumber}>{index + 1}</span>
                  <SeverityBadge level={annotation.severity} />
                  <span className={styles.legendTitle}>{annotation.title}</span>
                  {annotation.description !== undefined && (
                    <p className={styles.legendDescription}>{annotation.description}</p>
                  )}
                </li>
              ))}
            </ol>
          )}
        </>
      )}
    </div>
  );
}
