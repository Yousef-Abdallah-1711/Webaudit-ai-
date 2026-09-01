/**
 * T174 (API half) — the connected repository account, and what it can still do.
 *
 * FR-007 and `contracts/http-api.md`'s `GET /repos` ("Requires a connected
 * account"). Two questions live here, and keeping them together is the point:
 * *is there a connection* and *does it still work* are different questions with
 * different answers, and a route that only asked the first one would list
 * repositories from a token GitHub revoked last week.
 *
 * **A revoked token is discovered, never assumed.** There is no `revokedAt`
 * column for a provider credential and there should not be: revocation happens
 * on GitHub's side, out of band, and the only honest way to know is to use the
 * token and read the answer. `401` and `403` are the answer, and
 * `RepositoryConnectionRevokedError` is how it reaches the caller — clearly
 * enough for `create-scan.ts` to refuse before charging (Principle VI: never
 * charge for our failures, and never charge for work we already know cannot be
 * delivered).
 *
 * **The token never leaves this module in plaintext except to a fetch.** It is
 * sealed at rest (`token-vault.ts`, FR-091), opened here, put in an
 * `Authorization` header, and dropped. It is never logged, never returned, and
 * never placed in an error message — the failures below name the provider and
 * the remedy, not the credential.
 */

import { safeFetch } from '@webaudit/safe-net';
import type { PrismaClient } from '../../../prisma/generated/client/index.js';
import { open } from '../auth/token-vault.js';

/** GitHub's REST root. A constant so no caller can be pointed somewhere else. */
const GITHUB_API = 'https://api.github.com';

/** Enough to choose a repository. Deliberately not the whole API response. */
export interface ConnectedRepository {
  /** `owner/name`. The canonical value a REPOSITORY target is keyed on. */
  readonly fullName: string;
  readonly defaultBranch: string;
  readonly isPrivate: boolean;
  readonly updatedAt: string;
}

export class RepositoryConnectionMissingError extends Error {
  override readonly name = 'RepositoryConnectionMissingError';
  constructor() {
    super('No repository account is connected. Connect GitHub to audit a repository.');
  }
}

export class RepositoryConnectionRevokedError extends Error {
  override readonly name = 'RepositoryConnectionRevokedError';
  constructor(readonly status: number) {
    super(
      'The connected GitHub account no longer accepts this credential. Reconnect GitHub to ' +
        'audit a repository — nothing was charged for this attempt.',
    );
  }
}

/**
 * The plaintext token for a user's GitHub connection.
 *
 * Throws `RepositoryConnectionMissingError` rather than returning null: every
 * caller's response to "no connection" is to refuse, and an optional return
 * type invites a caller to carry on with `undefined` and discover it later,
 * after charging.
 */
export async function githubTokenFor(db: PrismaClient, userId: string): Promise<string> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { githubTokenEnc: true, githubTokenIv: true },
  });

  if (!user?.githubTokenEnc || !user.githubTokenIv) throw new RepositoryConnectionMissingError();

  try {
    // Prisma types a `Bytes` column as `Uint8Array`; the vault wants Buffers.
    // `Buffer.from` on a view is a copy, which is also what we want — nothing
    // downstream should be able to write back into the row's own memory.
    return open({
      ciphertext: Buffer.from(user.githubTokenEnc),
      iv: Buffer.from(user.githubTokenIv),
    });
  } catch {
    // GCM is authenticated, so a failure here means the ciphertext or the key
    // changed underneath the record. The stored credential is unusable, which
    // is operationally the same as revoked and is reported the same way.
    throw new RepositoryConnectionRevokedError(0);
  }
}

/** The transport, injectable so a suite need not reach GitHub. */
export type GithubFetch = typeof safeFetch;

interface RawRepository {
  readonly full_name?: unknown;
  readonly default_branch?: unknown;
  readonly private?: unknown;
  readonly updated_at?: unknown;
}

function toRepository(raw: RawRepository): ConnectedRepository | null {
  if (typeof raw.full_name !== 'string' || raw.full_name === '') return null;
  return {
    fullName: raw.full_name,
    defaultBranch: typeof raw.default_branch === 'string' ? raw.default_branch : 'main',
    isPrivate: raw.private === true,
    updatedAt: typeof raw.updated_at === 'string' ? raw.updated_at : '',
  };
}

/**
 * Call GitHub with the user's credential, turning an auth failure into the
 * typed revocation every caller branches on.
 */
export async function githubRequest(
  token: string,
  path: string,
  fetchImpl: GithubFetch = safeFetch,
): Promise<ReturnType<GithubFetch> extends Promise<infer R> ? R : never> {
  const response = await fetchImpl(`${GITHUB_API}${path}`, {
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/vnd.github+json',
      'user-agent': 'WebAuditAI',
      'x-github-api-version': '2022-11-28',
    },
    timeoutMs: 15_000,
  });

  if (response.status === 401 || response.status === 403) {
    throw new RepositoryConnectionRevokedError(response.status);
  }
  return response;
}

/**
 * The repositories this user can audit.
 *
 * One page of 100, most recently updated first. Not paginated: the picker is a
 * list a human scans, and walking every page of an account with four thousand
 * repositories would turn one route into a rate-limit problem. A search box
 * over the connected account is the right answer when someone needs it, and it
 * is a different endpoint.
 */
export async function listRepositories(
  db: PrismaClient,
  userId: string,
  fetchImpl: GithubFetch = safeFetch,
): Promise<readonly ConnectedRepository[]> {
  const token = await githubTokenFor(db, userId);
  const response = await githubRequest(
    token,
    '/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member',
    fetchImpl,
  );

  if (response.status !== 200) {
    throw new Error(`GitHub answered ${String(response.status)} listing repositories.`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(response.text());
  } catch {
    throw new Error('GitHub returned a repository list that could not be parsed.');
  }
  if (!Array.isArray(parsed)) return [];

  return parsed
    .map((entry) => toRepository(entry as RawRepository))
    .filter((repository): repository is ConnectedRepository => repository !== null);
}

/**
 * Confirm the connection still works, without listing anything.
 *
 * `create-scan.ts` calls this before charging for a REPOSITORY audit. It is a
 * single cheap request against `/user`, and it exists because the alternative —
 * discovering the revocation in the worker, halfway through a charged scan — is
 * a refund path rather than a refusal path, and Principle VI prefers the
 * refusal.
 */
export async function assertRepositoryConnectionLive(
  db: PrismaClient,
  userId: string,
  fetchImpl: GithubFetch = safeFetch,
): Promise<void> {
  const token = await githubTokenFor(db, userId);
  await githubRequest(token, '/user', fetchImpl);
}
