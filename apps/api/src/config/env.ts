import { z } from 'zod';

/**
 * Startup configuration. Fails closed.
 *
 * Secrets are REQUIRED. There is no implicit development fallback: the only way
 * to boot without a real signing key is the explicit, affirmative opt-in
 * `ALLOW_INSECURE_DEV_SECRETS=true`, which is itself refused when
 * `NODE_ENV=production`.
 *
 * `NODE_ENV` is deliberately NOT part of that decision. It defaults to
 * `development`, so keying the fallback off `NODE_ENV !== 'production'` means a
 * deploy that forgets to set `NODE_ENV=production` — a container default, a
 * missed platform variable — silently signs access tokens with a constant that
 * is committed to this repository. Anyone reading the repo could then mint a
 * token carrying `isOperator: true`. The constitution requires admin capability
 * to be enforced server-side on every privileged route; that guarantee is void
 * if the signature is forgeable. Absent configuration must therefore stop the
 * process, not downgrade the guarantee.
 */
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  /**
   * Affirmative opt-in to placeholder secrets. Must be the exact string `true`.
   * Never set this outside a developer machine or CI.
   */
  ALLOW_INSECURE_DEV_SECRETS: z.string().optional(),
  JWT_ACCESS_SECRET: z.string().optional(),
  JWT_REFRESH_SECRET: z.string().optional(),
  ENCRYPTION_KEY: z.string().optional(),
  ACCESS_TOKEN_TTL: z.string().default('15m'),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(7),
  BCRYPT_COST: z.coerce.number().int().min(12).default(12), // Constitution: >= 12
});

const parsed = schema.parse(process.env);

const isProduction = parsed.NODE_ENV === 'production';

/** Exact-match only: `1`, `yes`, or `TRUE` do not opt in. */
const allowInsecureDevSecrets = parsed.ALLOW_INSECURE_DEV_SECRETS === 'true';

if (allowInsecureDevSecrets && isProduction) {
  throw new Error(
    'ALLOW_INSECURE_DEV_SECRETS must not be set when NODE_ENV=production. ' +
      'Remove it and supply real secrets.',
  );
}

/**
 * Deliberately self-describing rather than plausible: if this string ever shows
 * up in a token, a log line, or a support ticket, its origin is unambiguous.
 */
const INSECURE_DEV_PREFIX = 'INSECURE-DEV-PLACEHOLDER-DO-NOT-DEPLOY';

const warnedFor = new Set<string>();

/**
 * Log once, loudly, naming the variable. A fallback that is used silently is
 * indistinguishable from a correct configuration during an incident.
 */
export function warnInsecureFallback(name: string, remedy: string): void {
  if (warnedFor.has(name)) return;
  warnedFor.add(name);
  // console.warn is permitted by the lint config; no logger exists this early in boot.
  console.warn(
    [
      '',
      '################################################################',
      `# INSECURE CONFIGURATION: ${name} is not set.`,
      '# A placeholder value is in use because ALLOW_INSECURE_DEV_SECRETS=true.',
      '# Anything protected by this value is FORGEABLE. Never deploy this.',
      `# Fix: ${remedy}`,
      '################################################################',
      '',
    ].join('\n'),
  );
}

/**
 * Missing or too-short secret is a startup failure unless the operator has
 * affirmatively opted in. The error names the variable and the remedy so the
 * failure is actionable from the crash log alone.
 */
function requireSecret(name: string, value: string | undefined, minLength = 32): string {
  if (value && value.length >= minLength) return value;

  const remedy = `set ${name} to at least ${minLength} characters (openssl rand -base64 48)`;

  if (!allowInsecureDevSecrets) {
    const why = value ? `is shorter than ${minLength} characters` : 'is not set';
    throw new Error(
      `${name} ${why}. Refusing to start: ${remedy}. ` +
        'For local development only, set ALLOW_INSECURE_DEV_SECRETS=true to use a placeholder.',
    );
  }

  warnInsecureFallback(name, remedy);
  return `${INSECURE_DEV_PREFIX}-${name}`;
}

export const env = {
  nodeEnv: parsed.NODE_ENV,
  isProduction,
  allowInsecureDevSecrets,
  accessSecret: new TextEncoder().encode(
    requireSecret('JWT_ACCESS_SECRET', parsed.JWT_ACCESS_SECRET),
  ),
  refreshTtlDays: parsed.REFRESH_TOKEN_TTL_DAYS,
  accessTtl: parsed.ACCESS_TOKEN_TTL,
  bcryptCost: parsed.BCRYPT_COST,
  encryptionKey: parsed.ENCRYPTION_KEY,
} as const;
