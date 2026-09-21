import "server-only";
import { createHash } from "node:crypto";
import { posix } from "node:path";
import { JSDOM } from "jsdom";
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
type RelativeImagePort = Pick<ReturnType<typeof createWorkbenchArtifactReadService>, "readRelativeImage">;

const MAX_RELATIVE_IMAGES = 12;
const MAX_RELATIVE_IMAGE_BYTES = 2 * 1024 * 1024;
const MAX_RELATIVE_IMAGE_PIXELS = 16_777_216;
const PNG_SIGNATURE = Buffer.from("89504e470d0a1a0a", "hex");

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

function imagePath(htmlPath: string, source: string): string | null {
  // URL、编码别名和父目录跳转都不进入后端查找；只接受同目录/子目录的字面相对路径。
  if (!source || source.length > 2048 || source.startsWith("/") ||
      /[\\%?#:\x00-\x1f\x7f]/.test(source)) return null;
  const parts = source.split("/");
  if (parts.some(part => part === ".." || !part)) return null;
  const path = posix.join(posix.dirname(htmlPath), source);
  return path.toLowerCase().endsWith(".png") ? path : null;
}

function isPng(bytes: Uint8Array): boolean {
  if (bytes.byteLength < 33 || !Buffer.from(bytes.subarray(0, 8)).equals(PNG_SIGNATURE)) return false;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(16), height = view.getUint32(20);
  return view.getUint32(8) === 13 && Buffer.from(bytes.subarray(12, 16)).toString("ascii") === "IHDR" &&
    width > 0 && height > 0 && width * height <= MAX_RELATIVE_IMAGE_PIXELS;
}

/** 预览 HTML 的图片由当前任务已登记对象内联；不让沙箱发起任何资源请求。 */
export async function renderRegisteredHtmlPreview(
  port: RelativeImagePort,
  ctx: RequestContext,
  taskId: string,
  metadata: WorkbenchArtifact,
  html: string,
): Promise<string> {
  const dom = new JSDOM(html, { contentType: "text/html" });
  try {
    const document = dom.window.document;
    document.querySelectorAll("script,base,link,iframe,object,embed,form,source").forEach(node => node.remove());
    document.querySelectorAll("meta").forEach(node => {
      if (node.getAttribute("http-equiv")?.toLowerCase() === "refresh") node.remove();
    });
    document.querySelectorAll("a,area").forEach(node => node.removeAttribute("href"));
    for (const element of document.querySelectorAll("*")) {
      for (const attribute of Array.from(element.attributes)) {
        if (attribute.name.toLowerCase().startsWith("on")) element.removeAttribute(attribute.name);
      }
    }
    let count = 0, totalBytes = 0;
    for (const image of document.querySelectorAll("img")) {
      const source = image.getAttribute("src") ?? "";
      image.removeAttribute("src");
      image.removeAttribute("srcset");
      // 既有内联 PNG 属于已验真的 HTML 字节，仍纳入相同的资源预算。
      if (source.startsWith("data:image/png;base64,")) {
        if (++count > MAX_RELATIVE_IMAGES) continue;
        const encoded = source.slice("data:image/png;base64,".length);
        if (!/^[A-Za-z0-9+/]*={0,2}$/.test(encoded) || encoded.length >
            Math.ceil((MAX_RELATIVE_IMAGE_BYTES - totalBytes) * 4 / 3) + 4) continue;
        const embedded = Buffer.from(encoded, "base64");
        if (!isPng(embedded) || embedded.byteLength > MAX_RELATIVE_IMAGE_BYTES - totalBytes) continue;
        totalBytes += embedded.byteLength;
        image.setAttribute("src", source);
        continue;
      }
      const path = imagePath(metadata.relativePath, source);
      if (!path || ++count > MAX_RELATIVE_IMAGES) continue;
      try {
        const found = await port.readRelativeImage(ctx, taskId, path, metadata);
        if (!found || found.metadata.taskId !== taskId || found.metadata.relativePath !== path ||
            found.metadata.mime !== "image/png" || found.metadata.size !== found.bytes.byteLength ||
            found.bytes.byteLength > MAX_RELATIVE_IMAGE_BYTES - totalBytes || !isPng(found.bytes)) continue;
        totalBytes += found.bytes.byteLength;
        image.setAttribute("src", `data:image/png;base64,${Buffer.from(found.bytes).toString("base64")}`);
      } catch {
        // 坏对象或暂时无法读取只影响该图，不阻断报告正文。
      }
    }
    return dom.serialize();
  } finally {
    dom.window.close();
  }
}
