"use client";

/**
 * 对话内网页正文读取结果卡(T-217c)。
 *
 * web.read 工具带 `.auth/web` 登录态读一个 URL 的正文全文 → 落 **pending** 逐字稿文本素材(带
 * sourceUrl 存证,素材库 list 按 active 过滤 → 未确认前不进库)。三态:
 *   ① asset 非 null → 读到正文,渲标题 + 正文摘要 + 来源 + 两级确认门(存入素材库 → 加入弹药),
 *      与 ChatScreenshotCard 同款(铁律②:AI 写入需人确认才进库);
 *   ② needLogin 非 null → 该站需先在保管库登录一次 → 渲引导条 +「去网站登录保管库」(跳设置);
 *   ③ error 非 null → 逐类诚实错误态(打不开 / HTTP 码 / 抽不出正文),不摆假正文。
 */

import * as React from "react";
import { useRouter } from "next/navigation";

import { client } from "@/lib/contract-client";

export interface ChatWebReadAsset {
  id: string;
  name: string;
  previewUrl: string | null;
  sourceUrl: string;
  title: string;
  excerpt: string;
  extractor: string;
}

function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function ChatWebReadCard({
  asset,
  needLogin,
  error,
  projectId,
}: {
  asset: ChatWebReadAsset | null;
  needLogin: { domain: string } | null;
  error: string | null;
  projectId: string | null;
}) {
  const router = useRouter();
  const [saveState, setSaveState] = React.useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [linkState, setLinkState] = React.useState<
    "idle" | "linking" | "linked" | "error"
  >("idle");

  const commit = React.useCallback(async () => {
    if (!asset) return;
    setSaveState("saving");
    try {
      await client.commitPendingAsset({
        params: { assetId: asset.id },
        query: undefined,
        body: undefined,
      });
      setSaveState("saved");
      router.refresh();
    } catch {
      setSaveState("error");
    }
  }, [asset, router]);

  const link = React.useCallback(async () => {
    if (!asset || !projectId) return;
    setLinkState("linking");
    try {
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
      setLinkState("linked");
      router.refresh();
    } catch {
      setLinkState("error");
    }
  }, [asset, projectId, router]);

  // 需登录降级:不截登录页糊弄,引导去保管库登录一次。
  if (needLogin) {
    return (
      <div
        data-slot="chat-web-read-card"
        data-need-login="true"
        className="mt-1 flex w-full max-w-[420px] flex-col gap-1.5 rounded-[10px] border border-warning/40 bg-warning/5 px-3 py-2"
      >
        <span className="text-[10px] font-medium uppercase tracking-wide text-warning">
          需先登录 · {needLogin.domain}
        </span>
        <p className="text-[12px] leading-relaxed text-foreground">
          「{needLogin.domain}」需要先登录才能读到正文。去设置里的「网站登录保管库」把它登录一次(会弹独立浏览器窗口,你自己登),登好回来我再读。
        </p>
        <a
          href="/settings"
          data-slot="chat-web-read-login-link"
          className="inline-flex h-6 w-fit items-center rounded-control border border-warning/50 px-2 text-[11px] font-medium text-warning hover:bg-warning/10"
        >
          去网站登录保管库 →
        </a>
      </div>
    );
  }

  // 失败态:诚实渲错误,不摆假正文。
  if (!asset || error) {
    return (
      <div
        data-slot="chat-web-read-card"
        data-error="true"
        className="mt-1 flex w-full max-w-[420px] flex-col gap-1 rounded-[10px] border border-destructive/40 bg-destructive/5 px-3 py-2"
      >
        <span className="text-[10px] font-medium uppercase tracking-wide text-destructive">
          读取失败
        </span>
        <p className="text-[12px] leading-relaxed text-destructive">
          {error || "没读到正文 —— 换一个有正文内容的链接再试。"}
        </p>
      </div>
    );
  }

  return (
    <div
      data-slot="chat-web-read-card"
      className="mt-1 flex w-full max-w-[420px] flex-col gap-1.5 rounded-[10px] border border-border bg-surface p-2.5"
    >
      <span className="text-[10px] font-medium uppercase tracking-wide text-brand">
        网页正文 · 逐字稿 · {saveState === "saved" ? "已存素材库" : "待确认存入"}
      </span>
      <div
        className="min-w-0 truncate text-[12px] font-medium text-foreground"
        title={asset.title || asset.name}
      >
        {asset.title || asset.name}
      </div>
      <p
        data-slot="chat-web-read-excerpt"
        className="max-h-40 overflow-hidden whitespace-pre-wrap rounded-md border border-border bg-surface-subtle px-2 py-1.5 text-[11px] leading-relaxed text-text-subtle"
      >
        {asset.excerpt}
        {asset.excerpt.length >= 280 ? "…" : ""}
      </p>
      <div className="flex items-center justify-between gap-2">
        <a
          href={asset.sourceUrl}
          target="_blank"
          rel="noreferrer"
          data-slot="chat-web-read-source-link"
          className="inline-flex min-w-0 items-center gap-1 truncate text-[10px] text-brand underline underline-offset-2"
          title={asset.sourceUrl}
        >
          🔗 {domainOf(asset.sourceUrl)}
        </a>
        {saveState === "saved" ? (
          projectId ? (
            linkState === "linked" ? (
              <span className="shrink-0 text-[10px] font-medium text-success">
                已进弹药
              </span>
            ) : (
              <button
                type="button"
                data-slot="chat-web-read-link"
                disabled={linkState === "linking"}
                onClick={() => void link()}
                className="inline-flex h-6 shrink-0 items-center rounded-control border border-brand/40 px-2 text-[10px] font-medium text-brand hover:bg-brand-soft disabled:opacity-50"
              >
                {linkState === "linking"
                  ? "加入中…"
                  : linkState === "error"
                    ? "重试"
                    : "加入弹药"}
              </button>
            )
          ) : (
            <span className="shrink-0 text-[10px] font-medium text-success">
              已存素材库
            </span>
          )
        ) : (
          <button
            type="button"
            data-slot="chat-web-read-save"
            disabled={saveState === "saving"}
            onClick={() => void commit()}
            className="inline-flex h-6 shrink-0 items-center rounded-control bg-brand px-2 text-[10px] font-medium text-brand-foreground hover:bg-brand/90 disabled:opacity-50"
          >
            {saveState === "saving"
              ? "存入中…"
              : saveState === "error"
                ? "重试"
                : "存入素材库"}
          </button>
        )}
      </div>
      {saveState === "saved" && !projectId ? (
        <p className="text-[11px] text-text-subtle">
          已进素材库 —— 输入 @ 引用一个项目后可把这段正文加进它的弹药。
        </p>
      ) : null}
    </div>
  );
}
