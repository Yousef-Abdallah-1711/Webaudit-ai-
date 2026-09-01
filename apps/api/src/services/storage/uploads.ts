/**
 * T173 — upload staging in R2.
 *
 * A sibling of `reports.ts` rather than a method on it, and the split is the
 * invariant. `reports.ts`'s whole contract is "`scans/<scanId>/<key>` — every
 * object for a scan lives under one prefix", which is what makes FR-090's
 * destruction obligation expressible as "delete a prefix". A staged upload
 * cannot live there: it exists *before* any scan does, and one archive may be
 * audited by several scans over time. Giving `ReportStorage` a general
 * `putAtAnyKey` to accommodate it would dissolve the only rule it has.
 *
 * So uploads get their own prefix, `uploads/<userId>/<sha256>.zip`, and their
 * own narrow interface. Two consequences worth stating:
 *
 *   - **Content-addressed.** Re-uploading the same archive produces the same
 *     key and overwrites itself, so a user who retries a failed submission does
 *     not pay for two copies and a duplicate audit is recognisable by key.
 *   - **User-scoped.** The user id is in the prefix, so a key belonging to
 *     someone else cannot be reached by guessing a hash — the caller's own id
 *     is always what builds the path, never a value from the request.
 */

import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';

export interface UploadStorage {
  put(userId: string, sha256: string, body: Uint8Array): Promise<string>;
  get(key: string): Promise<Uint8Array>;
  remove(key: string): Promise<void>;
}

const KEY_PATTERN = /^uploads\/[A-Za-z0-9_-]{1,64}\/[a-f0-9]{64}\.zip$/;

export function uploadKeyFor(userId: string, sha256: string): string {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(userId)) throw new Error('Not a usable user id.');
  if (!/^[a-f0-9]{64}$/.test(sha256)) throw new Error('Not a usable content hash.');
  return `uploads/${userId}/${sha256}.zip`;
}

/**
 * A key is data that came back from a database column, so it is validated
 * before it is used as a path — the same reason `objectKeyFor` refuses `..`.
 */
export function assertUploadKey(key: string): string {
  if (!KEY_PATTERN.test(key)) throw new Error(`Refusing an upload key of an unexpected shape.`);
  return key;
}

export interface UploadStorageOptions {
  readonly accountId: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  readonly bucket: string;
}

function optionsFromEnv(): UploadStorageOptions {
  const accountId = process.env['R2_ACCOUNT_ID'];
  const accessKeyId = process.env['R2_ACCESS_KEY_ID'];
  const secretAccessKey = process.env['R2_SECRET_ACCESS_KEY'];
  const bucket = process.env['R2_BUCKET'];
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
    throw new Error(
      'R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, and R2_BUCKET must all be set to ' +
        'stage an uploaded archive.',
    );
  }
  return { accountId, accessKeyId, secretAccessKey, bucket };
}

export function createUploadStorage(
  options: UploadStorageOptions = optionsFromEnv(),
): UploadStorage {
  const client = new S3Client({
    region: 'auto',
    endpoint: `https://${options.accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: options.accessKeyId, secretAccessKey: options.secretAccessKey },
  });

  return {
    async put(userId, sha256, body): Promise<string> {
      const key = uploadKeyFor(userId, sha256);
      await client.send(
        new PutObjectCommand({
          Bucket: options.bucket,
          Key: key,
          Body: body,
          ContentType: 'application/zip',
        }),
      );
      return key;
    },
    async get(key): Promise<Uint8Array> {
      const result = await client.send(
        new GetObjectCommand({ Bucket: options.bucket, Key: assertUploadKey(key) }),
      );
      if (result.Body === undefined) throw new Error(`No staged upload at ${key}.`);
      return result.Body.transformToByteArray();
    },
    async remove(key): Promise<void> {
      await client.send(
        new DeleteObjectCommand({ Bucket: options.bucket, Key: assertUploadKey(key) }),
      );
    },
  };
}
