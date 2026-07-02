"use client";

/**
 * [T-053 断点②] 「开始制作」CTA —— 治制作空态门死锁:真项目没有 ContentOutput 时
 * 制作页永远空态,而全前端此前没有任何 outputs.create 入口(产出无处可建 → 死锁)。
 *
 * write-on-intent(非 write-on-read,不重蹈 B12 覆辙):只有用户点击才创建产出
 * (projects.outputs.create),随后 router.refresh() —— resolveWiring 的
 * outputs.production.get 是 getOrCreate 语义(B10),production 随首读自动就位,
 * 录制工作台/素材/提词全部接通。
 */

import * as React from "react";
import { useRouter } from "next/navigation";

import { client } from "@/lib/contract-client";

export function StartProductionIsland({
  projectId,
  projectTitle,
}: {
  projectId: string;
  projectTitle: string;
}) {
  const router = useRouter();
  const [state, setState] = React.useState<"idle" | "creating" | "error">(
    "idle",
  );

  const start = React.useCallback(() => {
    setState("creating");
    void (async () => {
      try {
        await client.createOutput({
          params: { projectId },
          query: undefined,
          body: { title: projectTitle || "主内容" },
        });
        router.refresh();
      } catch {
        setState("error");
      }
    })();
  }, [projectId, projectTitle, router]);

  return (
    <div
      data-slot="start-production"
      className="flex flex-col items-start gap-2 rounded-card border border-dashed border-border bg-surface-subtle p-4"
    >
      <p className="text-sm text-muted-foreground">
        这个项目还没有产出内容。创建一条产出后,录制工作台、素材匹配与拍摄提词就会挂到它上面。
      </p>
      <button
        type="button"
        data-slot="start-production-button"
        onClick={start}
        disabled={state === "creating"}
        className="inline-flex items-center rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
      >
        {state === "creating" ? "正在创建产出…" : "开始制作"}
      </button>
      {state === "error" ? (
        <p className="text-xs text-destructive">创建失败,请重试。</p>
      ) : null}
    </div>
  );
}
