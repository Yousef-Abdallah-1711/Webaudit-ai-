/**
 * T178 — the two source-intake routes, from contracts/http-api.md:
 *
 *   GET  /repos         FR-007. Requires a connected account.
 *   POST /scans/upload  FR-015. Multipart. Streaming guard; refuses before extraction.
 *
 * Root-mounted rather than folded into `scansRoutes`, and mounted *ahead* of
 * it, for one reason that is worth stating because it looks like an
 * inconsistency: `app.use(express.json())` runs on every request, and a 50 MB
 * multipart body must not be handed to a JSON body parser first. Keeping the
 * upload handler in its own router lets it own its body entirely — nothing
 * between the socket and `readBoundedUpload` buffers anything.
 *
 * **Every refusal here happens before a scan exists.** This endpoint stages an
 * archive and returns a target; it does not create a scan and it does not
 * charge. The client then calls `POST /scans` with the returned `targetId` like
 * any other audit. Splitting it that way is what makes FR-015's "before
 * charging" structurally true rather than a matter of statement ordering — the
 * charge is in a different request.
 */

import busboy from 'busboy';
import { Router, type Request, type Response } from 'express';
import { ArchiveRefusedError } from '@webaudit/safe-archive';
import type { PrismaClient } from '../../prisma/generated/client/index.js';
import { requireAuth, type AuthedRequest } from '../middleware/auth.middleware.js';
import { PlanUpgradeRequiredError } from '../services/intake/create-scan.js';
import {
  RepositoryConnectionMissingError,
  RepositoryConnectionRevokedError,
  listRepositories,
  type GithubFetch,
} from '../services/intake/repos.js';
import { stageArchiveUpload } from '../services/intake/upload.js';
import { createUploadStorage, type UploadStorage } from '../services/storage/uploads.js';

export interface IntakeRoutesDeps {
  /** Injectable so a suite need not reach GitHub. */
  githubFetch?: GithubFetch;
  /** Injectable so a suite need not reach R2. Constructed lazily — see below. */
  storage?: UploadStorage;
}

/**
 * HTTP status for an archive refusal.
 *
 * `413` for "too big" and `422` for everything else. Both are refusals of a
 * well-formed request, but a client can act on the first (send less) and
 * cannot act on the second by retrying, and conflating them would have every
 * hostile archive look like a size problem in an operator's dashboard.
 */
function statusForRefusal(error: ArchiveRefusedError): number {
  return error.reason === 'ARCHIVE_TOO_LARGE' ? 413 : 422;
}

/**
 * A body this route could not read as multipart at all.
 *
 * Distinct from `ArchiveRefusedError` — that one means "we read your archive
 * and it broke a published rule", this one means "there was no archive here to
 * read". Both are the caller's fault and neither is a 500, which is what a bare
 * `Error` out of the busboy callbacks used to become. A client that omits the
 * file part or sends a truncated multipart body would have been told the
 * platform malfunctioned.
 */
class MalformedUploadError extends Error {}

/**
 * The first file part of a multipart body, as a stream, without buffering.
 *
 * Busboy is a push parser and `stageArchiveUpload` wants an async iterable, so
 * the file stream is handed over the moment it is announced rather than
 * collected. The promise rejects if the body ends with no file part; it does
 * *not* wait for the whole body first, which is the entire point — a client
 * sending 50 MB of fields and no file is cut off by the field limits below,
 * not by us reading all of it and then complaining.
 */
function firstFile(req: Request): Promise<{ filename: string; stream: AsyncIterable<Uint8Array> }> {
  return new Promise((resolve, reject) => {
    const parser = busboy({
      headers: req.headers,
      limits: { files: 1, fields: 4, fieldSize: 1_024, parts: 8 },
    });

    let handed = false;

    parser.on('file', (_name, stream, info) => {
      handed = true;
      resolve({ filename: info.filename ?? 'archive.zip', stream });
    });
    parser.on('close', () => {
      if (!handed) reject(new MalformedUploadError('The request contained no file part.'));
    });
    parser.on('error', (error: unknown) => {
      reject(
        new MalformedUploadError(
          error instanceof Error
            ? `The upload could not be read as multipart/form-data: ${error.message}`
            : 'The upload could not be read as multipart/form-data.',
        ),
      );
    });

    req.pipe(parser);
  });
}

export function intakeRoutes(db: PrismaClient, deps: IntakeRoutesDeps = {}): Router {
  const router = Router();

  // Constructed on first use, not at mount: `createUploadStorage` throws when
  // the R2 variables are unset, and an API that refuses to boot because nobody
  // has configured uploads yet is a worse failure than an upload route that
  // reports the misconfiguration when it is used.
  let storage = deps.storage;
  const storageFor = (): UploadStorage => (storage ??= createUploadStorage());

  router.use(requireAuth);

  router.get('/repos', async (req: AuthedRequest, res: Response) => {
    try {
      const repositories = await listRepositories(db, req.auth!.userId, deps.githubFetch);
      res.status(200).json({ repositories });
    } catch (error) {
      if (error instanceof RepositoryConnectionMissingError) {
        // 409, not 404: the route exists and the caller is authenticated. What
        // is missing is a precondition they can satisfy by connecting GitHub.
        res.status(409).json({
          error: { code: 'REPO_CONNECTION_MISSING', message: error.message },
        });
        return;
      }
      if (error instanceof RepositoryConnectionRevokedError) {
        res.status(409).json({
          error: { code: 'REPO_CONNECTION_REVOKED', message: error.message },
        });
        return;
      }
      throw error;
    }
  });

  router.post('/scans/upload', async (req: AuthedRequest, res: Response) => {
    const contentType = req.headers['content-type'] ?? '';
    if (!contentType.toLowerCase().startsWith('multipart/form-data')) {
      res.status(415).json({
        error: {
          code: 'UNSUPPORTED_MEDIA_TYPE',
          message: 'Upload an archive as multipart/form-data.',
        },
      });
      return;
    }

    try {
      const { filename, stream } = await firstFile(req);
      const staged = await stageArchiveUpload(
        db,
        { userId: req.auth!.userId, filename, body: stream },
        { storage: storageFor() },
      );
      res.status(201).json({ upload: staged });
    } catch (error) {
      if (error instanceof ArchiveRefusedError) {
        res.status(statusForRefusal(error)).json({
          error: {
            code: 'ARCHIVE_REFUSED',
            message: error.message,
            details: {
              reason: error.reason,
              ...(error.entryPath === undefined ? {} : { entryPath: error.entryPath }),
              ...(error.limit === undefined ? {} : { limit: error.limit }),
              ...(error.observed === undefined ? {} : { observed: error.observed }),
            },
          },
        });
        return;
      }
      if (error instanceof MalformedUploadError) {
        res.status(400).json({
          error: { code: 'UPLOAD_MALFORMED', message: error.message },
        });
        return;
      }
      if (error instanceof PlanUpgradeRequiredError) {
        res.status(403).json({
          error: {
            code: 'PLAN_UPGRADE_REQUIRED',
            message: error.message,
            details: { inputType: error.inputType, requiredTier: error.requiredTier },
          },
        });
        return;
      }
      throw error;
    }
  });

  return router;
}
