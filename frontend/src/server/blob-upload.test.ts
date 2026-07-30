import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { streamBlobToFile } from "./blob-upload";

describe("streamBlobToFile", () => {
  it("streams a video larger than 10MB to disk without a whole-body buffer", async () => {
    const chunk = new Uint8Array(1024 * 1024).fill(0x5a);
    const chunkCount = 24;
    let emitted = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (emitted >= chunkCount) {
          controller.close();
          return;
        }
        controller.enqueue(chunk);
        emitted += 1;
      },
    });
    const dir = await mkdtemp(join(tmpdir(), "creatoros-blob-upload-"));
    const target = join(dir, "large.mov");

    try {
      const written = await streamBlobToFile(body, target);

      expect(written).toBe(chunk.byteLength * chunkCount);
      expect((await stat(target)).size).toBe(written);
      expect(
        createHash("sha256").update(await readFile(target)).digest("hex"),
      ).toBe(
        createHash("sha256")
          .update(Buffer.alloc(written, 0x5a))
          .digest("hex"),
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
