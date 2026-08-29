/**
 * T059 — R8: "Detection combines known credential patterns with high-entropy
 * string heuristics."
 *
 * Two tiers, and the split matters more than either half.
 *
 * **Named patterns** are high confidence. `AKIA…`, `ghp_…`, `sk_live_…` are not
 * ambiguous — a match is a credential, and it is reported as CRITICAL or HIGH.
 *
 * **Entropy** is a heuristic, and heuristics have a cost this module has to pay
 * in both directions. Missing a secret leaks it to a third party for ever
 * (SC-016). Over-redacting destroys the input the AI is meant to reason about,
 * and a redactor that strips a lockfile of its integrity hashes has broken the
 * dependency audit while passing every leak test. So the entropy tier is
 * deliberately conservative: it requires mixed case *and* a digit, refuses
 * anything inside a known-benign span (subresource-integrity hashes, `data:`
 * URI payloads), and is rated MEDIUM so a false positive reads as a lower-
 * confidence finding rather than a certainty.
 *
 * That conservatism is safe only because it is not the last line. Anything the
 * entropy tier misses in a *secret-shaped assignment* is caught by
 * `GENERIC_SECRET_ASSIGNMENT`, which keys off the variable name rather than the
 * value — `DB_PASSWORD=password123` is low entropy and still a credential.
 *
 * `value` is on `SecretMatch` because the assembler needs it to perform the
 * replacement. That is why this module is **not re-exported from `index.ts`**:
 * the value never crosses the package boundary, and the public `secrets` array
 * carries only kind and location.
 */

import type { Severity } from '@webaudit/types';

export const SECRET_KINDS = [
  'PRIVATE_KEY',
  'AWS_ACCESS_KEY_ID',
  'GITHUB_TOKEN',
  'SLACK_TOKEN',
  'STRIPE_SECRET_KEY',
  'GOOGLE_API_KEY',
  'OPENAI_API_KEY',
  'ANTHROPIC_API_KEY',
  'SENDGRID_API_KEY',
  'NPM_TOKEN',
  'TWILIO_API_KEY',
  'JWT',
  'CONNECTION_STRING_PASSWORD',
  'AUTHORIZATION_HEADER',
  'GENERIC_SECRET_ASSIGNMENT',
  'HIGH_ENTROPY_STRING',
] as const;

export type SecretKind = (typeof SECRET_KINDS)[number];

/**
 * How much a match is trusted when two overlap.
 *
 * A named vendor pattern beats a name-based guess, which beats raw entropy. The
 * alternative — reporting all three — puts two placeholders in one span and
 * counts one credential as three findings.
 */
const PRECEDENCE: Readonly<Record<SecretKind, number>> = {
  PRIVATE_KEY: 3,
  AWS_ACCESS_KEY_ID: 3,
  GITHUB_TOKEN: 3,
  SLACK_TOKEN: 3,
  STRIPE_SECRET_KEY: 3,
  GOOGLE_API_KEY: 3,
  OPENAI_API_KEY: 3,
  ANTHROPIC_API_KEY: 3,
  SENDGRID_API_KEY: 3,
  NPM_TOKEN: 3,
  TWILIO_API_KEY: 3,
  JWT: 3,
  CONNECTION_STRING_PASSWORD: 3,
  AUTHORIZATION_HEADER: 3,
  GENERIC_SECRET_ASSIGNMENT: 2,
  HIGH_ENTROPY_STRING: 1,
};

const SEVERITY_BY_KIND: Readonly<Record<SecretKind, Severity>> = {
  // A key that grants infrastructure or moves money.
  PRIVATE_KEY: 'CRITICAL',
  AWS_ACCESS_KEY_ID: 'CRITICAL',
  STRIPE_SECRET_KEY: 'CRITICAL',
  // A named credential for a single service.
  GITHUB_TOKEN: 'HIGH',
  SLACK_TOKEN: 'HIGH',
  GOOGLE_API_KEY: 'HIGH',
  OPENAI_API_KEY: 'HIGH',
  ANTHROPIC_API_KEY: 'HIGH',
  SENDGRID_API_KEY: 'HIGH',
  NPM_TOKEN: 'HIGH',
  TWILIO_API_KEY: 'HIGH',
  JWT: 'HIGH',
  CONNECTION_STRING_PASSWORD: 'HIGH',
  AUTHORIZATION_HEADER: 'HIGH',
  GENERIC_SECRET_ASSIGNMENT: 'HIGH',
  // A guess. Rated so the report reads as one.
  HIGH_ENTROPY_STRING: 'MEDIUM',
};

export function severityOf(kind: SecretKind): Severity {
  return SEVERITY_BY_KIND[kind];
}

interface Rule {
  readonly kind: SecretKind;
  readonly pattern: RegExp;
  /**
   * Which capture group holds the credential. 0 means the whole match.
   *
   * Non-zero matters: for a connection string only the password is secret, and
   * redacting the host and database name too would throw away the context that
   * makes the finding actionable.
   */
  readonly group: number;
}

/** Names that make a value a credential regardless of how it is shaped. */
const SECRET_NAME = String.raw`(?:[A-Za-z0-9_.\[\]'"-]*(?:secret|passwd|password|token|api[_-]?key|apikey|access[_-]?key|private[_-]?key|client[_-]?secret|auth[_-]?token|credential|bearer)[A-Za-z0-9_.\[\]'"-]*)`;

/** Any of the three JavaScript string delimiters. */
const QUOTE = '["\'`]';
const NOT_QUOTE = '[^"\'`\\n]';

const RULES: readonly Rule[] = [
  {
    // The armour is not secret; the block including it is what must go, because
    // the body is the key and the body alone is unrecognisable afterwards.
    kind: 'PRIVATE_KEY',
    pattern:
      /-----BEGIN (?:RSA |DSA |EC |OPENSSH |PGP |ENCRYPTED )?PRIVATE KEY(?: BLOCK)?-----[\s\S]*?-----END (?:RSA |DSA |EC |OPENSSH |PGP |ENCRYPTED )?PRIVATE KEY(?: BLOCK)?-----/g,
    group: 0,
  },
  { kind: 'AWS_ACCESS_KEY_ID', pattern: /\b(?:AKIA|ASIA|ABIA|ACCA)[0-9A-Z]{16}\b/g, group: 0 },
  {
    kind: 'GITHUB_TOKEN',
    pattern: /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{22,})\b/g,
    group: 0,
  },
  { kind: 'SLACK_TOKEN', pattern: /\bxox[baprse]-[A-Za-z0-9-]{10,}/g, group: 0 },
  { kind: 'STRIPE_SECRET_KEY', pattern: /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}\b/g, group: 0 },
  { kind: 'GOOGLE_API_KEY', pattern: /\bAIza[A-Za-z0-9_-]{35}\b/g, group: 0 },
  // Anthropic before OpenAI: `sk-ant-…` is the more specific shape and must win.
  { kind: 'ANTHROPIC_API_KEY', pattern: /\bsk-ant-[A-Za-z0-9_-]{20,}/g, group: 0 },
  { kind: 'OPENAI_API_KEY', pattern: /\bsk-(?:proj-)?[A-Za-z0-9]{20,}\b/g, group: 0 },
  {
    kind: 'SENDGRID_API_KEY',
    pattern: /\bSG\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}/g,
    group: 0,
  },
  { kind: 'NPM_TOKEN', pattern: /\bnpm_[A-Za-z0-9]{36}\b/g, group: 0 },
  { kind: 'TWILIO_API_KEY', pattern: /\bSK[0-9a-fA-F]{32}\b/g, group: 0 },
  {
    kind: 'JWT',
    pattern: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g,
    group: 0,
  },
  {
    // Only the password. The scheme, user, host and database stay, because a
    // finding that says "the credential is in DATABASE_URL" needs them.
    kind: 'CONNECTION_STRING_PASSWORD',
    pattern:
      /\b(?:postgres(?:ql)?|mysql|mariadb|mongodb(?:\+srv)?|rediss?|amqps?|mssql|ftp|https?):\/\/[^\s:@/]+:([^\s@/]{3,})@/g,
    group: 1,
  },
  {
    kind: 'AUTHORIZATION_HEADER',
    pattern:
      /\bauthorization\b\s*[:=]\s*["'`]?\s*(?:Bearer|Basic|Token)\s+([A-Za-z0-9+/=_.-]{16,})/gi,
    group: 1,
  },
  {
    // Quoted assignment: `const clientSecret = "…"`, `"api_key": "…"`.
    kind: 'GENERIC_SECRET_ASSIGNMENT',
    pattern: new RegExp(
      SECRET_NAME + '\\s*[:=]\\s*' + QUOTE + '(' + NOT_QUOTE + '{8,})' + QUOTE,
      'gi',
    ),
    group: 1,
  },
  {
    // Bare assignment, as in a `.env` file, where there are no quotes to find.
    kind: 'GENERIC_SECRET_ASSIGNMENT',
    pattern: new RegExp(
      '^[ \\t]*(?:export[ \\t]+)?' + SECRET_NAME + '[ \\t]*=[ \\t]*([^\\s"\'#]{8,})',
      'gim',
    ),
    group: 1,
  },
];

/**
 * Spans that look like secrets, are high-entropy, and are public by design.
 *
 * Every one of these is something a real audit needs to read. A subresource
 * integrity hash is the thing a dependency check compares; a `data:` URI payload
 * is the image. Redacting them would pass SC-016 and break the product.
 */
const BENIGN_SPANS: readonly RegExp[] = [
  /\bsha(?:1|256|384|512)-[A-Za-z0-9+/=]{20,}/g,
  /\bintegrity\s*[:=]\s*["'][^"']+["']/g,
  /\bdata:[^;,\s]*;base64,[A-Za-z0-9+/=]+/g,
  // A git object name, a content hash, an ETag: hex only, no case mixing.
  /\b[0-9a-f]{32,64}\b/g,
];

export interface DetectOptions {
  /** Shannon entropy, in bits per character, a candidate must exceed. */
  readonly minEntropyBitsPerChar?: number;
  /** Shortest string the entropy tier will consider. */
  readonly minEntropyLength?: number;
  /** Longest. Beyond this it is a bundle or a blob, not a key. */
  readonly maxEntropyLength?: number;
}

const DEFAULTS = {
  minEntropyBitsPerChar: 3.5,
  minEntropyLength: 25,
  maxEntropyLength: 200,
} as const;

export interface SecretMatch {
  readonly kind: SecretKind;
  readonly severity: Severity;
  /** The credential itself. Never leaves this package — see the module note. */
  readonly value: string;
  readonly start: number;
  readonly end: number;
  /** 1-based, for a finding a human will read. */
  readonly line: number;
  readonly column: number;
}

function shannonEntropyPerChar(value: string): number {
  const counts = new Map<string, number>();
  for (const char of value) counts.set(char, (counts.get(char) ?? 0) + 1);
  let bits = 0;
  for (const count of counts.values()) {
    const p = count / value.length;
    bits -= p * Math.log2(p);
  }
  return bits;
}

/**
 * Mixed case and at least one digit.
 *
 * Not arbitrary: it is what separates `Xk9pQm2Lz7Rt4Yv1Bn6Hs3Wd8Fj5` from
 * `createVeryLongDescriptiveFunctionName` and from a lowercase hex digest, both
 * of which are long, both of which appear in every codebase, and neither of
 * which is a credential.
 */
function looksGenerated(value: string): boolean {
  return /[a-z]/.test(value) && /[A-Z]/.test(value) && /\d/.test(value);
}

interface Span {
  readonly start: number;
  readonly end: number;
}

function collectSpans(text: string, patterns: readonly RegExp[]): Span[] {
  const spans: Span[] = [];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      if (match.index === undefined) continue;
      spans.push({ start: match.index, end: match.index + match[0].length });
    }
  }
  return spans;
}

function overlaps(a: Span, b: Span): boolean {
  return a.start < b.end && b.start < a.end;
}

/**
 * `=` is excluded from the body and allowed only as trailing padding.
 *
 * Without that, `TOKEN=ghp_…` tokenises as one 46-character candidate that is
 * *longer* than the `ghp_…` match, wins the overlap resolution below, and gets
 * reported as a nameless entropy hit instead of a GitHub token.
 */
const ENTROPY_CANDIDATE = /[A-Za-z0-9+/_-]{20,}={0,2}/g;

function entropyMatches(text: string, options: Required<DetectOptions>): SecretMatch[] {
  const benign = collectSpans(text, BENIGN_SPANS);
  const found: SecretMatch[] = [];

  for (const match of text.matchAll(ENTROPY_CANDIDATE)) {
    const value = match[0];
    const start = match.index;
    if (start === undefined) continue;
    if (value.length < options.minEntropyLength || value.length > options.maxEntropyLength)
      continue;
    if (!looksGenerated(value)) continue;

    const span = { start, end: start + value.length };
    if (benign.some((b) => overlaps(span, b))) continue;
    if (shannonEntropyPerChar(value) < options.minEntropyBitsPerChar) continue;

    found.push({
      kind: 'HIGH_ENTROPY_STRING',
      severity: SEVERITY_BY_KIND.HIGH_ENTROPY_STRING,
      value,
      start: span.start,
      end: span.end,
      line: 0,
      column: 0,
    });
  }
  return found;
}

function namedMatches(text: string): SecretMatch[] {
  const found: SecretMatch[] = [];
  for (const rule of RULES) {
    for (const match of text.matchAll(rule.pattern)) {
      if (match.index === undefined) continue;
      const value = rule.group === 0 ? match[0] : match[rule.group];
      if (value === undefined || value === '') continue;

      // The group may sit anywhere inside the match; find where, so the
      // reported column points at the credential and not at the line start.
      const offsetInMatch = rule.group === 0 ? 0 : match[0].lastIndexOf(value);
      if (offsetInMatch < 0) continue;
      const start = match.index + offsetInMatch;

      found.push({
        kind: rule.kind,
        severity: SEVERITY_BY_KIND[rule.kind],
        value,
        start,
        end: start + value.length,
        line: 0,
        column: 0,
      });
    }
  }
  return found;
}

function lineStarts(text: string): number[] {
  const starts = [0];
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === '\n') starts.push(i + 1);
  }
  return starts;
}

function positionOf(starts: readonly number[], offset: number): { line: number; column: number } {
  let low = 0;
  let high = starts.length - 1;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (starts[mid]! <= offset) low = mid;
    else high = mid - 1;
  }
  return { line: low + 1, column: offset - starts[low]! + 1 };
}

/**
 * Every credential in a body of text, non-overlapping, in document order.
 *
 * @param text user source or captured markup. Never our own prompt text.
 */
export function detectSecrets(text: string, options: DetectOptions = {}): SecretMatch[] {
  const resolved: Required<DetectOptions> = {
    minEntropyBitsPerChar: options.minEntropyBitsPerChar ?? DEFAULTS.minEntropyBitsPerChar,
    minEntropyLength: options.minEntropyLength ?? DEFAULTS.minEntropyLength,
    maxEntropyLength: options.maxEntropyLength ?? DEFAULTS.maxEntropyLength,
  };

  const candidates = [...namedMatches(text), ...entropyMatches(text, resolved)];

  // Longest span first, then most-trusted kind. Greedy acceptance then leaves
  // one match per region: a JWT rather than its three high-entropy segments,
  // a private key block rather than each base64 line inside it.
  candidates.sort((a, b) => {
    const byLength = b.end - b.start - (a.end - a.start);
    if (byLength !== 0) return byLength;
    const byTrust = PRECEDENCE[b.kind] - PRECEDENCE[a.kind];
    if (byTrust !== 0) return byTrust;
    return a.start - b.start;
  });

  const accepted: SecretMatch[] = [];
  for (const candidate of candidates) {
    if (accepted.some((a) => overlaps(a, candidate))) continue;
    accepted.push(candidate);
  }

  const starts = lineStarts(text);
  return accepted
    .sort((a, b) => a.start - b.start)
    .map((match) => ({ ...match, ...positionOf(starts, match.start) }));
}
