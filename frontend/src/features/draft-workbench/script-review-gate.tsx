"use client";

/**
 * `script-review-gate.tsx` — 稿面编导文案审核门(T-086 SPEC §3 主案,软门 · T-103b 起对话化)。
 *
 * 稿面(draft-workbench)脚本区下方的合规审核入口 + 结构化报告面板 + 软门提示。
 *
 *  - 「审核」按钮(**T-103b 起改为对话内即时反馈**,SPEC 2026-07-04 ai-into-copilot-convergence
 *    §1.1/§3;**T-108 修真**):不再后台静默 triggerScriptReview + 轮询。稿面右栏是**常驻嵌入式
 *    Copilot**(无独立全局弹层),原走 `copilotDeepLink`(`?copilot=open`)+ router.push 在稿面
 *    开不出、prefill 进不了 rail(live bug)。改为方案 A(lift state):点击 → `onOpenChat` 预填
 *    常驻 rail(functionKey=review.script + selection(content_output id + 项目标题)+ 审核话术,
 *    只填不发,T-055b)。编导在对话里调 review.script 工具触发既有 script.review 审核链路(L1
 *    违禁词 lint + L2 语义审)→ **审核报告卡**(ChatReviewReportCard:verdict + findings)+ 改写
 *    建议逐条「应用」门。退役后台 trigger+poll 死码。
 *  - 结构化报告(**保留**,真值展示):verdict 徽章(pass 绿 / risk 黄 / block 红)+ summary +
 *    modelLabel(含「非专用审核模型」字样时醒目标注,诚实数据)+ lintFindings/llmFindings 命中列表。
 *    首屏 initialReport(服务端读 getLatestScriptReview)—— 这是稿面门的真值面,不是 AI 触发。
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
 * 对话内改写门(ChatReviewReportCard)与本地报告面板共用同一条应用门链。
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  AlertTriangle,
  MessagesSquare,
} from "lucide-react";

import { describeUserError } from "@/lib/ai-error-humanize";
import { client } from "@/lib/contract-client";
import { useDraftChatRequest } from "./draft-chat-request";
import { useLatestScriptReview } from "./use-latest-script-review";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type {
  ScriptReviewReportResource,
  LintFindingResource,
  LlmFindingResource,
} from "@creatoros/contract";

// [T-103b] 稿面审核的预填话术 —— 只填不发(T-055b),编导据此优先调 review.script。
const SCRIPT_REVIEW_PREFILL =
  "审核这份文案:跑一遍违禁词/合规诊断,命中给逐条改写建议。";

type Phase = "idle" | "opening" | "error";

const REVIEW_ATTENTION_MS = 1_600;
const reviewAttentionTimers = new WeakMap<HTMLElement, number>();

/** T-539：滚动只是位置变化；同屏时必须再给目标卡和真实动作一个可感知反馈。 */
function directAttentionToReview(): void {
  const gate = document.querySelector<HTMLElement>(
    '[data-testid="script-review-gate"]',
  );
  const fallback = document.getElementById("script");
  const scrollTarget = gate ?? fallback;
  if (!scrollTarget) return;

  const reduceMotion =
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  scrollTarget.scrollIntoView({
    behavior: reduceMotion ? "auto" : "smooth",
    block: "center",
  });

  if (!gate) return;
  const trigger = gate.querySelector<HTMLElement>(
    '[data-testid="script-review-trigger"]',
  );
  gate.dataset.attention = "true";
  if (trigger) {
    trigger.dataset.attention = "true";
    trigger.focus({ preventScroll: true });
  } else {
    gate.focus({ preventScroll: true });
  }

  const previousTimer = reviewAttentionTimers.get(gate);
  if (previousTimer !== undefined) window.clearTimeout(previousTimer);
  const timer = window.setTimeout(() => {
    delete gate.dataset.attention;
    if (trigger) delete trigger.dataset.attention;
    reviewAttentionTimers.delete(gate);
  }, REVIEW_ATTENTION_MS);
  reviewAttentionTimers.set(gate, timer);
}

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
  projectTitle,
  outputId,
  currentVersion,
  initialReport,
}: {
  readonly projectId: string;
  /** 项目标题(深链 selection 带,免编导索要;铸 content_output 兜底)。 */
  readonly projectTitle: string;
  /** 项目现有 ContentOutput 挂点(null = 还没铸;深链前先自愈铸一个,与登记表单同款)。 */
  readonly outputId: string | null;
  /** 当前脚本版本号(script.versionCount);用于判「报告版本过期」。 */
  readonly currentVersion: number;
  /** 服务端首屏读到的最新报告;null = 未审。 */
  readonly initialReport: ScriptReviewReportResource | null;
}) {
  // [T-108] 稿面对话请求协调器 —— 点击自动发进右栏常驻 rail(不开全局弹层)+ 发前 flush 编辑器。
  const { openChat, flushSave } = useDraftChatRequest();
  // [T-393] 首屏真值 + client 自愈:对话内审核落库后 router.refresh 不总覆盖到(真机实测:
  // 重新审核完成后 stale 徽标不消)—— stale/未审时 hook 轻量轮询最新报告,追上即停。
  const report = useLatestScriptReview(projectId, initialReport, currentVersion);
  const [phase, setPhase] = React.useState<Phase>("idle");
  const [error, setError] = React.useState<string | null>(null);
  // 卸载后停止在 await 链里 setState(长任务守卫)。
  const cancelledRef = React.useRef(false);
  React.useEffect(
    () => () => {
      cancelledRef.current = true;
    },
    [],
  );

  // [T-103b → T-108] 「审核」:先 flush 保存编辑器最新内容(审最新版,非 DB 旧版)→ 确保
  // content_output 挂点 → **自动发**审核话术进稿面右栏常驻编导对话(functionKey=review.script
  // + selection=content_output + autoSend)。审核/改写在对话里完成(ChatReviewReportCard:
  // review.script 触发既有审核链路 + 逐条改写门)。
  const openCopilot = React.useCallback(() => {
    if (phase === "opening") return;
    setPhase("opening");
    setError(null);
    void (async () => {
      try {
        // [T-108 v2] 先 flush 保存编辑器在途未落库的最新内容(dirty 才真存,saved 则 no-op)——
        // 否则 review.script 审的是持久化旧版(用户改了还在 dirty 窗口没保存)。flushSave 已 4s
        // 封顶(T-120),不会挂死。
        await flushSave();
        if (cancelledRef.current) return;
        // [T-123] 纯站内项目可能还没走制作 → 自愈铸 content_output 挂点让 selection 有真 id。
        // **但铸挂点是尽力而为,绝不能阻断「开对话+自动发」**:createOutput 慢/挂/失败都不卡按钮
        // ——review.script 工具靠 projectId 审当前脚本,不依赖 content_output id(selection 只为
        // 免编导索要标题)。之前 createOutput 无超时,一挂起按钮就永远卡「打开对话中」(用户实录)。
        let subjectId = outputId;
        if (!subjectId) {
          try {
            const created = (await Promise.race([
              client.createOutput({
                params: { projectId },
                query: undefined,
                body: { title: projectTitle || "主内容" },
              }),
              new Promise((_, reject) =>
                setTimeout(() => reject(new Error("createOutput 超时")), 6000),
              ),
            ])) as { id: string };
            subjectId = created.id;
          } catch {
            /* 铸挂点慢/挂/失败 → 不阻断开对话;subjectId 保持 null */
          }
        }
        if (cancelledRef.current) return;
        // 方案 A:自动发进常驻 rail —— functionKey=review.script(置顶审核工具),autoSend 直接发
        // 审核话术。有挂点就带 selection(免编导索要 id/标题);没铸出来也照开(工具靠 projectId 审)。
        openChat({
          functionKey: "review.script",
          prefill: SCRIPT_REVIEW_PREFILL,
          autoSend: true,
          ...(subjectId
            ? {
                selection: {
                  kind: "content_output",
                  id: subjectId,
                  title: projectTitle,
                },
              }
            : {}),
        });
        // 自动发成功即结束(不卡在「打开对话中…」):loading 态语义修正。
        if (!cancelledRef.current) setPhase("idle");
      } catch {
        if (!cancelledRef.current) {
          setPhase("error");
          setError("打开对话出错,请重试。");
        }
      }
    })();
  }, [phase, outputId, projectId, projectTitle, openChat, flushSave]);

  const opening = phase === "opening";
  const stale = report !== null && report.artifactVersion < currentVersion;
  const nonDedicated = report?.modelLabel.includes("非专用") ?? false;

  return (
    <div
      data-slot="script-review-gate"
      data-testid="script-review-gate"
      data-verdict={report?.verdict ?? "none"}
      tabIndex={-1}
      className="mt-3 flex flex-col gap-2 rounded-card border border-border bg-surface px-3.5 py-3 outline-none transition-[border-color,background-color,box-shadow] duration-300 motion-reduce:transition-none data-[attention=true]:border-brand/70 data-[attention=true]:bg-brand-soft data-[attention=true]:ring-4 data-[attention=true]:ring-brand/20"
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
          className="h-7 gap-1 px-2.5 text-[11px] data-[attention=true]:border-brand data-[attention=true]:bg-brand data-[attention=true]:text-brand-foreground data-[attention=true]:ring-4 data-[attention=true]:ring-brand/25"
          disabled={opening}
          onClick={openCopilot}
        >
          <MessagesSquare className="size-3.5" />
          {opening
            ? "打开对话中…"
            : phase === "error"
              ? "重试审核"
              : report
                ? "重新审核"
                : "审核"}
        </Button>
      </div>

      {report === null ? (
        <p
          data-testid="script-review-unreviewed"
          className="text-[12px] text-muted-foreground"
        >
          当前稿未审核。发布前在右栏对话里跑一次合规审(L1 违禁词 + L2 语义审),命中给逐条改写建议。
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
          message: describeUserError(err, "应用改写失败，请重试。"),
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
          message: describeUserError(err, "撤销失败，请重试。"),
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
      variant="outline"
      data-slot="script-review-apply-rewrite"
      data-testid="script-review-apply-rewrite"
      // [T-125] 醒目成绿色按钮态(原 ghost + muted 太淡,看不出是可点按钮)。
      className="h-6 gap-1 rounded-control border-success/50 bg-success-soft px-2 text-[10px] font-medium text-success hover:bg-success/15"
      disabled={state.phase === "applying"}
      onClick={apply}
      title="应用改写(确认门)—— 人工确认才写入新脚本版本,可撤销,绝不自动改稿"
    >
      {state.phase === "applying" ? "应用中…" : "✎ 应用改写"}
    </Button>
  );
}

/**
 * 软门提示条(SPEC §3 [gate-F1]):无报告 / verdict≠pass / 报告版本过期 → 内联醒目提示 +
 * 「先去审核」(滚动到脚本区审核门),**但不禁用**原动作。挂在「先盲预测」「登记已发布」旁。
 * 自包含 client 组件(scroll 逻辑内聚),故可从 server 组件 PublishPackSection 直接渲染。
 */
export function ReviewSoftGateHint({
  report: initialReport,
  currentVersion,
  projectId,
}: {
  readonly report: ScriptReviewReportResource | null;
  readonly currentVersion: number;
  readonly projectId: string;
}) {
  // [T-393] client 自愈:对话内审核完成后 server props 不刷新(真机实测横幅不消)——
  // stale/未审时轮询最新报告,追上即消。
  const report = useLatestScriptReview(projectId, initialReport, currentVersion);
  // [T-393 用户拍板 2026-07-18] 横幅只管「当前版本审没审过」:重新审核完成(版本追上)即消,
  // 无论 verdict、无论采纳与否。verdict=block 的后果由硬门(review-publish-gate hardBlocked
  // 禁用登记/发布)管,不在此重复提示。
  const reason =
    report === null
      ? "当前稿未过合规审核"
      : report.artifactVersion < currentVersion
        ? "脚本已改动,当前稿未重新审核"
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
        // [T-393] 定位审核卡；[T-539] 同屏也高亮并把焦点交给审核按钮。
        onClick={directAttentionToReview}
      >
        先去审核
      </Button>
    </div>
  );
}
