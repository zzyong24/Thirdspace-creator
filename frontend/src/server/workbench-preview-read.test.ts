import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { MAX_WORKBENCH_PREVIEW_BYTES, MAX_WORKBENCH_RAW_BYTES, readRegisteredWorkbenchPreview, WorkbenchPreviewIntegrityError, WorkbenchPreviewTooLargeError } from "./workbench-preview-read";

const ctx = { userId: "user", accountId: "account", requestId: "request", source: "user" as const };
const bytes = new Uint8Array(130_000).fill(65);
const metadata = { artifactId: "artifact", version: 1, mime: "text/html", size: bytes.byteLength,
  hash: createHash("sha256").update(bytes).digest("hex"), relativePath: "report.html", taskId: "task", provenance: [] };
function port(data:Uint8Array=bytes,meta=metadata){return {readAll:vi.fn(async()=>({metadata:meta,bytes:data}))};}

describe("工作台预览完整回读", () => {
  it("一份对象仅回读一次，验真后交付", async () => {
    const reader = port();
    const result = await readRegisteredWorkbenchPreview(reader, ctx, "task", "artifact", 1);
    expect(result.bytes).toEqual(bytes);
    expect(reader.readAll).toHaveBeenCalledTimes(1);
    expect(reader.readAll).toHaveBeenCalledWith(ctx,"task","artifact",1);
  });

  it("预览大小门只限制预览，raw 仍可读取存储上限内原始字节", async () => {
    const data = new Uint8Array(MAX_WORKBENCH_PREVIEW_BYTES + 1).fill(67);
    const meta = { ...metadata, size: data.byteLength,
      hash: createHash("sha256").update(data).digest("hex") };
    const reader = port(data,meta);
    await expect(readRegisteredWorkbenchPreview(reader, ctx, "task", "artifact", 1))
      .rejects.toBeInstanceOf(WorkbenchPreviewTooLargeError);
    const raw = await readRegisteredWorkbenchPreview(reader, ctx, "task", "artifact", 1, MAX_WORKBENCH_RAW_BYTES);
    expect(raw.bytes).toEqual(data);
  });

  it("拒绝篡改字节、假元数据和超限对象", async () => {
    const changed = Uint8Array.from(bytes); changed[129_999] = 66;
    await expect(readRegisteredWorkbenchPreview(port(changed), ctx, "task", "artifact", 1))
      .rejects.toBeInstanceOf(WorkbenchPreviewIntegrityError);
    await expect(readRegisteredWorkbenchPreview(port(bytes,{...metadata,taskId:"foreign"}),ctx,"task","artifact",1))
      .rejects.toBeInstanceOf(WorkbenchPreviewIntegrityError);
    const huge = new Uint8Array(MAX_WORKBENCH_PREVIEW_BYTES + 1);
    await expect(readRegisteredWorkbenchPreview(port(huge,{...metadata,size:huge.byteLength}),ctx,"task","artifact",1))
      .rejects.toBeInstanceOf(WorkbenchPreviewTooLargeError);
  });
});
