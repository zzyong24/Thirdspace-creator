"use client";

import { useEffect, useState } from "react";
import { handshakeHeaders } from "@/lib/handshake-client";
import { WORKBENCH_PREVIEW_DOCUMENT_CSP } from "@/server/workbench-preview-policy";

export interface WorkbenchPreviewFrameProps {
  taskId: string;
  artifactId: string;
  version: number;
  accountId: string;
  title?: string;
}

type PreviewState =
  | { scope: string; kind: "loading" | "error" }
  | { scope: string; kind: "document"; srcDoc: string }
  | { scope: string; kind: "image" | "pdf"; url: string };

const cspMeta = `<meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${WORKBENCH_PREVIEW_DOCUMENT_CSP}">`;
const escapeText = (value: string) => value.replace(/[&<>"']/g, char => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[char]!);

/**
 * 桌面代理要求启动握手头，原生 iframe 导航无法附头；先受控 fetch，再放入空
 * sandbox iframe。账号变化立即隐藏旧内容，过期请求不能回写，Blob URL 随卸载撤销。
 */
export function WorkbenchPreviewFrame({
  taskId, artifactId, version, accountId, title = "任务产物预览",
}: WorkbenchPreviewFrameProps) {
  const scope = JSON.stringify([accountId, taskId, artifactId, version]);
  const [state, setState] = useState<PreviewState>({ scope: "", kind: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    let objectUrl: string | null = null;
    const url = `/api/v1/workbench-preview/${encodeURIComponent(taskId)}/${encodeURIComponent(artifactId)}/${version}`;
    void (async () => {
      try {
        const response = await fetch(url, {
          credentials: "same-origin",
          cache: "no-store",
          headers: { ...handshakeHeaders(), "x-account-id": accountId },
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("PREVIEW_UNAVAILABLE");
        const mime = response.headers.get("x-workbench-mime");
        if (mime === "text/html" || mime === "text/markdown" || mime === "text/csv") {
          const body = await response.text();
          const content = mime === "text/html" ? body : `<pre>${escapeText(body)}</pre>`;
          if (!controller.signal.aborted) setState({ scope, kind: "document", srcDoc: `${cspMeta}${content}` });
        } else if (mime === "image/png" || mime === "application/pdf") {
          const body = await response.blob();
          if (controller.signal.aborted) return;
          objectUrl = URL.createObjectURL(body);
          setState({ scope, kind: mime === "image/png" ? "image" : "pdf", url: objectUrl });
        } else {
          throw new Error("PREVIEW_MIME_UNSUPPORTED");
        }
      } catch {
        if (!controller.signal.aborted) setState({ scope, kind: "error" });
      }
    })();
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [scope, taskId, artifactId, version, accountId]);

  const current = state.scope === scope ? state : { scope, kind: "loading" as const };
  if (current.kind === "loading") return <div role="status">正在载入预览…</div>;
  if (current.kind === "error") return <div role="alert">产物暂时无法预览。</div>;
  if (current.kind === "image") return (
    // 已验真的内存 Blob URL 无法经 Next 图片优化器处理。
    // eslint-disable-next-line @next/next/no-img-element
    <img src={current.url} alt={title} style={{ maxWidth: "100%" }} />
  );
  return <iframe
    title={title}
    sandbox=""
    referrerPolicy="no-referrer"
    src={current.kind === "pdf" ? current.url : undefined}
    srcDoc={current.kind === "document" ? current.srcDoc : undefined}
    style={{ border: 0, width: "100%", height: "100%", minHeight: 320 }}
  />;
}
