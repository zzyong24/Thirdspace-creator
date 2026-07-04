"use client";

/**
 * 对话内网页截图结果卡(T-084b,SPEC 2026-07-03 §2.2)。
 *
 * material.screenshot 工具真开无头浏览器给公开 URL 截图 → 已落素材中心(带 sourceUrl 存证)。
 * 本卡渲缩略图 + 来源 URL + 「加入弹药」(= createMaterialLink 挂当前项目,复用 ChatGatherCard
 * 同款按钮语义)。截图字节已真实产生、asset 已落库(存储动作,非 AI 写领域实体);「挂进这条
 * 内容用料链」才是人点的判断(与 asset-generate 候选门同界线,SPEC §2.2 注)。
 *
 * 失败(打不开 / HTTP 码 / 登录墙)→ error 非 null → 卡渲诚实错误态,不摆假缩略图。
 */

import * as React from "react";
import { useRouter } from "next/navigation";

import { client } from "@/lib/contract-client";

export interface ChatScreenshotAsset {
  id: string;
  name: string;
  previewUrl: string | null;
  sourceUrl: string;
}

/** [T-084b] 从 URL 取域名做链接文案(失败原样返)。 */
function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function ChatScreenshotCard({
  asset,
  error,
  projectId,
}: {
  asset: ChatScreenshotAsset | null;
  error: string | null;
  projectId: string | null;
}) {
  const router = useRouter();
  const [state, setState] = React.useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  );

  const save = React.useCallback(async () => {
    if (!asset || !projectId) return;
    setState("saving");
    try {
      // 「加入弹药」= 把已落库的截图 asset 挂进当前项目用料链(与 ChatGatherCard 同链,人采纳)。
      await client.createMaterialLink({
        params: undefined,
        query: undefined,
        body: {
          projectId,
          entityType: "asset",
          entityId: asset.id,
          role: "reference",
          stage: "script",
        },
      });
      setState("saved");
      router.refresh();
    } catch {
      setState("error");
    }
  }, [asset, projectId, router]);

  // 失败态:诚实渲错误(打不开/HTTP/登录墙),不摆假缩略图。
  if (!asset || error) {
    return (
      <div
        data-slot="chat-screenshot-card"
        data-error="true"
        className="mt-1 flex w-full max-w-[420px] flex-col gap-1 rounded-[10px] border border-destructive/40 bg-destructive/5 px-3 py-2"
      >
        <span className="text-[10px] font-medium uppercase tracking-wide text-destructive">
          截图失败
        </span>
        <p className="text-[12px] leading-relaxed text-destructive">
          {error || "截图没成功 —— 换一个公开可访问的链接再试。"}
        </p>
      </div>
    );
  }

  return (
    <div
      data-slot="chat-screenshot-card"
      className="mt-1 flex w-full max-w-[420px] flex-col gap-1.5 rounded-[10px] border border-border bg-surface p-2.5"
    >
      <span className="text-[10px] font-medium uppercase tracking-wide text-brand">
        网页截图 · 真证据 · 已存素材中心
      </span>
      {asset.previewUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={asset.previewUrl}
          alt={asset.name}
          data-slot="chat-screenshot-thumb"
          className="max-h-64 w-full rounded-md border border-border object-contain bg-surface-subtle"
        />
      ) : (
        <div className="flex h-24 w-full items-center justify-center rounded-md border border-dashed border-border text-[11px] text-text-subtle">
          缩略图加载中 / 不可用（素材已入库）
        </div>
      )}
      <div className="min-w-0 truncate text-[12px] text-foreground" title={asset.name}>
        {asset.name}
      </div>
      <div className="flex items-center justify-between gap-2">
        <a
          href={asset.sourceUrl}
          target="_blank"
          rel="noreferrer"
          data-slot="chat-screenshot-source-link"
          className="inline-flex min-w-0 items-center gap-1 truncate text-[10px] text-brand underline underline-offset-2"
          title={asset.sourceUrl}
        >
          🔗 {domainOf(asset.sourceUrl)}
        </a>
        {projectId ? (
          state === "saved" ? (
            <span className="shrink-0 text-[10px] font-medium text-success">
              已进弹药
            </span>
          ) : (
            <button
              type="button"
              data-slot="chat-screenshot-save"
              disabled={state === "saving"}
              onClick={() => void save()}
              className="inline-flex h-6 shrink-0 items-center rounded-control border border-brand/40 px-2 text-[10px] font-medium text-brand hover:bg-brand-soft disabled:opacity-50"
            >
              {state === "saving"
                ? "加入中…"
                : state === "error"
                  ? "重试"
                  : "加入弹药"}
            </button>
          )
        ) : null}
      </div>
      {!projectId ? (
        <p className="text-[11px] text-text-subtle">
          未关联项目 —— 输入 @ 引用一个项目后可把截图加进它的弹药。
        </p>
      ) : null}
    </div>
  );
}
