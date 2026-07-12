"use client";

/**
 * 对话内本机文件读取卡(T-253;T-263 升级为**阻塞式 HITL 授权**)。
 *
 * 授权态(两条路,共用同一张确认卡 UI):
 *   ①【T-263 主】approvalRequest 非 null → **原生工具授权挂起**(SDK approval-requested):工具调用
 *      被挂起、execute 暂不跑。用户点「允许一次/总是允许该目录」→ 先写 grant(POST read-grant,
 *      服务端 realpath 后落授权表)→ 再 addToolApprovalResponse(approved) → useChat 挂
 *      sendAutomaticallyWhen **同回合 resume 续跑** execute 读到内容(卡随即变成读取结果);「拒绝」
 *      → addToolApprovalResponse(denied) → SDK 标 output-denied、execute 不跑。**无新 user 消息、
 *      无第二回合叙述**(根治「点了还得手动再发」)。
 *   ②【T-253 兜底】needApproval 非 null(端口未装授权门时的旧四态输出)→ 写 grant 后经 onDecision
 *      发一句话让编导重调同一路径(双回合;快修:去掉 streaming 吞点,允许自动重读)。
 *
 * 结果态:file/listing/error(拒读:敏感 denylist/超限/二进制,带原因)。deniedTerminal = 用户已
 * 拒绝的终态(output-denied / reload 回放)。
 */

import * as React from "react";

export interface LocalReadApproval {
  path: string;
  size: number | null;
  type: string;
}

/** [T-263] 原生工具授权挂起态(approval-requested part)—— approvalId + 待读路径(模型原始入参)。 */
export interface LocalReadApprovalRequest {
  approvalId: string;
  path: string;
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

/** [T-262] needApproval 来自文件名搜索兜底(唯一命中)时的注记:原始要读的名字。 */
export interface LocalReadFoundByName {
  requestedName: string;
}

/** [T-262] 按名搜到多个同名文件的候选选择态(用户选中一个经授权门读)。 */
export interface LocalReadCandidates {
  requestedName: string;
  items: Array<{ path: string; size: number | null; type: string }>;
  truncated: boolean;
}

function humanSize(size: number | null): string {
  if (size == null) return "";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

export function ChatLocalReadCard({
  approvalRequest = null,
  needApproval,
  foundByName = null,
  candidates = null,
  file,
  listing,
  error,
  deniedTerminal = false,
  onApprove,
  onDeny,
  onDecision,
}: {
  /** [T-263] 原生授权挂起态(非 null → 渲阻塞式确认卡,允许/拒绝走 addToolApprovalResponse)。 */
  approvalRequest?: LocalReadApprovalRequest | null;
  /** [T-253 兜底] 旧四态输出的未授权态(端口未装授权门时);与 approvalRequest 二选一。 */
  needApproval: LocalReadApproval | null;
  /** [T-262] needApproval 来自文件名搜索兜底(唯一命中)时的注记 → 卡加「原路径没找到、在这找到同名」。 */
  foundByName?: LocalReadFoundByName | null;
  /** [T-262] 按名搜到多个同名文件 → 候选选择态(用户选中一个经授权门读)。 */
  candidates?: LocalReadCandidates | null;
  file: LocalReadFile | null;
  listing: LocalReadListing | null;
  error: string | null;
  /** [T-263] 用户已拒绝的终态(output-denied / reload 回放)→ 渲「已拒绝」,不再弹按钮。 */
  deniedTerminal?: boolean;
  /** [T-263] 原生授权「允许」回执(写 grant 成功后调,续跑 execute)。 */
  onApprove?: (approvalId: string) => void;
  /** [T-263] 原生授权「拒绝」回执(标 output-denied,execute 不跑)。 */
  onDeny?: (approvalId: string) => void;
  /** [T-253 兜底] 旧四态:用户决定后把一句话发回对话(让编导重调/停止)。 */
  onDecision?: (text: string) => void;
}) {
  const [state, setState] = React.useState<
    "idle" | "granting" | "granted" | "denied" | "error"
  >("idle");
  const [grantError, setGrantError] = React.useState<string | null>(null);

  // 待读路径:原生授权态取 approvalRequest.path(模型原始入参,read-grant 端点会 realpath);
  // 兜底态取 needApproval.path(已 realpath)。
  const pendingPath = approvalRequest?.path ?? needApproval?.path ?? "";
  const isNative = approvalRequest != null;

  // [T-262] 写 grant + 让编导重调该真实路径(候选选择/按名唯一命中共用)。pathOverride 缺省用
  // pendingPath;候选选择时传具体候选路径。原生授权态(approvalRequest)仍走 addToolApprovalResponse。
  const grant = React.useCallback(
    async (mode: "once" | "dir", pathOverride?: string) => {
      const p = pathOverride ?? pendingPath;
      if (!p) return;
      setState("granting");
      setGrantError(null);
      try {
        // 先写 grant(服务端 realpath 后落授权表)—— 续跑 execute 时 readLocalFile 查授权表命中即读到。
        const res = await fetch("/api/v1/local/read-grant", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path: p, mode }),
        });
        const data = (await res.json()) as { error?: string };
        if (!res.ok) {
          setState("error");
          setGrantError(data.error ?? "授权失败");
          return;
        }
        setState("granted");
        if (isNative && approvalRequest && !pathOverride) {
          // [T-263] 同回合 resume:回执「已批准」→ SDK 续跑 execute 读到内容(卡随即变读取结果)。
          onApprove?.(approvalRequest.approvalId);
        } else {
          // [T-253 兜底 / T-262 按名命中] 双回合:发一句话让编导重调该真实路径。
          onDecision?.(
            mode === "dir"
              ? `我已允许你读取该目录(${p} 所在目录今后免确认),请再次调用 local.read 读取 ${p}。`
              : `我已允许你读取一次,请再次调用 local.read 读取 ${p}。`,
          );
        }
      } catch {
        setState("error");
        setGrantError("授权请求失败,请重试");
      }
    },
    [pendingPath, isNative, approvalRequest, onApprove, onDecision],
  );

  const deny = React.useCallback(() => {
    if (!pendingPath) return;
    setState("denied");
    if (isNative && approvalRequest) {
      onDeny?.(approvalRequest.approvalId);
    } else {
      onDecision?.(
        `我拒绝了读取 ${pendingPath}。请不要再尝试读取这个文件,换其他方式继续。`,
      );
    }
  }, [pendingPath, isNative, approvalRequest, onDeny, onDecision]);

  // [T-263] 用户已拒绝的终态(output-denied / reload)—— 直接渲「已拒绝」,不再弹按钮。
  if (deniedTerminal) {
    return (
      <div
        data-slot="chat-local-read-card"
        data-denied="true"
        className="mt-1 flex w-full max-w-[420px] flex-col gap-1 rounded-[10px] border border-border bg-surface-subtle/60 px-3 py-2"
      >
        <span className="text-[10px] font-medium uppercase tracking-wide text-text-subtle">
          本机文件读取 · 已拒绝
        </span>
        <p className="text-[12px] text-text-subtle">
          你拒绝了这次读取 —— 编导不会读这个路径。
        </p>
      </div>
    );
  }

  // ① 运行时确认卡(approvalRequest 原生挂起 / needApproval 兜底,同一 UI)。
  if (approvalRequest || needApproval) {
    return (
      <div
        data-slot="chat-local-read-card"
        data-need-approval="true"
        data-native-approval={isNative ? "true" : "false"}
        className="mt-1 flex w-full max-w-[420px] flex-col gap-1.5 rounded-[10px] border border-warning/40 bg-warning/5 px-3 py-2"
      >
        <span className="text-[10px] font-medium uppercase tracking-wide text-warning">
          {foundByName ? "本机文件 · 按名找到,待你确认" : "本机文件读取 · 待你确认"}
        </span>
        {foundByName ? (
          <p className="text-[12px] leading-relaxed text-foreground">
            你要读的「{foundByName.requestedName}」在原路径没找到 —— 在你已授权/常用目录里找到了同名文件,读它吗?
          </p>
        ) : (
          <p className="text-[12px] leading-relaxed text-foreground">
            编导想读取本机文件:
          </p>
        )}
        <code
          className="break-all rounded-md border border-border bg-surface-subtle px-2 py-1 text-[11px] text-foreground"
          title={pendingPath}
        >
          {pendingPath}
        </code>
        {needApproval ? (
          <p className="text-[11px] text-text-subtle">
            {needApproval.type === "directory"
              ? "类型:目录(将返回文件清单)"
              : `类型:${needApproval.type}${
                  needApproval.size != null
                    ? ` · 大小:${humanSize(needApproval.size)}`
                    : ""
                }`}
          </p>
        ) : null}
        {state === "granted" ? (
          <span className="text-[11px] font-medium text-success">
            {isNative
              ? "已允许 —— 正在同一回合读取…"
              : "已允许 —— 编导会重新读取。"}
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

  // [T-262] 候选选择态:按名搜到多个同名文件 → 列全路径,用户选中一个经授权门读(grant once + 重调)。
  // 放在 error 兜底分支之前(candidates 无 file/listing/error,否则会被误判成「没读到内容」)。
  if (candidates && candidates.items.length > 0) {
    return (
      <div
        data-slot="chat-local-read-card"
        data-candidates="true"
        className="mt-1 flex w-full max-w-[420px] flex-col gap-1.5 rounded-[10px] border border-warning/40 bg-warning/5 px-3 py-2"
      >
        <span className="text-[10px] font-medium uppercase tracking-wide text-warning">
          本机文件 · 找到 {candidates.items.length} 个同名文件
        </span>
        <p className="text-[12px] leading-relaxed text-foreground">
          你要读的「{candidates.requestedName}」在原路径没找到 —— 在你已授权/常用目录里找到 {candidates.items.length} 个同名文件,读哪个?
        </p>
        {state === "granted" ? (
          <span className="text-[11px] font-medium text-success">
            已允许 —— 编导会读取你选的这个文件。
          </span>
        ) : state === "denied" ? (
          <span className="text-[11px] font-medium text-text-subtle">
            已取消 —— 编导不会读这些文件。
          </span>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {candidates.items.map((c) => (
              <li
                key={c.path}
                className="flex items-center justify-between gap-2 rounded-md border border-border bg-surface-subtle px-2 py-1.5"
              >
                <span className="min-w-0 flex-1">
                  <code
                    className="block break-all text-[11px] text-foreground"
                    title={c.path}
                  >
                    {c.path}
                  </code>
                  {c.size != null ? (
                    <span className="text-[10px] text-text-subtle">
                      {humanSize(c.size)}
                    </span>
                  ) : null}
                </span>
                <button
                  type="button"
                  data-slot="chat-local-read-candidate-pick"
                  disabled={state === "granting"}
                  onClick={() => void grant("once", c.path)}
                  className="inline-flex h-6 shrink-0 items-center rounded-control bg-brand px-2 text-[10px] font-medium text-brand-foreground hover:bg-brand/90 disabled:opacity-50"
                >
                  {state === "granting" ? "授权中…" : "读这个"}
                </button>
              </li>
            ))}
          </ul>
        )}
        {candidates.truncated && state === "idle" ? (
          <p className="text-[10px] text-text-subtle">
            同名文件较多,仅列出前 {candidates.items.length} 个 —— 若都不是,请给更准确的路径。
          </p>
        ) : null}
        {state === "idle" ? (
          <button
            type="button"
            data-slot="chat-local-read-candidate-cancel"
            onClick={() =>
              onDecision?.(
                `这些同名文件都不是我要的,请不要读,让我给你更准确的路径。`,
              )
            }
            className="mt-0.5 inline-flex h-6 w-fit items-center rounded-control border border-border px-2 text-[10px] font-medium text-text-subtle hover:bg-surface-subtle"
          >
            都不是
          </button>
        ) : null}
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
