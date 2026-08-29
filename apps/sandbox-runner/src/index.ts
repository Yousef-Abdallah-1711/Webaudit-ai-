/**
 * @webaudit/sandbox-runner
 *
 * Untrusted capability isolation (R1).
 * NO network egress, NO database credentials — an escape must yield access to
 * nothing worth having. First real work: T220. Until it exists, the upload path
 * returns 503 SANDBOX_UNAVAILABLE and never falls back.
 */

export const SERVICE_NAME = '@webaudit/sandbox-runner' as const;
