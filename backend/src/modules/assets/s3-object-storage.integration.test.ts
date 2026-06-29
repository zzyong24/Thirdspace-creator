import { describe, it, expect } from "vitest";
import { createS3ObjectStorage, ensureBucket } from "./s3-object-storage";

// Opt-in: runs ONLY when S3_TEST_ENDPOINT is set (local MinIO / CI). Proves real bytes flow
// end-to-end through the presigned PUT → headObject → presigned GET path. Skipped otherwise.
//   S3_TEST_ENDPOINT=http://localhost:9000 \
//     pnpm --filter creatoros-frontend exec vitest run src/server/modules/assets/s3-object-storage.integration.test.ts
const ENDPOINT = process.env.S3_TEST_ENDPOINT;
const suite = ENDPOINT ? describe : describe.skip;

suite("S3 object storage (real MinIO byte round-trip)", () => {
  const cfg = {
    endpoint: ENDPOINT!,
    region: "us-east-1",
    accessKeyId: process.env.S3_TEST_KEY ?? "creatoros",
    secretAccessKey: process.env.S3_TEST_SECRET ?? "creatoros-secret",
    bucket: process.env.S3_TEST_BUCKET ?? "creatoros-assets",
    forcePathStyle: true,
  };
  let seq = 0;
  const storage = createS3ObjectStorage(cfg, { nextKey: () => `it-${++seq}` });

  it("presigned PUT → headObject → signed GET round-trips the bytes", async () => {
    await ensureBucket(cfg);
    const body = "hello-creatoros-真字节";
    const { storageKey, uploadUrl } = await storage.createPresignedUpload({
      assetType: "document",
      mimeType: "text/plain",
      fileSize: Buffer.byteLength(body),
    });

    // Phase 1: the client PUTs the bytes to the presigned URL. Content-Type MUST match the
    // signed value or the signature is rejected.
    const put = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "content-type": "text/plain" },
      body,
    });
    expect(put.ok).toBe(true);

    // Phase 2: headObject reflects the REAL stored object (size/mime from S3, not pre-recorded).
    const head = await storage.headObject(storageKey);
    expect(head.mimeType).toBe("text/plain");
    expect(head.fileSize).toBe(Buffer.byteLength(body));
    expect(head.checksum.length).toBeGreaterThan(0);

    // Download via signed GET → identical bytes.
    const getUrl = await storage.getSignedUrl(storageKey);
    const got = await fetch(getUrl);
    expect(got.ok).toBe(true);
    expect(await got.text()).toBe(body);
  });
});
