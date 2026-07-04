"use client";

/**
 * `script-review-gate.tsx` — 稿面编导文案审核门(T-086 SPEC §3 主案,软门)。
 *
 * 稿面(draft-workbench)脚本区下方的合规审核入口 + 结构化报告面板 + 软门提示。
 *
 *  - 「审核」按钮:client.triggerScriptReview(projectId) 起 script.review 任务 →
 *    轮询 getTask 直到 succeeded/failed(dispatch 后台跑 L1 lint + L2 语义审 →
 *    落 script_review_reports)→ 读 getLatestScriptReview 展示报告。与
 *    blind-predict-row 同一条 trigger+poll 惯例(零新 op)。
 *  - 结构化报告:verdict 徽章(pass 绿 / risk 黄 / block 红)+ summary + modelLabel
 *    (含「非专用审核模型」字样时醒目标注,诚实数据)+ lintFindings/llmFindings 命中列表。
 *  - 软门([gate-F1] 缺省软门):无报告 / verdict≠pass / 报告版本 < 当前脚本版本 →
 *    内联醒目提示 +「先去审核」一键触发,**但不禁用**「先盲预测」「登记已发布」——
 *    operations 不阻断(硬门切换点见 blind-predict-row 注释)。
 *
 * 诚实(铁律):报告全部来自真实 script_review_reports 行;无报告显「未审」不报错;
 * 报告版本过期显式提示;modelLabel 非专用如实标注。
 *
 * 改写建议确认门(SPEC §3 铁律,已真做):改写只是候选 —— 人点「应用改写」才把命中片段
 * (quote)按 suggestion 单点替换,经 createArtifactVersion(append-only)物化成脚本新版本,
 * 卡上出「已应用 · 撤销」(restoreArtifact 回写前版本)。AI 绝不自动改稿;复用 ChatHookCard
 * 同一条 ensure→读当前版本→createArtifactVersion→restore 撤销的确认门链(零新 op)。
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  AlertTriangle,
  Loader2,
} from "lucide-react";

import { client } from "@/lib/contract-client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type {
  ScriptReviewReportResource,
  LintFindingResource,
  LlmFindingResource,
} from "@creatoros/contract";

type Phase = "idle" | "running" | "error";

/** verdict → 徽章样式 + 文案。 */
const VERDICT_META: Record<
  ScriptReviewReportResource["verdict"],
  { readonly label: string; readonly className: string; readonly Icon: typeof ShieldCheck }
> = {
  pass: {
    label: "通过",
    className: "border-success/40 bg-success-soft text-success",
    Icon: ShieldCheck,
  },
  risk: {
    label: "有风险",
    className: "border-warning/40 bg-warning-soft text-warning",
    Icon: ShieldAlert,
  },
  block: {
    label: "阻断",
    className: "border-destructive/40 bg-destructive/10 text-destructive",
    Icon: ShieldX,
  },
};

export function ScriptReviewGate({
  projectId,
  currentVersion,
  initialReport,
}: {
  readonly projectId: string;
  /** 当前脚本版本号(script.versionCount);用于判「报告版本过期」。 */
  readonly currentVersion: number;
  /** 服务端首屏读到的最新报告;null = 未审。 */
  readonly initialReport: ScriptReviewReportResource | null;
}) {
  const router = useRouter();
  const [report, setReport] = React.useState<ScriptReviewReportResource | null>(
    initialReport,
  );
  const [phase, setPhase] = React.useState<Phase>("idle");
  const [error, setError] = React.useState<string | null>(null);
  const cancelledRef = React.useRef(false);
  React.useEffect(
    () => () => {
      cancelledRef.current = true;
    },
    [],
  );

  // 「审核」:trigger script.review → 轮询 getTask → 读 getLatestScriptReview。
  const runReview = React.useCallback(() => {
    if (phase === "running") return;
    setPhase("running");
    setError(null);
    void (async () => {
      try {
        const task = (await client.triggerScriptReview({
          params: { projectId },
          query: undefined,
          body: undefined,
        })) as { id: string };
        for (let i = 0; i < 75; i++) {
          if (cancelledRef.current) return;
          await new Promise((r) => setTimeout(r, 3000));
          if (cancelledRef.current) return;
          const status = (await client.getTask({
            params: { taskId: task.id },
            query: undefined,
            body: undefined,
          })) as { status: string };
          if (status.status === "succeeded") {
            const latest = await fetchLatest(projectId);
            if (!cancelledRef.current) {
              setReport(latest);
              setPhase(latest ? "idle" : "error");
              if (!latest) setError("审核完成但未取到报告,请刷新重试。");
              // 报告落库后刷新服务端 vm → 发布区软门提示条同步更新(不阻断)。
              else router.refresh();
            }
            return;
          }
          if (status.status === "failed" || status.status === "cancelled") {
            if (!cancelledRef.current) {
              setPhase("error");
              setError("审核失败(可能没配模型),请重试。");
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
  }, [phase, projectId, router]);

  const running = phase === "running";
  const stale = report !== null && report.artifactVersion < currentVersion;
  const nonDedicated = report?.modelLabel.includes("非专用") ?? false;

  return (
    <div
      data-slot="script-review-gate"
      data-testid="script-review-gate"
      data-verdict={report?.verdict ?? "none"}
      className="mt-3 flex flex-col gap-2 rounded-card border border-border bg-surface px-3.5 py-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[13px] font-semibold text-foreground">
          <ShieldCheck className="size-4 text-brand" />
          编导文案审核
        </span>
        <Button
          type="button"
          size="sm"
          variant="outline"
          data-testid="script-review-trigger"
          className="h-7 gap-1 px-2.5 text-[11px]"
          disabled={running}
          onClick={runReview}
        >
          {running ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <ShieldCheck className="size-3.5" />
          )}
          {running ? "审核中…" : report ? "重新审核" : "审核"}
        </Button>
      </div>

      {report === null ? (
        <p
          data-testid="script-review-unreviewed"
          className="text-[12px] text-muted-foreground"
        >
          当前稿未审核。发布前跑一次合规审(L1 违禁词 + L2 语义审)。
        </p>
      ) : (
        <ReviewReportPanel
          report={report}
          stale={stale}
          nonDedicated={nonDedicated}
        />
      )}

      {error ? (
        <p className="text-[11px] text-destructive">{error}</p>
      ) : null}
    </div>
  );
}

/** 结构化报告面板:verdict + summary + modelLabel + 命中列表。 */
function ReviewReportPanel({
  report,
  stale,
  nonDedicated,
}: {
  readonly report: ScriptReviewReportResource;
  readonly stale: boolean;
  readonly nonDedicated: boolean;
}) {
  const verdict = VERDICT_META[report.verdict];
  const VerdictIcon = verdict.Icon;
  const findingCount = report.lintFindings.length + report.llmFindings.length;
  // 改写建议应用的目标脚本 artifact(报告绑的那一版脚本;null = 无 artifact 无法改写)。
  const artifactId = report.artifactId;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <span
          data-testid="script-review-verdict"
          className={cn(
            "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium",
            verdict.className,
          )}
        >
          <VerdictIcon className="size-3.5" />
          {verdict.label}
        </span>
        <span className="text-[11px] text-muted-foreground">
          命中 {findingCount} 条 · 脚本 v{report.artifactVersion}
        </span>
        {stale ? (
          <span
            data-testid="script-review-stale"
            className="inline-flex items-center gap-1 rounded-full border border-warning/40 bg-warning-soft px-2 py-0.5 text-[10px] text-warning"
          >
            <AlertTriangle className="size-3" />
            稿已改动,建议重审
          </span>
        ) : null}
      </div>

      {report.summary ? (
        <p className="text-[12px] text-foreground">{report.summary}</p>
      ) : null}

      {/* modelLabel 诚实标注:非专用审核模型醒目提示。 */}
      <p
        data-testid="script-review-model"
        className={cn(
          "text-[11px]",
          nonDedicated ? "font-medium text-warning" : "text-muted-foreground",
        )}
      >
        {nonDedicated ? "⚠ " : ""}
        审核模型:{report.modelLabel}
      </p>

      {/* 命中列表(L1 lint + L2 语义审合并渲染,各带来源标签)。 */}
      {findingCount > 0 ? (
        <ul
          data-testid="script-review-findings"
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

/** L1 lint 命中(确定性;tier + category + note + replacement)。 */
function LintFindingRow({
  finding,
  artifactId,
}: {
  finding: LintFindingResource;
  artifactId: string | null;
}) {
  return (
    <li
      data-slot="script-review-lint-finding"
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

/** L2 语义审命中(severity + category + reason + suggestion)。 */
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
      data-slot="script-review-llm-finding"
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

/** 单点替换:首个含 quote 的段正文里把 quote 换成 suggestion(不改原数组)。 */
export function applyRewriteToSections(
  sections: ReadonlyArray<SectionRow>,
  quote: string,
  suggestion: string,
): { sections: SectionRow[]; replaced: boolean } {
  let replaced = false;
  const next = sections.map((s) => {
    const body = typeof s.body === "string" ? s.body : "";
    if (!replaced && body.includes(quote)) {
      replaced = true;
      return { ...s, body: body.replace(quote, suggestion) };
    }
    return s;
  });
  return { sections: next, replaced };
}

type RewriteState =
  | { phase: "idle" }
  | { phase: "applying" }
  | { phase: "applied"; artifactId: string; previousVersionId: string | null }
  | { phase: "error"; message: string };

/**
 * 「应用改写」确认门(SPEC §3 铁律,已真做)。
 *
 * 改写只是候选 —— 人点本按钮才把命中片段(quote)在脚本当前版本里单点替换成 suggestion,
 * 经 createArtifactVersion(append-only)物化成新版本;写后出「已应用 · 撤销」,撤销 =
 * restoreArtifact 回写前版本(复用 ChatHookCard 同款确认门链)。AI 绝不自动改稿:
 * 无 artifactId(报告未绑脚本)或无 suggestion → 不渲染按钮。
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
        // 结构化 sections 里找不到命中(旧稿/纯文本稿)→ 退回全文文本单点替换,仍走确认门。
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
        data-slot="script-review-rewrite-applied"
        className="inline-flex items-center gap-1 text-[10px] font-medium text-success"
      >
        已应用
        <button
          type="button"
          data-slot="script-review-rewrite-undo"
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
        data-slot="script-review-rewrite-error"
        className="text-[10px] text-destructive"
      >
        {state.message}
      </span>
    );
  }
  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      data-slot="script-review-apply-rewrite"
      data-testid="script-review-apply-rewrite"
      className="h-5 px-1.5 text-[10px] text-muted-foreground"
      disabled={state.phase === "applying"}
      onClick={apply}
      title="应用改写(确认门)—— 人工确认才写入新脚本版本,可撤销,绝不自动改稿"
    >
      {state.phase === "applying" ? "应用中…" : "应用改写"}
    </Button>
  );
}

/** 读最新报告;404(未审)吞成 null,诚实显未审不报错。 */
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

/**
 * 软门提示条(SPEC §3 [gate-F1]):无报告 / verdict≠pass / 报告版本过期 → 内联醒目提示 +
 * 「先去审核」(滚动到脚本区审核门),**但不禁用**原动作。挂在「先盲预测」「登记已发布」旁。
 * 自包含 client 组件(scroll 逻辑内聚),故可从 server 组件 PublishPackSection 直接渲染。
 */
export function ReviewSoftGateHint({
  report,
  currentVersion,
}: {
  readonly report: ScriptReviewReportResource | null;
  readonly currentVersion: number;
}) {
  const reason =
    report === null
      ? "当前稿未过合规审核"
      : report.artifactVersion < currentVersion
        ? "脚本已改动,当前稿未重新审核"
        : report.verdict !== "pass"
          ? `合规审核未通过(${report.verdict === "block" ? "阻断" : "有风险"})`
          : null;
  if (reason === null) return null;
  return (
    <div
      data-testid="script-review-soft-gate"
      className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-md border border-warning/40 bg-warning-soft px-2.5 py-1.5"
    >
      <span className="flex items-center gap-1.5 text-[11px] font-medium text-warning">
        <AlertTriangle className="size-3.5 shrink-0" />
        {reason}
      </span>
      <Button
        type="button"
        size="sm"
        variant="outline"
        data-testid="script-review-soft-gate-action"
        className="h-6 px-2 text-[10px]"
        onClick={() =>
          document
            .getElementById("script")
            ?.scrollIntoView({ behavior: "smooth" })
        }
      >
        先去审核
      </Button>
    </div>
  );
}
