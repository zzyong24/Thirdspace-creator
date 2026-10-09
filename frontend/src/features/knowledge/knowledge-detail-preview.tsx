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

import { describeUserError } from "@/lib/ai-error-humanize";
import { Button } from "@/components/ui/button";
import { client as defaultClient } from "@/lib/contract-client";
import {
  parseLessonPoints,
  type LessonPoint,
} from "./knowledge-lesson-content";

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

export function KnowledgeDetailPreview({
  knowledgeId,
  onContentLoaded,
  reader = false,
  contractClient = defaultClient,
}: {
  knowledgeId: string;
  reader?: boolean;
  contractClient?: typeof defaultClient;
  /**
   * [T-260c] 最新修订正文读回回调 —— 交互岛用它给「编辑」预填全文(全文就地编辑,
   * 保存为新版本)。用 ref 镜像,避免进 effect 依赖导致重复拉取。
   */
  onContentLoaded?: (content: string) => void;
}) {
  const client = contractClient;
  const [retry, setRetry] = React.useState(0);
  const [state, setState] = React.useState<PreviewState>(INITIAL);
  const onContentLoadedRef = React.useRef(onContentLoaded);
  // eslint-disable-next-line react-hooks/refs -- latest-callback ref 不参与渲染，避免回调身份变化触发重复拉取
  onContentLoadedRef.current = onContentLoaded;

  React.useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- knowledgeId 是外部选择，切换时必须立即清除旧预览状态
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
        if(reader && (!current || current.id !== item.currentRevisionId)) throw new Error("正文版本暂时未读到，请重试。");
        const content = current?.content ?? "";
        setState({
          phase: "ready",
          item,
          content,
          error: null,
        });
        // 回传最新正文(编辑预填源);读失败/空正文回传空串(诚实,不编内容)。
        onContentLoadedRef.current?.(content);
      } catch (err) {
        if (cancelled) return;
        setState({
          phase: "error",
          item: null,
          content: "",
          error: describeUserError(err, "内容读取失败，请重试。"),
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [knowledgeId, retry, reader, client]);

  return (
    <div
      data-slot="knowledge-detail-preview"
      data-phase={state.phase}
      className={reader ? "flex flex-col gap-4 text-base [&_[data-slot=knowledge-detail-content]]:text-base [&_p]:text-base [&_li]:text-base" : "flex flex-col gap-1.5 rounded-md border border-border bg-surface p-2.5"}
    >
      {!reader && <p className="text-[11px] font-medium text-muted-foreground">内容预览</p>}
      {state.phase === "loading" ? (
        <p className="text-[12px] text-muted-foreground">正在加载内容…</p>
      ) : state.phase === "error" ? (
        <div><p
          data-slot="knowledge-detail-error"
          role="alert"
          className="text-[12px] text-destructive"
        >
          {state.error}
        </p><Button variant="outline" className="mt-3" onClick={()=>setRetry(n=>n+1)}>重新读取正文</Button></div>
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
            <KnowledgeContentBody content={state.content} />
          )}
          {/* [T-260b] 关系管理(建边 + 删边)整体移到关系图主面:
              - 建边全 AI(图面「AI 找关联」→ 候选确认门,createdByType='ai'),不给人手连;
              - 删边唯一入口在图面「已建关联」清单。
              详情抽屉回归「预览 + 归档」两件事,不再挂 KnowledgeRelateEntry /
              KnowledgeRelationsList。 */}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// KnowledgeContentBody — [T-198] 正文渲染:课程 YAML → 带小标题的可读区块;
//   其余(markdown / 纯文本)→ react-markdown 正常渲染(诚实退回,绝不崩)。
// ---------------------------------------------------------------------------

function KnowledgeContentBody({ content }: { content: string }) {
  const lessons = React.useMemo(() => parseLessonPoints(content), [content]);
  if (lessons && lessons.length > 0) {
    return (
      <div
        data-slot="knowledge-detail-content"
        data-structured="lesson"
        className="flex flex-col gap-3"
      >
        {lessons.map((lesson, index) => (
          <LessonPointView
            key={lesson.id ?? `lesson-${index}`}
            lesson={lesson}
            index={index}
          />
        ))}
      </div>
    );
  }
  return (
    <div
      data-slot="knowledge-detail-content"
      className="prose prose-sm max-w-none text-[13px] leading-relaxed text-foreground [&_a]:text-brand [&_code]:rounded [&_code]:bg-surface-subtle [&_code]:px-1 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-surface-subtle [&_pre]:p-2"
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
}

// 单个知识点的结构化区块(一句话 / 正文 / 案例 / 易错点 / 苏格拉底提问 / 实践作业)。
function LessonPointView({
  lesson,
  index,
}: {
  lesson: LessonPoint;
  index: number;
}) {
  return (
    <section
      data-slot="lesson-point"
      data-lesson-index={index}
      className="flex flex-col gap-2 rounded-md border border-border bg-surface-subtle/40 p-3"
    >
      {lesson.title ? (
        <div className="flex flex-wrap items-baseline gap-2">
          <h4
            data-slot="lesson-point-title"
            className="text-[14px] font-semibold leading-snug text-foreground"
          >
            {lesson.title}
          </h4>
          {lesson.module ? (
            <span className="rounded-full bg-brand-soft px-1.5 py-0.5 text-[10px] text-brand">
              {lesson.module}
            </span>
          ) : null}
          {lesson.difficulty ? (
            <span className="text-[10px] text-muted-foreground">
              难度 {lesson.difficulty}
            </span>
          ) : null}
        </div>
      ) : null}
      {lesson.oneLine ? (
        <LessonBlock slot="one-line" label="一句话">
          <p className="text-[13px] font-medium leading-relaxed text-foreground">
            {lesson.oneLine}
          </p>
        </LessonBlock>
      ) : null}
      {lesson.core ? (
        <LessonBlock slot="core" label="正文">
          <LessonProse text={lesson.core} />
        </LessonBlock>
      ) : null}
      {lesson.examples ? (
        <LessonBlock slot="examples" label="案例">
          <LessonProse text={lesson.examples} />
        </LessonBlock>
      ) : null}
      {lesson.misconceptions ? (
        <LessonBlock slot="misconceptions" label="易错点">
          <LessonProse text={lesson.misconceptions} />
        </LessonBlock>
      ) : null}
      {lesson.socratic.length > 0 ? (
        <LessonBlock slot="socratic" label="苏格拉底提问">
          <ol className="flex flex-col gap-2">
            {lesson.socratic.map((question, qi) => (
              <li
                key={qi}
                data-slot="socratic-question"
                className="flex flex-col gap-1 rounded-md bg-surface px-2.5 py-2"
              >
                <p className="text-[13px] font-medium text-foreground">
                  Q{qi + 1}. {question.q}
                </p>
                {question.keyPoints.length > 0 ? (
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[11px] font-medium text-muted-foreground">
                      要点
                    </span>
                    <ul className="ml-4 list-disc text-[12px] leading-relaxed text-muted-foreground">
                      {question.keyPoints.map((point, pi) => (
                        <li key={pi} data-slot="socratic-key-point">
                          {point}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {question.hint ? (
                  <p className="text-[11px] leading-snug text-muted-foreground">
                    提示:{question.hint}
                  </p>
                ) : null}
              </li>
            ))}
          </ol>
        </LessonBlock>
      ) : null}
      {lesson.practiceTask ? (
        <LessonBlock slot="practice" label="实践作业">
          <LessonProse text={lesson.practiceTask} />
        </LessonBlock>
      ) : null}
    </section>
  );
}

function LessonBlock({
  slot,
  label,
  children,
}: {
  slot: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div data-slot={`lesson-${slot}`} className="flex flex-col gap-1">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      {children}
    </div>
  );
}

// 多段正文按空行分段渲染(保留换行/段落留白,读起来不挤成一坨)。
function LessonProse({ text }: { text: string }) {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  return (
    <div className="flex flex-col gap-1.5">
      {paragraphs.map((para, i) => (
        <p
          key={i}
          className="whitespace-pre-wrap text-[13px] leading-relaxed text-foreground"
        >
          {para}
        </p>
      ))}
    </div>
  );
}
