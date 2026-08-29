/**
 * T064 — the manifest schema.
 *
 * FR-020: the audit areas, input needs, and cost estimate of a capability are
 * discovered "from the capability itself, rather than from configuration held
 * elsewhere". This file is that self-description, and its validator.
 *
 * **Trust is not here, and its absence is the point.**
 *
 * `CapabilityManifest` has no `trust` field, and `manifestSchema` is not
 * `.strict()`, so a manifest that ships `"trust": "VENDORED"` validates
 * successfully and the claim is *dropped* — Zod strips unknown keys. That is
 * exactly what the contract asks for: "A manifest claiming trust is ignored."
 *
 * Ignoring rather than rejecting is a deliberate choice and worth defending.
 * Rejecting would be louder, and louder is usually better — but it would make a
 * self-declared `"trust"` key a denial-of-registration for the capability next
 * to it in the same store, and it would tempt someone to add the field to the
 * type "so validation can check it". Once the field exists on the type it will
 * eventually be read. There is no field, so there is nothing to read: trust is
 * assigned by `discover.ts` from the directory the manifest was found in, and
 * `parseManifest` cannot return it even if asked.
 *
 * `assertNoTrustClaim` exists so the attempt is still *visible*. Discovery calls
 * it and logs, because a capability trying to declare itself trusted is a signal
 * about that capability, even though it changes nothing.
 */

import { z } from 'zod';
import { CAPABILITY_LAYERS, CONTROL_LEVELS, MODULE_TYPES } from '@webaudit/types';

/**
 * A capability id is a directory name and a database primary key, so it is
 * constrained to what is safe as both. No dots, no slashes, no leading dash —
 * `..` as an id would make the discovery path traversal-shaped.
 */
const CAPABILITY_ID = /^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/;

/** Semver, loosely: three numeric parts and an optional pre-release tag. */
const VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

export const manifestSchema = z.object({
  id: z.string().regex(CAPABILITY_ID, 'lowercase letters, digits and hyphens; 3-64 characters'),
  name: z.string().min(1).max(200),
  version: z.string().regex(VERSION, 'must be a three-part version'),
  module: z.enum(MODULE_TYPES),
  layer: z.enum(CAPABILITY_LAYERS),
  /**
   * Where the entry module is, relative to the capability directory. Validated
   * as a relative path that cannot climb out: an entrypoint of
   * `../../../api/src/index.js` would have the registry load core code as a
   * capability.
   */
  entrypoint: z
    .string()
    .min(1)
    .max(512)
    .refine((p) => !p.startsWith('/') && !/^[A-Za-z]:/.test(p), 'must be relative')
    .refine((p) => !p.split(/[/\\]/).includes('..'), 'must not contain ".."'),
  requiresCode: z.boolean().default(false),
  requiresScreenshot: z.boolean().default(false),
  /** Gates load generation. Compared against the target's level, never trusted upward. */
  requiredControlLevel: z.enum(CONTROL_LEVELS).default('NONE'),
  /**
   * FR-082 measures this against reality. A CODE-layer capability declaring
   * anything above zero is a contradiction — the code layer costs no tokens
   * (Principle III) — so it is refused here rather than discovered in a
   * cost report three months later.
   */
  estimatedTokens: z.number().int().min(0).max(1_000_000).default(0),
  /** Vendored only. Provenance for review, never fetched at runtime (FR-024). */
  originalSource: z.string().max(2048).optional(),
  license: z.string().max(200).optional(),
  vendoredAt: z.string().max(64).optional(),
});

export type CapabilityManifest = z.infer<typeof manifestSchema>;

export interface ManifestProblem {
  readonly path: string;
  readonly message: string;
}

export type ParseResult =
  | { readonly ok: true; readonly manifest: CapabilityManifest }
  | { readonly ok: false; readonly problems: readonly ManifestProblem[] };

/**
 * Keys that would be a claim to trust. Present so discovery can report the
 * attempt; never present on the parsed result.
 */
const TRUST_CLAIM_KEYS = ['trust', 'trustLevel', 'trusted', 'isTrusted', 'verified', 'reviewed'];

/** Which trust-claiming keys a raw manifest carried. Empty is the normal answer. */
export function assertNoTrustClaim(raw: unknown): readonly string[] {
  if (typeof raw !== 'object' || raw === null) return [];
  return TRUST_CLAIM_KEYS.filter((key) => key in raw);
}

export function parseManifest(raw: unknown): ParseResult {
  const result = manifestSchema.safeParse(raw);
  if (!result.success) {
    return {
      ok: false,
      problems: result.error.issues.map((issue) => ({
        path: issue.path.join('.') || '(root)',
        message: issue.message,
      })),
    };
  }

  const manifest = result.data;

  // Principle III as a validation rule. A CODE-layer capability that calls an
  // LLM is a principle violation; one that budgets tokens is announcing it.
  if (manifest.layer === 'CODE' && manifest.estimatedTokens > 0) {
    return {
      ok: false,
      problems: [
        {
          path: 'estimatedTokens',
          message:
            'a CODE-layer capability costs zero tokens (Principle III); declare layer BOTH if it has an AI layer',
        },
      ],
    };
  }

  // An AI-layer capability declaring zero tokens is the same mistake inverted:
  // FR-082 compares estimate against actual, and an estimate of zero makes every
  // real invocation look like unbounded drift.
  if (manifest.layer === 'AI' && manifest.estimatedTokens === 0) {
    return {
      ok: false,
      problems: [
        {
          path: 'estimatedTokens',
          message: 'an AI-layer capability must declare a non-zero token estimate (FR-082)',
        },
      ],
    };
  }

  return { ok: true, manifest };
}

/** The file every capability directory must contain. */
export const MANIFEST_FILENAME = 'capability.manifest.json';
