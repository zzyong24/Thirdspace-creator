"use client";

/**
 * [T-057⑤ → T-268] 对话内整稿分镜脚本卡 —— **异步 dispatch 范式**(仿 ChatThesisCard /
 * ChatReviewReportCard;替掉旧的 inline 同步整稿)。
 *
 * script.draft 工具不再 inline 同步跑整稿(分钟级,弱模型下必超时→回合被腰斩→退回 hooks,
 * 「点生成脚本只出 hook」的根因),而是 dispatch 既有异步 runner runScriptDraft,把 taskId 交给
 * 本卡。本卡据 taskId **轮询** task/candidate(与 ChatThesisCard 同款循环):
 *   running/queued → 进行中;
 *   awaiting_confirmation → 拉 candidate 渲整稿分镜候选 +「采纳写入稿面」
 *     (T-512:只消费服务端 validationStatus/validationErrors/canAdopt；旧候选缺字段
 *      fail-closed，前端不按段数或 CTA 自行判断)
 *     (client.confirmTask → artifact_version 分支 append 进项目 output_script 当前版本 →
 *      **发 SCRIPT_WRITE 局部刷新信号**把新整稿直接推给稿面编辑器 setContent,不整页 router.refresh);
 *   cancelled/failed → 失败(含未配 script.draft 模型)→ 卡内诚实「去设置 / 重试」。
 *
 * dispatch 本身失败 / 无项目上下文(error 非 null)→ 直接渲错误态(诚实提示去项目稿面写脚本)。
 * 整稿生成吃波1接地(brief 硬锚 + 素材可溯 + anti-fabrication),不凭空编数字。
 */

import * as React from "react";
import { TaskObservationNotice, useTaskObservation } from "@/components/ai/task-observation";
import { TaskPartialNotice } from "@/components/ai/task-partial-notice";
import { useRouter } from "next/navigation";

import { client } from "@/lib/contract-client";
import { sectionsToHtml } from "@/features/script/script-editor-bridge";
import { emitScriptWrite } from "@/features/script/script-write-signal";
import type { ScriptSectionView } from "@/types/view-models";
import type {
  AITaskResultDataResource,
  AITaskResultResource,
} from "@creatoros/contract";

const POLL_INTERVAL_MS = 4000;
const MAX_POLLS = 90; // ~6 分钟 —— 整稿生成可达分钟级(弱模型更慢)
const VERBATIM_PREVIEW_CHARS = 1_200;

type Phase = "running" | "review" | "done" | "error" | "partial";

const LEGACY_VALIDATION_ERROR =
  "这个旧候选缺少完整性校验，已禁止采纳。请重新生成后再写入稿面。";

export interface ChatScriptSection {
  heading: string;
  body: string;
}

// candidate.resultData(script-runner recordCandidate 写的形状:{ body, summary, sections,
// hook, cta, contentData:{sections,hook,cta} })→ 收窄出编辑器分段(优先 contentData.sections
// 的 {heading,body},兜 resultData.sections)。
function parseSections(resultData: Record<string, unknown>): ChatScriptSection[] {
  const cd = resultData.contentData;
  const rawFromContentData =
    cd && typeof cd === "object" && Array.isArray((cd as Record<string, unknown>).sections)
      ? ((cd as Record<string, unknown>).sections as unknown[])
      : null;
  const raw = rawFromContentData ?? (Array.isArray(resultData.sections) ? resultData.sections : []);
  return raw
    .map((r): ChatScriptSection | null => {
      const o = (r ?? {}) as Record<string, unknown>;
      const heading = typeof o.heading === "string" ? o.heading : "";
      const body = typeof o.body === "string" ? o.body : "";
      if (!heading && !body) return null;
      return { heading, body };
    })
    .filter((s): s is ChatScriptSection => s !== null);
}

function readAdoptionGate(resultData: AITaskResultDataResource): {
  canAdopt: boolean;
  errors: string[];
} {
  const { validationStatus, validationErrors, canAdopt } = resultData;
  if (
    validationStatus === "valid" &&
    canAdopt === true &&
    Array.isArray(validationErrors) &&
    validationErrors.length === 0
  ) {
    return { canAdopt: true, errors: [] };
  }
  if (
    validationStatus === "invalid" &&
    canAdopt === false &&
    Array.isArray(validationErrors) &&
    validationErrors.length > 0
  ) {
    return { canAdopt: false, errors: validationErrors };
  }
  return { canAdopt: false, errors: [LEGACY_VALIDATION_ERROR] };
}

// 采纳后局部刷新用:整稿分段 → 编辑器富文本 HTML(与稿面读侧 sectionsToHtml 同一桥,忠实往返)。
function sectionsToEditorHtml(sections: ReadonlyArray<ChatScriptSection>): string {
  const views: ScriptSectionView[] = sections.map((s, i) => ({
    id: `draft-${i}`,
    type: "body",
    heading: s.heading,
    body: s.body,
    emphasis: false,
    startSeconds: null,
    endSeconds: null,
  }));
  return sectionsToHtml(views);
}

export function ChatScriptDraftCard({
  draftMode: initialDraftMode = "generate",
  taskId,
  projectId,
  error,
  pollIntervalMs = POLL_INTERVAL_MS,
}: {
  /** 工具 dispatch 时即返回；旧持久消息缺省为普通生成。 */
  draftMode?: "generate" | "verbatim";
  taskId: string | null;
  /** 目标项目 id(采纳/局部刷新定位;无项目上下文为 null → 只渲错误态)。 */
  projectId: string | null;
  /** dispatch 阶段的错误(无项目上下文/端口未接入等);非 null 时直接渲错误态。 */
  error: string | null;
  /** 轮询间隔(测试注 0 免等实时;默认 4s)。 */
  pollIntervalMs?: number;
}) {
  const router = useRouter();
  const observation = useTaskObservation(taskId);
  const { pause: pauseObservation, capture: captureObservation } = observation;
  const [phase, setPhase] = React.useState<Phase>(
    error || !taskId ? "error" : "running",
  );
  const [sections, setSections] = React.useState<ChatScriptSection[]>([]);
  const [expanded, setExpanded] = React.useState(false);
  const [confirming, setConfirming] = React.useState(false);
  const [canAdopt, setCanAdopt] = React.useState(false);
  const [validationErrors, setValidationErrors] = React.useState<string[]>([]);
  const [qualityWarnings, setQualityWarnings] = React.useState<string[]>([]);
  const [terminalError, setTerminalError] = React.useState<string | null>(null);
  const [draftMode, setDraftMode] = React.useState<"generate" | "verbatim">(
    initialDraftMode,
  );
  const [sourceLength, setSourceLength] = React.useState<number | null>(null);

  // 轮询 task/candidate(仿 ChatThesisCard,从已 dispatch 的 taskId 起)。取消只靠本效应闭包内
  // 的 abandoned(effect cleanup 置真)—— **不用 mount-unmount ref**:React StrictMode(dev 默认开)
  // 的 mount→unmount→mount 双调里,unmount 会把这类 ref 置真、remount 不重置 → 轮询恒被 bail 卡死。
  React.useEffect(() => {
    if (!taskId || error) return;
    let abandoned = false;
    void (async () => {
      const isCurrent = captureObservation();
      for (let i = 0; ; i++) {
        if (i > 0 && i % MAX_POLLS === 0 && !await pauseObservation()) return;
        if (abandoned || !isCurrent()) return;
        await new Promise((r) => setTimeout(r, pollIntervalMs));
        if (abandoned || !isCurrent()) return;
        let status: string;
        let taskError: string | null = null;
        try {
          const t = (await client.getTask({
            params: { taskId },
            query: undefined,
            body: undefined,
          })) as { status: string; errorMessage?: string | null };
          if (abandoned || !isCurrent()) return;
          status = t.status;
          taskError =
            typeof t.errorMessage === "string" && t.errorMessage.trim()
              ? t.errorMessage.trim()
              : null;
        } catch {
          continue; // 单次拉取失败不终止(下轮再试)
        }
        if (status === "partial") { setPhase("partial"); return; }
        if (status === "succeeded") { setPhase("done"); return; }
        if (status === "awaiting_confirmation") {
          try {
            // contract-client 的泛型目前没有把 isList 投影成数组，运行时端点返回的确是
            // AITaskResultResource[]；在此保留显式边界收窄，元素 resultData 仍由 typed
            // aiTaskResultDataResource 约束，不再手写三字段形状。
            const results = (await client.listTaskResults({
              params: { taskId },
              query: undefined,
              body: undefined,
            })) as unknown as AITaskResultResource[];
            const last = results[results.length - 1];
            const got = last
              ? parseSections(last.resultData as Record<string, unknown>)
              : [];
            const gate = last
              ? readAdoptionGate(last.resultData)
              : { canAdopt: false, errors: [LEGACY_VALIDATION_ERROR] };
            if (abandoned || !isCurrent()) return;
            const resultMode = last?.resultData.draftMode;
            if (resultMode === "verbatim") {
              setDraftMode("verbatim");
              setSourceLength(
                typeof last.resultData.sourceLength === "number"
                  ? last.resultData.sourceLength
                  : got[0]?.body.length ?? null,
              );
            }
            setSections(got);
            setCanAdopt(gate.canAdopt && got.length > 0);
            setValidationErrors(
              got.length > 0
                ? gate.errors
                : ["候选内容无法读取，已禁止采纳。请重新生成。"],
            );
            const warnings = last?.resultData.qualityWarnings;
            setQualityWarnings(
              Array.isArray(warnings)
                ? warnings.filter(
                    (item): item is string =>
                      typeof item === "string" && item.trim().length > 0,
                  )
                : [],
            );
            setPhase("review");
          } catch {
            if (!abandoned && isCurrent()) setPhase("error");
          }
          return;
        }
        if (status === "cancelled" || status === "failed") {
          if (!abandoned && isCurrent()) {
            setTerminalError(
              taskError || "本次整稿生成没有完成，请重新生成。",
            );
            setPhase("error");
          }
          return;
        }
      }
    })();
    return () => {
      abandoned = true;
    };
    // taskId 稳定;错误态不轮询。
  }, [taskId, error, pollIntervalMs, pauseObservation, captureObservation]);

  const adopt = React.useCallback(async () => {
    if (!taskId || !canAdopt || sections.length === 0) return;
    setConfirming(true);
    try {
      // confirmTask:artifact_version 分支 append 整稿新版本到项目 output_script(铁律②人点才落)。
      await client.confirmTask({
        params: { taskId },
        query: undefined,
        body: undefined,
      });
      // [T-268] 局部刷新:整稿 HTML 直接推给稿面编辑器 setContent(在稿面/脚本页时**当场生效、不重挂**)。
      emitScriptWrite({
        artifactId: null,
        html: sectionsToEditorHtml(sections),
      });
      // [T-273] 兜底:用户在稿面**外**(copilot 覆盖选题/别的页)采纳时编辑器没挂载、事件 no-op →
      // 看不到「已写入」。router.refresh 让服务端重读——去脚本阶段即见最新版,不再「已写入但没反应」。
      router.refresh();
      setPhase("done");
    } catch {
      setPhase("error");
    } finally {
      setConfirming(false);
    }
  }, [taskId, canAdopt, sections, router]);

  const shown = expanded ? sections : sections.slice(0, 3);
  return (
    <div
      data-slot="chat-script-draft-card"
      data-phase={phase}
      className="mt-1 flex w-full max-w-[420px] flex-col gap-1.5 rounded-[10px] border border-border bg-surface p-2.5"
    >
      <span className="text-[10px] font-medium uppercase tracking-wide text-brand">
        {draftMode === "verbatim"
          ? "原文保真候选 · 采纳后写入稿面"
          : "整稿分镜脚本 · 采纳后写入稿面"}
      </span>

      <TaskObservationNotice {...observation} />
      <TaskPartialNotice visible={phase === "partial"} />
      {phase === "running" && !observation.paused ? (
        <div
          data-slot="chat-script-running"
          className="flex items-center gap-2 text-[12px] text-muted-foreground"
        >
          <span className="size-3.5 shrink-0 animate-spin rounded-full border-2 border-brand border-t-transparent" />
          {draftMode === "verbatim"
            ? "正在校验原文字符与来源…（不调用写稿模型）"
            : "正在基于定位/选题/立项 brief/已搜素材写整稿分镜…（后台跑，不占用这轮对话）"}
        </div>
      ) : null}

      {phase === "review" ? (
        <div data-slot="chat-script-review" className="flex flex-col gap-1.5">
          {draftMode === "verbatim" ? (
            <p
              data-slot="chat-script-verbatim-proof"
              className="rounded-md border border-success/30 bg-success/5 px-2.5 py-1.5 text-[11px] leading-relaxed text-success"
            >
              原文保真候选 · 已校验 {sourceLength ?? sections[0]?.body.length ?? 0} 字符 ·
              未调用写稿模型
            </p>
          ) : null}
          {shown.length > 0 ? (
            <ol className="flex flex-col gap-1">
              {shown.map((s, i) => (
                <li
                  key={`${i}-${s.heading.slice(0, 8)}`}
                  data-slot="chat-script-section"
                  className="rounded-md border border-border/70 bg-surface-subtle/50 px-2.5 py-1.5"
                >
                  {s.heading ? (
                    <p className="text-[11px] font-semibold text-foreground">
                      {s.heading}
                    </p>
                  ) : null}
                  <p className="mt-0.5 whitespace-pre-line text-[13px] leading-relaxed text-muted-foreground">
                    {draftMode === "verbatim" &&
                    s.body.length > VERBATIM_PREVIEW_CHARS
                      ? `${s.body.slice(0, VERBATIM_PREVIEW_CHARS)}\n…（卡片仅预览前 ${VERBATIM_PREVIEW_CHARS} 字符，采纳仍使用完整原文）`
                      : s.body}
                  </p>
                </li>
              ))}
            </ol>
          ) : null}
          {!canAdopt && validationErrors.length > 0 ? (
            <div
              data-slot="chat-script-validation-errors"
              className="rounded-md border border-destructive/30 bg-destructive/5 px-2.5 py-2"
            >
              {validationErrors.map((message) => (
                <p
                  key={message}
                  className="text-[12px] leading-relaxed text-destructive"
                >
                  {message}
                </p>
              ))}
            </div>
          ) : null}
          {qualityWarnings.length > 0 ? (
            <div
              data-slot="chat-script-quality-warnings"
              className="rounded-md border border-amber-300/70 bg-amber-50 px-2.5 py-2"
            >
              <p className="text-[11px] font-medium text-amber-900">
                整稿已生成，可以先采纳；建议再检查：
              </p>
              {qualityWarnings.map((message) => (
                <p
                  key={message}
                  className="mt-0.5 text-[12px] leading-relaxed text-amber-800"
                >
                  {message}
                </p>
              ))}
            </div>
          ) : null}
          {sections.length > 3 ? (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="self-start text-[11px] text-brand underline underline-offset-2"
            >
              {expanded ? "收起" : `展开全部 ${sections.length} 段 ▾`}
            </button>
          ) : null}
          <div className="flex items-center justify-between gap-2">
            {!projectId ? (
              <p className="text-[11px] text-text-subtle">
                未关联项目 —— 在项目稿面里才能写入稿面。
              </p>
            ) : (
              <span />
            )}
            {canAdopt ? (
              <button
                type="button"
                data-slot="chat-script-write"
                disabled={confirming}
                onClick={() => void adopt()}
                className="inline-flex h-7 items-center rounded-control bg-brand px-3 text-[11px] font-medium text-brand-foreground hover:bg-brand/90 disabled:opacity-50"
              >
                {confirming ? "写入中…" : "采纳写入稿面"}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {phase === "done" ? (
        <p data-slot="chat-script-done" className="text-[12px] text-success">
          {draftMode === "verbatim"
            ? "✓ 原文已按校验内容写入稿面（新版本已保存，可回滚）。"
            : "✓ 整稿已写入稿面（新版本已保存，可在编辑器里直接改；保存即新版本、可回滚）。"}
        </p>
      ) : null}

      {phase === "error" ? (
        <div data-slot="chat-script-error" className="flex flex-col gap-1">
          <p className="text-[12px] leading-relaxed text-destructive">
            {error || terminalError || "本次整稿生成没有完成，请重新生成。"}
          </p>
          {draftMode === "verbatim" ||
          error ||
          !/未配置|尚未配置|api\s*key|密钥|credential|鉴权|401|403/i.test(
            terminalError ?? "",
          ) ? null : (
            <a
              href="/settings?highlight=text-model"
              data-slot="chat-script-settings-link"
              className="text-[11px] font-medium text-brand underline underline-offset-2"
            >
              去设置配脚本生成模型 →
            </a>
          )}
        </div>
      ) : null}
    </div>
  );
}
