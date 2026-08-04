"use client";

/**
 * 对话内搜素材结果卡(T-057④,替代已退役的 GatherMaterialIsland)。
 *
 * material.gather 工具产的四类素材候选(钩子/案例/数据点/金句,带来源)渲成列表卡,
 * 逐条「存入弹药」= knowledge.create(sourceUrl 带来源链)+ materialLinks 挂当前项目
 * —— 与稿面「记一条」同链,人采纳落库(铁律②)。无项目上下文 → 只读 + 显式提示。
 *
 * [T-264] 逐条太繁琐 → 加「批量入库」门(复用知识链 knowledge-atom-gate 范式):每条可勾选,
 * 底部「存入选中 N 条」一次性存所有选中项,只 **一次 router.refresh**(而非逐条 N 次)。
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
  grounding = "unavailable",
}: {
  items: ReadonlyArray<ChatGatherItem>;
  projectId: string | null;
  /** [T-684] web=真实浏览器结果；unavailable=搜索失败且没有模型记忆兜底。 */
  grounding?: "web" | "unavailable";
}) {
  const router = useRouter();
  const [states, setStates] = React.useState<
    Record<number, "saving" | "saved" | "error">
  >({});
  // [T-264] 批量勾选:默认全选(未显式取消视为选中);批量入库运行态 + 全失败提示。
  const [unselected, setUnselected] = React.useState<Record<number, boolean>>(
    {},
  );
  const [batchBusy, setBatchBusy] = React.useState(false);
  const [batchError, setBatchError] = React.useState(false);
  const isSelected = React.useCallback(
    (i: number) => !unselected[i],
    [unselected],
  );

  // 单条落库(两步:knowledge.create + materialLink 挂项目)—— 供逐条「存入弹药」与批量共用,
  // 不含 state/refresh 副作用(由调用方按逐条/批量收口)。
  const persistOne = React.useCallback(
    async (item: ChatGatherItem) => {
      if (!projectId) return;
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
    },
    [projectId],
  );

  const save = React.useCallback(
    async (index: number) => {
      const item = items[index];
      if (!item || !projectId) return;
      setStates((prev) => ({ ...prev, [index]: "saving" }));
      try {
        await persistOne(item);
        setStates((prev) => ({ ...prev, [index]: "saved" }));
        setUnselected((prev) => ({ ...prev, [index]: true })); // 落库后退出批量池
        router.refresh();
      } catch {
        setStates((prev) => ({ ...prev, [index]: "error" }));
      }
    },
    [items, projectId, persistOne, router],
  );

  // [T-264] 批量入库:存所有选中且未落库的条 —— 逐条 persist,只 **一次 refresh**(非 N 次)。
  const batchIndices = items
    .map((_, i) => i)
    .filter((i) => isSelected(i) && states[i] !== "saved");
  const batchSave = React.useCallback(async () => {
    if (batchBusy || !projectId || batchIndices.length === 0) return;
    setBatchBusy(true);
    setBatchError(false);
    let anyOk = false;
    try {
      for (const i of batchIndices) {
        const item = items[i];
        if (!item) continue;
        setStates((prev) => ({ ...prev, [i]: "saving" }));
        try {
          await persistOne(item);
          setStates((prev) => ({ ...prev, [i]: "saved" }));
          setUnselected((prev) => ({ ...prev, [i]: true }));
          anyOk = true;
        } catch {
          setStates((prev) => ({ ...prev, [i]: "error" })); // 单条失败不阻断整批
        }
      }
    } finally {
      setBatchBusy(false);
      if (anyOk) router.refresh(); // 一次刷新
      setBatchError(!anyOk && batchIndices.length > 0);
    }
  }, [batchBusy, projectId, batchIndices, items, persistOne, router]);

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
        {grounding === "web" ? "联网找到资料" : "未找到联网资料"} · {items.length} 条 · 可保存到当前项目
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
                {/* [T-264] 批量勾选(有项目、未落库时显);落库后隐藏。 */}
                {projectId && s !== "saved" ? (
                  <input
                    type="checkbox"
                    data-slot="chat-gather-select"
                    aria-label={`选中第 ${i + 1} 条素材`}
                    checked={isSelected(i)}
                    disabled={s === "saving" || batchBusy}
                    onChange={(e) =>
                      setUnselected((prev) => ({
                        ...prev,
                        [i]: !e.target.checked,
                      }))
                    }
                    className="mt-0.5 size-3.5 shrink-0 accent-brand"
                  />
                ) : null}
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
                      已保存到项目
                    </span>
                  ) : (
                    <button
                      type="button"
                      data-slot="chat-gather-save"
                      disabled={s === "saving"}
                      onClick={() => void save(i)}
                      className="inline-flex h-6 shrink-0 items-center rounded-control border border-brand/40 px-2 text-[10px] font-medium text-brand hover:bg-brand-soft disabled:opacity-50"
                    >
                      {s === "saving" ? "保存中…" : s === "error" ? "重试" : "保存到项目"}
                    </button>
                  )
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
      {/* [T-264] 批量入库门(有项目、≥2 条时显)——「存入选中 N 条」一次 persist + 一次 refresh。 */}
      {projectId && items.length > 1 ? (
        <div
          data-slot="chat-gather-batch"
          className="flex flex-wrap items-center gap-2 border-t border-border/60 pt-1.5"
        >
          <button
            type="button"
            data-slot="chat-gather-batch-save"
            disabled={batchBusy || batchIndices.length === 0}
            onClick={() => void batchSave()}
            className="inline-flex h-6 items-center rounded-control bg-brand px-2 text-[10px] font-medium text-brand-foreground hover:bg-brand/90 disabled:opacity-50"
          >
            {batchBusy ? "批量保存中…" : `保存选中 ${batchIndices.length} 条`}
          </button>
          {batchError ? (
            <span className="text-[10px] text-destructive">
              批量存入失败，重试
            </span>
          ) : null}
        </div>
      ) : null}
      {!projectId ? (
        <p className="text-[11px] text-text-subtle">
          未关联项目——输入 @ 引用一个项目后，可把这些素材统一保存进项目。
        </p>
      ) : null}
    </div>
  );
}
