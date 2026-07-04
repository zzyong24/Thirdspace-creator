"use client";

/**
 * 对话内审核报告卡(T-103b,SPEC 2026-07-04 ai-into-copilot-convergence §3 文案审核行)。
 *
 * review.script 工具 dispatch 既有 script.review 审核链路(L1 违禁词 lint + L2 豆包语义审,复用
 * T-086,不重造)后立即返回 { taskId, projectId }。本卡:
 *   1. 据 taskId 轮询 getTask(与旧 script-review-gate 同款 3s 轮询)→ succeeded 后读
 *      getLatestScriptReview(projectId)拿结构化报告。
 *   2. 渲**审核报告卡**:verdict 徽标(pass 绿 / risk 黄 / block 红)+ summary + modelLabel
 *      诚实标注(含「非专用」字样醒目提示去设置)+ L1/L2 命中列表(带来源标签 + 命中片段)。
 *   3. 改写建议逐条走**应用门**:人点「应用改写」才把命中片段(quote)在脚本当前版本单点替换成
 *      suggestion,经 createArtifactVersion(append-only)物化新版本;写后「已应用 · 撤销」
 *      (restoreArtifact 回写前版本)。AI 绝不自动改稿(铁律②),与稿面审核门同一条应用门链。
 *
 * 诚实(铁律):报告全来自真实 script_review_reports 行;dispatch 失败 / 无项目上下文 / 未配模型 →
 * 卡内诚实错误态(不假装审过);L1 违禁词 lint 是确定性的照常跑,即便没配 L2 语义审模型。
 */

import * as React from "react";
import { useRouter } from "next/navigation";

import { client } from "@/lib/contract-client";
import { cn } from "@/lib/utils";
import { applyRewriteToSections } from "@/features/draft-workbench/script-review-gate";
import type {
  ScriptReviewReportResource,
  LintFindingResource,
  LlmFindingResource,
} from "@creatoros/contract";

// 轮询审核任务的间隔(与旧 script-review-gate / blind-predict-row 同款 3s;测试注入 0 去等待)。
const DEFAULT_POLL_INTERVAL_MS = 3000;

/** verdict → 徽章样式 + 文案(与稿面审核门 VERDICT_META 同口径)。 */
const VERDICT_META: Record<
  ScriptReviewReportResource["verdict"],
  { readonly label: string; readonly className: string }
> = {
  pass: { label: "通过", className: "border-success/40 bg-success-soft text-success" },
  risk: { label: "有风险", className: "border-warning/40 bg-warning-soft text-warning" },
  block: {
    label: "阻断",
    className: "border-destructive/40 bg-destructive/10 text-destructive",
  },
};

type Phase = "running" | "ready" | "error";

export function ChatReviewReportCard({
  taskId,
  projectId,
  error: initialError,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
}: {
  readonly taskId: string | null;
  readonly projectId: string | null;
  /** dispatch 阶段的诚实错误(工具已判无项目上下文 / 端口未装配 → 直接错误态,不轮询)。 */
  readonly error: string | null;
  readonly pollIntervalMs?: number;
}) {
  const router = useRouter();
  const [phase, setPhase] = React.useState<Phase>(
    initialError || !taskId || !projectId ? "error" : "running",
  );
  const [report, setReport] = React.useState<ScriptReviewReportResource | null>(
    null,
  );
  const [error, setError] = React.useState<string | null>(initialError);
  // 卸载后停止在 await 链里 setState(长任务守卫,与旧盲预测/审核行同款)。
  const cancelledRef = React.useRef(false);
  React.useEffect(
    () => () => {
      cancelledRef.current = true;
    },
    [],
  );

  // 轮询 getTask(taskId)→ succeeded 后读 getLatestScriptReview(projectId)。只在挂载时跑一次
  // (taskId/projectId 是工具结果的定值,不会变)。dispatch 失败态直接跳过(error 已置)。
  React.useEffect(() => {
    if (!taskId || !projectId || initialError) return;
    void (async () => {
      try {
        for (let i = 0; i < 75; i++) {
          if (cancelledRef.current) return;
          await new Promise((r) => setTimeout(r, pollIntervalMs));
          if (cancelledRef.current) return;
          const status = (await client.getTask({
            params: { taskId },
            query: undefined,
            body: undefined,
          })) as { status: string };
          if (status.status === "succeeded") {
            const latest = await fetchLatest(projectId);
            if (cancelledRef.current) return;
            if (latest) {
              setReport(latest);
              setPhase("ready");
              // 报告落库后刷新服务端 vm → 稿面审核门 + 发布区软门提示同步(不阻断)。
              router.refresh();
            } else {
              setPhase("error");
              setError("审核完成但未取到报告,请重试。");
            }
            return;
          }
          if (status.status === "failed" || status.status === "cancelled") {
            if (!cancelledRef.current) {
              setPhase("error");
              setError("审核失败(可能没配审核模型)—— L1 违禁词 lint 仍会跑,请去设置配置审核模型后重试。");
            }
            return;
          }
        }
        if (!cancelledRef.current) {
          setPhase("error");
          setError("审核超时,请重试。");
        }
      } catch {
        if (!cancelledRef.current) {
          setPhase("error");
          setError("审核出错,请重试。");
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      data-slot="chat-review-report-card"
      data-testid="chat-review-report-card"
      data-verdict={report?.verdict ?? "none"}
      className="mt-1.5 flex flex-col gap-1.5 rounded-lg border border-brand/20 bg-surface/70 p-2"
    >
      <span className="text-[10px] font-medium uppercase tracking-wide text-brand">
        AI 编导文案审核 · L1 违禁词 + L2 语义审
      </span>

      {phase === "running" ? (
        <div
          data-slot="chat-review-running"
          className="flex items-center gap-1.5 text-[12px] text-muted-foreground"
        >
          <span className="size-3 shrink-0 animate-spin rounded-full border-2 border-brand border-t-transparent" />
          审核中…(后台跑 L1 违禁词 lint + L2 语义审,稍候)
        </div>
      ) : null}

      {phase === "error" ? (
        <div
          data-slot="chat-review-error"
          role="alert"
          className="flex flex-col gap-1 text-[12px] text-destructive"
        >
          <span>{error ?? "审核出错,请重试。"}</span>
          <a
            href="/settings"
            data-slot="chat-review-settings-link"
            className="self-start text-[11px] font-medium text-brand underline underline-offset-2"
          >
            去设置配置审核模型 →
          </a>
        </div>
      ) : null}

      {phase === "ready" && report ? (
        <ReviewReportBody report={report} />
      ) : null}
    </div>
  );
}

/** 结构化报告主体:verdict + summary + modelLabel 诚实标注 + L1/L2 命中列表(逐条改写门)。 */
function ReviewReportBody({
  report,
}: {
  readonly report: ScriptReviewReportResource;
}) {
  const verdict = VERDICT_META[report.verdict];
  const findingCount = report.lintFindings.length + report.llmFindings.length;
  const nonDedicated = report.modelLabel.includes("非专用");
  // 改写建议应用的目标脚本 artifact(报告绑的那一版脚本;null = 无 artifact 无法改写)。
  const artifactId = report.artifactId;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <span
          data-testid="chat-review-verdict"
          className={cn(
            "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium",
            verdict.className,
          )}
        >
          {verdict.label}
        </span>
        <span className="text-[11px] text-muted-foreground">
          命中 {findingCount} 条 · 脚本 v{report.artifactVersion}
        </span>
      </div>

      {report.summary ? (
        <p className="text-[12px] text-foreground">{report.summary}</p>
      ) : null}

      {/* modelLabel 诚实标注:非专用审核模型醒目提示。 */}
      <p
        data-testid="chat-review-model"
        className={cn(
          "text-[11px]",
          nonDedicated ? "font-medium text-warning" : "text-muted-foreground",
        )}
      >
        {nonDedicated ? "⚠ " : ""}
        审核模型:{report.modelLabel}
      </p>

      {findingCount > 0 ? (
        <ul
          data-testid="chat-review-findings"
          className="flex flex-col gap-1.5"
        >
          {report.lintFindings.map((f, i) => (
            <LintFindingRow key={`lint-${i}`} finding={f} artifactId={artifactId} />
          ))}
          {report.llmFindings.map((f, i) => (
            <LlmFindingRow key={`llm-${i}`} finding={f} artifactId={artifactId} />
          ))}
        </ul>
      ) : (
        <p className="text-[11px] text-muted-foreground">未命中任何规则。</p>
      )}
    </div>
  );
}

/** L1 lint 命中(确定性;category + note + replacement + 改写门)。 */
function LintFindingRow({
  finding,
  artifactId,
}: {
  finding: LintFindingResource;
  artifactId: string | null;
}) {
  return (
    <li
      data-slot="chat-review-lint-finding"
      className="flex flex-wrap items-center gap-1.5 rounded border border-border/60 px-2 py-1.5 text-[11px]"
    >
      <span className="rounded bg-surface-subtle px-1 py-0.5 font-medium text-foreground">
        L1
      </span>
      <mark className="rounded bg-warning-soft px-1 text-foreground">
        {finding.quote}
      </mark>
      <span className="text-muted-foreground">{finding.category}</span>
      {finding.note ? (
        <span className="text-muted-foreground">· {finding.note}</span>
      ) : null}
      {finding.replacement ? (
        <span className="text-muted-foreground">→ {finding.replacement}</span>
      ) : null}
      <RewriteApplyButton
        artifactId={artifactId}
        quote={finding.quote}
        suggestion={finding.replacement}
      />
    </li>
  );
}

/** L2 语义审命中(severity + category + reason + suggestion + 改写门)。 */
function LlmFindingRow({
  finding,
  artifactId,
}: {
  finding: LlmFindingResource;
  artifactId: string | null;
}) {
  const sev =
    finding.severity === "block"
      ? "text-destructive"
      : finding.severity === "warn"
        ? "text-warning"
        : "text-muted-foreground";
  return (
    <li
      data-slot="chat-review-llm-finding"
      className="flex flex-wrap items-center gap-1.5 rounded border border-border/60 px-2 py-1.5 text-[11px]"
    >
      <span className="rounded bg-surface-subtle px-1 py-0.5 font-medium text-foreground">
        L2
      </span>
      <mark className="rounded bg-warning-soft px-1 text-foreground">
        {finding.quote}
      </mark>
      <span className={cn("font-medium", sev)}>{finding.severity}</span>
      <span className="text-muted-foreground">{finding.category}</span>
      {finding.reason ? (
        <span className="text-muted-foreground">· {finding.reason}</span>
      ) : null}
      {finding.suggestion ? (
        <span className="text-muted-foreground">→ {finding.suggestion}</span>
      ) : null}
      <RewriteApplyButton
        artifactId={artifactId}
        quote={finding.quote}
        suggestion={finding.suggestion}
      />
    </li>
  );
}

interface SectionRow {
  id?: string;
  heading?: string;
  body?: string;
  [k: string]: unknown;
}
interface VersionRow {
  id: string;
  versionNumber: number;
  contentText?: string;
  contentData?: { sections?: SectionRow[] } | null;
}
interface ArtifactRow {
  id: string;
  currentVersionId?: string | null;
}

/** 读脚本 artifact 当前版本(currentVersionId 优先,回退最大 versionNumber)——与 ChatHookCard 同款。 */
async function readCurrentVersion(
  artifactId: string,
): Promise<VersionRow | null> {
  const artifact = (await client.getArtifact({
    params: { artifactId },
    query: undefined,
    body: undefined,
  })) as unknown as ArtifactRow;
  const versionsRaw = (await client.listArtifactVersions({
    params: { artifactId },
    query: { page: 1, pageSize: 100 },
    body: undefined,
  })) as unknown;
  const rows = (Array.isArray(versionsRaw) ? versionsRaw : []) as VersionRow[];
  if (rows.length === 0) return null;
  return (
    rows.find((v) => v.id === artifact.currentVersionId) ??
    rows.slice().sort((a, b) => b.versionNumber - a.versionNumber)[0] ??
    null
  );
}

type RewriteState =
  | { phase: "idle" }
  | { phase: "applying" }
  | { phase: "applied"; artifactId: string; previousVersionId: string | null }
  | { phase: "error"; message: string };

/**
 * 「应用改写」确认门(T-103b,复用稿面审核门同一条 append-only 应用门链)。
 *
 * 改写只是候选 —— 人点本按钮才把命中片段(quote)在脚本当前版本单点替换成 suggestion,经
 * createArtifactVersion(append-only)物化新版本;写后出「已应用 · 撤销」(restoreArtifact 回写
 * 前版本)。AI 绝不自动改稿:无 artifactId(报告未绑脚本)或无 suggestion → 不渲染按钮。
 */
function RewriteApplyButton({
  artifactId,
  quote,
  suggestion,
}: {
  artifactId: string | null;
  quote: string;
  suggestion: string | null;
}) {
  const router = useRouter();
  const [state, setState] = React.useState<RewriteState>({ phase: "idle" });
  if (!suggestion || !artifactId) return null;

  const apply = () => {
    setState({ phase: "applying" });
    void (async () => {
      try {
        const current = await readCurrentVersion(artifactId);
        const baseSections = current?.contentData?.sections ?? [];
        const { sections, replaced } = applyRewriteToSections(
          baseSections,
          quote,
          suggestion,
        );
        // 结构化 sections 找不到命中(旧稿/纯文本稿)→ 退回全文文本单点替换,仍走确认门。
        const contentText = replaced
          ? sections
              .map((s) => `${s.heading ?? ""}\n${s.body ?? ""}`.trim())
              .join("\n\n")
          : (current?.contentText ?? "").replace(quote, suggestion);
        await client.createArtifactVersion({
          params: { artifactId },
          query: undefined,
          body: {
            contentText,
            changeSummary: `应用审核改写:「${quote.slice(0, 16)}」→「${suggestion.slice(0, 16)}」`,
            ...(replaced ? { contentData: { sections } } : {}),
          },
        });
        setState({
          phase: "applied",
          artifactId,
          previousVersionId: current?.id ?? null,
        });
        router.refresh();
      } catch (err) {
        setState({
          phase: "error",
          message:
            err instanceof Error && err.message ? err.message : "应用失败,重试",
        });
      }
    })();
  };

  const undo = () => {
    if (state.phase !== "applied") return;
    const { artifactId: aid, previousVersionId } = state;
    void (async () => {
      try {
        if (previousVersionId) {
          await client.restoreArtifact({
            params: { artifactId: aid },
            query: undefined,
            body: { versionId: previousVersionId },
          });
        }
        setState({ phase: "idle" });
        router.refresh();
      } catch (err) {
        setState({
          phase: "error",
          message:
            err instanceof Error && err.message ? err.message : "撤销失败,重试",
        });
      }
    })();
  };

  if (state.phase === "applied") {
    return (
      <span
        data-slot="chat-review-rewrite-applied"
        className="inline-flex items-center gap-1 text-[10px] font-medium text-success"
      >
        已应用
        <button
          type="button"
          data-slot="chat-review-rewrite-undo"
          onClick={undo}
          className="underline underline-offset-2 hover:opacity-80"
        >
          撤销
        </button>
      </span>
    );
  }
  if (state.phase === "error") {
    return (
      <span
        role="alert"
        data-slot="chat-review-rewrite-error"
        className="text-[10px] text-destructive"
      >
        {state.message}
      </span>
    );
  }
  return (
    <button
      type="button"
      data-slot="chat-review-apply-rewrite"
      data-testid="chat-review-apply-rewrite"
      disabled={state.phase === "applying"}
      onClick={apply}
      title="应用改写(确认门)—— 人工确认才写入新脚本版本,可撤销,绝不自动改稿"
      className="inline-flex h-5 items-center rounded-control px-1.5 text-[10px] text-muted-foreground hover:bg-surface-subtle disabled:opacity-50"
    >
      {state.phase === "applying" ? "应用中…" : "应用改写"}
    </button>
  );
}

/** 读最新报告;404(未审)吞成 null,诚实不报错。 */
async function fetchLatest(
  projectId: string,
): Promise<ScriptReviewReportResource | null> {
  try {
    return (await client.getLatestScriptReview({
      params: { projectId },
      query: undefined,
      body: undefined,
    })) as ScriptReviewReportResource;
  } catch {
    return null;
  }
}
