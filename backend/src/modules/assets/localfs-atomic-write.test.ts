import { afterEach, expect, it, vi } from "vitest";
import * as fs from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createLocalFsObjectStorage } from "./localfs-object-storage";

const fault = vi.hoisted(() => ({ root: "", enabled: false }));
vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return { ...actual, writeFile: async (...args: Parameters<typeof actual.writeFile>) => {
    if (fault.enabled && String(args[0]).startsWith(fault.root)) {
      await actual.writeFile(args[0], "半份");
      throw new Error("模拟中断写入");
    }
    return actual.writeFile(...args);
  } };
});
afterEach(async () => { fault.enabled = false; if (fault.root) await fs.rm(fault.root, { recursive: true, force: true }); });

it("本地 put 中断不会截断已完整发布的同键对象", async () => {
  fault.root = await fs.mkdtemp(join(tmpdir(), "t915-atomic-"));
  const storage = createLocalFsObjectStorage({ rootPath: fault.root, publicBaseUrl: "/blob" }, { nextKey: () => "unused" });
  const input = { storageKey: "a/document/fixed.txt", bytes: new TextEncoder().encode("完整正文"), mimeType: "text/plain", assetType: "document" };
  await storage.putObject(input);
  fault.enabled = true;
  await expect(storage.putObject(input)).rejects.toThrow("模拟中断写入");
  expect(new TextDecoder().decode(await storage.getObject(input.storageKey))).toBe("完整正文");
});
