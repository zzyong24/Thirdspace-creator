"use client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { FolderPlus,Link2,RefreshCw } from "lucide-react";
import * as React from "react";
import type { RadarItemDetail } from "./intelligence-workbench-types";
import { canRetryTopicTask,isTopicTaskPending,isTopicTaskPolling,topicTaskAttention,topicTaskStatus } from "./topic-task-state";
const CONTENT_ROLE_LABELS = { traffic: "流量型", trust: "信任型", conversion: "获客型" } as const;
type CandidateSnapshot = NonNullable<RadarItemDetail["transforms"][number]["outputSnapshot"]>;
function candidateFromSnapshot(snapshot: CandidateSnapshot) {
  return {
    ...snapshot,
    title: snapshot.title ?? "",
    angle: snapshot.angle ?? "",
    differentiation: snapshot.differentiation ?? "",
    sourceSummary: snapshot.sourceSummary ?? "",
    targetAudience: snapshot.targetAudience ?? "",
    audiencePain: snapshot.audiencePain ?? "",
    coreConflict: snapshot.coreConflict ?? "",
    format: snapshot.format ?? "",
    contentRole: snapshot.contentRole ?? null,
    adaptationStrategy: snapshot.adaptationStrategy ?? {
      keep: [],
      replace: [],
      add: [],
      avoid: [],
    },
  };
}
export function TopicCandidateEditor({
  transform,
  sourceTranscript,
  busy,
  retryDisabled,
  onRetry,
  onConfirm,
  onUpgradeProject,
}: {
  transform: RadarItemDetail["transforms"][number] & {
    outputSnapshot: NonNullable<
      RadarItemDetail["transforms"][number]["outputSnapshot"]
    >;
  };
  sourceTranscript: string;
  busy: boolean;
  retryDisabled: boolean;
  onRetry: () => void;
  onConfirm: (
    transformId: string,
    candidate: NonNullable<
      RadarItemDetail["transforms"][number]["outputSnapshot"]
    >,
  ) => void;
  onUpgradeProject: (
    transformId: string,
    candidate: NonNullable<
      RadarItemDetail["transforms"][number]["outputSnapshot"]
    >,
    existingTopicId: string | null,
  ) => void;
}) {
  const dirtyFields = React.useRef(new Set<string>());
  const [candidate, setCandidate] = React.useState(() => candidateFromSnapshot(transform.outputSnapshot));
  // 同一 transform 的分段检查点持续到达，刷新未编辑字段，保留用户主动改选或清空。
  React.useEffect(() => {
    setCandidate((current) => {
      const next = candidateFromSnapshot(transform.outputSnapshot);
      for (const field of dirtyFields.current) {
        Object.assign(next, { [field]: current[field as keyof typeof current] });
      }
      return next;
    });
  }, [transform.outputSnapshot]);
  const editCandidate = (changes: Partial<typeof candidate>) => {
    Object.keys(changes).forEach((field) => dirtyFields.current.add(field));
    setCandidate((current) => ({ ...current, ...changes }));
  };
  const draftText = transform.outputSnapshot.adaptedDraft?.contentText ?? "";
  const confirmed = transform.status === "confirmed";
  const recommendedRole = confirmed
    ? transform.outputSnapshot.recommendedContentRole
    : transform.outputSnapshot.contentRole;
  const roleChanged = (candidate.contentRole ?? null) !== (recommendedRole ?? null);
  // [T-900] 改写初稿是进入后续创作的最小内容真相；选题辅助字段允许后补。
  // 归属、来源与 provenance 等安全门仍由 confirmTopic 在执行当下重新校验。
  const incomplete = !draftText.trim();
  const progress = transform.outputSnapshot.generationProgress;
  const retrying=isTopicTaskPending(topicTaskStatus(transform));
  const terminalFailure=Boolean(topicTaskAttention(topicTaskStatus(transform)));
  const progressLabel =
    retrying && progress?.draft?.status === "failed"
      ? "拆解和选题已保留，正在重试改写初稿"
      : retrying && progress?.topic?.status === "failed"
        ? "逐字稿拆解已保留，正在重试选题"
        : retrying && progress?.decomposition?.status === "failed"
          ? "正在重试逐字稿拆解"
          : progress?.draft?.status === "failed"
      ? "拆解和选题已保留，改写初稿待重试"
      : progress?.topic?.status === "failed"
          ? "逐字稿拆解已保留，选题待重试"
        : progress?.decomposition?.status === "failed"
          ? "逐字稿拆解待重试"
          : progress?.draft?.status === "completed"
            ? "改写初稿已生成"
            : progress?.topic?.status === "completed"
              ? "选题已生成，正在改写初稿"
              : progress?.decomposition?.status === "completed"
                ? "逐字稿已拆解，正在生成选题"
                : null;
  return (
    <div className="mt-3 space-y-2 rounded-xl border border-primary/20 bg-primary/[0.035] p-3">
      {progressLabel ? (
        <div
          role="status"
          className="rounded-lg bg-primary/8 px-3 py-2 text-xs text-primary"
        >
          {isTopicTaskPolling(topicTaskStatus(transform)) ? (
            <RefreshCw className="mr-1 inline size-3 animate-spin" />
          ) : null}
          {progressLabel}
        </div>
      ) : null}
      {terminalFailure ? (
        <div
          role="alert"
          className="rounded-lg border border-warning/30 bg-warning/5 px-3 py-2"
        >
          <p className="text-xs font-medium text-foreground">
            后续生成暂未完成，已生成的内容已保留
          </p>
          <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
            {transform.taskErrorMessage?.trim() || topicTaskAttention(topicTaskStatus(transform)) || "可以稍后只重试未完成部分。"}
          </p>
          {!confirmed&&canRetryTopicTask(topicTaskStatus(transform)) ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={retryDisabled}
              onClick={onRetry}
              className="mt-2 gap-1.5"
            >
              <RefreshCw className="size-3.5" />
              重试生成选题卡
            </Button>
          ) : null}
        </div>
      ) : null}
      {candidate.hook || candidate.structureSteps?.length ? (
      <div className="space-y-2 rounded-lg border border-border/70 bg-surface p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-semibold text-foreground">
            逐字稿结构拆解
          </span>
          {candidate.sourceUrl ? (
            <a
              href={candidate.sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
            >
              查看原视频 <Link2 className="size-3" />
            </a>
          ) : null}
        </div>
        <p className="text-xs leading-5 text-muted-foreground">
          <span className="font-medium text-foreground">钩子：</span>
          {candidate.hook ?? "—"}
        </p>
        <ol className="list-decimal space-y-1 pl-4 text-xs leading-5 text-muted-foreground">
          {(candidate.structureSteps ?? []).map((step, index) => (
            <li key={`${index}:${step}`}>{step}</li>
          ))}
        </ol>
        <p className="text-xs leading-5 text-muted-foreground">
          <span className="font-medium text-foreground">可迁移结构：</span>
          {candidate.reusablePattern ?? "—"}
        </p>
        {(candidate.factRisks?.length ?? 0) > 0 ? (
          <p className="text-xs leading-5 text-warning">
            待核验：{candidate.factRisks?.join("；")}
          </p>
        ) : null}
      </div>
      ) : null}
      {draftText ? (
        <div className="grid gap-3 rounded-lg border border-border/70 bg-surface p-3 md:grid-cols-2">
          <label className="grid min-w-0 gap-1 text-[11px] font-semibold text-foreground">
            对标原稿（只读）
            <textarea
              aria-label="对标原稿"
              value={sourceTranscript}
              readOnly
              className="min-h-64 resize-y rounded-lg border border-input bg-muted/40 px-3 py-2 text-xs font-normal leading-5 text-muted-foreground"
            />
          </label>
          <label className="grid min-w-0 gap-1 text-[11px] font-semibold text-foreground">
            我的改写初稿
            <textarea
              aria-label="我的改写初稿"
              value={draftText}
              readOnly
              className="min-h-64 resize-y rounded-lg border border-input bg-background px-3 py-2 text-xs font-normal leading-5 text-foreground"
            />
            <span className="font-normal text-muted-foreground">
              采纳选题后会随选题进入 Project；在项目稿面编辑和保存版本。
            </span>
          </label>
        </div>
      ) : null}
      <Input
        aria-label="选题候选标题"
        value={candidate.title}
        disabled={confirmed || busy || retrying}
        onChange={(event) =>
          editCandidate({ title: event.target.value })
        }
        className="bg-surface text-sm font-medium"
      />
      <section aria-label="内容目的" className="space-y-2 rounded-lg border border-border/70 bg-surface p-3">
        <label className="grid gap-1 text-xs font-medium">
          内容目的
          <select
            aria-label="选题候选内容目的"
            value={candidate.contentRole ?? ""}
            disabled={confirmed || busy || retrying}
            onChange={(event) => editCandidate({ contentRole: (event.target.value || null) as typeof candidate.contentRole })}
            className="rounded-lg border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="">未选择</option>
            {Object.entries(CONTENT_ROLE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <p className="text-[11px] leading-5 text-muted-foreground">流量型：吸引相关新观众 · 信任型：展示判断与证据 · 获客型：解决购买顾虑、促成咨询</p>
        <p className="text-xs leading-5">原推荐：{recommendedRole ? CONTENT_ROLE_LABELS[recommendedRole] : "未推荐"}</p>
        {transform.outputSnapshot.contentRoleReason ? <p className="text-xs leading-5 text-muted-foreground">推荐依据：{transform.outputSnapshot.contentRoleReason}</p> : null}
        {roleChanged ? <p role="status" className="text-xs leading-5 text-primary">已改选，采纳后用于项目后续写稿；当前初稿仍是原推荐下的参考稿，尚未按新目的重写。</p> : null}
        {confirmed ? <p className="text-[11px] text-muted-foreground">已随选题保存，在项目中继续创作。</p> : null}
      </section>
      {(
        [
          ["angle", "角度"],
          ["differentiation", "差异化"],
          ["sourceSummary", "来源摘要"],
          ["targetAudience", "目标观众"],
          ["audiencePain", "观众痛点"],
          ["coreConflict", "核心冲突"],
          ["format", "内容形式"],
        ] as const
      ).map(([field, label]) => (
        <label key={field} className="grid gap-1 text-[11px] text-muted-foreground">
          {label}
          <textarea
            aria-label={`选题候选${label}`}
            value={candidate[field]}
            disabled={confirmed || busy || retrying}
            onChange={(event) =>
              editCandidate({ [field]: event.target.value })
            }
            className="min-h-16 resize-y rounded-lg border border-input bg-surface px-3 py-2 text-xs leading-5 text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>
      ))}
      <div
        role="group"
        aria-label="改写规则"
        className="space-y-2 rounded-lg border border-border/70 bg-surface p-3"
      >
        <div>
          <p className="text-[11px] font-semibold text-foreground">改写规则</p>
          <p className="mt-0.5 text-[10px] leading-4 text-muted-foreground">
            系统根据对标原稿和当前定位生成，随本次选题锁定。文案不满意时，可重新生成改写稿。
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
        {(
          [
            ["keep", "保留什么"],
            ["replace", "替换什么"],
            ["add", "新增什么"],
            ["avoid", "避开什么"],
          ] as const
        ).map(([field, label]) => {
          const rules = candidate.adaptationStrategy[field];
          return (
            <section
              key={field}
              aria-label={label}
              className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2"
            >
              <p className="text-[11px] font-medium text-foreground">{label}</p>
              {rules.length > 0 ? (
                <ul className="mt-1 space-y-1 text-xs leading-5 text-muted-foreground">
                  {rules.map((rule, index) => (
                    <li key={`${field}:${index}:${rule}`}>· {rule}</li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-xs text-muted-foreground">暂无额外规则</p>
              )}
            </section>
          );
        })}
        </div>
      </div>
      {draftText && !retrying && !terminalFailure ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={retryDisabled}
          onClick={onRetry}
          className="w-full gap-1.5"
        >
          <RefreshCw className="size-3.5" />
          重新生成改写稿
        </Button>
      ) : null}
      <div className="grid gap-2 sm:grid-cols-2">
        {!confirmed && !retrying ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy || incomplete}
            onClick={() => onConfirm(transform.id, candidate)}
            className="w-full"
          >
            确认写入选题池
          </Button>
        ) : null}
        <Button
          type="button"
          size="sm"
          disabled={busy || retrying || incomplete}
          onClick={() =>
            onUpgradeProject(
              transform.id,
              candidate,
              transform.targetTopicId,
            )
          }
          className={cn("w-full gap-1.5", confirmed && "sm:col-span-2")}
        >
          <FolderPlus className="size-3.5" />
          一键升级项目
        </Button>
      </div>
      <p className="text-[10px] leading-4 text-muted-foreground">
        有改写初稿即可继续；未生成的观众痛点、核心冲突等字段可进入选题或项目后补充。一键升级会把真实来源证据和当前初稿一起带入项目。
      </p>
    </div>
  );
}
