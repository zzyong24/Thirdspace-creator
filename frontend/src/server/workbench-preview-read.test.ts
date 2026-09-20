import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { MAX_WORKBENCH_PREVIEW_BYTES, MAX_WORKBENCH_RAW_BYTES, readRegisteredWorkbenchPreview, WorkbenchPreviewIntegrityError, WorkbenchPreviewTooLargeError } from "./workbench-preview-read";

const ctx = { userId: "user", accountId: "account", requestId: "request", source: "user" as const };
const bytes = new Uint8Array(130_000).fill(65);
const hash = createHash("sha256").update(bytes).digest("hex");
const metadata = { artifactId: "artifact", version: 1, mime: "text/html", size: bytes.byteLength,
  hash, relativePath: "report.html", taskId: "task", provenance: [] };

function port(data = bytes) {
  return { read: vi.fn(async (_ctx, _task, _artifact, _version, offset: number, limit: number) => {
    const end = Math.min(offset + limit, data.byteLength);
    return { metadata, total: data.byteLength, bytes: data.slice(offset, end),
      nextOffset: end < data.byteLength ? end : null };
  }) } as unknown as Parameters<typeof readRegisteredWorkbenchPreview>[0];
}

describe("工作台预览分页汇总", () => {
  it("按真实页序拼接并复核总哈希", async () => {
    const reader = port();
    const result = await readRegisteredWorkbenchPreview(reader, ctx, "task", "artifact", 1);
    expect(result.bytes).toEqual(bytes);
    expect(reader.read).toHaveBeenCalledTimes(2);
  });

  it("预览大小门只限制预览，raw 仍可读取存储上限内原始字节", async () => {
    const data = new Uint8Array(MAX_WORKBENCH_PREVIEW_BYTES + 1).fill(67);
    const meta = { ...metadata, size: data.byteLength,
      hash: createHash("sha256").update(data).digest("hex") };
    const reader = { read: vi.fn(async (_ctx, _task, _artifact, _version, offset: number, limit: number) => {
      const next = Math.min(offset + limit, data.byteLength);
      return { metadata: meta, total: data.byteLength, bytes: data.slice(offset, next),
        nextOffset: next < data.byteLength ? next : null };
    }) } as unknown as Parameters<typeof readRegisteredWorkbenchPreview>[0];
    await expect(readRegisteredWorkbenchPreview(reader, ctx, "task", "artifact", 1))
      .rejects.toBeInstanceOf(WorkbenchPreviewTooLargeError);
    const raw = await readRegisteredWorkbenchPreview(reader, ctx, "task", "artifact", 1, MAX_WORKBENCH_RAW_BYTES);
    expect(raw.bytes).toEqual(data);
  });

  it("拒绝跨页改字节、假页序和超限对象", async () => {
    const changed = Uint8Array.from(bytes); changed[129_999] = 66;
    await expect(readRegisteredWorkbenchPreview(port(changed), ctx, "task", "artifact", 1))
      .rejects.toBeInstanceOf(WorkbenchPreviewIntegrityError);
    const wrong = port();
    const original = wrong.read.bind(wrong);
    wrong.read = vi.fn(async (...args: Parameters<typeof original>) => {
      const page = await original(...args);
      return args[4] > 0 ? { ...page, nextOffset: 7 } : page;
    }) as typeof wrong.read;
    await expect(readRegisteredWorkbenchPreview(wrong, ctx, "task", "artifact", 1))
      .rejects.toBeInstanceOf(WorkbenchPreviewIntegrityError);
    const huge = { read: vi.fn(async () => ({ metadata: { ...metadata, size: MAX_WORKBENCH_PREVIEW_BYTES + 1 },
      total: MAX_WORKBENCH_PREVIEW_BYTES + 1, bytes: new Uint8Array(128_000), nextOffset: 128_000 })) };
    await expect(readRegisteredWorkbenchPreview(huge as never, ctx, "task", "artifact", 1))
      .rejects.toBeInstanceOf(WorkbenchPreviewTooLargeError);
  });
});
