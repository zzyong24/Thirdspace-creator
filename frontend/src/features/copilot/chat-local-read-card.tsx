"use client";

/**
 * 对话内本机文件读取卡(T-253)。local.read 工具四态(照 ChatWebReadCard 的 needLogin 范式):
 *   ① needApproval 非 null → **运行时确认卡**:「编导想读 <path>(大小/类型)」+ 三按钮
 *      (允许一次 / 总是允许该目录 / 拒绝)。允许 → POST /api/v1/local/read-grant 写授权表,
 *      然后经 onDecision 发一句话让编导**重调同一路径**;拒绝 → 本地渲「已拒绝」+ 告知编导别再试。
 *   ② file 非 null → 已读到文本:文件名/路径 + 窗口进度(offset/totalChars/hasMore)+ 正文预览。
 *   ③ listing 非 null → 目录清单。
 *   ④ error 非 null → 拒读(敏感 denylist/超限/二进制,带原因)或 IO 失败 —— 诚实渲错误。
 */

import * as React from "react";

export interface LocalReadApproval {
  path: string;
  size: number | null;
  type: string;
}

export interface LocalReadFile {
  path: string;
  name: string;
  text: string;
  offset: number;
  totalChars: number;
  hasMore: boolean;
}

export interface LocalReadListing {
  path: string;
  entries: Array<{ name: string; kind: "file" | "dir"; size: number | null }>;
  total: number;
}

function humanSize(size: number | null): string {
  if (size == null) return "";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

export function ChatLocalReadCard({
  needApproval,
  file,
  listing,
  error,
  onDecision,
}: {
  needApproval: LocalReadApproval | null;
  file: LocalReadFile | null;
  listing: LocalReadListing | null;
  error: string | null;
  /** 用户在确认卡上做出决定后,把一句话发回对话(让编导重调 / 停止尝试)。流式中可为空。 */
  onDecision?: (text: string) => void;
}) {
  const [state, setState] = React.useState<
    "idle" | "granting" | "granted" | "denied" | "error"
  >("idle");
  const [grantError, setGrantError] = React.useState<string | null>(null);

  const grant = React.useCallback(
    async (mode: "once" | "dir") => {
      if (!needApproval) return;
      setState("granting");
      setGrantError(null);
      try {
        const res = await fetch("/api/v1/local/read-grant", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path: needApproval.path, mode }),
        });
        const data = (await res.json()) as { error?: string };
        if (!res.ok) {
          setState("error");
          setGrantError(data.error ?? "授权失败");
          return;
        }
        setState("granted");
        onDecision?.(
          mode === "dir"
            ? `我已允许你读取该目录(${needApproval.path} 所在目录今后免确认),请再次调用 local.read 读取 ${needApproval.path}。`
            : `我已允许你读取一次,请再次调用 local.read 读取 ${needApproval.path}。`,
        );
      } catch {
        setState("error");
        setGrantError("授权请求失败,请重试");
      }
    },
    [needApproval, onDecision],
  );

  const deny = React.useCallback(() => {
    if (!needApproval) return;
    setState("denied");
    onDecision?.(
      `我拒绝了读取 ${needApproval.path}。请不要再尝试读取这个文件,换其他方式继续。`,
    );
  }, [needApproval, onDecision]);

  // ① 运行时确认卡(needApproval)。
  if (needApproval) {
    return (
      <div
        data-slot="chat-local-read-card"
        data-need-approval="true"
        className="mt-1 flex w-full max-w-[420px] flex-col gap-1.5 rounded-[10px] border border-warning/40 bg-warning/5 px-3 py-2"
      >
        <span className="text-[10px] font-medium uppercase tracking-wide text-warning">
          本机文件读取 · 待你确认
        </span>
        <p className="text-[12px] leading-relaxed text-foreground">
          编导想读取本机文件:
        </p>
        <code
          className="break-all rounded-md border border-border bg-surface-subtle px-2 py-1 text-[11px] text-foreground"
          title={needApproval.path}
        >
          {needApproval.path}
        </code>
        <p className="text-[11px] text-text-subtle">
          {needApproval.type === "directory"
            ? "类型:目录(将返回文件清单)"
            : `类型:${needApproval.type}${
                needApproval.size != null
                  ? ` · 大小:${humanSize(needApproval.size)}`
                  : ""
              }`}
        </p>
        {state === "granted" ? (
          <span className="text-[11px] font-medium text-success">
            已允许 —— 编导会重新读取。
          </span>
        ) : state === "denied" ? (
          <span className="text-[11px] font-medium text-text-subtle">
            已拒绝 —— 编导不会再读这个路径。
          </span>
        ) : (
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              data-slot="chat-local-read-allow-once"
              disabled={state === "granting"}
              onClick={() => void grant("once")}
              className="inline-flex h-6 items-center rounded-control bg-brand px-2 text-[10px] font-medium text-brand-foreground hover:bg-brand/90 disabled:opacity-50"
            >
              {state === "granting" ? "授权中…" : "允许一次"}
            </button>
            <button
              type="button"
              data-slot="chat-local-read-allow-dir"
              disabled={state === "granting"}
              onClick={() => void grant("dir")}
              className="inline-flex h-6 items-center rounded-control border border-brand/40 px-2 text-[10px] font-medium text-brand hover:bg-brand-soft disabled:opacity-50"
            >
              总是允许该目录
            </button>
            <button
              type="button"
              data-slot="chat-local-read-deny"
              disabled={state === "granting"}
              onClick={deny}
              className="inline-flex h-6 items-center rounded-control border border-border px-2 text-[10px] font-medium text-text-subtle hover:bg-surface-subtle disabled:opacity-50"
            >
              拒绝
            </button>
          </div>
        )}
        {state === "error" && grantError ? (
          <p className="text-[11px] text-destructive">{grantError}</p>
        ) : null}
      </div>
    );
  }

  // ④ 拒读/失败态(敏感 denylist/超限/二进制/IO)—— 诚实渲原因。
  if (error || (!file && !listing)) {
    return (
      <div
        data-slot="chat-local-read-card"
        data-error="true"
        className="mt-1 flex w-full max-w-[420px] flex-col gap-1 rounded-[10px] border border-destructive/40 bg-destructive/5 px-3 py-2"
      >
        <span className="text-[10px] font-medium uppercase tracking-wide text-destructive">
          本机文件读取 · 未读取
        </span>
        <p className="text-[12px] leading-relaxed text-destructive">
          {error || "没读到内容。"}
        </p>
      </div>
    );
  }

  // ③ 目录清单。
  if (listing) {
    return (
      <div
        data-slot="chat-local-read-card"
        data-listing="true"
        className="mt-1 flex w-full max-w-[420px] flex-col gap-1.5 rounded-[10px] border border-border bg-surface p-2.5"
      >
        <span className="text-[10px] font-medium uppercase tracking-wide text-brand">
          本机目录 · {listing.total} 项
        </span>
        <code className="break-all text-[11px] text-text-subtle">{listing.path}</code>
        <ul className="max-h-48 overflow-auto rounded-md border border-border bg-surface-subtle px-2 py-1.5 text-[11px] leading-relaxed text-foreground">
          {listing.entries.slice(0, 50).map((e) => (
            <li key={e.name} className="flex items-center justify-between gap-2">
              <span className="min-w-0 truncate">
                {e.kind === "dir" ? "📁" : "📄"} {e.name}
              </span>
              <span className="shrink-0 text-text-subtle">{humanSize(e.size)}</span>
            </li>
          ))}
        </ul>
        {listing.total > 50 ? (
          <p className="text-[10px] text-text-subtle">
            仅展示前 50 项(共 {listing.total} 项,清单已全部给到编导)。
          </p>
        ) : null}
      </div>
    );
  }

  // ② 已读到文本文件:窗口进度 + 正文预览(全文已进编导上下文)。
  const f = file!;
  const readEnd = f.offset + f.text.length;
  return (
    <div
      data-slot="chat-local-read-card"
      className="mt-1 flex w-full max-w-[420px] flex-col gap-1.5 rounded-[10px] border border-border bg-surface p-2.5"
    >
      <span className="text-[10px] font-medium uppercase tracking-wide text-brand">
        本机文件 · 已读取
      </span>
      <div className="min-w-0 truncate text-[12px] font-medium text-foreground" title={f.path}>
        {f.name}
      </div>
      <code className="break-all text-[10px] text-text-subtle">{f.path}</code>
      <p
        data-slot="chat-local-read-preview"
        className="max-h-40 overflow-hidden whitespace-pre-wrap rounded-md border border-border bg-surface-subtle px-2 py-1.5 text-[11px] leading-relaxed text-text-subtle"
      >
        {f.text.slice(0, 300)}
        {f.text.length > 300 ? "…" : ""}
      </p>
      <p className="text-[10px] text-text-subtle">
        {f.hasMore
          ? `本窗读到第 ${f.offset + 1}–${readEnd} 字(全文 ${f.totalChars} 字,编导会继续翻窗)`
          : `已读全文(${f.totalChars} 字)`}
      </p>
    </div>
  );
}
