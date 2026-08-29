/**
 * T054 — FR-017 Level 2: "The user demonstrates control by publishing a
 * system-issued token, either as a file at a system-specified path on the target
 * or as a DNS record for its domain."
 *
 * Two properties do the work here, and neither is obvious from the requirement:
 *
 * **The token is per `Target` row, not per address.** `Target` is unique on
 * (userId, inputType, canonicalValue), so two accounts naming the same host get
 * two rows and two different tokens. This is what makes SC-021's third bypass
 * fail: the token is published in public, so a second account can read it — but
 * reading it is useless, because the check looks for the token issued to *that*
 * row. Verification is a property of the account's claim, not of the host.
 *
 * **Only the newest pending token counts.** Issuing again supersedes the last
 * one. Without that, a token leaked or published years ago stays a valid key
 * for ever, and the history the schema keeps becomes a liability rather than a
 * record.
 *
 * The probe is injected. The real one reaches the target through
 * `@webaudit/safe-net`, which is the only network path in the product (R6); the
 * adverse suite passes a map, so "the user removed the token" is a `delete` and
 * not a live host that has to be talked out of serving a file.
 */

import { randomBytes, timingSafeEqual } from 'node:crypto';
import { resolveTxt } from 'node:dns/promises';
import { safeFetch } from '@webaudit/safe-net';
import { CONTROL_GATE } from '@webaudit/config';
import type { ControlLevel, VerificationMethod } from '@webaudit/types';
import type { PrismaClient } from '../../../prisma/generated/client/index.js';
import { level1RateBound } from './rate-bound.js';

/**
 * How the platform reads what the user published.
 *
 * Two methods, because a user may control a host's DNS without being able to
 * deploy a file to it, or the reverse.
 */
export interface ControlProbe {
  /** The file's contents, or null if it is absent or unreadable. Never throws. */
  fetchFile(url: string): Promise<string | null>;
  /** Every TXT value at the name. Empty if there is no record. Never throws. */
  resolveTxt(name: string): Promise<string[]>;
}

export class TargetNotAvailableError extends Error {
  override readonly name = 'TargetNotAvailableError';
  constructor(readonly targetId: string) {
    super(`Target ${targetId} is not available to this account.`);
  }
}

export class VerificationFailedError extends Error {
  override readonly name = 'VerificationFailedError';
  constructor(
    readonly targetId: string,
    readonly method: VerificationMethod | null,
    readonly detail: string,
  ) {
    super(`Verification of target ${targetId} failed: ${detail}`);
  }
}

export interface StartVerificationInput {
  readonly targetId: string;
  readonly userId: string;
  readonly method: VerificationMethod;
}

export interface IssuedVerification {
  readonly verificationId: string;
  readonly method: VerificationMethod;
  readonly token: string;
  readonly expiresAt: Date;
  /** For FILE: the absolute URL the token must be served from. */
  readonly fileUrl?: string;
  /** For DNS: the TXT record name the token must be published at. */
  readonly recordName?: string;
}

type VerifyDb = Pick<PrismaClient, 'target' | 'targetVerification' | 'auditLogEntry'>;

interface TargetRow {
  readonly id: string;
  readonly canonicalValue: string;
  readonly controlLevel: ControlLevel;
}

async function ownedTarget(db: VerifyDb, targetId: string, userId: string): Promise<TargetRow> {
  const target = await db.target.findFirst({
    where: { id: targetId, userId },
    select: { id: true, canonicalValue: true, controlLevel: true },
  });
  // Same error for "not yours" and "does not exist": a distinguishable response
  // is an oracle for which target ids are real.
  if (target === null) throw new TargetNotAvailableError(targetId);
  return target;
}

/** The host a URL target's verification applies to. */
function hostOf(canonicalValue: string): string {
  try {
    return new URL(canonicalValue).hostname;
  } catch {
    // A repository or archive target has no host, so DNS cannot apply to it.
    return '';
  }
}

/** The origin a URL target's file verification is served from, or `''`. */
function originOf(canonicalValue: string): string {
  try {
    return new URL(canonicalValue).origin;
  } catch {
    // A repository or archive target has no origin, so FILE cannot apply to it.
    // `hostOf` above has had this guard since the beginning, which is why the
    // DNS branch refuses such a target cleanly and the FILE branch used to throw
    // ERR_INVALID_URL out of the service and land as a 500.
    return '';
  }
}

export function fileUrlFor(canonicalValue: string): string {
  // The origin, not the submitted path: a token under /some/page/ proves control
  // of that page's directory, which is not the same as control of the host.
  const origin = originOf(canonicalValue);
  if (origin === '') {
    throw new VerificationFailedError(
      canonicalValue,
      'FILE',
      'this target has no origin to serve a file from, so file verification does not apply',
    );
  }
  return `${origin}${CONTROL_GATE.verificationFilePath}`;
}

export function recordNameFor(canonicalValue: string): string {
  return `${CONTROL_GATE.dnsRecordPrefix}.${hostOf(canonicalValue)}`;
}

export async function startVerification(
  db: VerifyDb,
  input: StartVerificationInput,
): Promise<IssuedVerification> {
  const target = await ownedTarget(db, input.targetId, input.userId);

  if (input.method === 'DNS' && hostOf(target.canonicalValue) === '') {
    throw new VerificationFailedError(
      target.id,
      'DNS',
      'this target has no domain, so DNS verification does not apply',
    );
  }

  // Checked here, beside the DNS guard, and **before the writes below**. The
  // ordering is the point: `fileUrlFor` is called at the end of this function,
  // by which time the caller's outstanding token has been revoked and a new row
  // created. A throw there took a user's working verification away as a side
  // effect of a request that reported a server error.
  if (input.method === 'FILE' && originOf(target.canonicalValue) === '') {
    throw new VerificationFailedError(
      target.id,
      'FILE',
      'this target has no origin to serve a file from, so file verification does not apply',
    );
  }

  // Supersede whatever was outstanding, for every method. A user who starts
  // with FILE and switches to DNS should not leave a live FILE token behind.
  await db.targetVerification.updateMany({
    where: { targetId: target.id, confirmedAt: null, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  const token = randomBytes(CONTROL_GATE.tokenBytes).toString('base64url');
  const created = await db.targetVerification.create({
    data: { targetId: target.id, method: input.method, token },
    select: { id: true, issuedAt: true },
  });

  await db.auditLogEntry.create({
    data: {
      actorId: input.userId,
      action: 'control.verification_issued',
      subjectType: 'Target',
      subjectId: target.id,
      after: { verificationId: created.id, method: input.method },
    },
  });

  return {
    verificationId: created.id,
    method: input.method,
    token,
    expiresAt: new Date(created.issuedAt.getTime() + CONTROL_GATE.tokenTtlMs),
    ...(input.method === 'FILE'
      ? { fileUrl: fileUrlFor(target.canonicalValue) }
      : { recordName: recordNameFor(target.canonicalValue) }),
  };
}

/**
 * Is the token the user was issued actually published right now?
 *
 * Shared by `checkVerification` (the user pressing "check") and
 * `reconfirmControl` (the platform checking before a load-generating run), so
 * the two can never drift apart. A re-confirmation that asks a slightly
 * different question from the original check is how bypass 2 gets through.
 */
export async function isTokenPublished(
  probe: ControlProbe,
  method: VerificationMethod,
  canonicalValue: string,
  token: string,
): Promise<boolean> {
  if (method === 'FILE') {
    const body = await probe.fetchFile(fileUrlFor(canonicalValue));
    return body !== null && matchesToken(body.trim(), token);
  }
  const values = await probe.resolveTxt(recordNameFor(canonicalValue));
  // A domain's TXT records carry SPF, DKIM, and every other vendor's proof.
  // Ours only has to be among them.
  return values.some((value) => matchesToken(value.trim(), token));
}

function matchesToken(candidate: string, token: string): boolean {
  const a = Buffer.from(candidate, 'utf8');
  const b = Buffer.from(token, 'utf8');
  // Length is public (every token is the same length) but the comparison is
  // constant-time anyway: this runs on caller-supplied input and costs nothing.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export interface CheckVerificationResult {
  readonly targetId: string;
  readonly method: VerificationMethod;
  readonly controlLevel: ControlLevel;
  readonly confirmedAt: Date;
}

/**
 * Confirm the outstanding token and promote the target to VERIFIED.
 *
 * This is the user-initiated check. It is not the last one: `reconfirm.ts` runs
 * again immediately before every load-generating check, because control
 * established here can be lost tomorrow.
 */
export async function checkVerification(
  db: VerifyDb,
  input: { targetId: string; userId: string },
  probe: ControlProbe,
): Promise<CheckVerificationResult> {
  const target = await ownedTarget(db, input.targetId, input.userId);

  const pending = await db.targetVerification.findFirst({
    where: { targetId: target.id, confirmedAt: null, revokedAt: null },
    orderBy: { issuedAt: 'desc' },
    select: { id: true, method: true, token: true, issuedAt: true },
  });
  if (pending === null) {
    throw new VerificationFailedError(target.id, null, 'no verification is outstanding');
  }

  const checkedAt = new Date();

  if (checkedAt.getTime() - pending.issuedAt.getTime() > CONTROL_GATE.tokenTtlMs) {
    await db.targetVerification.update({
      where: { id: pending.id },
      data: { revokedAt: checkedAt, lastCheckedAt: checkedAt },
    });
    throw new VerificationFailedError(target.id, pending.method, 'the issued token has expired');
  }

  const published = await isTokenPublished(
    probe,
    pending.method,
    target.canonicalValue,
    pending.token,
  );

  if (!published) {
    // Not revoked: the user may simply not have finished publishing. Only the
    // check is recorded, so retrying is free.
    await db.targetVerification.update({
      where: { id: pending.id },
      data: { lastCheckedAt: checkedAt },
    });
    throw new VerificationFailedError(
      target.id,
      pending.method,
      pending.method === 'FILE'
        ? `no matching token at ${fileUrlFor(target.canonicalValue)}`
        : `no matching TXT record at ${recordNameFor(target.canonicalValue)}`,
    );
  }

  await db.targetVerification.update({
    where: { id: pending.id },
    data: { confirmedAt: checkedAt, lastCheckedAt: checkedAt },
  });
  const updated = await db.target.update({
    where: { id: target.id },
    data: { controlLevel: 'VERIFIED' },
    select: { controlLevel: true },
  });

  await db.auditLogEntry.create({
    data: {
      actorId: input.userId,
      action: 'control.verified',
      subjectType: 'Target',
      subjectId: target.id,
      before: { controlLevel: target.controlLevel },
      after: { controlLevel: updated.controlLevel, method: pending.method },
    },
  });

  return {
    targetId: target.id,
    method: pending.method,
    controlLevel: updated.controlLevel,
    confirmedAt: checkedAt,
  };
}

/**
 * Wait out an ordinary burst before giving up. `tryAcquire` failing once does
 * not mean the target is over budget for good — it means this instant is.
 * Waiting up to the bucket's own refill time (capped, so a caller never hangs
 * indefinitely) and retrying once respects the published rate instead of
 * refusing traffic the bound would have permitted a moment later.
 *
 * This matters beyond latency: `reconfirmControl` (`reconfirm.ts`) cannot
 * tell a rate-limit refusal from "the token genuinely is not there", and
 * treats the latter as loss of verification — a destructive, hard-to-recover
 * write. Retrying here shrinks the window in which an ordinary burst could be
 * mistaken for a removed token to near zero; `reconfirm.ts`'s own check
 * against the still-exhausted bucket covers what this retry cannot.
 */
async function acquireOrWait(key: string): Promise<boolean> {
  if (level1RateBound.tryAcquire(key)) return true;
  const waitMs = Math.min(level1RateBound.retryAfterMs(key), 2000);
  await new Promise((resolve) => setTimeout(resolve, waitMs));
  return level1RateBound.tryAcquire(key);
}

/**
 * The production probe.
 *
 * Reads the file through `@webaudit/safe-net`, which is the only network path in
 * the product (R6) — so a verification check against `http://169.254.169.254/`
 * is refused by the same four layers that refuse an audit of it. Both methods
 * swallow their failures into "not published", because from the gate's point of
 * view an unreachable host, a 404, and a refused address are the same answer:
 * the token is not there. The distinction matters for the message a user sees on
 * `verify/check`, which is why `checkVerification` reports the URL it looked at.
 *
 * Both methods also consult `level1RateBound` before issuing the request
 * (FR-017), keyed on the hostname/record name being probed, via `acquireOrWait`
 * above — a single wait-and-retry rather than a bare refusal, since a bare
 * refusal here is indistinguishable from "not published" to every caller,
 * `reconfirmControl` included (see that function's own rate-limiter check for
 * why a refusal that survives the retry still must not be treated as removal).
 */
export function createSafeNetProbe(): ControlProbe {
  return {
    async fetchFile(url: string): Promise<string | null> {
      try {
        const key = new URL(url).hostname;
        if (!(await acquireOrWait(key))) return null;
        const response = await safeFetch(url, {
          // A verification token is 43 characters. Anything larger is not one,
          // and reading it would let a target feed us an arbitrary payload.
          maxResponseBytes: 4096,
          timeoutMs: 10_000,
          // **No redirects.** `safeFetch` defaults to five and re-validates each
          // hop, which is right when auditing a site and wrong when proving
          // control of one. If the well-known path on victim.com redirects
          // off-origin, control of victim.com could be demonstrated with a token
          // served from a host the prover owns. The proof has to come from the
          // host being proved, so the only acceptable hop count is zero.
          maxRedirects: 0,
        });
        if (response.status !== 200) return null;
        return response.text();
      } catch {
        return null;
      }
    },
    async resolveTxt(name: string): Promise<string[]> {
      try {
        if (!(await acquireOrWait(name))) return [];
        // Each record arrives as an array of strings, because a long TXT value
        // is chunked at 255 bytes on the wire. Joining is how it reads back.
        return (await resolveTxt(name)).map((chunks) => chunks.join(''));
      } catch {
        return [];
      }
    },
  };
}
