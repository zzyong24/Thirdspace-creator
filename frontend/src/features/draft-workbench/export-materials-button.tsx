"use client";

/**
 * 稿面顶条「导出素材包」(T-375,替换原「在 Finder 打开」)。
 *
 * 原 RevealProjectButton 开本地项目文件夹 —— 但素材实际全在 asset 库,文件夹永远空,
 * 名不副实(用户 2026-07-17 真机反馈)。这里换成真有用的动作:复用 T-366b 导出链
 * (productions.exports.materials),把项目全部素材 + 口播稿 + 编导说明打包 zip 下载。
 *
 * 参数链:稿面只有 projectId/outputId —— outputId 可能还没有(没进过制作面):
 *   outputId ?? createOutput(projectId) → getOutputProduction(get-or-create,后端
 *   production.service 首读即建)→ exportProductionMaterials(productionId) → 签名
 *   URL 触发浏览器下载。全链自动 ensure,不要求用户先进制作面。
 */

import * as React from "react";
import { Loader2, FolderDown } from "lucide-react";

import { client } from "@/lib/contract-client";

type State = "idle" | "busy" | "done" | "error";

export function ExportMaterialsButton({
  projectId,
  projectTitle,
  outputId,
}: {
  projectId: string;
  projectTitle: string;
  outputId: string | null;
}) {
  const [state, setState] = React.useState<State>("idle");
  const [error, setError] = React.useState<string | null>(null);
  // 「已开始下载」自动复位定时器;卸载时清,避免对已卸载组件 setState。
  const resetTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  React.useEffect(
    () => () => {
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    },
    [],
  );

  const exportMaterials = React.useCallback(async () => {
    setState("busy");
    setError(null);
    try {
      // ① ensure output(稿面项目可能从没进过制作面 → 无 output 行)。
      let oid = outputId;
      if (!oid) {
        const created = (await client.createOutput({
          params: { projectId },
          query: undefined,
          body: { title: projectTitle || "成片" },
        })) as unknown as { id: string };
        oid = created.id;
      }
      // ② production 行 get-or-create(后端首读即建,见 production.service)。
      const prod = (await client.getOutputProduction({
        params: { outputId: oid },
        query: undefined,
        body: undefined,
      })) as unknown as { id: string };
      // ③ 打包导出(T-366b 链:本地 zip → asset → 签名下载 URL)。
      const res = (await client.exportProductionMaterials({
        params: { productionId: prod.id },
        query: undefined,
        body: undefined,
      })) as unknown as { downloadUrl: string; fileName: string };
      const a = document.createElement("a");
      a.href = res.downloadUrl;
      a.download = res.fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setState("done");
      // [bug·2026-07-19 真机] 原「done」是终态永不复位 → 4MB 素材包浏览器瞬时下完,按钮却一直
      //   挂「已开始下载」,看起来像卡在下载中(其实早下完了)。下载是触发即忘的浏览器行为,这里
      //   2.5s 后把按钮复位回「导出素材包」,消除"卡住/还在下"的错觉。error 态不复位(留着让用户重试)。
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
      resetTimerRef.current = setTimeout(() => setState("idle"), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "素材包导出失败,请重试");
      setState("error");
    }
  }, [projectId, projectTitle, outputId]);

  const label =
    state === "busy"
      ? "打包中…"
      : state === "done"
        ? "已开始下载"
        : state === "error"
          ? "导出失败,重试"
          : "导出素材包";

  return (
    <button
      type="button"
      data-slot="draft-export-materials"
      onClick={() => void exportMaterials()}
      disabled={state === "busy"}
      title={
        error ??
        "把本项目全部素材 + 口播稿 + 编导说明打包成 zip 下载(本地打包,不出网)"
      }
      className="inline-flex h-8 items-center gap-1.5 rounded-control border border-border bg-surface px-2.5 text-xs text-muted-foreground transition-colors hover:border-brand/40 hover:text-foreground disabled:opacity-50"
    >
      {state === "busy" ? (
        <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
      ) : (
        <FolderDown className="size-3.5" aria-hidden="true" />
      )}
      {label}
    </button>
  );
}
