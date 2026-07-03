"use client";

/**
 * 知识卡内容预览(T-062c SPEC §4)—— 选中一条知识后,读该条目的元数据 + 最新修订正文,
 * markdown 渲染全文(react-markdown + remark-gfm,与 Copilot 气泡同款依赖,不新增重依赖);
 * source=web 型显示来源链接。
 *
 * 数据链:knowledge.get(sourceType/sourceUrl/currentRevisionId)+ knowledge.revisions.list
 * (取 currentRevisionId 对应修订,缺则取 revisionNumber 最大的)。诚实三态:读失败 → 内联
 * 错误;无正文 → 空态文案;绝不编内容。
 */

import * as React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { client } from "@/lib/contract-client";

interface KnowledgeItemDto {
  readonly id: string;
  readonly title: string;
  readonly sourceType: "manual" | "web" | "import" | "ai";
  readonly sourceUrl: string | null;
  readonly currentRevisionId: string;
}

interface RevisionDto {
  readonly id: string;
  readonly revisionNumber: number;
  readonly content: string;
}

interface PreviewState {
  readonly phase: "loading" | "ready" | "error";
  readonly item: KnowledgeItemDto | null;
  readonly content: string;
  readonly error: string | null;
}

const INITIAL: PreviewState = { phase: "loading", item: null, content: "", error: null };

export function KnowledgeDetailPreview({ knowledgeId }: { knowledgeId: string }) {
  const [state, setState] = React.useState<PreviewState>(INITIAL);

  React.useEffect(() => {
    let cancelled = false;
    setState(INITIAL);
    void (async () => {
      try {
        const [item, revisions] = await Promise.all([
          client.getKnowledge({
            params: { knowledgeId },
            query: undefined,
            body: undefined,
          }) as unknown as Promise<KnowledgeItemDto>,
          // isList 读:transport 返回数组;typed client 的返回类型标的是单资源,
          // 结构性收窄(与 knowledge-data 的 DTO 断言同款)。
          client.listKnowledgeRevisions({
            params: { knowledgeId },
            query: undefined,
            body: undefined,
          }) as unknown as Promise<ReadonlyArray<RevisionDto>>,
        ]);
        if (cancelled) return;
        const list = Array.isArray(revisions) ? revisions : [];
        // currentRevisionId 命中的修订优先;缺则退 revisionNumber 最大的(最新)。
        const current =
          list.find((rev) => rev.id === item.currentRevisionId) ??
          list.slice().sort((a, b) => b.revisionNumber - a.revisionNumber)[0];
        setState({
          phase: "ready",
          item,
          content: current?.content ?? "",
          error: null,
        });
      } catch (err) {
        if (cancelled) return;
        setState({
          phase: "error",
          item: null,
          content: "",
          error: err instanceof Error ? err.message : "内容读取失败",
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [knowledgeId]);

  return (
    <div
      data-slot="knowledge-detail-preview"
      data-phase={state.phase}
      className="flex flex-col gap-1.5 rounded-md border border-border bg-surface p-2.5"
    >
      <p className="text-[11px] font-medium text-muted-foreground">内容预览</p>
      {state.phase === "loading" ? (
        <p className="text-[12px] text-muted-foreground">正在加载内容…</p>
      ) : state.phase === "error" ? (
        <p
          data-slot="knowledge-detail-error"
          role="alert"
          className="text-[12px] text-destructive"
        >
          {state.error}
        </p>
      ) : (
        <>
          {/* source=web 型显示来源链接(诚实溯源;manual/import/ai 无链接不显)。 */}
          {state.item?.sourceType === "web" && state.item.sourceUrl ? (
            <a
              data-slot="knowledge-detail-source"
              href={state.item.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="w-fit break-all text-[12px] text-brand underline underline-offset-2"
            >
              来源:{state.item.sourceUrl}
            </a>
          ) : null}
          {state.content.trim().length === 0 ? (
            <p
              data-slot="knowledge-detail-empty"
              className="text-[12px] text-muted-foreground"
            >
              该条目暂无正文内容。
            </p>
          ) : (
            <div
              data-slot="knowledge-detail-content"
              className="prose prose-sm max-w-none text-[13px] leading-relaxed text-foreground [&_a]:text-brand [&_code]:rounded [&_code]:bg-surface-subtle [&_code]:px-1 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-surface-subtle [&_pre]:p-2"
            >
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {state.content}
              </ReactMarkdown>
            </div>
          )}
        </>
      )}
    </div>
  );
}
