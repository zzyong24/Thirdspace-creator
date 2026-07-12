"use client";

/**
 * [T-254b] 决策确认「分场预览卡」—— 制作视频管线的确认门 UI(SPEC §3.1 步骤 3)。
 *
 * 输入 = video.decisions 任务的 `video_decisions` 候选(四决策产物 + 素材清单快照),
 * 渲成场景列表:每场 = 标题/时间段/概括 + 信息卡(kind 徽标+文案+插点,可**删卡**)+
 * B-roll(可**换选**素材清单下拉,可移除)+ 字幕样例(本场前两行双语)。
 *
 * 确认 → assembleVideoRenderProps(编辑后的决策)组装 props JSON 交 onConfirm;
 * **不确认不渲染**(铁律②:这里是渲染的唯一入口闸)。挂载点独立组件,T-254c 在
 * production tab 接线(传入候选 resultData + 回调);本文件不碰 production 页面。
 */

import * as React from "react";

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
  /** 确认:编辑后的决策 + 组装好的渲染 props(contract videoRenderProps 单一真值)。 */
  onConfirm: (payload: {
    decisions: VideoDecisions;
    renderProps: VideoRenderProps;
  }) => void;
  onDiscard?: () => void;
  /** 渲染 props meta.title(通常 = 项目标题;T-254c 接线传)。 */
  title?: string;
  /** 粗剪人物视频 assetId(T-254c 上传链持有)→ talkingHead.file(mountAs=assetId 约定)。 */
  talkingHeadAssetId?: string | null;
  /** 粗剪人物视频真实时长(秒,T-254c ffprobe 探针带入);缺省按场景/字幕末尾推导。 */
  talkingHeadDurationSec?: number;
}

export function VideoDecisionPreview({
  decisions,
  inventory,
  onConfirm,
  onDiscard,
  title,
  talkingHeadAssetId,
  talkingHeadDurationSec,
}: VideoDecisionPreviewProps) {
  // 可编辑的两轴:删卡(cards)/ B-roll 换选与移除(broll)。场景/字幕本期只读展示。
  const [cards, setCards] = React.useState(decisions.cards);
  const [broll, setBroll] = React.useState(decisions.broll);

  const labelOf = React.useCallback(
    (assetId: string) =>
      inventory.find((a) => a.assetId === assetId)?.label ?? assetId,
    [inventory],
  );

  const edited: VideoDecisions = React.useMemo(
    () => ({ ...decisions, cards, broll }),
    [decisions, cards, broll],
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
          过目可改;确认后才组装渲染 props,不确认不渲染
        </p>
      </header>

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
                      <select
                        aria-label={`B-roll 素材(当前:${labelOf(pick.assetId)})`}
                        className="h-6 min-w-0 flex-1 rounded-control border border-border bg-surface px-1"
                        value={pick.assetId}
                        onChange={(e) => {
                          const next = e.target.value;
                          setBroll((prev) =>
                            prev.map((b, j) =>
                              j === i ? { ...b, assetId: next } : b,
                            ),
                          );
                        }}
                      >
                        {inventory.map((a) => (
                          <option key={a.assetId} value={a.assetId}>
                            {a.label}
                            {a.kind ? `（${a.kind}）` : ""}
                          </option>
                        ))}
                      </select>
                      <span className="shrink-0 text-muted-foreground">
                        @{fmtSec(pick.at)} · {fmtSec(pick.durationSec)}
                      </span>
                      <button
                        type="button"
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

      <footer className="flex items-center justify-end gap-2">
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
          className="h-8 rounded-control bg-primary px-3 text-sm text-primary-foreground"
          onClick={() =>
            onConfirm({
              decisions: edited,
              renderProps: assembleVideoRenderProps(edited, {
                title,
                talkingHeadAssetId,
                talkingHeadDurationSec,
                inventory,
              }),
            })
          }
        >
          确认决策,进入渲染
        </button>
      </footer>
    </section>
  );
}
