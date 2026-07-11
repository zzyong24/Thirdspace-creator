"use client";

/**
 * 对话内网页截图结果卡(T-084b;T-219 加确认门)。
 *
 * material.screenshot 工具真开无头浏览器给公开 URL 截图 → 落 **pending** asset(带 sourceUrl
 * 存证,素材库 list 按 active 过滤 → 未确认前不进库)。本卡渲缩略图 + 来源 URL + 两级确认门:
 *   ①「存入素材库」= client.commitPendingAsset(pending→active + stamp 当前号,铁律②:AI 写入
 *      需人确认才进库);
 *   ②(存入后)「加入弹药」= createMaterialLink 挂当前项目(把已入库截图挂进这条内容用料链)。
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
  // [T-219] 存入素材库(确认门①):pending → active。
  const [saveState, setSaveState] = React.useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  // 加入弹药(确认门②,存入后才可):createMaterialLink 挂当前项目。
  const [linkState, setLinkState] = React.useState<
    "idle" | "linking" | "linked" | "error"
  >("idle");

  // [T-219] 「存入素材库」= commitPendingAsset(pending→active + stamp 当前号,铁律②)。
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

  // 「加入弹药」= 把已入库(active)截图 asset 挂进当前项目用料链(与 ChatGatherCard 同链)。
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
        网页截图 · 真证据 ·{" "}
        {saveState === "saved" ? "已存素材库" : "待确认存入"}
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
          缩略图加载中 / 不可用
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
        {/* [T-219] 确认门①:未存入 → 「存入素材库」(pending→active);存入后 → 若有项目再露
            确认门②「加入弹药」(挂用料链),否则显「已存素材库」。 */}
        {saveState === "saved" ? (
          projectId ? (
            linkState === "linked" ? (
              <span className="shrink-0 text-[10px] font-medium text-success">
                已进弹药
              </span>
            ) : (
              <button
                type="button"
                data-slot="chat-screenshot-link"
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
            data-slot="chat-screenshot-save"
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
          已进素材库 —— 输入 @ 引用一个项目后可把截图加进它的弹药。
        </p>
      ) : null}
    </div>
  );
}
