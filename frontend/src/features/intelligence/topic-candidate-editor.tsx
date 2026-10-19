"use client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Copy, FolderPlus,Link2,RefreshCw } from "lucide-react";
import * as React from "react";
import type { RadarItemDetail } from "./intelligence-workbench-types";
import { canRetryTopicTask,isTopicTaskPending,isTopicTaskPolling,topicTaskAttention,topicTaskNeedsModelSetup,topicTaskStatus } from "./topic-task-state";
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
  generationPending = false,
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
  generationPending?: boolean;
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
  const savedDraftText =
    transform.outputSnapshot.adoptedDraftContentText ??
    transform.outputSnapshot.adaptedDraft?.contentText ??
    "";
  const hasSavedDraft = Boolean(savedDraftText.trim());
  const [draftText, setDraftText] = React.useState(savedDraftText);
  const draftEdited = React.useRef(false);
  const previousSavedDraftText = React.useRef(savedDraftText);
  const [copyStatus, setCopyStatus] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (previousSavedDraftText.current !== savedDraftText) {
      previousSavedDraftText.current = savedDraftText;
      draftEdited.current = false;
      setDraftText(savedDraftText);
      setCopyStatus(null);
    } else if (!draftEdited.current) {
      setDraftText(savedDraftText);
    }
  }, [savedDraftText]);
  const candidateForAction = React.useMemo(() => ({
    ...candidate,
    ...(candidate.adaptedDraft
      ? { adaptedDraft: { ...candidate.adaptedDraft, contentText: draftText } }
      : {}),
  }), [candidate, draftText]);
  const copyDraft = async () => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(draftText);
      setCopyStatus("已复制改写稿。");
    } catch {
      setCopyStatus("复制失败，请选中正文后手动复制。");
    }
  };
  const confirmed = transform.status === "confirmed";
  const recommendedRole = confirmed
    ? transform.outputSnapshot.recommendedContentRole
    : transform.outputSnapshot.contentRole;
  const roleChanged = (candidate.contentRole ?? null) !== (recommendedRole ?? null);
  // [T-900] 改写初稿是进入后续创作的最小内容真相；选题辅助字段允许后补。
  // 归属、来源与 provenance 等安全门仍由 confirmTopic 在执行当下重新校验。
  const incomplete = !draftText.trim();
  const progress = transform.outputSnapshot.generationProgress;
  const retrying=generationPending || isTopicTaskPending(topicTaskStatus(transform));
  const terminalFailure=Boolean(topicTaskAttention(topicTaskStatus(transform)));
  const needsModelSetup=topicTaskNeedsModelSetup(transform);
  const personalizationStatus =
    transform.outputSnapshot.adaptedDraft?.generationMode === "rewrite_only"
      ? transform.outputSnapshot.adaptedDraft.personalizationStatus
      : transform.outputSnapshot.personalizationStatus;
  const rewriteOnly =
    transform.outputSnapshot.generationMode === "rewrite_only" ||
    transform.outputSnapshot.adaptedDraft?.generationMode === "rewrite_only";
  const progressLabel = rewriteOnly
    ? retrying
      ? "正在生成改写稿"
      : progress?.rewriteDraft?.status === "completed"
        ? "改写稿已生成"
        : progress?.rewriteDraft?.status === "failed"
          ? "改写稿待重试"
          : null
    : retrying && progress?.draft?.status === "failed"
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
            {needsModelSetup ? "完成 AI 设置后继续" : rewriteOnly ? "这次没有生成改写稿" : "后续生成暂未完成，已生成的内容已保留"}
          </p>
          <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
            {transform.taskErrorMessage?.trim() || topicTaskAttention(topicTaskStatus(transform)) || "可以稍后只重试未完成部分。"}
          </p>
          {needsModelSetup ? (
            <a
              href="/settings?highlight=text-model"
              data-slot="topic-model-settings-link"
              className="mt-2 inline-flex h-8 items-center rounded-md bg-primary px-3 text-[11px] font-medium text-primary-foreground"
            >
              去设置 AI 模型
            </a>
          ) : !confirmed&&canRetryTopicTask(topicTaskStatus(transform)) ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={retryDisabled}
              onClick={onRetry}
              className="mt-2 gap-1.5"
            >
              <RefreshCw className="size-3.5" />
              {rewriteOnly ? "重新生成改写稿" : "重试生成选题卡"}
            </Button>
          ) : null}
        </div>
      ) : null}
      {hasSavedDraft ? (
        <div className="space-y-2 rounded-lg border border-primary/20 bg-surface p-3">
          <label className="grid gap-1 text-[11px] font-semibold text-muted-foreground">
            对标原稿（只读）
            <textarea
              aria-label="对标原稿"
              value={sourceTranscript}
              readOnly
              className="min-h-28 resize-y rounded-lg border border-input bg-muted/40 px-3 py-2 text-xs font-normal leading-5 text-muted-foreground"
            />
          </label>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs font-semibold text-foreground">我的改写稿</p>
              {personalizationStatus === "not_applied" ? (
                <p className="mt-1 text-[11px] text-warning">未应用账号定位，这是通用改写稿。</p>
              ) : personalizationStatus === "applied" ? (
                <p className="mt-1 text-[11px] text-muted-foreground">生成时已应用账号定位；重新生成会使用当前定位。</p>
              ) : null}
            </div>
            <Button type="button" size="sm" variant="outline" disabled={!draftText.trim()} onClick={() => void copyDraft()} className="gap-1.5">
              <Copy className="size-3.5" />复制改写稿
            </Button>
          </div>
          <textarea
            aria-label="我的改写初稿"
            value={draftText}
            disabled={confirmed || busy || retrying || !rewriteOnly}
            onChange={(event) => {
              draftEdited.current = true;
              setDraftText(event.target.value);
              setCopyStatus(null);
            }}
            className="min-h-64 w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-xs font-normal leading-5 text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          {copyStatus ? <p role="status" className="text-[11px] text-muted-foreground">{copyStatus}</p> : null}
          <p className="text-[11px] leading-4 text-muted-foreground">
            {rewriteOnly
              ? "这里的编辑暂存在当前页面；采纳为选题或创建项目时会一并保存。"
              : "这是旧版策略稿；可以复制正文，后续继续沿用原有选题编辑流程。"}
          </p>
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
      {!rewriteOnly ? <>
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
            生成改写稿不依赖这些补充字段；需要时可稍后整理选题信息。
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
      </> : null}
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
        {!confirmed && (generationPending || !isTopicTaskPending(topicTaskStatus(transform))) ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy || retrying || incomplete}
          onClick={() => onConfirm(transform.id, candidateForAction)}
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
              candidateForAction,
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
