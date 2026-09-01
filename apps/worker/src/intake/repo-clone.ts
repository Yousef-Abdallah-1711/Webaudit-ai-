/**
 * T174 — materialising a connected repository into the scan workspace.
 *
 * **A zipball, not `git clone`, and that is a deliberate divergence from the
 * task's wording ("shallow clone") recorded here rather than left implicit.**
 * The task asks for the shallowest possible copy of a repository at a ref, and
 * GitHub already publishes exactly that as a single zip
 * (`/repos/{owner}/{repo}/zipball/{ref}`) — one commit, no history, no `.git`.
 * Taking it that way is better on three axes that matter more than fidelity to
 * the phrase:
 *
 *   1. **One extraction guard for both input types.** A repository arrives
 *      through the same `@webaudit/safe-archive` path an upload does, so a
 *      repository containing a symlink to `/etc` is refused by the code that
 *      was adversarially tested for it (T169). `git clone` would create that
 *      symlink, and the workspace confinement in `capability-sdk`'s `readFile`
 *      would then be the *only* thing standing between a hostile repository and
 *      the worker's filesystem. Two guards are better than one, and the same
 *      guard for both inputs is better than two.
 *   2. **No credential in a process argument list.** `git clone` needs the
 *      token in the URL, in an `http.extraHeader` argument, or behind an
 *      askpass script; the first two are visible in `ps` to anything sharing
 *      the host. A header on a fetch is visible to nothing.
 *   3. **No `git` binary in the worker image**, and therefore no `git` version
 *      to keep patched in a service that processes hostile input.
 *
 * What it costs: no history, no branches, no submodules. An audit reads a tree
 * at a ref, so none of the three is used by anything in this repository today.
 * If a capability ever needs history, this is the decision to revisit — see
 * research.md's open items.
 *
 * **The fetch is the SSRF-guarded one.** `safeFetch` re-validates every
 * redirect hop (R6), which matters here specifically: `api.github.com` answers
 * a zipball request with a 302 to `codeload.github.com`, so the second hop is
 * the one that actually delivers the bytes and it must be validated like the
 * first.
 */

import { safeFetch } from '@webaudit/safe-net';
import {
  DEFAULT_ARCHIVE_LIMITS,
  extractArchive,
  type ArchiveLimits,
  type ExtractionResult,
} from '@webaudit/safe-archive';
import { RepositoryConnectionRevokedError, type GithubFetch } from '@webaudit/api/intake';

/** `owner/repo`. The canonical value a REPOSITORY target carries. */
const REPO_PATTERN = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/;

export class RepositoryUnavailableError extends Error {
  override readonly name = 'RepositoryUnavailableError';
  constructor(
    readonly fullName: string,
    readonly status: number,
  ) {
    super(
      `The repository ${fullName} could not be read (HTTP ${String(status)}). It may have been ` +
        'renamed, made private, or removed from the connected account.',
    );
  }
}

export interface MaterialiseRepositoryOptions {
  /** Plaintext GitHub token. Obtained from `githubTokenFor`, never stored here. */
  readonly token: string;
  /** `owner/repo`. */
  readonly fullName: string;
  /** A branch, tag, or commit. Omit for the repository's default branch. */
  readonly ref?: string;
  /** The scan workspace. Contents land directly in it, not in a subdirectory. */
  readonly destRoot: string;
  readonly limits?: ArchiveLimits;
  readonly fetchImpl?: GithubFetch;
  readonly signal?: AbortSignal;
}

/**
 * The `/{ref}` suffix on GitHub's zipball endpoint — empty when the caller
 * wants the default branch, `/<ref>` otherwise. `encodeURIComponent` because a
 * tag or branch name is not guaranteed to be URL-safe as written (`feature/x`,
 * a name with a space).
 */
function refPath(ref: string | undefined): string {
  return ref === undefined ? '' : `/${encodeURIComponent(ref)}`;
}

/**
 * Fetch the repository at a ref and extract it into the scan workspace.
 *
 * `stripComponents: 1` removes the `owner-repo-<sha>/` wrapper GitHub puts
 * around a zipball, so a capability's glob sees `package.json` rather than
 * `acme-storefront-8f2c1ab/package.json` — a path that would otherwise change
 * on every commit and make every source finding's fingerprint unstable across
 * audits, which R3 forbids.
 */
export async function materialiseRepository(
  options: MaterialiseRepositoryOptions,
): Promise<ExtractionResult> {
  if (!REPO_PATTERN.test(options.fullName)) {
    throw new RepositoryUnavailableError(options.fullName, 0);
  }

  const limits = options.limits ?? DEFAULT_ARCHIVE_LIMITS;
  const fetchImpl = options.fetchImpl ?? safeFetch;
  const ref = refPath(options.ref);

  const response = await fetchImpl(
    `https://api.github.com/repos/${options.fullName}/zipball${ref}`,
    {
      headers: {
        authorization: `Bearer ${options.token}`,
        accept: 'application/vnd.github+json',
        'user-agent': 'WebAuditAI',
        'x-github-api-version': '2022-11-28',
      },
      // The one place the archive size limit is enforced *by the transport*.
      // Everything downstream of here has already accepted the bytes.
      maxResponseBytes: limits.maxBytes,
      timeoutMs: 120_000,
      ...(options.signal === undefined ? {} : { signal: options.signal }),
    },
  );

  if (response.status === 401 || response.status === 403) {
    throw new RepositoryConnectionRevokedError(response.status);
  }
  if (response.status !== 200) {
    throw new RepositoryUnavailableError(options.fullName, response.status);
  }

  return extractArchive(response.bytes(), {
    destRoot: options.destRoot,
    limits,
    stripComponents: 1,
  });
}

export { RepositoryConnectionRevokedError };
