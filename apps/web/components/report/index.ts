/**
 * T239 — report components, ported from design-system/{components/core,components/report}/.
 *
 * Import from here, not from a component's own file directly — same
 * discipline as apps/web/components/ui/index.ts.
 */
export { SeverityBadge, type SeverityBadgeProps } from './SeverityBadge';
export { AttributionMark, type AttributionMarkProps } from './AttributionMark';
export { ScoreArc, type ScoreArcProps } from './ScoreArc';
export { ModuleStatus, type ModuleStatusProps } from './ModuleStatus';
export { ProgressRow, type ProgressRowProps } from './ProgressRow';
export { IssueCard, type IssueCardProps } from './IssueCard';
export {
  AnnotatedScreenshot,
  type AnnotatedScreenshotProps,
  type ScreenshotAnnotation,
} from './AnnotatedScreenshot';
