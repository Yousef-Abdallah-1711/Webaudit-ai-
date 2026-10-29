/**
 * The narrow object-store port `createArtifact` and the reaper need, plus an in-memory implementation (tests,
 * local runs) and an S3-compatible one (Cloudflare R2). Like `uploads.ts`, the real client is only constructed
 * when first asked for, so a deployment that never stores artifacts boots without R2 credentials.
 */

import {
  DeleteObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';

export interface StoredObject {
  readonly key: string;
  readonly lastModified: Date;
}

export interface ArtifactStore {
  put(key: string, body: Uint8Array, contentType: string): Promise<void>;
  delete(key: string): Promise<void>;
  /** Every object under `prefix` (paged internally). */
  list(prefix: string): Promise<readonly StoredObject[]>;
}

/** `artifacts/<scanId>/<executionUnitId>/<sha256 | cuid-like>`; ids and the leaf are restricted so no `..` can appear. */
const KEY_PATTERN = /^artifacts\/[A-Za-z0-9_-]{1,64}\/[A-Za-z0-9_-]{1,64}\/[A-Za-z0-9_-]{8,128}$/;

export function artifactKeyFor(scanId: string, executionUnitId: string, leaf: string): string {
  const key = `artifacts/${scanId}/${executionUnitId}/${leaf}`;
  return assertArtifactKey(key);
}

/** A key is data that comes back from a column or a listing: validate before any storage call (R8, rule 2). */
export function assertArtifactKey(key: string): string {
  if (!KEY_PATTERN.test(key)) throw new Error('Refusing an artifact key of an unexpected shape.');
  return key;
}

export function createMemoryArtifactStore(now: () => Date = () => new Date()): ArtifactStore & {
  readonly objects: Map<string, { body: Uint8Array; contentType: string; lastModified: Date }>;
  /** Test hook: backdate an object so the reaper's grace period can be exercised. */
  backdate(key: string, lastModified: Date): void;
} {
  const objects = new Map<string, { body: Uint8Array; contentType: string; lastModified: Date }>();
  return {
    objects,
    put(key, body, contentType) {
      assertArtifactKey(key);
      objects.set(key, { body, contentType, lastModified: now() });
      return Promise.resolve();
    },
    delete(key) {
      assertArtifactKey(key);
      objects.delete(key);
      return Promise.resolve();
    },
    list(prefix) {
      return Promise.resolve(
        [...objects.entries()]
          .filter(([k]) => k.startsWith(prefix))
          .map(([key, v]) => ({ key, lastModified: v.lastModified })),
      );
    },
    backdate(key, lastModified) {
      const o = objects.get(key);
      if (o !== undefined) o.lastModified = lastModified;
    },
  };
}

export function createR2ArtifactStore(client: S3Client, bucket: string): ArtifactStore {
  return {
    async put(key, body, contentType) {
      assertArtifactKey(key);
      await client.send(
        new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType }),
      );
    },
    async delete(key) {
      assertArtifactKey(key);
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    },
    async list(prefix) {
      if (!prefix.startsWith('artifacts/'))
        throw new Error('Refusing to list outside the artifacts/ prefix.');
      const found: StoredObject[] = [];
      let token: string | undefined;
      do {
        const page = await client.send(
          new ListObjectsV2Command({
            Bucket: bucket,
            Prefix: prefix,
            ...(token === undefined ? {} : { ContinuationToken: token }),
          }),
        );
        for (const o of page.Contents ?? []) {
          if (o.Key !== undefined && o.LastModified !== undefined)
            found.push({ key: o.Key, lastModified: o.LastModified });
        }
        token = page.IsTruncated === true ? page.NextContinuationToken : undefined;
      } while (token !== undefined);
      return found;
    },
  };
}

/**
 * Production wiring: an R2-backed store when every R2 variable is present, `null` otherwise. A deployment without R2
 * credentials (dev, CI) simply has no object store: artifact rows are still removed by retention, and the reaper is a no-op.
 */
export function createArtifactStoreFromEnv(
  env: Readonly<Record<string, string | undefined>> = process.env,
): ArtifactStore | null {
  const accountId = env['R2_ACCOUNT_ID'];
  const accessKeyId = env['R2_ACCESS_KEY_ID'];
  const secretAccessKey = env['R2_SECRET_ACCESS_KEY'];
  const bucket = env['R2_BUCKET'];
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) return null;
  const client = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
  return createR2ArtifactStore(client, bucket);
}
