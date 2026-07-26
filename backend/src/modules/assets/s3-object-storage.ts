// Real S3/MinIO/OSS-compatible object storage — same `ObjectStoragePort` as the mock
// (foundation §4 swap-seam). The composition layer picks mock vs this by env, with NO
// domain change. Bytes really land in the bucket; presigned PUT/GET move them. No
// `server-only` import here so the module + its integration test can load under vitest.
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  CreateBucketCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl as presign } from "@aws-sdk/s3-request-presigner";
import type {
  ObjectStoragePort,
  HeadObjectResult,
  PresignedUpload,
} from "./object-storage";
import { accountKeyPrefix } from "./object-storage";

export interface S3ObjectStorageConfig {
  endpoint?: string; // e.g. http://localhost:9000 (MinIO); omit for AWS S3
  region: string; // e.g. us-east-1
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  forcePathStyle?: boolean; // true for MinIO / most self-hosted
  expiresInSeconds?: number; // presigned URL TTL (default 900s)
}

export interface S3ObjectStorageDeps {
  // Deterministic key source (injected; no crypto/Math.random at the call site).
  nextKey: () => string;
}

function makeClient(cfg: S3ObjectStorageConfig): S3Client {
  return new S3Client({
    endpoint: cfg.endpoint,
    region: cfg.region,
    forcePathStyle: cfg.forcePathStyle ?? Boolean(cfg.endpoint),
    credentials: {
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
    },
  });
}

export function createS3ObjectStorage(
  cfg: S3ObjectStorageConfig,
  deps: S3ObjectStorageDeps,
): ObjectStoragePort {
  const s3 = makeClient(cfg);
  const expiresIn = cfg.expiresInSeconds ?? 900;
  return {
    kind: "s3",
    async createPresignedUpload({ assetType, mimeType, accountId }) {
      // [T-157] 账号分区:key = <accountId ?? _default>/<assetType>/<nextKey>。
      const storageKey = `${accountKeyPrefix(accountId)}${assetType}/${deps.nextKey()}`;
      // Sign ContentType so the client MUST send the same header on PUT (tamper-resistant).
      const uploadUrl = await presign(
        s3,
        new PutObjectCommand({
          Bucket: cfg.bucket,
          Key: storageKey,
          ContentType: mimeType,
        }),
        { expiresIn },
      );
      return { storageKey, uploadUrl } satisfies PresignedUpload;
    },

    async getObject(storageKey) {
      // [T-055h] Server-side read for asset.classify.
      const res = await s3.send(
        new GetObjectCommand({ Bucket: cfg.bucket, Key: storageKey }),
      );
      const bytes = await res.Body?.transformToByteArray();
      return bytes ?? new Uint8Array(0);
    },

    async putObject({ storageKey, bytes, mimeType }) {
      // Server-side direct write (asset.generate) — PUT the in-process bytes straight
      // into the bucket (no presigned round-trip; the runner already holds them).
      await s3.send(
        new PutObjectCommand({
          Bucket: cfg.bucket,
          Key: storageKey,
          Body: bytes,
          ContentType: mimeType,
        }),
      );
    },

    async headObject(storageKey) {
      const h = await s3.send(
        new HeadObjectCommand({ Bucket: cfg.bucket, Key: storageKey }),
      );
      return {
        mimeType: h.ContentType ?? "application/octet-stream",
        fileSize: Number(h.ContentLength ?? 0),
        checksum: (h.ETag ?? "").replaceAll('"', ""),
        // S3 head carries no media dimensions; left null (a future probe can fill them).
        width: null,
        height: null,
        durationMs: null,
        mediaMetadata: {},
      } satisfies HeadObjectResult;
    },

    async getSignedUrl(storageKey) {
      return presign(
        s3,
        new GetObjectCommand({ Bucket: cfg.bucket, Key: storageKey }),
        { expiresIn },
      );
    },
  };
}

// Idempotently ensure the bucket exists (dev convenience; call once at wiring time).
export async function ensureBucket(cfg: S3ObjectStorageConfig): Promise<void> {
  try {
    await makeClient(cfg).send(new CreateBucketCommand({ Bucket: cfg.bucket }));
  } catch {
    // Already exists / owned by us, or a transient — headObject/PUT will surface real errors.
  }
}
