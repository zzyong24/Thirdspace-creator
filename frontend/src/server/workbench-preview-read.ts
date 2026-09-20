import "server-only";
import { createHash } from "node:crypto";
import type { RequestContext } from "@creatoros/contract";
import type { createWorkbenchArtifactReadService } from "@creatoros/backend/modules/execution";
import { WORKBENCH_BLOB_MAX_BYTES } from "@creatoros/backend/modules/assets";
import type { WorkbenchArtifact } from "@creatoros/contract/agent-workbench";

/** 只读预览限制为 4 MiB；完整文件下载与导出由独立端口处理。 */
export const MAX_WORKBENCH_PREVIEW_BYTES = 4 * 1024 * 1024;
/** 原始字节模式对齐存储端口单对象上限。 */
export const MAX_WORKBENCH_RAW_BYTES = WORKBENCH_BLOB_MAX_BYTES;
const PAGE_BYTES = 128_000;
const PREVIEW_MIMES = new Set([
  "text/html", "text/markdown", "text/csv", "image/png", "application/pdf",
]);

type ReadPort = Pick<ReturnType<typeof createWorkbenchArtifactReadService>, "read">;

export class WorkbenchPreviewTooLargeError extends Error {}
export class WorkbenchPreviewIntegrityError extends Error {}

/**
 * 公共读服务每页都重新核实任务归属、版本及完整对象字节；这里再对页序和拼接结果
 * 做整体验证，避免部分页或变更中的响应被当作一份预览交付。
 */
export async function readRegisteredWorkbenchPreview(
  port: ReadPort,
  ctx: RequestContext,
  taskId: string,
  artifactId: string,
  version: number,
  maxBytes = MAX_WORKBENCH_PREVIEW_BYTES,
): Promise<{ metadata: WorkbenchArtifact; bytes: Uint8Array }> {
  let offset = 0;
  let metadata: WorkbenchArtifact | null = null;
  let fingerprint = "";
  let full: Uint8Array | null = null;
  do {
    const page = await port.read(ctx, taskId, artifactId, version, offset, PAGE_BYTES);
    if (!metadata) {
      metadata = page.metadata;
      if (metadata.taskId !== taskId || metadata.artifactId !== artifactId ||
          metadata.version !== version || !PREVIEW_MIMES.has(metadata.mime) ||
          metadata.size !== page.total || !Number.isSafeInteger(page.total) || page.total < 1) {
        throw new WorkbenchPreviewIntegrityError("产物预览元数据不匹配");
      }
      if (page.total > maxBytes) {
        throw new WorkbenchPreviewTooLargeError("产物超过在线预览大小上限");
      }
      fingerprint = JSON.stringify(metadata);
      full = new Uint8Array(page.total);
    }
    const expected = Math.min(PAGE_BYTES, full!.byteLength - offset);
    const next = offset + expected;
    if (JSON.stringify(page.metadata) !== fingerprint || page.total !== full!.byteLength ||
        page.bytes.byteLength !== expected || page.nextOffset !== (next < full!.byteLength ? next : null)) {
      throw new WorkbenchPreviewIntegrityError("产物预览分页不完整");
    }
    full!.set(page.bytes, offset);
    offset = next;
  } while (offset < full!.byteLength);
  const hash = createHash("sha256").update(full!).digest("hex");
  if (hash !== metadata!.hash) throw new WorkbenchPreviewIntegrityError("产物预览哈希不匹配");
  return { metadata: metadata!, bytes: full! };
}
