import { NextResponse } from "next/server";
import {createWorkbenchArtifactRepresentation,WorkbenchArtifactFormatError} from "@/server/workbench-artifact-representation";
import { readSessionCookie } from "@/app/api/v1/auth/_session";
import { isAuthError, isOwnershipError, readRequestAccountId, resolveRequestContext } from "@/lib/request-context.server";
import { isTrustedLocalRequest, loopbackForbidden } from "@/lib/loopback-guard.server";
import { getWorkbenchPreviewRuntime } from "@/server/persistence-client";
import { WorkbenchPreviewIntegrityError, WorkbenchPreviewTooLargeError } from "@/server/workbench-preview-read";
import { WORKBENCH_PREVIEW_RESPONSE_CSP } from "@/server/workbench-preview-policy";
import { WorkbenchHtmlRenderError } from "@/server/workbench-artifact-render";

export const dynamic = "force-dynamic";

const REFERENCE = /^[A-Za-z0-9._:-]{1,160}$/;
const VERSION = /^[1-9][0-9]{0,8}$/;
const COMMON_HEADERS = {
  "Cache-Control": "private, no-store",
  "Content-Security-Policy": WORKBENCH_PREVIEW_RESPONSE_CSP,
  "Cross-Origin-Resource-Policy": "same-origin",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "SAMEORIGIN",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), clipboard-read=(), clipboard-write=()",
};

const EXTENSION: Record<string, string> = {
  "text/html": "html", "text/markdown": "md", "text/csv": "csv",
  "image/png": "png", "application/pdf": "pdf",
};


function failure(status: number, message: string): Response {
  return NextResponse.json({ error: message }, { status, headers: COMMON_HEADERS });
}

/** 仅接收版本引用；实际用户、账号和字节来源均在服务端重新核实。 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ taskId: string; artifactId: string; version: string }> },
): Promise<Response> {
  if (!isTrustedLocalRequest(req)) return loopbackForbidden();
  const { taskId, artifactId, version: rawVersion } = await params;
  if (!REFERENCE.test(taskId) || !REFERENCE.test(artifactId) || !VERSION.test(rawVersion)) {
    return failure(400, "产物引用无效");
  }
  const version = Number(rawVersion);
  if (!Number.isSafeInteger(version)) return failure(400, "产物版本无效");
  const formats = new URL(req.url).searchParams.getAll("format");
  if (formats.length > 1 || (formats.length === 1 && !["raw", "png", "pdf"].includes(formats[0]))) {
    return failure(400, "预览格式无效");
  }
  const format = formats[0];
  const raw = format === "raw";

  let ctx;
  try {
    // 预览包含私有正文；存在但失效的 session 不能降级成单机主用户。
    ctx = await resolveRequestContext(readSessionCookie(req), readRequestAccountId(req), {
      rejectInvalidToken: true,
    });
  } catch (error) {
    if (isAuthError(error)) return failure(401, "未登录");
    if (isOwnershipError(error)) return failure(404, "产物不存在");
    return failure(503, "暂时无法核实访问身份");
  }
  if (!ctx.accountId) return failure(404, "产物不存在");

  try {
    const port = await getWorkbenchPreviewRuntime();
    const representation=await createWorkbenchArtifactRepresentation(port,ctx,taskId,artifactId,version,format as "raw"|"png"|"pdf"|undefined);
    const {mime,filename,hash,sourceHash,size}=representation;
    const bytes=Buffer.from(representation.data,"base64");
    const contentType=!raw && (mime==="text/markdown"||mime==="text/csv") ? "text/plain; charset=utf-8" : mime.startsWith("text/") ? `${mime}; charset=utf-8` : mime;
    return new Response(Uint8Array.from(bytes).buffer, {
      status: 200,
      headers: {
        ...COMMON_HEADERS,
        "Content-Type": contentType,
        "Content-Length": String(size),
        "Content-Disposition": `inline; filename="artifact-${version}.${EXTENSION[mime]}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "X-Workbench-Mime": mime,
        "X-Workbench-Filename": encodeURIComponent(filename),
        "X-Workbench-Hash": hash,
        "X-Workbench-Size": String(size),
        "X-Workbench-Source-Hash": sourceHash,
        "X-Workbench-Renderer-Policy": representation.rendererPolicy,
        "X-Workbench-Degraded": String(representation.diagnostics.degraded),
      },
    });
  } catch (error) {
    if (isOwnershipError(error)) return failure(404, "产物不存在");
    if (error instanceof WorkbenchArtifactFormatError) return failure(415, "仅 HTML 产物支持 PNG/PDF 导出");
    if (error instanceof WorkbenchPreviewTooLargeError) return failure(413, "产物超过读取大小上限");
    if (error instanceof WorkbenchPreviewIntegrityError) return failure(409, "产物预览校验失败");
    if (error instanceof WorkbenchHtmlRenderError) {
      return failure(error.code === "INVALID_INPUT" ? 422 : error.code === "RENDER_BUSY" ? 429 : 503,
        error.code === "BROWSER_RUNTIME_UNAVAILABLE" ? "桌面版缺少 HTML 导出所需的 Chromium 运行时" :
          error.code === "RENDER_BUSY" ? "HTML 导出正在处理，请稍后重试" :
            error.code === "INVALID_INPUT" ? "HTML 内容无效，无法导出" : "HTML 导出失败，请重试");
    }
    return failure(503, "产物暂时无法预览");
  }
}
