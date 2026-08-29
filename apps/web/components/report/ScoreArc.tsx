'use client';

/**
 * Ported from design-system/components/report/ScoreArc.jsx.
 *
 * T240, folded in ahead of T131 by explicit user decision (tasks.md):
 * Landing.jsx's Proof() section renders this directly, so the landing page
 * cannot be faithfully ported without it.
 *
 * ScoreArc.prompt.md: "It animates exactly once and respects
 * prefers-reduced-motion by rendering the final value immediately." The
 * rAF count-up is unchanged from the source — guarded on both
 * prefers-reduced-motion and requestAnimationFrame existing at all, and the
 * measured `score` is always what ends up rendered even if the animation
 * never runs (the source's own comment: "a throttled or never-firing rAF
 * can only cost the animation — never the number").
 */
import { useEffect, useState } from 'react';
import styles from './ScoreArc.module.css';

export interface ScoreArcProps {
  /** 0–100 */
  score: number;
  /** Change against the baseline scan, e.g. +23. Omit when there is no baseline. */
  delta?: number | null;
  size?: number;
  label?: string;
}

function band(score: number): string {
  if (score >= 85) return 'var(--sev-resolved)';
  if (score >= 70) return 'var(--sev-low)';
  if (score >= 50) return 'var(--sev-medium)';
  if (score >= 30) return 'var(--sev-high)';
  return 'var(--sev-critical)';
}

export function ScoreArc({
  score,
  delta = null,
  size = 180,
  label = 'Health score',
}: ScoreArcProps): React.ReactElement {
  const [v, setV] = useState(score);

  useEffect(() => {
    setV(score);
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (typeof requestAnimationFrame !== 'function') return;
    const t0 = performance.now();
    const duration = 600;
    let raf = 0;
    let done = false;
    const step = (t: number): void => {
      const p = Math.min(1, (t - t0) / duration);
      setV(Math.round(score * (1 - Math.pow(1 - p, 3))));
      if (p < 1 && !done) {
        raf = requestAnimationFrame(step);
      } else {
        setV(score);
      }
    };
    raf = requestAnimationFrame(step);
    return () => {
      done = true;
      cancelAnimationFrame(raf);
    };
  }, [score]);

  const r = (size - 16) / 2;
  const c = Math.PI * r * 1.5;
  const off = c * (1 - v / 100);
  const height = size * 0.78;

  return (
    <div className={styles.wrap} style={{ width: size }}>
      <svg width={size} height={height} viewBox={`0 0 ${size} ${height}`}>
        <g transform={`rotate(135 ${size / 2} ${size / 2})`}>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="var(--border-default)"
            strokeWidth="8"
            strokeDasharray={`${c} 999`}
            strokeLinecap="butt"
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={band(score)}
            strokeWidth="8"
            strokeDasharray={`${c} 999`}
            strokeDashoffset={off}
            strokeLinecap="butt"
          />
        </g>
        <text
          x={size / 2}
          y={size * 0.46}
          textAnchor="middle"
          fontFamily="var(--font-sans)"
          fontSize={size * 0.3}
          fontWeight="700"
          fill="var(--text-strong)"
          className={styles.value}
        >
          {v}
        </text>
        {delta !== null && (
          <text
            x={size / 2}
            y={size * 0.62}
            textAnchor="middle"
            fontFamily="var(--font-mono)"
            fontSize="13"
            fill={delta >= 0 ? 'var(--sev-resolved)' : 'var(--sev-critical)'}
          >
            {delta >= 0 ? '+' : ''}
            {delta} vs baseline
          </text>
        )}
      </svg>
      <div className={styles.label}>{label}</div>
    </div>
  );
}
