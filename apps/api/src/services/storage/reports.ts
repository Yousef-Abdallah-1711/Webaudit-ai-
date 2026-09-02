/**
 * T117 — R2 object storage, per research.md R17: "per-scan prefix, rendered
 * artifacts and screenshots only — never structured findings, which stay
 * relational." The JSON report itself is synthesized on read from `Scan` +
 * `ModuleResult[]` + `Issue[]` (`reports.routes.ts`, T118) and never touches
 * this module; what belongs here is exactly what cannot be reconstructed
 * from a database row — a rendered screenshot, an exported artifact bundle.
 *
 * **R2 is S3-compatible**, so this wraps `@aws-sdk/client-s3` against R2's
 * endpoint rather than adding a Cloudflare-specific SDK — the same reasoning
 * `.env.example`'s `R2_*` variables already assume (`R2_ACCOUNT_ID` builds
 * the endpoint URL; the rest are ordinary S3 credentials).
 *
 * **Nothing calls this yet, honestly.** No capability produces a screenshot
 * or a rendered artifact in this sub-phase (`packages/capabilities-vendored/`
 * is empty; T119-124), and FR-093's export bundle is a later task. This is
 * real, working infrastructure — not a stub — but it is unconsumed until
 * something has a screenshot to store, which is why there is no test here
 * beyond what the key-derivation logic itself can prove without a real R2
 * bucket.
 */

import {
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';

export interface ReportStorage {
  /** `key` is relative to the scan's own prefix — callers never see the full path. */
  putObject(scanId: string, key: string, body: Uint8Array, contentType: string): Promise<void>;
  getObject(scanId: string, key: string): Promise<Uint8Array>;
  /**
   * Delete every object under `scans/<scanId>/`. This is what makes FR-092's
   * retention removal (and FR-090's workspace destruction, once screenshots are
   * stored) a single prefix operation. Returns the count removed.
   */
  deleteScanObjects(scanId: string): Promise<number>;
}

/** `scans/<scanId>/<key>` — every object for a scan lives under one prefix. */
export function objectKeyFor(scanId: string, key: string): string {
  if (scanId.trim() === '') throw new Error('scanId must not be empty.');
  if (key.trim() === '' || key.includes('..')) {
    throw new Error(`Refusing an object key that is empty or attempts traversal: "${key}".`);
  }
  return `scans/${scanId}/${key}`;
}

export interface ReportStorageOptions {
  readonly accountId: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  readonly bucket: string;
}

function optionsFromEnv(): ReportStorageOptions {
  const accountId = process.env['R2_ACCOUNT_ID'];
  const accessKeyId = process.env['R2_ACCESS_KEY_ID'];
  const secretAccessKey = process.env['R2_SECRET_ACCESS_KEY'];
  const bucket = process.env['R2_BUCKET'];
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
    throw new Error(
      'R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, and R2_BUCKET must all be set to ' +
        'store a report artifact.',
    );
  }
  return { accountId, accessKeyId, secretAccessKey, bucket };
}

export function createReportStorage(options: ReportStorageOptions = optionsFromEnv()): ReportStorage {
  const client = new S3Client({
    region: 'auto',
    endpoint: `https://${options.accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: options.accessKeyId, secretAccessKey: options.secretAccessKey },
  });

  return {
    async putObject(scanId, key, body, contentType): Promise<void> {
      await client.send(
        new PutObjectCommand({
          Bucket: options.bucket,
          Key: objectKeyFor(scanId, key),
          Body: body,
          ContentType: contentType,
        }),
      );
    },
    async getObject(scanId, key): Promise<Uint8Array> {
      const result = await client.send(
        new GetObjectCommand({ Bucket: options.bucket, Key: objectKeyFor(scanId, key) }),
      );
      if (result.Body === undefined) {
        throw new Error(`No object at scans/${scanId}/${key}.`);
      }
      return result.Body.transformToByteArray();
    },
    async deleteScanObjects(scanId): Promise<number> {
      if (scanId.trim() === '' || scanId.includes('..') || scanId.includes('/')) {
        throw new Error(`Refusing a scan prefix of an unexpected shape: "${scanId}".`);
      }
      const prefix = `scans/${scanId}/`;
      let removed = 0;
      let continuationToken: string | undefined;
      do {
        const listed = await client.send(
          new ListObjectsV2Command({
            Bucket: options.bucket,
            Prefix: prefix,
            ...(continuationToken === undefined ? {} : { ContinuationToken: continuationToken }),
          }),
        );
        const keys = (listed.Contents ?? [])
          .map((o) => o.Key)
          .filter((k): k is string => typeof k === 'string');
        if (keys.length > 0) {
          await client.send(
            new DeleteObjectsCommand({
              Bucket: options.bucket,
              Delete: { Objects: keys.map((Key) => ({ Key })), Quiet: true },
            }),
          );
          removed += keys.length;
        }
        continuationToken = listed.IsTruncated === true ? listed.NextContinuationToken : undefined;
      } while (continuationToken !== undefined);
      return removed;
    },
  };
}
