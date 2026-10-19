"use client";

/**
 * [T-254b] 决策确认「分场预览卡」—— 制作视频管线的确认门 UI(SPEC §3.1 步骤 3)。
 *
 * 输入 = video.decisions 任务的 `video_decisions` 候选(四个节点 + 总导演结论 + 素材快照),
 * 渲成场景列表:每场 = 标题/时间段/概括 + 信息卡(kind 徽标+文案+插点,可**删卡**)+
 * B-roll(可**换选**素材清单下拉,可移除)+ 字幕样例(本场前两行双语)。
 *
 * 确认 → assembleVideoRenderProps(编辑后的决策)组装 props JSON 交 onConfirm;
 * **不确认不渲染**(铁律②:这里是渲染的唯一入口闸)。挂载点独立组件,T-254c 在
 * production tab 接线(传入候选 resultData + 回调);本文件不碰 production 页面。
 */

import * as React from "react";
import {AssetPicker} from "@/components/media/asset-picker";
import {mediaIdentity,type MediaChoice} from "@/components/media/asset-picker.types";
import {useCreationWorkspace,useCreationScope,creationScopeKey} from "@/lib/creation-workspace-scope";

import type {
  VideoDecisions,
  BrollAssetRef,
} from "@creatoros/backend/modules/ai-runtime";
import type { VideoRenderProps } from "@creatoros/contract";
import { assembleVideoRenderProps } from "./assemble-video-render-props";

const KIND_LABEL: Record<string, string> = {
  stat: "数据",
  quote: "金句",
  list: "清单",
  compare: "对比",
  code: "代码",
  image: "配图",
};

const fmtSec = (n: number) => {
  const m = Math.floor(n / 60);
  const s = n - m * 60;
  const ss = (Math.round(s * 10) / 10).toString();
  return m > 0 ? `${m}m${ss}s` : `${ss}s`;
};

export interface VideoDecisionPreviewProps {
  decisions: VideoDecisions;
  /** 素材清单快照(runner 决策同源投影)—— B-roll 换选下拉的选项集。 */
  inventory: readonly BrollAssetRef[];
  /**
   * 已绑定但已不属于当前项目素材清单的旧快照名称。只用于诚实展示与解除绑定，
   * 不会把旧 assetId 重新加入可选清单，也不会触发模型重跑。
   */
  unavailableAssetLabels?: Readonly<Record<string, string>>;
  /** 确认:编辑后的决策 + 组装好的渲染 props(contract videoRenderProps 单一真值)。 */
  onConfirm: (payload: {
    decisions: VideoDecisions;
    renderProps: VideoRenderProps;
  }) => void;
  /** 保留原方案与全部既有绑定，只局部调整素材插点和时长。 */
  onRestoryboard?: (assignments: readonly ManualMaterialAssignment[]) => void;
  onDiscard?: () => void;
  /** 渲染 props meta.title(通常 = 项目标题;T-254c 接线传)。 */
  title?: string;
  /** 粗剪人物视频 assetId(T-254c 上传链持有)→ talkingHead.file(mountAs=assetId 约定)。 */
  talkingHeadAssetId?: string | null;
  /** 粗剪人物视频真实时长(秒,T-254c ffprobe 探针带入);缺省按场景/字幕末尾推导。 */
  talkingHeadDurationSec?: number;
  /** [T-290] 项目画幅 → 渲染 delivery 尺寸(portrait 竖版 / landscape 横版)。 */
  orientation?: "portrait" | "landscape";
  /** 已确认方案只读回顾：保留完整内容，但不再展示会误触二次确认的编辑动作。 */
  readOnly?: boolean;
  /** 正在保存方案/创建渲染任务：锁住入口，避免重复提交并立即反馈进度。 */
  confirming?: boolean;
  /** 正在应用局部补充选材：锁住入口，避免重复创建调整任务。 */
  adjustingMaterials?: boolean;
}

export interface ManualMaterialAssignment {
  assetId: string;
  sceneIdx: number;
  sceneTitle: string;
  sceneSummary: string;
}

export function VideoDecisionPreview({
  decisions,
  inventory,
  unavailableAssetLabels = {},
  onConfirm,
  onRestoryboard,
  onDiscard,
  title,
  talkingHeadAssetId,
  talkingHeadDurationSec,
  orientation,
  readOnly = false,
  confirming = false,
  adjustingMaterials = false,
}: VideoDecisionPreviewProps) {
  const scope=useCreationScope(),workspace=useCreationWorkspace(scope);
  const [previewFiles,setPreviewFiles]=React.useState<Record<string,ReturnType<typeof mediaIdentity>>>({});
  const inventoryKey=JSON.stringify(inventory.map(asset=>asset.assetId));
  React.useEffect(()=>{
    let cancelled=false;setPreviewFiles({});
    if(!scope.groupId&&!scope.accountId)return;
    const operation=workspace.capture();let index=0;
    async function worker(){
      while(!cancelled&&index<inventory.length){
        const item=inventory[index++];
        try{const asset=await operation.client.getAsset({params:{assetId:item.assetId},query:undefined,body:undefined});operation.assertCurrent();
          if(!cancelled)setPreviewFiles(previous=>({...previous,[item.assetId]:mediaIdentity(asset)}));
        }catch{/* 旧快照仍可人工选择；预览失败不改选材范围或assetId合同。 */}
      }
    }
    void Promise.all(Array.from({length:Math.min(4,inventory.length)},worker));
    return()=>{cancelled=true;};
  },[inventoryKey,creationScopeKey(scope),workspace]);
  const choices:MediaChoice<BrollAssetRef>[]=inventory.map(asset=>({choiceKey:asset.assetId,value:asset,name:asset.label,identity:previewFiles[asset.assetId]??null,assetType:asset.kind==='image'||asset.kind==='video'||asset.kind==='audio'?asset.kind:undefined}));
  // 可编辑的两轴:删卡(cards)/ B-roll 换选与移除(broll)。场景/字幕本期只读展示。
  const [cards, setCards] = React.useState(decisions.cards);
  const [broll, setBroll] = React.useState(decisions.broll);
  const [manualAssignments, setManualAssignments] = React.useState<
    ManualMaterialAssignment[]
  >([]);
  const hasManualChanges = manualAssignments.length > 0;
  const canEditMaterials = !readOnly && Boolean(onRestoryboard);
  const directorNeedsAttention =
    decisions.directorReview?.status === "needs_attention";

  const unresolvedUnavailableCount = React.useMemo(
    () =>
      broll.filter((pick) =>
        Object.prototype.hasOwnProperty.call(
          unavailableAssetLabels,
          pick.assetId,
        ),
      ).length,
    [broll, unavailableAssetLabels],
  );

  const labelOf = React.useCallback(
    (assetId: string) =>
      inventory.find((a) => a.assetId === assetId)?.label ??
      unavailableAssetLabels[assetId] ??
      assetId,
    [inventory, unavailableAssetLabels],
  );

  const edited: VideoDecisions = React.useMemo(
    () => ({ ...decisions, cards, broll }),
    [decisions, cards, broll],
  );

  const allBoundAssignments = React.useMemo(
    () =>
      Array.from(
        new Map(
          broll.flatMap((pick): Array<[string, ManualMaterialAssignment]> => {
            const scene = decisions.scenes[pick.sceneIdx];
            if (!scene) return [];
            return [[
              `${pick.assetId}:${pick.sceneIdx}`,
              {
                assetId: pick.assetId,
                sceneIdx: pick.sceneIdx,
                sceneTitle: scene.title,
                sceneSummary: scene.summary,
              },
            ]];
          }),
        ).values(),
      ),
    [broll, decisions.scenes],
  );

  const unassignedUserAssets = React.useMemo(() => {
    const assigned = new Set(broll.map((pick) => pick.assetId));
    return inventory.filter(
      (asset) =>
        (asset.source === "manual" || asset.source === "ammo") &&
        (asset.kind === "image" || asset.kind === "video") &&
        !assigned.has(asset.assetId),
    );
  }, [broll, inventory]);

  const assignUserAsset = React.useCallback(
    (assetId: string, sceneIdx: number) => {
      const scene = decisions.scenes[sceneIdx];
      if (!scene) return;
      const at =
        decisions.srtLines.find(
          (line) =>
            line.startSec >= scene.startSec && line.startSec < scene.endSec,
        )?.startSec ?? scene.startSec;
      setBroll((previous) =>
        [
          ...previous.filter((pick) => pick.assetId !== assetId),
          {
            sceneIdx,
            assetId,
            at,
            // 这里只用于预览“已选中”；真实展示时长必须由下一轮 AI 结合素材时长重算。
            durationSec: Math.max(1, scene.endSec - at),
          },
        ].sort((a, b) => a.at - b.at),
      );
      setManualAssignments((previous) => [
        ...previous.filter((item) => item.assetId !== assetId),
        {
          assetId,
          sceneIdx,
          sceneTitle: scene.title,
          sceneSummary: scene.summary,
        },
      ]);
    },
    [decisions.scenes, decisions.srtLines],
  );

  return (
    <section
      data-slot="video-decision-preview"
      className="flex flex-col gap-3 rounded-control border border-border bg-surface p-4"
    >
      <header className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-medium">
          分场预览 · {decisions.scenes.length} 场 / 卡片 {cards.length} 张 /
          B-roll {broll.length} 条
        </h3>
        <p className="text-xs text-muted-foreground">
          {readOnly ? "已确认 · 只读回顾" : "过目可改;确认后才组装渲染 props,不确认不渲染"}
        </p>
      </header>

      {decisions.directorReview ? (
        <div
          data-slot="director-review"
          className={`rounded-control border p-3 text-xs ${
            directorNeedsAttention
              ? "border-amber-300/60 bg-amber-50/60 text-amber-950 dark:bg-amber-950/20 dark:text-amber-100"
              : "border-emerald-300/60 bg-emerald-50/60 text-emerald-950 dark:bg-emerald-950/20 dark:text-emerald-100"
          }`}
        >
          <p className="font-medium">
            {directorNeedsAttention ? "旧候选审片记录" : "总导演审片通过"}
          </p>
          <p className="mt-1 opacity-80">
            {directorNeedsAttention
              ? "当前完整分镜可直接确认进入渲染；只有你主动补充选材时，系统才会局部调整素材和时间线。"
              : decisions.directorReview.summary}
          </p>
          {!directorNeedsAttention && decisions.directorReview.issues.length > 0 ? (
            <ul className="mt-2 flex flex-col gap-1">
              {decisions.directorReview.issues.map((issue, index) => (
                <li key={`${issue.sceneIdx}:${issue.code}:${index}`}>
                  场景 {issue.sceneIdx + 1}：{issue.message}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {canEditMaterials && unassignedUserAssets.length > 0 ? (
        <div
          data-slot="unassigned-user-assets"
          className="rounded-control border border-amber-300/50 bg-amber-50/50 p-3 text-xs text-amber-900 dark:bg-amber-950/20 dark:text-amber-100"
        >
          <p className="font-medium">可选补充素材 · {unassignedUserAssets.length} 个</p>
          <p className="mt-1 opacity-80">
            首轮方案已经可以成片；如果你想指定更多素材，系统会保留原分镜和全部既有绑定，只在当前方案上自动调整节奏。
          </p>
          <ul className="mt-2 flex flex-col gap-2">
            {unassignedUserAssets.map((asset) => (
              <li key={asset.assetId} className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate">{asset.label}</span>
                <select
                  aria-label={`将 ${asset.label} 放入场景`}
                  defaultValue=""
                  className="h-7 max-w-60 rounded-control border border-border bg-surface px-2 text-foreground"
                  onChange={(event) => {
                    const sceneIdx = Number(event.target.value);
                    if (Number.isInteger(sceneIdx)) {
                      assignUserAsset(asset.assetId, sceneIdx);
                    }
                  }}
                >
                  <option value="" disabled>选择场景…</option>
                  {decisions.scenes.map((scene, sceneIdx) => (
                    <option key={sceneIdx} value={sceneIdx}>
                      场景 {sceneIdx + 1} · {scene.title}
                    </option>
                  ))}
                </select>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <ol className="flex flex-col gap-3">
        {decisions.scenes.map((scene, sceneIdx) => {
          const sceneCards = cards
            .map((c, i) => ({ card: c, i }))
            .filter(({ card }) => card.sceneIdx === sceneIdx);
          const sceneBroll = broll
            .map((b, i) => ({ pick: b, i }))
            .filter(({ pick }) => pick.sceneIdx === sceneIdx);
          const sampleSubtitles = decisions.subtitles
            .filter(
              (l) => l.startSec >= scene.startSec && l.startSec < scene.endSec,
            )
            .slice(0, 2);
          return (
            <li
              key={`scene-${sceneIdx}`}
              data-testid={`scene-${sceneIdx}`}
              className="rounded-control border border-border p-3"
            >
              <div className="flex items-baseline gap-2">
                <span className="text-xs text-muted-foreground">
                  场景 {sceneIdx + 1}
                </span>
                <span className="text-sm font-medium">{scene.title}</span>
                <span className="text-xs text-muted-foreground">
                  {fmtSec(scene.startSec)} → {fmtSec(scene.endSec)}
                </span>
              </div>
              {scene.summary ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  {scene.summary}
                </p>
              ) : null}

              {sceneCards.length > 0 ? (
                <ul className="mt-2 flex flex-col gap-1">
                  {sceneCards.map(({ card, i }) => (
                    <li
                      key={`card-${i}`}
                      data-testid={`card-${i}`}
                      className="flex items-center gap-2 rounded-control bg-muted/40 px-2 py-1 text-xs"
                    >
                      <span className="shrink-0 rounded-control border border-border px-1">
                        {KIND_LABEL[card.kind] ?? card.kind}
                      </span>
                      <span className="min-w-0 flex-1 truncate">
                        {card.content}
                      </span>
                      <span className="shrink-0 text-muted-foreground">
                        @{fmtSec(card.at)}
                      </span>
                      <button
                        type="button"
                        hidden={readOnly}
                        aria-label={`删除卡片:${card.content}`}
                        className="shrink-0 text-muted-foreground hover:text-foreground"
                        onClick={() =>
                          setCards((prev) => prev.filter((_, j) => j !== i))
                        }
                      >
                        ✕
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}

              {sceneBroll.length > 0 ? (
                <ul className="mt-2 flex flex-col gap-1">
                  {sceneBroll.map(({ pick, i }) => (
                    <li
                      key={`broll-${i}`}
                      data-testid={`broll-${i}`}
                      className="flex items-center gap-2 text-xs"
                    >
                      <span className="shrink-0 text-muted-foreground">
                        B-roll
                      </span>
                      {/* 换选:选项集 = 决策同源的素材清单快照(真实 assetId,禁编造) */}
                      <div className="min-w-0 flex-1"><AssetPicker
                        ownerKey={`${creationScopeKey(scope)}:${inventoryKey}:${sceneIdx}:${i}:${pick.assetId}`}
                        label={`B-roll 素材(当前:${labelOf(pick.assetId)})`}
                        disabled={!canEditMaterials||confirming||adjustingMaterials}
                        source={{kind:"bounded",key:inventoryKey,label:"本次分镜素材",allowedTypes:["image","video","audio"],items:choices,completeness:"complete"}}
                        value={choices.find(choice=>choice.value.assetId===pick.assetId)??{choiceKey:pick.assetId,value:{assetId:pick.assetId,label:labelOf(pick.assetId),kind:"",description:""},name:`${labelOf(pick.assetId)}（素材已不可用）`,identity:null}}
                        confirmLabel="替换这一段素材"
                        onConfirm={choice=>{
                          const next=choice.value.assetId;if(next===pick.assetId)return;
                          setBroll(previous=>previous.map((item,index)=>index===i?{...item,assetId:next}:item));
                          const scene=decisions.scenes[pick.sceneIdx];
                          if(scene)setManualAssignments(previous=>[...previous.filter(item=>item.assetId!==next),{assetId:next,sceneIdx:pick.sceneIdx,sceneTitle:scene.title,sceneSummary:scene.summary}]);
                        }}/></div>
                      <span className="shrink-0 text-muted-foreground">
                        @{fmtSec(pick.at)} · {fmtSec(pick.durationSec)}
                      </span>
                      <button
                        type="button"
                        hidden={readOnly}
                        aria-label={`移除 B-roll:${labelOf(pick.assetId)}`}
                        className="shrink-0 text-muted-foreground hover:text-foreground"
                        onClick={() =>
                          setBroll((prev) => prev.filter((_, j) => j !== i))
                        }
                      >
                        ✕
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}

              {sampleSubtitles.length > 0 ? (
                <div
                  data-testid={`subtitle-sample-${sceneIdx}`}
                  className="mt-2 rounded-control bg-muted/40 px-2 py-1 text-xs text-muted-foreground"
                >
                  {sampleSubtitles.map((l) => (
                    <p key={`sub-${l.index}`}>
                      {l.zh}
                      {l.en ? (
                        <span className="ml-2 opacity-70">{l.en}</span>
                      ) : null}
                    </p>
                  ))}
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>

      {!readOnly ? (
        <footer className="flex flex-col gap-2">
          {unresolvedUnavailableCount > 0 ? (
            <p className="text-right text-xs text-destructive">
              请先移除或重新选择 {unresolvedUnavailableCount} 条已不可用素材。
            </p>
          ) : null}
          {hasManualChanges ? (
            <p className="text-right text-xs text-amber-700 dark:text-amber-300">
              已记录你的选材；系统会保留原分镜，在当前方案内自动调整插点、接力和展示时长。
            </p>
          ) : null}
          <div className="flex items-center justify-end gap-2">
            {onDiscard ? (
              <button
                type="button"
                className="h-8 rounded-control border border-border px-3 text-sm"
                onClick={onDiscard}
              >
                丢弃
              </button>
            ) : null}
            <button
              type="button"
              disabled={
                confirming ||
                adjustingMaterials ||
                unresolvedUnavailableCount > 0
              }
              className="h-8 rounded-control bg-primary px-3 text-sm text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
              onClick={() => {
                if (
                  confirming ||
                  adjustingMaterials ||
                  unresolvedUnavailableCount > 0
                ) return;
                if (hasManualChanges) {
                  // 人工只改一个素材时，也要把首轮已经绑定的全部素材作为硬约束
                  // 传回去，只优化当前方案，禁止把之前的绑定洗掉。
                  onRestoryboard?.(allBoundAssignments);
                  return;
                }
                onConfirm({
                  decisions: edited,
                  renderProps: assembleVideoRenderProps(edited, {
                    title,
                    talkingHeadAssetId,
                    talkingHeadDurationSec,
                    inventory,
                    orientation,
                  }),
                });
              }}
            >
              {confirming
                ? "正在保存分镜并创建渲染任务…"
                : adjustingMaterials
                ? "正在应用补充选材…"
                : hasManualChanges
                ? "应用补充选材"
                : "确认决策,进入渲染"}
            </button>
          </div>
        </footer>
      ) : null}
    </section>
  );
}
