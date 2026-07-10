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
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { describeUserError } from "@/lib/ai-error-humanize";
import { client } from "@/lib/contract-client";
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
          error: describeUserError(err, "内容读取失败，请重试。"),
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
            <KnowledgeContentBody content={state.content} />
          )}
          {/* [T-091] 手动建边入口:「关联到…」→ 同一 create op(createdByType='user')。 */}
          <KnowledgeRelateEntry knowledgeId={knowledgeId} />
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

// ---------------------------------------------------------------------------
// KnowledgeRelateEntry — [T-091] 详情预览内的手动关联入口
//   展开时拉一次 knowledge.list(排除自身)供选目标;关联走既有
//   knowledge.relations.create(缺省 createdByType='user');幂等由 service 兜底
//   (重复同向同类型边返回既有边,不重插)。
// ---------------------------------------------------------------------------

const MANUAL_RELATION_TYPES: ReadonlyArray<{ value: string; label: string }> = [
  { value: "supports", label: "支撑(supports)" },
  { value: "contradicts", label: "矛盾(contradicts)" },
  { value: "references", label: "引用(references)" },
  { value: "extends", label: "延伸(extends)" },
];

function KnowledgeRelateEntry({ knowledgeId }: { knowledgeId: string }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [targets, setTargets] = React.useState<
    ReadonlyArray<{ id: string; title: string }> | null
  >(null);
  const [targetId, setTargetId] = React.useState("");
  const [relationType, setRelationType] = React.useState("references");
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);

  const handleToggle = React.useCallback(async () => {
    const next = !open;
    setOpen(next);
    setMessage(null);
    if (next && targets === null) {
      try {
        const rows = (await client.listKnowledge({
          params: undefined,
          query: { page: 1, pageSize: 200 },
          body: undefined,
        })) as unknown as ReadonlyArray<{
          id: string;
          title: string;
          status: string;
        }>;
        setTargets(
          (Array.isArray(rows) ? rows : [])
            .filter((r) => r.status === "active" && r.id !== knowledgeId)
            .map((r) => ({ id: r.id, title: r.title })),
        );
      } catch {
        setTargets([]);
        setMessage("知识列表读取失败,稍后重试。");
      }
    }
  }, [open, targets, knowledgeId]);

  const handleRelate = React.useCallback(async () => {
    if (!targetId || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      await client.createKnowledgeRelation({
        params: { knowledgeId },
        query: undefined,
        body: { targetKnowledgeId: targetId, relationType },
      });
      setMessage("已关联。");
      setTargetId("");
      router.refresh();
    } catch (err) {
      setMessage(describeUserError(err, "关联失败，请重试。"));
    } finally {
      setBusy(false);
    }
  }, [targetId, busy, knowledgeId, relationType, router]);

  return (
    <div data-slot="knowledge-relate-entry" className="flex flex-col gap-1.5">
      <button
        type="button"
        data-slot="knowledge-relate-toggle"
        aria-expanded={open}
        onClick={() => void handleToggle()}
        className="w-fit text-[11px] text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
      >
        {open ? "收起关联" : "关联到…"}
      </button>
      {open ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <label className="sr-only" htmlFor="knowledge-relate-target">
            目标知识
          </label>
          <select
            id="knowledge-relate-target"
            data-slot="knowledge-relate-target"
            value={targetId}
            onChange={(e) => setTargetId(e.target.value)}
            className="h-7 max-w-56 rounded-md border border-border bg-surface px-1.5 text-[12px] text-foreground"
          >
            <option value="">选择要关联的知识…</option>
            {(targets ?? []).map((t) => (
              <option key={t.id} value={t.id}>
                {t.title.slice(0, 30)}
              </option>
            ))}
          </select>
          <label className="sr-only" htmlFor="knowledge-relate-manual-type">
            关联类型
          </label>
          <select
            id="knowledge-relate-manual-type"
            data-slot="knowledge-relate-manual-type"
            value={relationType}
            onChange={(e) => setRelationType(e.target.value)}
            className="h-7 rounded-md border border-border bg-surface px-1.5 text-[12px] text-foreground"
          >
            {MANUAL_RELATION_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            data-slot="knowledge-relate-submit"
            disabled={busy || !targetId}
            onClick={() => void handleRelate()}
            className="inline-flex h-7 items-center rounded-md bg-brand px-2 text-[12px] font-medium text-brand-foreground hover:bg-brand/90 disabled:opacity-50"
          >
            {busy ? "关联中…" : "关联"}
          </button>
          {message ? (
            <span
              data-slot="knowledge-relate-message"
              className="text-[11px] text-muted-foreground"
            >
              {message}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
