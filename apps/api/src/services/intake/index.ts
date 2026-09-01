/**
 * The intake surface `apps/worker` is allowed to reach.
 *
 * Same reasoning as `services/control-gate/index.ts`: the worker needs the
 * sealed GitHub credential and the typed revocation, and re-implementing
 * either would mean two definitions of "is this connection still good" that
 * drift the first time GitHub changes a status code. What is *not* exported is
 * `create-scan` — charging is the API's, and a worker that could create a
 * charged scan would put the credit path on both sides of the queue.
 */

export {
  RepositoryConnectionMissingError,
  RepositoryConnectionRevokedError,
  assertRepositoryConnectionLive,
  githubRequest,
  githubTokenFor,
  listRepositories,
  type ConnectedRepository,
  type GithubFetch,
} from './repos.js';

export {
  createUploadStorage,
  uploadKeyFor,
  assertUploadKey,
  type UploadStorage,
} from '../storage/uploads.js';
