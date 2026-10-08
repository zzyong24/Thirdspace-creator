import "server-only";
import {createHash} from "node:crypto";
import type {RequestContext} from "@creatoros/contract";
import type {createWorkbenchArtifactReadService} from "@creatoros/backend/modules/execution";
import {readRegisteredWorkbenchPreview,renderRegisteredHtmlPreview,MAX_WORKBENCH_RAW_BYTES} from "./workbench-preview-read";
import {workbenchRendererDiagnostics} from "./workbench-html-diagnostics";
import {renderTrustedWorkbenchHtml,WorkbenchHtmlRenderError} from "./workbench-artifact-render";
const EXTENSION: Record<string, string> = {
  "text/html": "html", "text/markdown": "md", "text/csv": "csv",
  "image/png": "png", "application/pdf": "pdf",
};

/** 只生成建议名；绝不把产物相对路径当作磁盘导出路径。 */
function suggestedFilename(relativePath: string, mime: string, version: number): string {
  const last = relativePath.split(/[/\\]/).at(-1) ?? "";
  const stem = last.replace(/\.[^.]+$/, "").replace(/[\x00-\x1f\x7f<>:"|?*]/g, "_").trim().slice(0, 100);
  return `${stem || `artifact-${version}`}.${EXTENSION[mime]}`;
}

export class WorkbenchArtifactFormatError extends Error {}

export async function createWorkbenchArtifactRepresentation(port:Pick<ReturnType<typeof createWorkbenchArtifactReadService>, "readAll" | "readRelativeImage">,ctx:RequestContext,taskId:string,artifactId:string,version:number,format:"raw"|"preview"|"png"|"pdf"="preview"){
 const raw=format==="raw";
    const result = await readRegisteredWorkbenchPreview(
      port, ctx, taskId, artifactId, version,
      raw ? MAX_WORKBENCH_RAW_BYTES : undefined,
    );
    if ((format === "png" || format === "pdf") && result.metadata.mime !== "text/html") {
      throw new WorkbenchArtifactFormatError("仅 HTML 产物支持 PNG/PDF 导出");
    }
    let sourceHtml: string | null = null;
    if (result.metadata.mime === "text/html" && !raw) {
      try {
        sourceHtml = format === "png" || format === "pdf"
          ? new TextDecoder("utf-8", { fatal: true }).decode(result.bytes)
          : Buffer.from(result.bytes).toString("utf8");
      } catch {
        throw new WorkbenchHtmlRenderError("INVALID_INPUT", "HTML 字节不是有效 UTF-8，无法导出");
      }
    }
    const sourceHash = result.metadata.hash;
    const safeHtml = sourceHtml !== null
      ? await renderRegisteredHtmlPreview(port, ctx, taskId, result.metadata,
        sourceHtml)
      : null;
    const bytes = format === "png" || format === "pdf"
      ? await renderTrustedWorkbenchHtml({ html: safeHtml!, format })
      : safeHtml === null ? result.bytes : Buffer.from(safeHtml, "utf8");
    const mime = format === "png" ? "image/png" : format === "pdf" ? "application/pdf" : result.metadata.mime;
    const filename = suggestedFilename(result.metadata.relativePath, mime, version);
    return {...workbenchRendererDiagnostics(result.metadata.mime,sourceHash,result.bytes),metadata:result.metadata,format,mime,filename,size:bytes.byteLength,hash:createHash("sha256").update(bytes).digest("hex"),sourceHash,encoding:"base64" as const,data:Buffer.from(bytes).toString("base64")};
}
