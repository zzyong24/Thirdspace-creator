import { describe, it, expect, afterEach } from "vitest";
import { mkdtemp, writeFile, rm, symlink } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  completeLogPrefix,
  listEncryptedLogSnapshots,
  createGrowthObservabilityTransport,
} from "./encrypted-log-upload.server";
const header = Buffer.concat([
  Buffer.from("CRLOG\x01"),
  Buffer.from([1]),
  Buffer.alloc(96),
]);
const frame = Buffer.concat([Buffer.from([16, 0, 0, 0]), Buffer.alloc(16)]);
const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(
    dirs.splice(0).map((p) => rm(p, { recursive: true, force: true })),
  );
});
describe("T1255 actual ciphertext snapshots", () => {
  it("preserves nonce-frame prefix and leaves incomplete tail", () => {
    expect(
      completeLogPrefix(
        Buffer.concat([header, frame, Buffer.from([20, 0, 0, 0, 1])]),
      ),
    ).toEqual(Buffer.concat([header, frame]));
    expect(() => completeLogPrefix(Buffer.from("plain"))).toThrow();
  });
  it("rejects symlinks and never accepts arbitrary file names", async () => {
    const dir = await mkdtemp(join(tmpdir(), "t1255-log-"));
    dirs.push(dir);
    await writeFile(
      join(dir, "sidecar-2026-10-12.log.enc"),
      Buffer.concat([header, frame]),
    );
    await writeFile(join(dir, "private.txt"), "secret");
    await symlink(
      join(dir, "private.txt"),
      join(dir, "sidecar-2026-10-11.log.enc"),
    );
    const snapshots = await listEncryptedLogSnapshots(dir);
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]!.byteLength).toBe(123);
  });
  it("rejects mismatched receipt identity and prohibits redirect", async () => {
    let options: RequestInit | undefined;
    const transport = createGrowthObservabilityTransport({
      fetchImpl: async (_url, init) => {
        options = init;
        return new Response(
          JSON.stringify({
            schemaVersion: "encrypted-log-receipt-v1",
            receiptId: "receipt",
            installationAlias: crypto.randomUUID(),
            sessionId: "a".repeat(64),
            sha256: "b".repeat(64),
            byteLength: 123,
            receivedAt: new Date().toISOString(),
            status: "stored",
          }),
        );
      },
    });
    await expect(
      transport.uploadLog(
        {
          installationAlias: crypto.randomUUID(),
          appVersion: "1.2.0",
          osName: "macos",
        },
        {
          body: Buffer.concat([header, frame]),
          byteLength: 123,
          sessionId: "a".repeat(64),
          sha256: "b".repeat(64),
          logDate: "2026-10-12",
        },
        131072,
        new AbortController().signal,
      ),
    ).rejects.toThrow("LOG_RECEIPT_MISMATCH");
    expect(options?.redirect).toBe("error");
    expect(options?.credentials).toBe("omit");
  });
});

import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { appendFile } from "node:fs/promises";
import { readPendingEncryptedLog } from "./encrypted-log-upload.server";
it("lost receipt restores the exact persisted prefix even after file grows", async () => {
  const dir = await mkdtemp(join(tmpdir(), "t1255-prefix-"));
  dirs.push(dir);
  const fileName = "sidecar-2026-10-12.log.enc";
  await writeFile(join(dir, fileName), Buffer.concat([header, frame]));
  const original = (await listEncryptedLogSnapshots(dir))[0]!;
  await appendFile(join(dir, fileName), frame);
  const recovered = await readPendingEncryptedLog(dir, {
    fileName,
    sessionId: original.sessionId,
    sha256: original.sha256,
    byteLength: original.byteLength,
    logDate: original.logDate,
  });
  expect(recovered.sha256).toBe(original.sha256);
  expect(recovered.body).toEqual(original.body);
  expect((await listEncryptedLogSnapshots(dir))[0]!.sha256).not.toBe(
    original.sha256,
  );
});
it("actual HTTP adapter streams at configured 16KiB and verifies the entire response", async () => {
  const payload = Buffer.concat([
    header,
    Buffer.from([0x40, 0x9c, 0, 0]),
    Buffer.alloc(40000),
  ]);
  const sha = createHash("sha256").update(payload).digest("hex");
  const session = createHash("sha256").update(header).digest("hex");
  const alias = crypto.randomUUID();
  let observed = Buffer.alloc(0);
  let authorization: string | undefined;
  let started = 0;
  let elapsed = 0;
  const server = createServer((request, response) => {
    started = Date.now();
    authorization = request.headers.authorization;
    request.on("data", (data) => {
      observed = Buffer.concat([observed, data]);
    });
    request.on("end", () => {
      elapsed = Date.now() - started;
      response.setHeader("Content-Type", "application/json");
      response.end(
        JSON.stringify({
          schemaVersion: "encrypted-log-receipt-v1",
          receiptId: "test-receipt",
          installationAlias: alias,
          sessionId: session,
          sha256: sha,
          byteLength: payload.length,
          receivedAt: new Date().toISOString(),
          status: "stored",
        }),
      );
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address() as { port: number };
    const transport = createGrowthObservabilityTransport({
      testOrigin: `http://127.0.0.1:${address.port}`,
    });
    const receipt = await transport.uploadLog(
      { installationAlias: alias, appVersion: "1.2.0", osName: "macos" },
      {
        body: payload,
        byteLength: payload.length,
        sessionId: session,
        sha256: sha,
        logDate: "2026-10-12",
      },
      16384,
      new AbortController().signal,
    );
    expect(observed).toEqual(payload);
    expect(authorization).toBeUndefined();
    expect(receipt.sha256).toBe(sha);
    expect(elapsed).toBeGreaterThanOrEqual(1800);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
import { readNativeExceptionMetadata } from "./encrypted-log-upload.server";
it("native outbox accepts closed metadata only, ignores incomplete tail and refuses symlinks", async () => {
  const dir = await mkdtemp(join(tmpdir(), "t1255-native-"));
  dirs.push(dir);
  const event = {
    eventId: "a".repeat(64),
    code: "HOST_PANIC",
    occurredAt: new Date().toISOString(),
    logSessionId: "b".repeat(64),
  };
  const outbox = join(dir, "host-exceptions.jsonl");
  await writeFile(
    outbox,
    `${JSON.stringify(event)}\n${JSON.stringify({ ...event, message: "PRIVATE" })}\n{"eventId":`,
  );
  expect(await readNativeExceptionMetadata(dir)).toEqual([event]);
  await rm(outbox);
  await writeFile(join(dir, "private.txt"), "PRIVATE");
  await symlink(join(dir, "private.txt"), outbox);
  await expect(readNativeExceptionMetadata(dir)).rejects.toThrow(
    "HOST_EXCEPTION_OUTBOX_INVALID",
  );
});
