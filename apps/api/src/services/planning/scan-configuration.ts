/**
 * ScanConfiguration (scan-configuration-contract.md, FR-001/FR-004/FR-020).
 *
 * A request DTO: validated here, never persisted as the authority for what ran
 * (only the resolved `ScanPlan` is). It never carries a secret: any key that names
 * one is refused before the resolver sees the value.
 */

import { z } from 'zod';
import { MODULE_TYPES } from '@webaudit/types';

/** Largest serialized per-domain configuration accepted; bounded so a request cannot bloat a plan. */
export const MAX_PER_DOMAIN_CONFIG_BYTES = 16_384;
const MAX_DEPTH = 8;

const SECRET_KEY =
  /(pass(word|wd)?|secret|token|api[-_]?key|authorization|cookie|credential|private[-_]?key|session)/i;
/** The one sanctioned way to point at a credential: an opaque reference (FR-020/FR-045). */
const OPAQUE_REF_KEY = /^credentialBindingRef$/;

/** First path to a secret-looking key, or null. Iterative so hostile depth cannot overflow the stack. */
export function findSecretKey(value: unknown): string | null {
  const stack: Array<{ v: unknown; path: string; depth: number }> = [
    { v: value, path: '$', depth: 0 },
  ];
  while (stack.length > 0) {
    const { v, path, depth } = stack.pop()!;
    if (v === null || typeof v !== 'object') continue;
    if (depth > MAX_DEPTH) return `${path} (too deep)`;
    const entries = Array.isArray(v) ? v.map((x, i) => [String(i), x] as const) : Object.entries(v);
    for (const [k, child] of entries) {
      if (!Array.isArray(v) && SECRET_KEY.test(k) && !OPAQUE_REF_KEY.test(k)) return `${path}.${k}`;
      stack.push({ v: child, path: `${path}.${k}`, depth: depth + 1 });
    }
  }
  return null;
}

const moduleType = z.enum(MODULE_TYPES);

const perDomainConfig = z.record(z.string(), z.unknown()).superRefine((cfg, ctx) => {
  for (const key of Object.keys(cfg)) {
    if (!(MODULE_TYPES as readonly string[]).includes(key)) {
      ctx.addIssue({ code: 'custom', message: `unknown domain "${key}"`, path: [key] });
    }
  }
  const secret = findSecretKey(cfg);
  if (secret !== null) {
    // Too deep to serialize safely: refuse before JSON.stringify can overflow the stack.
    ctx.addIssue({
      code: 'custom',
      message: `secret-looking or too deeply nested key at ${secret}`,
    });
    return;
  }
  if (Buffer.byteLength(JSON.stringify(cfg), 'utf8') > MAX_PER_DOMAIN_CONFIG_BYTES) {
    ctx.addIssue({ code: 'custom', message: 'perDomainConfig is too large' });
  }
});

export const scanConfigurationSchema = z
  .object({
    targetId: z.string().min(1).max(128),
    profile: z.discriminatedUnion('kind', [
      z
        .object({
          kind: z.literal('NAMED'),
          scanProfileId: z.string().min(1).max(128),
          scanProfileVersion: z.number().int().positive().optional(),
          perDomainConfig: perDomainConfig.optional(),
        })
        .strict(),
      z
        .object({
          kind: z.literal('CUSTOM'),
          domains: z.array(moduleType).min(1).max(MODULE_TYPES.length),
          perDomainConfig: perDomainConfig.optional(),
        })
        .strict(),
    ]),
    requestedAuthorizationGrantIds: z.array(z.string().min(1).max(128)).max(32).optional(),
  })
  .strict();

export type ScanConfiguration = z.infer<typeof scanConfigurationSchema>;

export type ScanConfigurationResult =
  { ok: true; config: ScanConfiguration } | { ok: false; reason: string };

/** Validates untrusted input. The refusal text names the problem but never echoes a submitted value. */
export function parseScanConfiguration(input: unknown): ScanConfigurationResult {
  const parsed = scanConfigurationSchema.safeParse(input);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const where =
      first === undefined || first.path.length === 0 ? 'configuration' : first.path.join('.');
    return { ok: false, reason: `INVALID_CONFIGURATION: ${where}: ${first?.message ?? 'invalid'}` };
  }
  const domains = parsed.data.profile.kind === 'CUSTOM' ? parsed.data.profile.domains : [];
  if (new Set(domains).size !== domains.length) {
    return { ok: false, reason: 'INVALID_CONFIGURATION: profile.domains: duplicate domain' };
  }
  return { ok: true, config: parsed.data };
}
