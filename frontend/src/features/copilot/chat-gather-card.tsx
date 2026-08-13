"use client";

/**
 * 对话内搜素材结果卡(T-057④,替代已退役的 GatherMaterialIsland)。
 *
 * material.gather 只返回搜索线索(标题/摘要/URL)，不等于网页正文。[T-813] 每条只能先
 * 「阅读全文」→ 当前对话强制 web.read；读成功后的 ChatWebReadCard 才能保存到项目。
 */

export interface ChatGatherItem {
  title: string;
  url: string;
  source: string;
  whyRelevant: string;
  category: string;
  /** [T-084a] 该条引用的联网检索真实 URL(有则渲可点域名链接;无则渲「需核实」徽标)。 */
  sourceUrl?: string;
}

/** [T-084a] 从 URL 取域名做链接文案(失败原样返)。 */
function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function ChatGatherCard({
  items,
  projectId,
  grounding = "unavailable",
  onRead,
  reading = false,
}: {
  items: ReadonlyArray<ChatGatherItem>;
  projectId: string | null;
  /** [T-684] web=真实浏览器结果；unavailable=搜索失败且没有模型记忆兜底。 */
  grounding?: "web" | "unavailable";
  /** [T-813] 把用户所点卡片的真实 URL 交给当前对话，绑定后调用 web.read。 */
  onRead?: (url: string) => void;
  /** 当前对话有生成在途时禁用，避免点击被吞却让人误以为已读。 */
  reading?: boolean;
}) {
  if (items.length === 0) {
    return (
      <div
        data-slot="chat-gather-card"
        data-empty="true"
        className="mt-1 rounded-[10px] border border-dashed border-border px-3 py-2 text-[11px] text-text-subtle"
      >
        {grounding === "unavailable" ? (
          <span data-slot="chat-gather-warning">
            ⚠️ 本轮浏览器搜索失败，没有用模型记忆伪造素材。请稍后重试。
          </span>
        ) : (
          "这轮没搜到可用素材 —— 换个关键词再试试。"
        )}
      </div>
    );
  }

  return (
    <div
      data-slot="chat-gather-card"
      data-grounding={grounding}
      className="mt-1 flex w-full max-w-[420px] flex-col gap-1.5 rounded-[10px] border border-border bg-surface p-2.5"
    >
      {/* [T-645] 搜索属于内部能力路由。降级时诚实告知结果来源，但不再把普通用户
          引向已经隐藏的技术配置项。 */}
      {grounding === "unavailable" ? (
        <div
          data-slot="chat-gather-warning"
          className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 rounded-md border border-warning/40 bg-warning-soft px-2 py-1.5 text-[10px] leading-snug text-warning-foreground"
        >
          <span>⚠️ 本轮浏览器搜索失败，没有用模型记忆伪造素材。请稍后重试。</span>
        </div>
      ) : null}
      <span className="text-[10px] font-medium uppercase tracking-wide text-brand">
        {grounding === "web" ? "联网找到资料" : "未找到联网资料"} · {items.length} 条 · 先阅读正文
      </span>
      <ol className="flex flex-col gap-1.5">
        {items.map((it, i) => {
          const src = it.sourceUrl || it.url;
          return (
            <li
              key={`${i}-${it.title.slice(0, 8)}`}
              data-slot="chat-gather-item"
              className="flex flex-col gap-1 rounded-md border border-border/70 bg-surface-subtle/50 px-2.5 py-1.5"
            >
              <div className="flex items-start gap-2">
                <span className="shrink-0 rounded-full bg-surface-subtle px-1.5 py-0.5 text-[10px] text-muted-foreground">
                  {it.category}
                </span>
                <span className="min-w-0 flex-1 text-[13px] leading-snug text-foreground">
                  {it.title}
                </span>
              </div>
              <p className="text-[11px] leading-relaxed text-text-subtle">
                {it.whyRelevant}
              </p>
              <div className="flex items-center justify-between gap-2">
                {/* [T-084a] 有真实来源就允许新窗查证；没有则明确标为需核实。 */}
                {src ? (
                  <a
                    href={src}
                    target="_blank"
                    rel="noreferrer"
                    data-slot="chat-gather-source-link"
                    className="inline-flex min-w-0 items-center gap-1 truncate text-[10px] text-brand underline underline-offset-2"
                    title={src}
                  >
                    🔗 {domainOf(src)}
                  </a>
                ) : (
                  <span
                    data-slot="chat-gather-needs-check"
                    className="shrink-0 rounded-full border border-warning/40 bg-warning-soft px-1.5 py-0.5 text-[10px] text-warning-foreground"
                  >
                    需核实
                  </span>
                )}
                {src && onRead ? (
                  <button
                    type="button"
                    data-slot="chat-gather-read"
                    disabled={reading}
                    onClick={() => onRead(src)}
                    className="inline-flex h-6 shrink-0 items-center rounded-control border border-brand/40 px-2 text-[10px] font-medium text-brand hover:bg-brand-soft disabled:opacity-50"
                  >
                    {reading ? "阅读中…" : "阅读全文"}
                  </button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
      {!projectId ? (
        <p className="text-[11px] text-text-subtle">
          可以先阅读全文；读成功后，输入 @ 引用当前项目即可保存正文。
        </p>
      ) : null}
    </div>
  );
}
