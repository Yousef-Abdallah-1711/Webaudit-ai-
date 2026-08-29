/**
 * T058 — SC-016: "Zero secrets found in user source or markup appear in
 * provider-bound content, verified by adversarial testing with planted
 * credentials."
 *
 * FR-056 has two halves and this suite refuses to let either one carry the
 * other: secrets MUST NOT reach a provider, "while still reporting their
 * presence to the user". A redactor that strips the file to nothing passes the
 * first half and fails the product; one that reports beautifully and leaks
 * passes nothing at all.
 *
 * So every planted credential is asserted twice — absent from the assembled
 * prompt, present as a finding — and the negative-control block asserts that
 * ordinary code survives untouched, because an over-eager redactor destroys the
 * input the AI is supposed to reason about.
 *
 * The absence assertion runs over `JSON.stringify` of the entire returned
 * object, not over `prompt.text`. A secret parked in a metadata field, an
 * evidence blob, or a debug echo is just as leaked, and checking only the text
 * is how that ships.
 */

import { describe, expect, it } from 'vitest';
import { assemblePrompt, isRedactedPrompt, secretsToFindings } from '../../src/index.js';
import { detectSecrets } from '../../src/detect.js';

/**
 * Planted credentials.
 *
 * Every value is synthetic. Where a vendor publishes a documentation example
 * (AWS does) that example is used, because a pattern tuned against invented
 * shapes is a pattern tuned against nothing.
 */
const PLANTED = {
  awsKeyId: 'AKIAIOSFODNN7EXAMPLE',
  awsSecret: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
  githubPat: 'ghp_A1b2C3d4E5f6G7h8I9j0KlMnOpQrStUvWxYz',
  slackBot: 'xoxb-123456789012-123456789012-AbCdEfGhIjKlMnOpQrStUvWx',
  stripeLive: 'sk_live_4eC39HqLyjWDarjtT1zdp7dc',
  googleKey: 'AIzaSyA1b2C3d4E5f6G7h8I9j0KlMnOpQrStUvw',
  openaiKey: 'sk-A1b2C3d4E5f6G7h8I9j0KlMnOpQrStUvWxYz0123456789ab',
  anthropicKey: 'sk-ant-api03-A1b2C3d4E5f6G7h8I9j0KlMnOpQrStUvWxYz0123456789',
  sendgrid: 'SG.A1b2C3d4E5f6G7h8I9j0Kl.MnOpQrStUvWxYz0123456789abcdefghijklmnopqrstu',
  npmToken: 'npm_A1b2C3d4E5f6G7h8I9j0KlMnOpQrStUvWxYz',
  jwt: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk',
  dbPassword: 's3cr3t-P4ssw0rd-Very-Long',
  genericSecret: 'Zq7Yx2Wv9Ut4Sr6Qp8On0Ml2Kj4Ih6Gf8Ed',
  entropyBlob: 'Xk9pQm2Lz7Rt4Yv1Bn6Hs3Wd8Fj5Gc0Ka2Ne7Pu4Ry',
} as const;

const PEM = [
  '-----BEGIN RSA PRIVATE KEY-----',
  'MIIBOgIBAAJBAK7Yx2Wv9Ut4Sr6Qp8On0Ml2Kj4Ih6Gf8EdCb0Az9Yx8Wv7Ut6Sr5',
  'Qp4On3Ml2Kj1Ih0Gf9Ed8Cb7Az6Yx5Wv4Ut3Sr2Qp1On0Ml=',
  '-----END RSA PRIVATE KEY-----',
].join('\n');

const SOURCE_FILES = [
  {
    label: 'config',
    path: 'src/config.ts',
    content: [
      "import { readFileSync } from 'node:fs';",
      '',
      '// Deployment credentials. Do not commit.',
      `export const AWS_ACCESS_KEY_ID = '${PLANTED.awsKeyId}';`,
      `export const AWS_SECRET_ACCESS_KEY = '${PLANTED.awsSecret}';`,
      `export const OPENAI_API_KEY = '${PLANTED.openaiKey}';`,
      `const apiSecret = "${PLANTED.genericSecret}";`,
      '',
      'export function loadConfig(path: string) {',
      "  return JSON.parse(readFileSync(path, 'utf8'));",
      '}',
    ].join('\n'),
  },
  {
    label: 'env',
    path: '.env.production',
    content: [
      'NODE_ENV=production',
      'PORT=3000',
      `GITHUB_TOKEN=${PLANTED.githubPat}`,
      `SLACK_BOT_TOKEN=${PLANTED.slackBot}`,
      `STRIPE_SECRET_KEY=${PLANTED.stripeLive}`,
      `NPM_TOKEN=${PLANTED.npmToken}`,
      `ANTHROPIC_API_KEY=${PLANTED.anthropicKey}`,
      `SENDGRID_API_KEY=${PLANTED.sendgrid}`,
      `DATABASE_URL=postgresql://appuser:${PLANTED.dbPassword}@db.example.com:5432/appdb`,
      'LOG_LEVEL=info',
    ].join('\n'),
  },
  {
    label: 'markup',
    path: 'public/index.html',
    content: [
      '<!doctype html>',
      '<html lang="en">',
      '  <head>',
      '    <title>Acme Storefront</title>',
      `    <meta name="google-api-key" content="${PLANTED.googleKey}" />`,
      '  </head>',
      '  <body>',
      '    <h1>Welcome to Acme</h1>',
      `    <script>window.__AUTH__ = { token: "${PLANTED.jwt}" };</script>`,
      `    <!-- entropy blob left by a build tool: ${PLANTED.entropyBlob} -->`,
      '  </body>',
      '</html>',
    ].join('\n'),
  },
  {
    label: 'key',
    path: 'deploy/id_rsa',
    content: PEM,
  },
] as const;

/** Every planted value that must never appear in provider-bound content. */
const SECRET_VALUES: readonly string[] = [
  ...Object.values(PLANTED),
  // The PEM body lines, not the armour, which is not itself secret.
  'MIIBOgIBAAJBAK7Yx2Wv9Ut4Sr6Qp8On0Ml2Kj4Ih6Gf8EdCb0Az9Yx8Wv7Ut6Sr5',
];

function assemble() {
  return assemblePrompt({
    instructions: 'Review the following source for security defects.',
    segments: SOURCE_FILES.map((f) => ({ label: f.label, path: f.path, content: f.content })),
  });
}

/** Everything that would leave this process, as one string. */
function outboundPayload(result: ReturnType<typeof assemble>): string {
  return JSON.stringify(result);
}

// ─── The guarantee ───────────────────────────────────────────────────────────

describe('SC-016 - no planted credential reaches provider-bound content', () => {
  it.each(SECRET_VALUES)('strips %s from the assembled prompt', (secret) => {
    const result = assemble();
    expect(result.prompt.text).not.toContain(secret);
  });

  it.each(SECRET_VALUES)(
    'strips %s from every field of the result, not just the text',
    (secret) => {
      // The assertion that catches a secret parked in metadata or an echo field.
      expect(outboundPayload(assemble())).not.toContain(secret);
    },
  );

  it.each(SECRET_VALUES)('does not leak %s re-encoded', (secret) => {
    const payload = outboundPayload(assemble());
    // An assembler that base64s or URL-encodes content would pass the plain
    // check and leak anyway.
    expect(payload).not.toContain(Buffer.from(secret, 'utf8').toString('base64'));
    expect(payload).not.toContain(encodeURIComponent(secret));
    expect(payload.toLowerCase()).not.toContain(secret.toLowerCase());
  });

  it('leaks no fragment of a long secret either', () => {
    const payload = outboundPayload(assemble());
    // A truncating redactor that keeps a prefix "for context" leaks a prefix.
    for (const secret of SECRET_VALUES) {
      for (const length of [12, 16, 24]) {
        if (secret.length <= length) continue;
        expect(payload, `${secret.slice(0, length)}…`).not.toContain(secret.slice(0, length));
        expect(payload).not.toContain(secret.slice(-length));
      }
    }
  });

  it('redacts before truncating, so a clipped file cannot expose half a key', () => {
    const long = 'x'.repeat(4000);
    const result = assemblePrompt(
      {
        instructions: 'Review.',
        segments: [
          { label: 'big', path: 'a.ts', content: `${long}\nKEY=${PLANTED.githubPat}\n${long}` },
        ],
      },
      { maxSegmentChars: 500 },
    );

    expect(result.prompt.text).not.toContain(PLANTED.githubPat);
    for (const length of [8, 12, 20]) {
      expect(result.prompt.text).not.toContain(PLANTED.githubPat.slice(0, length));
    }
    // Truncated, and the secret was found before the clip rather than after it.
    expect(result.prompt.text).toContain('truncated');
    expect(result.secrets.length).toBeGreaterThan(0);
  });
});

// ─── The other half of FR-056 ────────────────────────────────────────────────

describe('FR-056 - the presence of every secret is still reported', () => {
  it('reports every planted credential as a finding with a location', () => {
    const findings = secretsToFindings(assemble().secrets);
    expect(findings.length).toBeGreaterThanOrEqual(14);

    for (const finding of findings) {
      expect(finding.location, finding.title).toMatch(/^[^\s]+:\d+/);
      expect(finding.checkId).toBe('redaction.secret-in-source');
      expect(finding.fixable).toBe(true);
      expect(finding.fingerprintParts.length).toBeGreaterThan(0);
    }
  });

  it('names the file each secret was found in', () => {
    const findings = secretsToFindings(assemble().secrets);
    const paths = new Set(findings.map((f) => f.location?.split(':')[0]));
    expect(paths).toContain('src/config.ts');
    expect(paths).toContain('.env.production');
    expect(paths).toContain('public/index.html');
    expect(paths).toContain('deploy/id_rsa');
  });

  it('identifies what kind of credential each one is', () => {
    const kinds = new Set(assemble().secrets.map((s) => s.kind));
    for (const expected of [
      'AWS_ACCESS_KEY_ID',
      'GITHUB_TOKEN',
      'SLACK_TOKEN',
      'STRIPE_SECRET_KEY',
      'GOOGLE_API_KEY',
      'PRIVATE_KEY',
      'JWT',
      'CONNECTION_STRING_PASSWORD',
    ]) {
      expect(kinds, expected).toContain(expected);
    }
  });

  it('never puts the secret in the finding it raises about the secret', () => {
    const findings = secretsToFindings(assemble().secrets);
    const serialised = JSON.stringify(findings);
    for (const secret of SECRET_VALUES) {
      expect(serialised).not.toContain(secret);
    }
  });

  it('rates a private key and a live payment key above a mere entropy hit', () => {
    const bySeverity = new Map(assemble().secrets.map((s) => [s.kind, s.severity]));
    expect(bySeverity.get('PRIVATE_KEY')).toBe('CRITICAL');
    expect(bySeverity.get('STRIPE_SECRET_KEY')).toBe('CRITICAL');
    expect(bySeverity.get('HIGH_ENTROPY_STRING')).toBe('MEDIUM');
  });
});

// ─── Placeholders: the AI must still know a credential was there ─────────────

describe('R8 - a stable placeholder replaces each secret', () => {
  it('leaves a placeholder naming the kind, so the model can still reason', () => {
    const result = assemble();
    expect(result.prompt.text).toContain('[[REDACTED:AWS_ACCESS_KEY_ID:');
    expect(result.prompt.text).toContain('[[REDACTED:PRIVATE_KEY:');
    expect(result.prompt.redactionCount).toBe(result.secrets.length);
  });

  it('gives one value one placeholder, however many times it appears', () => {
    const repeated = `KEY=${PLANTED.githubPat}\nOTHER=${PLANTED.githubPat}\nTHIRD=${PLANTED.githubPat}`;
    const result = assemblePrompt({
      instructions: 'Review.',
      segments: [{ label: 'dup', path: 'dup.env', content: repeated }],
    });

    const placeholders = [...result.prompt.text.matchAll(/\[\[REDACTED:[^\]]+\]\]/g)].map(
      (m) => m[0],
    );
    expect(placeholders).toHaveLength(3);
    expect(new Set(placeholders).size).toBe(1);
  });

  it('gives two different values two different placeholders', () => {
    const result = assemblePrompt({
      instructions: 'Review.',
      segments: [
        {
          label: 'two',
          path: 'two.env',
          content: `A=${PLANTED.githubPat}\nB=${PLANTED.npmToken}`,
        },
      ],
    });
    const placeholders = new Set(
      [...result.prompt.text.matchAll(/\[\[REDACTED:[^\]]+\]\]/g)].map((m) => m[0]),
    );
    expect(placeholders.size).toBe(2);
  });

  it('derives the placeholder from position, never from the secret', () => {
    // A hash-derived placeholder is a hash of a credential sent to a third
    // party. Harmless for 40 random characters, not harmless for a password.
    const weak = 'password123';
    const result = assemblePrompt({
      instructions: 'Review.',
      segments: [{ label: 'weak', path: 'weak.env', content: `DB_PASSWORD=${weak}` }],
    });
    const payload = outboundPayload(result);
    for (const encoding of ['hex', 'base64', 'base64url'] as const) {
      expect(payload).not.toContain(Buffer.from(weak, 'utf8').toString(encoding));
    }
    expect(payload).not.toContain(weak);
  });
});

// ─── The type is the mechanism ───────────────────────────────────────────────

describe('R8 - RedactedPrompt is constructible only by this package', () => {
  it('accepts what the assembler produced', () => {
    expect(isRedactedPrompt(assemble().prompt)).toBe(true);
  });

  it('rejects a hand-built object that satisfies the shape', () => {
    // The compile-time brand stops honest code. This is the runtime half, for
    // `as unknown as RedactedPrompt` — which a review can grep for, but which a
    // registry check refuses outright.
    const forged = {
      text: 'Review the following source for security defects.',
      placeholders: [],
      redactionCount: 0,
    };
    expect(isRedactedPrompt(forged)).toBe(false);
  });

  it('rejects a plain string, an empty object, and null', () => {
    for (const candidate of ['a prompt', {}, null, undefined, 42, []]) {
      expect(isRedactedPrompt(candidate)).toBe(false);
    }
  });

  it('rejects a structural clone of a real prompt', () => {
    // Serialising and reviving loses registry membership, which is the point:
    // a prompt that has been through a queue must be re-assembled, not trusted.
    const real = assemble().prompt;
    const revived: unknown = JSON.parse(JSON.stringify(real));
    expect(isRedactedPrompt(real)).toBe(true);
    expect(isRedactedPrompt(revived)).toBe(false);
  });

  it('exposes exactly one way to make one', async () => {
    // If a second constructor ever appears on the public surface, SC-016 stops
    // being a type error and goes back to being a discipline problem.
    const surface = Object.keys(await import('../../src/index.js')).sort();
    expect(surface).toEqual([
      'SECRET_CHECK_ID',
      'SECRET_KINDS',
      'assemblePrompt',
      'isRedactedPrompt',
      'redactText',
      'secretsToFindings',
    ]);
  });
});

// ─── Negative control: the AI must still get something to read ──────────────

describe('FR-056 - ordinary content survives untouched', () => {
  const ORDINARY = [
    "export function formatCurrency(amountMicros: number, locale = 'en-US'): string {",
    '  return new Intl.NumberFormat(locale, {',
    "    style: 'currency',",
    "    currency: 'USD',",
    '  }).format(amountMicros / 1_000_000);',
    '}',
    '',
    '// A subresource integrity hash, which is public by design:',
    '// sha512-Q1zH9K3mNpXvR7tYuI2oP4aS6dF8gH0jK2lM4nO6pQ8rS0tU2vW4xY6zA8bC0dE2',
    'const CLASSNAMES = "flex items-center justify-between gap-4 rounded-lg border";',
    'const COMMIT = "e83c5163316f89bfbde7d9ab23ca2e25604af290";',
  ].join('\n');

  it('changes nothing in a file with no secrets in it', () => {
    const result = assemblePrompt({
      instructions: 'Review.',
      segments: [{ label: 'ordinary', path: 'src/format.ts', content: ORDINARY }],
    });

    expect(result.secrets).toHaveLength(0);
    expect(result.prompt.redactionCount).toBe(0);
    expect(result.prompt.text).toContain('formatCurrency');
    expect(result.prompt.text).toContain(
      'flex items-center justify-between gap-4 rounded-lg border',
    );
  });

  it('leaves an integrity hash and a git sha alone', () => {
    // Both are high-entropy and both are public. Redacting them would strip a
    // lockfile of the very thing a dependency audit reads.
    const found = detectSecrets(ORDINARY).map((s) => s.kind);
    expect(found).toEqual([]);
  });

  it('leaves a base64 data URI alone', () => {
    const dataUri =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==';
    expect(detectSecrets(`<img src="${dataUri}" />`)).toEqual([]);
  });

  it('keeps the instructions we wrote verbatim', () => {
    const result = assemble();
    expect(result.prompt.text).toContain('Review the following source for security defects.');
  });

  it('labels each segment so the model knows which file it is reading', () => {
    const result = assemble();
    for (const file of SOURCE_FILES) {
      expect(result.prompt.text).toContain(file.path);
    }
  });
});

// ─── Detection edges that matter ─────────────────────────────────────────────

describe('detection', () => {
  it('finds a secret on the first line and on the last', () => {
    const first = detectSecrets(`${PLANTED.githubPat}\ntrailing`);
    const last = detectSecrets(`leading\n${PLANTED.githubPat}`);
    expect(first[0]?.line).toBe(1);
    expect(last[0]?.line).toBe(2);
  });

  it('reports a column, not only a line', () => {
    const found = detectSecrets(`TOKEN=${PLANTED.githubPat}`);
    expect(found[0]?.column).toBe(7);
  });

  it('finds every occurrence rather than stopping at the first', () => {
    const found = detectSecrets(
      `A=${PLANTED.githubPat}\nB=${PLANTED.npmToken}\nC=${PLANTED.stripeLive}`,
    );
    expect(found).toHaveLength(3);
  });

  it('catches a generic assignment to a secret-shaped name', () => {
    const kinds = detectSecrets('const clientSecret = "Qp8On0Ml2Kj4Ih6Gf8EdCb0Az9Yx8Wv7Ut6";').map(
      (s) => s.kind,
    );
    expect(kinds).toContain('GENERIC_SECRET_ASSIGNMENT');
  });

  it('does not flag an assignment to a harmless name', () => {
    expect(detectSecrets('const userName = "a-perfectly-ordinary-string-value";')).toEqual([]);
  });

  it('catches an Authorization header in captured markup', () => {
    const kinds = detectSecrets(
      'fetch("/api", { headers: { Authorization: "Bearer A1b2C3d4E5f6G7h8I9j0KlMnOpQrSt" } });',
    ).map((s) => s.kind);
    expect(kinds).toContain('AUTHORIZATION_HEADER');
  });

  it('catches a high-entropy blob with no recognisable vendor prefix', () => {
    const kinds = detectSecrets(`SOME_KEY=${PLANTED.entropyBlob}`).map((s) => s.kind);
    expect(kinds).toContain('HIGH_ENTROPY_STRING');
  });

  it('does not flag ordinary prose however long', () => {
    const prose =
      'The quick brown fox jumps over the lazy dog and continues running through the field for a very long time indeed.';
    expect(detectSecrets(prose)).toEqual([]);
  });

  it('does not flag a long lowercase identifier or a URL path', () => {
    expect(
      detectSecrets(
        'import { createVeryLongDescriptiveFunctionName } from "@scope/package-with-a-long-name/sub/path";',
      ),
    ).toEqual([]);
  });

  it('overlapping matches resolve to one, longest wins', () => {
    // sk-ant-… also matches the shorter OpenAI-style sk- pattern. Reporting both
    // would double-count the finding and place two placeholders in one span.
    const found = detectSecrets(`KEY=${PLANTED.anthropicKey}`);
    expect(found).toHaveLength(1);
    expect(found[0]?.kind).toBe('ANTHROPIC_API_KEY');
  });
});
