"use client";

/**
 * 稿面顶条「在 Finder 打开」(T-055d,SPEC §7.2)。
 *
 * 打开该项目的本地目录 ~/CreatorOS/projects/<safe-title>-<id6>/(素材/录制/导出
 * 都在里面)。目录还没建(没倒过素材)时 route 会先建出来再开 —— 用户预期「总能打开」。
 * 路径安全(gate-F1 三重防护)在 /api/v1/local/reveal 侧。
 */

import * as React from "react";
import { FolderOpen } from "lucide-react";

export function RevealProjectButton({ projectId }: { projectId: string }) {
  const [state, setState] = React.useState<"idle" | "opening" | "error">(
    "idle",
  );

  const reveal = React.useCallback(async () => {
    setState("opening");
    try {
      const res = await fetch("/api/v1/local/reveal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      });
      setState(res.ok ? "idle" : "error");
    } catch {
      setState("error");
    }
  }, [projectId]);

  return (
    <button
      type="button"
      data-slot="draft-reveal-project"
      onClick={() => void reveal()}
      disabled={state === "opening"}
      title="在 Finder 打开项目文件夹(素材/录制/导出)"
      className="inline-flex h-8 items-center gap-1.5 rounded-control border border-border bg-surface px-2.5 text-xs text-muted-foreground transition-colors hover:border-brand/40 hover:text-foreground disabled:opacity-50"
    >
      <FolderOpen className="size-3.5" aria-hidden="true" />
      {state === "error" ? "打开失败,重试" : "在 Finder 打开"}
    </button>
  );
}
