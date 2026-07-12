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
 *     (client.confirmTask → artifact_version 分支 append 进项目 output_script 当前版本 →
 *      **发 SCRIPT_WRITE 局部刷新信号**把新整稿直接推给稿面编辑器 setContent,不整页 router.refresh);
 *   cancelled/failed → 失败(含未配 script.draft 模型)→ 卡内诚实「去设置 / 重试」。
 *
 * dispatch 本身失败 / 无项目上下文(error 非 null)→ 直接渲错误态(诚实提示去项目稿面写脚本)。
 * 整稿生成吃波1接地(brief 硬锚 + 素材可溯 + anti-fabrication),不凭空编数字。
 */

import * as React from "react";

import { client } from "@/lib/contract-client";
import { sectionsToHtml } from "@/features/script/script-editor-bridge";
import { emitScriptWrite } from "@/features/script/script-write-signal";
import type { ScriptSectionView } from "@/types/view-models";

const POLL_INTERVAL_MS = 4000;
const MAX_POLLS = 90; // ~6 分钟 —— 整稿生成可达分钟级(弱模型更慢)

type Phase = "running" | "review" | "done" | "error";

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
  taskId,
  projectId,
  error,
  pollIntervalMs = POLL_INTERVAL_MS,
}: {
  taskId: string | null;
  /** 目标项目 id(采纳/局部刷新定位;无项目上下文为 null → 只渲错误态)。 */
  projectId: string | null;
  /** dispatch 阶段的错误(无项目上下文/端口未接入等);非 null 时直接渲错误态。 */
  error: string | null;
  /** 轮询间隔(测试注 0 免等实时;默认 4s)。 */
  pollIntervalMs?: number;
}) {
  const [phase, setPhase] = React.useState<Phase>(
    error || !taskId ? "error" : "running",
  );
  const [sections, setSections] = React.useState<ChatScriptSection[]>([]);
  const [expanded, setExpanded] = React.useState(false);
  const [confirming, setConfirming] = React.useState(false);

  // 轮询 task/candidate(仿 ChatThesisCard,从已 dispatch 的 taskId 起)。取消只靠本效应闭包内
  // 的 abandoned(effect cleanup 置真)—— **不用 mount-unmount ref**:React StrictMode(dev 默认开)
  // 的 mount→unmount→mount 双调里,unmount 会把这类 ref 置真、remount 不重置 → 轮询恒被 bail 卡死。
  React.useEffect(() => {
    if (!taskId || error) return;
    let abandoned = false;
    void (async () => {
      for (let i = 0; i < MAX_POLLS; i++) {
        if (abandoned) return;
        await new Promise((r) => setTimeout(r, pollIntervalMs));
        if (abandoned) return;
        let status: string;
        try {
          const t = (await client.getTask({
            params: { taskId },
            query: undefined,
            body: undefined,
          })) as { status: string };
          status = t.status;
        } catch {
          continue; // 单次拉取失败不终止(下轮再试)
        }
        if (status === "awaiting_confirmation") {
          try {
            const results = (await client.listTaskResults({
              params: { taskId },
              query: undefined,
              body: undefined,
            })) as unknown as Array<{ resultData: Record<string, unknown> }>;
            const last = results[results.length - 1];
            const got = last ? parseSections(last.resultData) : [];
            if (abandoned) return;
            if (got.length > 0) {
              setSections(got);
              setPhase("review");
            } else {
              setPhase("error");
            }
          } catch {
            if (!abandoned) setPhase("error");
          }
          return;
        }
        if (status === "cancelled" || status === "failed") {
          if (!abandoned) setPhase("error");
          return;
        }
      }
      if (!abandoned) setPhase("error"); // 轮询预算耗尽
    })();
    return () => {
      abandoned = true;
    };
    // taskId 稳定;错误态不轮询。
  }, [taskId, error, pollIntervalMs]);

  const adopt = React.useCallback(async () => {
    if (!taskId || sections.length === 0) return;
    setConfirming(true);
    try {
      // confirmTask:artifact_version 分支 append 整稿新版本到项目 output_script(铁律②人点才落)。
      await client.confirmTask({
        params: { taskId },
        query: undefined,
        body: undefined,
      });
      // [T-268] 局部刷新:把新整稿 HTML 直接推给稿面编辑器 setContent(不 router.refresh 整页重挂)。
      emitScriptWrite({
        artifactId: null,
        html: sectionsToEditorHtml(sections),
      });
      setPhase("done");
    } catch {
      setPhase("error");
    } finally {
      setConfirming(false);
    }
  }, [taskId, sections]);

  const shown = expanded ? sections : sections.slice(0, 3);
  return (
    <div
      data-slot="chat-script-draft-card"
      data-phase={phase}
      className="mt-1 flex w-full max-w-[420px] flex-col gap-1.5 rounded-[10px] border border-border bg-surface p-2.5"
    >
      <span className="text-[10px] font-medium uppercase tracking-wide text-brand">
        整稿分镜脚本 · 采纳后写入稿面
      </span>

      {phase === "running" ? (
        <div
          data-slot="chat-script-running"
          className="flex items-center gap-2 text-[12px] text-muted-foreground"
        >
          <span className="size-3.5 shrink-0 animate-spin rounded-full border-2 border-brand border-t-transparent" />
          正在基于定位/选题/立项 brief/已搜素材写整稿分镜…（后台跑，不占用这轮对话）
        </div>
      ) : null}

      {phase === "review" && sections.length > 0 ? (
        <div data-slot="chat-script-review" className="flex flex-col gap-1.5">
          <ol className="flex flex-col gap-1">
            {shown.map((s, i) => (
              <li
                key={`${i}-${s.heading.slice(0, 8)}`}
                data-slot="chat-script-section"
                className="rounded-md border border-border/70 bg-surface-subtle/50 px-2.5 py-1.5"
              >
                <p className="text-[11px] font-semibold text-foreground">
                  {s.heading}
                </p>
                <p className="mt-0.5 whitespace-pre-line text-[13px] leading-relaxed text-muted-foreground">
                  {s.body}
                </p>
              </li>
            ))}
          </ol>
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
            <button
              type="button"
              data-slot="chat-script-write"
              disabled={confirming}
              onClick={() => void adopt()}
              className="inline-flex h-7 items-center rounded-control bg-brand px-3 text-[11px] font-medium text-brand-foreground hover:bg-brand/90 disabled:opacity-50"
            >
              {confirming ? "写入中…" : "采纳写入稿面"}
            </button>
          </div>
        </div>
      ) : null}

      {phase === "done" ? (
        <p data-slot="chat-script-done" className="text-[12px] text-success">
          ✓ 整稿已写入稿面（新版本已保存，可在编辑器里直接改；保存即新版本、可回滚）。
        </p>
      ) : null}

      {phase === "error" ? (
        <div data-slot="chat-script-error" className="flex flex-col gap-1">
          <p className="text-[12px] leading-relaxed text-destructive">
            {error
              ? error
              : "没能写出整稿 —— 可能是还没配置脚本生成模型，或本次生成失败。"}
          </p>
          {error ? null : (
            <a
              href="/settings?tab=models"
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
