/**
 * T082 — FR-082: "require a capability to declare its expected consumption, and
 * MUST surface a capability whose real consumption persistently exceeds its
 * declaration."
 *
 * The load-bearing word is **persistently**. One audit of an enormous site will
 * blow any honest estimate, and a report that flags it teaches operators to
 * ignore the report. So drift needs both a sustained ratio and a minimum sample
 * before it says anything at all.
 *
 * **Median, not mean.** A single 50x outlier drags a mean over any threshold and
 * produces exactly the false positive that makes the signal useless. The median
 * moves only when the typical execution has genuinely changed.
 *
 * **Both directions, but only one is a risk.** A capability consuming far less
 * than it declared is over-quoting customers — worth knowing, and reported
 * separately — but it costs the platform nothing and cannot exhaust a budget, so
 * it is never confused with the overshoot FR-082 is about.
 *
 * A declaration of zero is its own case. That is a CODE-layer capability, and
 * Principle III says the code layer costs zero tokens; any consumption is a
 * principle violation rather than drift, and it is named as one on the first
 * sight of spend instead of waiting for a ratio.
 */

export interface CapabilityDrift {
  readonly capabilityId: string;
  readonly declaredTokens: number;
  readonly medianActualTokens: number;
  /** `Infinity` when a zero-token declaration is consuming tokens. */
  readonly ratio: number;
  readonly samples: number;
  readonly direction: 'OVERSHOOT' | 'UNDERSHOOT';
  readonly note: string;
}

export interface ExecutionSample {
  readonly capabilityId: string;
  /** What the manifest declared (FR-020). */
  readonly estimatedTokens: number;
  /** What it actually consumed, successful and failed attempts alike. */
  readonly actualTokens: number;
}

export interface DriftOptions {
  /** Below this many samples, nothing is reported. Default 10. */
  readonly minSamples?: number;
  /** Median ratio at or above which overshoot is surfaced. Default 1.5. */
  readonly overshootRatio?: number;
  /** Median ratio at or below which under-declaration is noted. Default 0.5. */
  readonly undershootRatio?: number;
}

const DEFAULTS = { minSamples: 10, overshootRatio: 1.5, undershootRatio: 0.5 } as const;

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]!
    : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

/**
 * Group samples by capability and report the ones whose typical consumption has
 * drifted from what they declared.
 *
 * @returns only capabilities worth an operator's attention, worst ratio first.
 *   An empty array is the normal, healthy answer.
 */
export function computeDrift(
  samples: readonly ExecutionSample[],
  options: DriftOptions = {},
): readonly CapabilityDrift[] {
  const minSamples = options.minSamples ?? DEFAULTS.minSamples;
  const overshoot = options.overshootRatio ?? DEFAULTS.overshootRatio;
  const undershoot = options.undershootRatio ?? DEFAULTS.undershootRatio;

  const byCapability = new Map<string, ExecutionSample[]>();
  for (const sample of samples) {
    const bucket = byCapability.get(sample.capabilityId);
    if (bucket === undefined) byCapability.set(sample.capabilityId, [sample]);
    else bucket.push(sample);
  }

  const drifts: CapabilityDrift[] = [];
  for (const [capabilityId, bucket] of byCapability) {
    if (bucket.length < minSamples) continue;

    const declared = bucket[0]!.estimatedTokens;
    const medianActual = median(bucket.map((s) => s.actualTokens));

    if (declared === 0) {
      if (medianActual > 0) {
        drifts.push({
          capabilityId,
          declaredTokens: 0,
          medianActualTokens: medianActual,
          ratio: Number.POSITIVE_INFINITY,
          samples: bucket.length,
          direction: 'OVERSHOOT',
          note:
            'This capability declared zero tokens and is consuming them. A CODE-layer ' +
            'capability that calls an LLM violates Principle III; if it has an AI layer, its ' +
            'manifest should declare layer BOTH and a real estimate.',
        });
      }
      continue;
    }

    const ratio = medianActual / declared;
    if (ratio >= overshoot) {
      drifts.push({
        capabilityId,
        declaredTokens: declared,
        medianActualTokens: medianActual,
        ratio,
        samples: bucket.length,
        direction: 'OVERSHOOT',
        note:
          `Typical consumption is ${ratio.toFixed(1)}x the declared estimate across ` +
          `${String(bucket.length)} executions. Correct the manifest or disable the ` +
          'capability (FR-082, FR-086).',
      });
    } else if (ratio <= undershoot) {
      drifts.push({
        capabilityId,
        declaredTokens: declared,
        medianActualTokens: medianActual,
        ratio,
        samples: bucket.length,
        direction: 'UNDERSHOOT',
        note:
          `Typical consumption is ${ratio.toFixed(2)}x the declared estimate. Not a platform ` +
          'cost risk, but the quote shown to customers is higher than it needs to be.',
      });
    }
  }

  return drifts.sort((a, b) => b.ratio - a.ratio);
}
