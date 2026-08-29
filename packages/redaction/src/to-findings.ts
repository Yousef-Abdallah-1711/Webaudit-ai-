/**
 * T062 — FR-056's second half: "while still reporting their presence to the
 * user."
 *
 * The half that is easy to drop. A redactor that only strips satisfies SC-016
 * completely and leaves the customer with a credential in their repository and
 * no idea it is there — which, for a product whose entire value is telling
 * people the truth about their software, is the worse failure of the two.
 *
 * **No finding contains the credential.** Not in the description, not in the
 * evidence, not as a masked preview. FR-091 forbids revealing stored credentials
 * "in logs, error messages, or AI prompts", and a report that echoes the secret
 * back becomes one more place it exists — one that gets exported (FR-093),
 * emailed, and pasted into tickets. The user owns the file and has the line
 * number; they do not need us to quote it at them.
 *
 * Fingerprints are location plus kind, never a function of the value. Same
 * reason as the placeholders in `assemble.ts`: a hash of `password123` is
 * `password123`. It also gives the right dedup behaviour — rotating a leaked key
 * without removing it from the file is still the same finding.
 */

import type { CapabilityFinding } from '@webaudit/types';
import type { RedactedSecretRef } from './assemble.js';
import type { SecretKind } from './detect.js';

export type SecretFinding = CapabilityFinding;

/** One check id, so re-verification routes to one place (FR-059). */
export const SECRET_CHECK_ID = 'redaction.secret-in-source';

const WHAT: Readonly<Record<SecretKind, string>> = {
  PRIVATE_KEY: 'a private key',
  AWS_ACCESS_KEY_ID: 'an AWS access key ID',
  GITHUB_TOKEN: 'a GitHub access token',
  SLACK_TOKEN: 'a Slack API token',
  STRIPE_SECRET_KEY: 'a Stripe secret key',
  GOOGLE_API_KEY: 'a Google API key',
  OPENAI_API_KEY: 'an OpenAI API key',
  ANTHROPIC_API_KEY: 'an Anthropic API key',
  SENDGRID_API_KEY: 'a SendGrid API key',
  NPM_TOKEN: 'an npm access token',
  TWILIO_API_KEY: 'a Twilio API key',
  JWT: 'a signed JSON Web Token',
  CONNECTION_STRING_PASSWORD: 'a password inside a database connection string',
  AUTHORIZATION_HEADER: 'a credential in an Authorization header',
  GENERIC_SECRET_ASSIGNMENT: 'a value assigned to a credential-shaped name',
  HIGH_ENTROPY_STRING: 'a high-entropy string consistent with a credential',
};

const CONSEQUENCE: Readonly<Record<SecretKind, string>> = {
  PRIVATE_KEY:
    'Anyone who can read this file can impersonate the holder of this key. Rotate it and treat every system that trusted it as compromised.',
  AWS_ACCESS_KEY_ID:
    'Paired with its secret, this grants API access to your AWS account. Deactivate the key and review CloudTrail for use you do not recognise.',
  STRIPE_SECRET_KEY:
    'A live secret key can move money and read customer records. Roll it in the Stripe dashboard immediately.',
  GITHUB_TOKEN:
    'This grants access to the repositories in its scope, including private ones. Revoke it and issue a replacement with narrower scope.',
  SLACK_TOKEN: 'This can read and post to your workspace. Revoke it in the Slack app settings.',
  GOOGLE_API_KEY:
    'Depending on its restrictions this can be billed against your project by anyone who has it. Rotate it and add referrer or IP restrictions.',
  OPENAI_API_KEY: 'Usage on this key is billed to your account. Rotate it.',
  ANTHROPIC_API_KEY: 'Usage on this key is billed to your account. Rotate it.',
  SENDGRID_API_KEY:
    'This can send mail as your domain, which is a phishing risk carrying your reputation. Revoke it.',
  NPM_TOKEN:
    'A publish-scoped token lets anyone release a version of your package. Revoke it and review recent publishes.',
  TWILIO_API_KEY: 'This can send messages and place calls billed to your account. Revoke it.',
  JWT: 'A token committed to source is valid until it expires, and cannot be recalled. Shorten the lifetime and stop committing them.',
  CONNECTION_STRING_PASSWORD:
    'This is a direct route to your database for anyone who can read this file. Change the password and move the connection string to configuration.',
  AUTHORIZATION_HEADER:
    'A credential hard-coded into a request is shipped to every client that receives this code. Move it server-side and rotate it.',
  GENERIC_SECRET_ASSIGNMENT:
    'If this is a live credential, anyone who can read this file can use it. Rotate it and move it to configuration the repository does not hold.',
  HIGH_ENTROPY_STRING:
    'This may be a credential. If it is, rotate it and move it to configuration; if it is not, no action is needed.',
};

/**
 * Where the secret was, as `path:line:column` — the form editors and terminals
 * both make clickable.
 */
function locationOf(secret: RedactedSecretRef): string {
  return `${secret.path}:${String(secret.line)}:${String(secret.column)}`;
}

export function secretsToFindings(secrets: readonly RedactedSecretRef[]): readonly SecretFinding[] {
  return secrets.map((secret) => ({
    checkId: SECRET_CHECK_ID,
    // Location and kind only. Never the value, and never a hash of it.
    fingerprintParts: [
      SECRET_CHECK_ID,
      secret.path,
      secret.kind,
      String(secret.line),
      String(secret.column),
    ],
    severity: secret.severity,
    title: `Credential in source: ${WHAT[secret.kind]}`,
    description:
      `${WHAT[secret.kind].charAt(0).toUpperCase()}${WHAT[secret.kind].slice(1)} appears in ` +
      `${secret.path} at line ${String(secret.line)}, column ${String(secret.column)} ` +
      `(${String(secret.length)} characters). The value has been withheld from this report and was ` +
      `replaced with ${secret.placeholder} before any part of this file was sent to an AI provider.`,
    location: locationOf(secret),
    evidence: {
      kind: secret.kind,
      path: secret.path,
      segment: secret.label,
      line: secret.line,
      column: secret.column,
      length: secret.length,
      placeholder: secret.placeholder,
      // Deliberately no `value`, no `preview`, no `prefix`. See the module note.
    },
    consequence: CONSEQUENCE[secret.kind],
    // Always: removing a credential from a file is something the user can do,
    // and re-verification can confirm it is gone.
    fixable: true,
  }));
}
