"use client";

/**
 * [T-350a/b] 对话内发布物料卡 —— **异步 dispatch 范式**(仿 ChatScriptDraftCard):
 *
 * publish.package 工具 dispatch 既有 publish.platform_adapt runner(单平台抖音,platform.adapt
 * 模板已内嵌 cheat-package 发布审核 SOP),把 taskId 交给本卡。本卡据 taskId **轮询** task/candidate:
 *   running/queued → 进行中;
 *   awaiting_confirmation → 拉 candidate(publication_drafts:{drafts:[douyin一条],outputId})渲
 *     标题/简介/标签/封面文案/**审核结论(auditFlags)** +「采纳」(client.confirmTask →
 *     createPublicationFromDraft 物化真 Publication+revision → router.refresh 让稿面发布包回填);
 *   cancelled/failed → 失败(含未配文本模型)→ 卡内诚实「去设置 / 重试」。
 *
 * dispatch 本身失败 / 无项目上下文 / 空稿门(error 非 null)→ 直接渲错误态。
 * 硬规则命中的合规改动已在 draft 本体(runner 侧模型自动改),auditFlags 只记「改了什么」。
 */

import * as React from "react";
import { useRouter } from "next/navigation";

import { client } from "@/lib/contract-client";

const POLL_INTERVAL_MS = 4000;
const MAX_POLLS = 180; // 覆盖后台执行的十分钟期限与状态回读余量

type Phase = "blocked" | "running" | "review" | "done" | "error";

export interface PublishPackageDraft {
  platform: string;
  title: string;
  body: string;
  tags: string[];
  coverIdea: string;
  auditFlags: string[];
}

// candidate.resultData(platform-adapt-runner recordCandidate 写的形状:{ drafts:[{platform,
// title,body,tags,coverIdea,auditFlags}], outputId })→ 取抖音那条(单平台链只会有一条,兜首条)。
function parseDouyinDraft(
  resultData: Record<string, unknown>,
): PublishPackageDraft | null {
  const rawDrafts = Array.isArray(resultData.drafts) ? resultData.drafts : [];
  const drafts = rawDrafts
    .map((r): PublishPackageDraft | null => {
      const o = (r ?? {}) as Record<string, unknown>;
      const platform = typeof o.platform === "string" ? o.platform : "";
      const title = typeof o.title === "string" ? o.title : "";
      if (!platform || !title) return null;
      const tags = Array.isArray(o.tags)
        ? o.tags.filter((t): t is string => typeof t === "string")
        : [];
      const auditFlags = Array.isArray(o.auditFlags)
        ? o.auditFlags.filter((f): f is string => typeof f === "string")
        : [];
      return {
        platform,
        title,
        body: typeof o.body === "string" ? o.body : "",
        tags,
        coverIdea: typeof o.coverIdea === "string" ? o.coverIdea : "",
        auditFlags,
      };
    })
    .filter((d): d is PublishPackageDraft => d !== null);
  return drafts.find((d) => d.platform === "douyin") ?? drafts[0] ?? null;
}

export function ChatPublishPackageCard({
  taskId,
  projectId,
  error,
  pollIntervalMs = POLL_INTERVAL_MS,
}: {
  taskId: string | null;
  /** 目标项目 id(采纳后回填定位;无项目上下文为 null → 只渲错误态)。 */
  projectId: string | null;
  /** dispatch 阶段的错误(无项目上下文/空稿门/端口未接入等);非 null 时直接渲错误态。 */
  error: string | null;
  /** 轮询间隔(测试注 0 免等实时;默认 4s)。 */
  pollIntervalMs?: number;
}) {
  const router = useRouter();
  const [phase, setPhase] = React.useState<Phase>(
    error || !taskId ? "error" : "running",
  );
  const [blocked,setBlocked]=React.useState<{status:string;executionTaskId:string}|null>(null);
  const [pollEpoch,setPollEpoch]=React.useState(0);
  const [draft, setDraft] = React.useState<PublishPackageDraft | null>(null);
  const [confirming, setConfirming] = React.useState(false);
  const [progressText, setProgressText] = React.useState(
    "正在准备发布物料生成任务",
  );
  const [failureDetail, setFailureDetail] = React.useState("");

  // 轮询 task/candidate(仿 ChatScriptDraftCard,从已 dispatch 的 taskId 起;abandoned 闭包取消,
  // 不用 mount-unmount ref —— StrictMode 双调会把 ref 置真卡死轮询)。
  React.useEffect(() => {
    if (!taskId || error) return;
    let abandoned = false;
    void (async () => {
      for (let i = 0; i < MAX_POLLS; i++) {
        if (abandoned) return;
        await new Promise((r) => setTimeout(r, pollIntervalMs));
        if (abandoned) return;
        try {
          const steps = (await client.listTaskSteps({
            params: { taskId },
            query: undefined,
            body: undefined,
          })) as unknown as Array<{ kind: string; text: string }>;
          const latest = steps[steps.length - 1];
          if (!abandoned && latest?.text) setProgressText(latest.text);
        } catch {
          /* 步骤是辅助信息，拉取失败不影响任务主轮询 */
        }
        let task: { status: string; runtimeStatus?:string; executionTaskId?:string; errorMessage?: string | null };
        try {
          task = (await client.getTask({
            params: { taskId },
            query: undefined,
            body: undefined,
          })) as { status: string; runtimeStatus?:string; executionTaskId?:string; errorMessage?: string | null };
        } catch {
          continue; // 单次拉取失败不终止(下轮再试)
        }
        if(task.executionTaskId && ["waiting_user","unknown_result","paused"].includes(task.runtimeStatus ?? "")){
          if(!abandoned){setBlocked({status:task.runtimeStatus!,executionTaskId:task.executionTaskId});setPhase("blocked");}
          return;
        }
        if(!abandoned && task.runtimeStatus==="retry_wait")setProgressText("暂时繁忙，正在等待自动重试");
        if(!abandoned && task.runtimeStatus==="cancel_requested")setProgressText("正在取消生成");
        const status = task.status;
        if (status === "awaiting_confirmation") {
          try {
            const results = (await client.listTaskResults({
              params: { taskId },
              query: undefined,
              body: undefined,
            })) as unknown as Array<{ resultData: Record<string, unknown> }>;
            const last = results[results.length - 1];
            const got = last ? parseDouyinDraft(last.resultData) : null;
            if (abandoned) return;
            if (got) {
              setDraft(got);
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
          if (!abandoned) {
            const detail = task.errorMessage?.trim();
            if (detail) setFailureDetail(detail);
            setPhase("error");
          }
          return;
        }
      }
      if (!abandoned) {
        setFailureDetail("页面等待超时，后台任务可能仍在执行，请先查看任务状态。");
        setPhase("error");
      }
    })();
    return () => {
      abandoned = true;
    };
  }, [taskId, error, pollIntervalMs,pollEpoch]);

  const resume=async()=>{
    if(!blocked)return;
    try{await client.commandExecutionTasks({params:undefined,query:undefined,body:{taskIds:[blocked.executionTaskId],command:"resume",idempotencyKey:crypto.randomUUID()}});setBlocked(null);setPhase("running");setPollEpoch(value=>value+1);}
    catch{setFailureDetail("暂时无法继续，请稍后重试");}
  };

  const adopt = React.useCallback(async () => {
    if (!taskId || !draft) return;
    setConfirming(true);
    try {
      // confirmTask:publication_drafts 分支 → createPublicationFromDraft 物化真 Publication+revision
      // (铁律②人点才落)。router.refresh 让稿面发布包区重读 → 占位文案换成真标题/标签。
      await client.confirmTask({
        params: { taskId },
        query: undefined,
        body: undefined,
      });
      router.refresh();
      setPhase("done");
    } catch {
      setPhase("error");
    } finally {
      setConfirming(false);
    }
  }, [taskId, draft, router]);

  return (
    <div
      data-slot="chat-publish-package-card"
      data-phase={phase}
      className="mt-1 flex w-full max-w-[420px] flex-col gap-1.5 rounded-[10px] border border-border bg-surface p-2.5"
    >
      <span className="text-[10px] font-medium uppercase tracking-wide text-brand">
        抖音发布物料 · 已过合规审核 · 采纳后建发布行
      </span>

      {phase === "blocked" && blocked ? (
        <div className="flex flex-col gap-2 text-sm" role="status">
          <p>{blocked.status==="waiting_user" ? "生成已暂停，请先检查模型配置，再继续执行。" : blocked.status==="paused" ? "生成已暂停，进度已保留。" : "提交结果尚待核对，请勿重复生成。"}</p>
          {blocked.status==="waiting_user" ? <a href="/settings?highlight=text-model">检查模型设置</a> : null}
          {blocked.status!=="unknown_result" ? <button type="button" onClick={()=>void resume()}>继续执行</button> : null}
          {failureDetail ? <p>{failureDetail}</p> : null}
        </div>
      ) : null}
      {phase === "running" ? (
        <div
          data-slot="chat-publish-running"
          className="flex items-center gap-2 text-[12px] text-muted-foreground"
        >
          <span className="size-3.5 shrink-0 animate-spin rounded-full border-2 border-brand border-t-transparent" />
          <span data-slot="chat-publish-progress">{progressText}</span>
        </div>
      ) : null}

      {phase === "review" && draft ? (
        <div data-slot="chat-publish-review" className="flex flex-col gap-2">
          {/* 标题 */}
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] font-medium text-text-subtle">标题</span>
            <p className="text-[13px] font-semibold leading-snug text-foreground">
              {draft.title}
            </p>
          </div>
          {/* 简介 */}
          {draft.body ? (
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] font-medium text-text-subtle">简介</span>
              <p className="whitespace-pre-line text-[12.5px] leading-relaxed text-muted-foreground">
                {draft.body}
              </p>
            </div>
          ) : null}
          {/* 标签 */}
          {draft.tags.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1.5">
              {draft.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-md bg-surface-subtle px-2 py-0.5 text-[11px] text-text-subtle"
                >
                  # {tag}
                </span>
              ))}
            </div>
          ) : null}
          {/* 封面文案 */}
          {draft.coverIdea ? (
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-medium text-text-subtle">封面文案</span>
              <span className="rounded-md border border-border/70 bg-surface-subtle/50 px-2 py-0.5 text-[11.5px] text-foreground">
                {draft.coverIdea}
              </span>
            </div>
          ) : null}
          {/* 审核结论(auditFlags):硬规则已自动改成合规版,这里记改了什么 / 全清给 ✅ */}
          {draft.auditFlags.length > 0 ? (
            <div
              data-slot="chat-publish-audit"
              className="flex flex-col gap-0.5 rounded-md border border-border/60 bg-surface-subtle/40 px-2 py-1.5"
            >
              <span className="text-[10px] font-medium text-text-subtle">发布审核</span>
              <ul className="flex flex-col gap-0.5">
                {draft.auditFlags.map((f, i) => (
                  <li
                    key={`${i}-${f.slice(0, 8)}`}
                    className="text-[11px] leading-snug text-muted-foreground"
                  >
                    · {f}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <div className="flex items-center justify-between gap-2">
            {!projectId ? (
              <p className="text-[11px] text-text-subtle">
                未关联项目 —— 在项目稿面里才能建发布行。
              </p>
            ) : (
              <span />
            )}
            <button
              type="button"
              data-slot="chat-publish-adopt"
              disabled={confirming}
              onClick={() => void adopt()}
              className="inline-flex h-7 items-center rounded-control bg-brand px-3 text-[11px] font-medium text-brand-foreground hover:bg-brand/90 disabled:opacity-50"
            >
              {confirming ? "采纳中…" : "采纳发布物料"}
            </button>
          </div>
        </div>
      ) : null}

      {phase === "done" ? (
        <p data-slot="chat-publish-done" className="text-[12px] text-success">
          ✓ 发布物料已采纳，可在当前项目点击“查看发布物料”。
        </p>
      ) : null}

      {phase === "error" ? (
        <div data-slot="chat-publish-error" className="flex flex-col gap-1">
          <p className="text-[12px] leading-relaxed text-destructive">
            {error
              ? error
              : failureDetail ||
                "没能生成发布物料 —— 可能是还没配置文本生成模型，或本次生成失败。"}
          </p>
          {error ? null : (
            <a
              href="/settings?highlight=text-model"
              data-slot="chat-publish-settings-link"
              className="text-[11px] font-medium text-brand underline underline-offset-2"
            >
              去设置配文本生成模型 →
            </a>
          )}
        </div>
      ) : null}
    </div>
  );
}
