/**
 * T247 — the generic renderer `Sidebar.jsx`'s `Ico` and `AdminShell.jsx`'s
 * `AIco` each defined locally and identically: 24×24 viewBox, `currentColor`
 * stroke, no fill, round caps and joins. `size` and `strokeWidth` default to
 * the value both source helpers used for nav icons (17px, 1.9) — a caller
 * rendering at a different size (`SeverityBadge`'s badge-scale icons, say)
 * passes its own, the same way the source components already do inline.
 *
 * `aria-hidden="true"`, unlike `SeverityBadge`/`AttributionMark`'s icons:
 * those are direct, named, documented ports of a specific `.jsx` with its own
 * `.d.ts`/`.prompt.md` contract, and adding an attribute the contract never
 * specifies is the same overreach as Button's focus ring. `Ico`/`AIco` were
 * never that — undocumented private helpers local to one file each, being
 * consolidated into new shared infrastructure this task explicitly asks for.
 * Every call site pairs this icon with a visible label, so hiding the
 * decorative glyph from assistive tech is correct markup, not a design
 * decision requiring the same restraint.
 */
import styles from './Icon.module.css';
import { ICON_PATHS, type IconName } from './paths';

export interface IconProps {
  name: IconName;
  size?: number;
  strokeWidth?: number;
  className?: string;
}

export function Icon({
  name,
  size = 17,
  strokeWidth = 1.9,
  className,
}: IconProps): React.ReactElement {
  const classes = [styles.icon, className].filter(Boolean).join(' ');

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={classes}
      aria-hidden="true"
    >
      <path d={ICON_PATHS[name]} />
    </svg>
  );
}
