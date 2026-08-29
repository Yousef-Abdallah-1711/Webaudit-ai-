/**
 * T110 — FR-011: "Users MUST be able to choose which audit areas to run, and
 * MUST be shown the exact credit cost of that selection before work begins."
 *
 * A thin wrapper over `@webaudit/config`'s `quoteAreas` — the pricing table
 * itself (`AREA_COST`, the bundle discount) already exists and is already
 * correct; this is the seam `POST /scans/quote` (T112) calls, and the same
 * seam `createScan` (T111) re-derives from to check `acceptedQuote` against
 * the *current* price rather than trusting whatever the client sent.
 *
 * No validation here: `modules` arriving non-empty is `POST /scans/quote`'s
 * own Zod schema's job (a boundary check, per CLAUDE.md's "validate at every
 * boundary"), not this function's — this is an internal service call, not a
 * boundary.
 */
import { quoteAreas } from '@webaudit/config';
import type { ModuleType } from '@webaudit/types';

export interface Quote {
  readonly credits: number;
  /** Deduplicated, in the order `quoteAreas` itself treats them. */
  readonly modules: readonly ModuleType[];
}

export function quoteFor(modules: readonly ModuleType[]): Quote {
  const unique = [...new Set(modules)];
  return { credits: quoteAreas(unique), modules: unique };
}
