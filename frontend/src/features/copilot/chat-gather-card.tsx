"use client";

/**
 * 对话内搜素材结果卡(T-057④,替代已退役的 GatherMaterialIsland)。
 *
 * material.gather 工具产的四类素材候选(钩子/案例/数据点/金句,带来源)渲成列表卡,
 * 逐条「存入弹药」= knowledge.create(sourceUrl 带来源链)+ materialLinks 挂当前项目
 * —— 与稿面「记一条」同链,人采纳落库(铁律②)。无项目上下文 → 只读 + 显式提示。
 */

import * as React from "react";
import { useRouter } from "next/navigation";

import { client } from "@/lib/contract-client";

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
  grounding = "model_memory",
}: {
  items: ReadonlyArray<ChatGatherItem>;
  projectId: string | null;
  /** [T-084a] web=经联网检索(不显黄条)、model_memory=未配/降级(显黄条 + 需核实徽标)。 */
  grounding?: "web" | "model_memory";
}) {
  const router = useRouter();
  const [states, setStates] = React.useState<
    Record<number, "saving" | "saved" | "error">
  >({});

  const save = React.useCallback(
    async (index: number) => {
      const item = items[index];
      if (!item || !projectId) return;
      setStates((prev) => ({ ...prev, [index]: "saving" }));
      try {
        // [T-084a] 来源链:优先 sourceUrl(检索真实 URL),回退 url(镜像位)。
        const srcUrl = item.sourceUrl || item.url;
        const created = (await client.createKnowledge({
          params: undefined,
          query: undefined,
          body: {
            title: item.title,
            knowledgeType: "reference",
            content: [item.whyRelevant, srcUrl && `来源:${srcUrl}`]
              .filter(Boolean)
              .join("\n"),
          },
        })) as unknown as { id: string };
        await client.createMaterialLink({
          params: undefined,
          query: undefined,
          body: {
            projectId,
            entityType: "knowledge",
            entityId: created.id,
            role: "reference",
            stage: "script",
          },
        });
        setStates((prev) => ({ ...prev, [index]: "saved" }));
        router.refresh();
      } catch {
        setStates((prev) => ({ ...prev, [index]: "error" }));
      }
    },
    [items, projectId, router],
  );

  if (items.length === 0) {
    return (
      <div
        data-slot="chat-gather-card"
        data-empty="true"
        className="mt-1 rounded-[10px] border border-dashed border-border px-3 py-2 text-[11px] text-text-subtle"
      >
        这轮没搜到可用素材 —— 换个关键词再试试。
      </div>
    );
  }

  return (
    <div
      data-slot="chat-gather-card"
      data-grounding={grounding}
      className="mt-1 flex w-full max-w-[420px] flex-col gap-1.5 rounded-[10px] border border-border bg-surface p-2.5"
    >
      {/* [Bug-12 T-026] 未配联网检索 → 黄条诚实告知素材来自模型记忆、来源需核实。措辞更新:
          T-126 解耦后搜索有「免 key」(浏览器/RSS)与「付费 API」(bocha/tavily/serpapi)两条路径,
          用户看到「去设置配联网搜索」容易误以为又要配模型。换成两条路径都明示 + 给免 key
          选项深链,降低「我明明浏览器搜索了为什么还要配」的困惑。 */}
      {grounding === "model_memory" ? (
        <div
          data-slot="chat-gather-warning"
          className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 rounded-md border border-warning/40 bg-warning-soft px-2 py-1.5 text-[10px] leading-snug text-warning-foreground"
        >
          <span>
            ⚠️ 本轮素材来自模型记忆(非实时检索),来源需自行核实 —— 在
          </span>
          <a
            href="/settings?tab=models&capability=web.search"
            className="font-medium text-brand underline underline-offset-2"
          >
            设置 → 模型 → 联网搜索
          </a>
          <span>启用「浏览器抓取 Bing / RSS 订阅」(免 key)或配置付费 API</span>
        </div>
      ) : null}
      <span className="text-[10px] font-medium uppercase tracking-wide text-brand">
        {grounding === "web" ? "联网搜到素材" : "搜到素材"} · {items.length} 条 · 逐条存入弹药
      </span>
      <ol className="flex flex-col gap-1.5">
        {items.map((it, i) => {
          const s = states[i];
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
                {(() => {
                  // [T-084a] 有 sourceUrl(检索真实来源)→ 可点域名链接(新窗查证);
                  // 无 → 「需核实」徽标(诚实标注非查证过的真信源)。
                  const src = it.sourceUrl || it.url;
                  return src ? (
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
                  );
                })()}
                {projectId ? (
                  s === "saved" ? (
                    <span className="shrink-0 text-[10px] font-medium text-success">
                      已进弹药
                    </span>
                  ) : (
                    <button
                      type="button"
                      data-slot="chat-gather-save"
                      disabled={s === "saving"}
                      onClick={() => void save(i)}
                      className="inline-flex h-6 shrink-0 items-center rounded-control border border-brand/40 px-2 text-[10px] font-medium text-brand hover:bg-brand-soft disabled:opacity-50"
                    >
                      {s === "saving" ? "存入中…" : s === "error" ? "重试" : "存入弹药"}
                    </button>
                  )
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
      {!projectId ? (
        <p className="text-[11px] text-text-subtle">
          未关联项目 —— 输入 @ 引用一个项目后可把素材存进它的弹药。
        </p>
      ) : null}
    </div>
  );
}
