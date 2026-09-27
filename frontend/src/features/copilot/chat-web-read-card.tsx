"use client";

/**
 * 对话内网页正文读取结果卡(T-217c)。
 *
 * web.read 工具带 `.auth/web` 登录态读一个 URL 的正文全文 → 落 **pending** 逐字稿文本素材(带
 * sourceUrl 存证,素材库 list 按 active 过滤 → 未确认前不进库)。三态:
 *   ① asset 非 null → 读到正文,作为当前对话临时上下文；有项目时一键「保存到项目」
 *      (commit pending asset → materialLink)，搜索线索本身没有保存入口；
 *   ② needLogin 非 null → 该站需先在保管库登录一次 → 渲引导条 +「去网站登录保管库」(跳设置);
 *   ③ error 非 null → 逐类诚实错误态(打不开 / HTTP 码 / 抽不出正文),不摆假正文。
 */

import * as React from "react";

import { client } from "@/lib/contract-client";

export interface ChatWebReadAsset {
  id: string;
  name: string;
  previewUrl: string | null;
  sourceUrl: string;
  finalUrl?: string;
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
  httpStatus = null,
  loginSuggested = false,
  projectId,
  window,
  hasMore = false,
}: {
  asset: ChatWebReadAsset | null;
  needLogin: { domain: string } | null;
  error: string | null;
  httpStatus?: number | null;
  loginSuggested?: boolean;
  projectId: string | null;
  window?: { offset: number; length: number; total: number } | null;
  hasMore?: boolean;
}) {
  const [saveState, setSaveState] = React.useState<
    "idle" | "saving" | "saved" | "commit-error" | "link-error"
  >("idle");

  const saveToProject = React.useCallback(async () => {
    if (!asset || !projectId) return;
    setSaveState("saving");
    try {
      await client.commitPendingAsset({
        params: { assetId: asset.id },
        query: undefined,
        body: { expectedSourceUrl: asset.sourceUrl },
      });
    } catch {
      setSaveState("commit-error");
      return;
    }
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
          addedByType: "ai",
        },
      });
      setSaveState("saved");
    } catch {
      setSaveState("link-error");
    }
  }, [asset, projectId]);

  const coverage = window
    ? {
        read: Math.min(window.total, window.offset + window.length),
        total: window.total,
      }
    : null;

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
          href="/settings?highlight=web-session-vault"
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
    const blockedByWebsite = Boolean(error && loginSuggested);
    return (
      <div
        data-slot="chat-web-read-card"
        data-error="true"
        className="mt-1 flex w-full max-w-[420px] flex-col gap-1.5 rounded-[10px] border border-destructive/40 bg-destructive/5 px-3 py-2"
      >
        <span className="text-[10px] font-medium uppercase tracking-wide text-destructive">
          读取失败
        </span>
        {blockedByWebsite ? (
          <>
            <p className="text-[12px] leading-relaxed text-foreground">
              当前没有拿到原文。这个页面可能已下架，也可能需要登录或额外权限。
            </p>
            {httpStatus ? (
              <p
                data-slot="chat-web-read-http-status"
                className="text-[11px] text-text-subtle"
              >
                网站返回 HTTP {httpStatus}
              </p>
            ) : null}
            <p className="text-[11px] leading-relaxed text-text-subtle">
              可以先登录这个网站后重试；如果仍失败，再换一个来源。系统不会根据没读到的原文编内容。
            </p>
            <a
              href="/settings?highlight=web-session-vault"
              data-slot="chat-web-read-login-suggestion"
              className="inline-flex h-6 w-fit items-center rounded-control border border-warning/50 px-2 text-[11px] font-medium text-warning hover:bg-warning/10"
            >
              前往网站登录 →
            </a>
          </>
        ) : (
          <p className="text-[12px] leading-relaxed text-destructive">
            {error || "没读到正文 —— 换一个有正文内容的链接再试。"}
          </p>
        )}
      </div>
    );
  }

  // SEMANTIC_BOUNDARY_ALLOW: 只校验展示链接协议及凭据，不选择内容或授予访问权限。
  let sourceLink = asset.sourceUrl;
  try {
    const final = new URL(asset.finalUrl ?? "");
    if (["https:", "http:"].includes(final.protocol) && !final.username && !final.password) sourceLink = final.href;
  } catch { /* 旧记录无最终地址时保留原来源。 */ }

  return (
    <div
      data-slot="chat-web-read-card"
      className="mt-1 flex w-full max-w-[420px] flex-col gap-1.5 rounded-[10px] border border-border bg-surface p-2.5"
    >
      <span className="text-[10px] font-medium uppercase tracking-wide text-brand">
        已阅读 · 当前对话临时上下文
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
      <p data-slot="chat-web-read-extractor" className="text-[10px] text-text-subtle">
        提取方式：{asset.extractor}
      </p>
      {coverage ? (
        <p data-slot="chat-web-read-coverage" className="text-[10px] text-text-subtle">
          已读 {coverage.read.toLocaleString("zh-CN")} / 共 {coverage.total.toLocaleString("zh-CN")} 字
          {hasMore && coverage.total > coverage.read
            ? ` · 还有 ${(coverage.total - coverage.read).toLocaleString("zh-CN")} 字未读`
            : " · 本页正文已读完"}
        </p>
      ) : (
        <p className="text-[10px] text-text-subtle">已读取正文，当前来源未返回覆盖度。</p>
      )}
      <div className="flex items-center justify-between gap-2">
        <a
          href={sourceLink}
          target="_blank"
          rel="noreferrer"
          data-slot="chat-web-read-source-link"
          className="inline-flex min-w-0 items-center gap-1 truncate text-[10px] text-brand underline underline-offset-2"
          title={sourceLink}
        >
          🔗 {domainOf(sourceLink)}
        </a>
        {saveState === "saved" ? (
          <span className="shrink-0 text-[10px] font-medium text-success">
            已保存到项目
          </span>
        ) : projectId ? (
          <button
            type="button"
            data-slot="chat-web-read-save"
            disabled={saveState === "saving"}
            onClick={() => void saveToProject()}
            className="inline-flex h-6 shrink-0 items-center rounded-control bg-brand px-2 text-[10px] font-medium text-brand-foreground hover:bg-brand/90 disabled:opacity-50"
          >
            {saveState === "saving"
              ? "保存中…"
              : saveState === "idle"
                ? "保存到项目"
                : "重试保存"}
          </button>
        ) : null}
      </div>
      {saveState === "link-error" ? (
        <p role="alert" className="text-[11px] text-destructive">
          素材已入库，项目关联失败；请重试保存，正文不会重新抓取。
        </p>
      ) : saveState === "commit-error" ? (
        <p role="alert" className="text-[11px] text-destructive">
          正文确认入库失败；请重试，系统会继续使用同一份已读素材。
        </p>
      ) : null}
      {!projectId ? (
        <p className="text-[11px] text-text-subtle">
          已进入当前对话临时上下文。请先 @ 引用当前项目，再保存这份正文。
        </p>
      ) : null}
    </div>
  );
}
