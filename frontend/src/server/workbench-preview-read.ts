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
const PREVIEW_MIMES = new Set([
  "text/html", "text/markdown", "text/csv", "image/png", "application/pdf",
]);

type ReadPort = Pick<ReturnType<typeof createWorkbenchArtifactReadService>, "readAll">;

export class WorkbenchPreviewTooLargeError extends Error {}
export class WorkbenchPreviewIntegrityError extends Error {}

/**
 * 公共读服务一次核实任务归属、版本与完整对象字节；避免分页重复读取整份
 * 20 MiB 对象。响应前再验证元数据和摘要，杜绝不完整交付。
 */
export async function readRegisteredWorkbenchPreview(
  port: ReadPort,
  ctx: RequestContext,
  taskId: string,
  artifactId: string,
  version: number,
  maxBytes = MAX_WORKBENCH_PREVIEW_BYTES,
): Promise<{ metadata: WorkbenchArtifact; bytes: Uint8Array }> {
  const {metadata,bytes}=await port.readAll(ctx,taskId,artifactId,version);
  if(metadata.taskId!==taskId||metadata.artifactId!==artifactId||metadata.version!==version||
     !PREVIEW_MIMES.has(metadata.mime)||!Number.isSafeInteger(metadata.size)||metadata.size<1||
     metadata.size!==bytes.byteLength)throw new WorkbenchPreviewIntegrityError("产物预览元数据不匹配");
  if(bytes.byteLength>maxBytes)throw new WorkbenchPreviewTooLargeError("产物超过在线预览大小上限");
  if(createHash("sha256").update(bytes).digest("hex")!==metadata.hash)
   throw new WorkbenchPreviewIntegrityError("产物预览哈希不匹配");
  return {metadata,bytes};
}
