"use client";

/**
 * `AssetGenerateIsland` — L5 录制页「AI 生成」区(SPEC 2026-07-01 §3 + §4 区③)。
 *
 * 填/带 prompt(可从分镜「画面」字段带)+ 选 kind(image/video)+ aspectRatio → dispatch
 * `asset.generate` → 候选(generated_asset)→ 采纳绑定项目(用料链)。**纯前端接线**,复用
 * 现成 dispatch/候选/采纳门(`AdoptCandidateCard` = createAITask→poll→confirmTask 全流程),
 * 不改后端/契约/M1-M3。
 *
 * 三条约束都在这层落地:
 *  - **`[gate-F3]` aspectRatio 竖屏优先**:默认跟随项目横竖屏(`outputAspectRatio` 是 "9:16"→
 *    默认竖屏),用户可改;选了 9:16 但 provider 只出横屏(video 默认场景)→ **显式提示**「该
 *    provider 可能仅出 16:9,需自行裁 9:16」,不静默产横屏(SPEC §4/§9「先只标注不自动裁」)。
 *  - **video-asset-kit 决策提示(§2.3)**:显式标「AI 图/视频只当隐喻点缀 ≤1-2 个;真证据自截/录」
 *    + 动态概念→文生视频 / 静态→文生图 / 抽象→别硬上 的引导。
 *  - **未配禁用**:没配 image/video 模型(`imageConfigured`/`videoConfigured` 由路由读
 *    listModels hasSecret 判)→ 禁用生成 + 引导「去设置配文生图/文生视频模型」。
 *
 * 诚实:真出图/视频要用户配 key + 花钱(M5 端到端)。本区只保证 UI 接线 + dispatch 入参正确
 * (aspectRatio 跟随项目)+ 未配禁用。生成失败(未配 key / provider 报错 / 轮询超时)→
 * AdoptCandidateCard 的 error 态诚实提示。
 */

import * as React from "react";
import { ImageIcon, Video } from "lucide-react";

import { SectionCard } from "@/components/project/section-card";
import { Textarea } from "@/components/ui/textarea";
import { AdoptCandidateCard } from "@/components/ai/adopt-candidate-card";

// asset.generate 的候选(generated_asset resultData;见 asset-generate-runner.recordCandidate)。
interface GeneratedAssetItem {
  assetId: string;
  assetType: string;
  name: string;
  prompt: string;
  aspectRatio?: string;
}

function parseGenerated(
  resultData: Record<string, unknown>,
): GeneratedAssetItem[] {
  // runner 只产 1 个候选(单次生成一份素材),但兼容 items 数组形态(与其它节点一致)。
  const rows = Array.isArray(resultData.items)
    ? (resultData.items as unknown[])
    : [resultData];
  return rows
    .map((raw): GeneratedAssetItem | null => {
      const o = (raw ?? {}) as Record<string, unknown>;
      const assetId = typeof o.assetId === "string" ? o.assetId : "";
      if (!assetId) return null;
      return {
        assetId,
        assetType: typeof o.assetType === "string" ? o.assetType : "image",
        name: typeof o.name === "string" ? o.name : assetId,
        prompt: typeof o.prompt === "string" ? o.prompt : "",
        aspectRatio:
          typeof o.aspectRatio === "string" ? o.aspectRatio : undefined,
      };
    })
    .filter((m): m is GeneratedAssetItem => m !== null);
}

function renderGenerated(item: GeneratedAssetItem) {
  return (
    <div className="flex flex-col gap-1 rounded-control border border-border bg-surface px-2.5 py-2 text-sm">
      <div className="flex items-center gap-2">
        <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
          {item.assetType === "video" ? "视频" : "图片"}
        </span>
        <span className="min-w-0 flex-1 truncate font-medium text-foreground">
          {item.name}
        </span>
        {item.aspectRatio ? (
          <span className="shrink-0 font-mono text-[11px] text-text-subtle tabular-nums">
            {item.aspectRatio}
          </span>
        ) : null}
      </div>
      <span className="truncate font-mono text-[10px] text-text-subtle">
        {item.assetId}
      </span>
    </div>
  );
}

// aspectRatio 选项(抖音竖屏优先;16:9 横屏 + 1:1 方图兜底常用)。
const ASPECT_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "9:16", label: "9:16 竖屏(抖音)" },
  { value: "16:9", label: "16:9 横屏" },
  { value: "1:1", label: "1:1 方图" },
];

// `[gate-F3]` 项目横竖屏 → 默认 aspectRatio。项目 output.aspectRatio 是自由串,常见
// "9:16"/"16:9"/"portrait"/"landscape";规整成一个 aspect 值,竖屏优先(默认 9:16)。
function defaultAspectFor(outputAspectRatio: string | undefined): string {
  const a = (outputAspectRatio ?? "").trim().toLowerCase();
  if (a.includes("16:9") || a.includes("landscape") || a === "16_9") {
    return "16:9";
  }
  if (a === "1:1" || a.includes("square")) return "1:1";
  // 竖屏优先:9:16 / portrait / 未知 → 都默认竖屏(合宪 §8,抖音场景)。
  return "9:16";
}

export interface AssetGenerateIslandProps {
  readonly projectId: string;
  /** 项目主 output 的 aspectRatio(路由从 listOutputs 读);驱动 `[gate-F3]` 默认竖竖屏。 */
  readonly outputAspectRatio?: string;
  /** 从分镜「画面」字段带来的初始 prompt(可空 → 用户手填)。 */
  readonly initialPrompt?: string;
  /** 文生图模型已配(路由读 listModels + hasSecret)。未配 → image 生成禁用 + 引导去设置。 */
  readonly imageConfigured: boolean;
  /** 文生视频模型已配。未配 → video 生成禁用 + 引导去设置。 */
  readonly videoConfigured: boolean;
}

export function AssetGenerateIsland({
  projectId,
  outputAspectRatio,
  initialPrompt,
  imageConfigured,
  videoConfigured,
}: AssetGenerateIslandProps) {
  const [kind, setKind] = React.useState<"image" | "video">("image");
  const [prompt, setPrompt] = React.useState<string>(initialPrompt ?? "");
  const [aspectRatio, setAspectRatio] = React.useState<string>(() =>
    defaultAspectFor(outputAspectRatio),
  );

  // 当前 kind 是否已配模型 → 决定生成入口禁用/引导。
  const configured = kind === "image" ? imageConfigured : videoConfigured;

  // `[gate-F3]` provider 只横屏提示:选了竖屏(非 16:9)但当前是 video —— MiniMax 文生视频默认
  // 16:9(SPEC §9),显式提示「需自行裁 9:16」,不静默产横屏。image 侧 provider 通常支持 9:16
  // (直接配),故只对 video 提示。这是「先只标注不自动裁」的诚实实现。
  const showPortraitCropHint =
    kind === "video" && aspectRatio !== "16:9";

  // AdoptCandidateCard 的 inputData —— 随 prompt/kind/aspectRatio 变;dispatch 时(start
  // 闭包读最新 inputData)带进 createAITask.body.inputData,喂 asset.generate runner。
  const inputData = React.useMemo(
    () => ({ projectId, prompt: prompt.trim(), kind, aspectRatio }),
    [projectId, prompt, kind, aspectRatio],
  );

  const promptEmpty = prompt.trim().length === 0;
  // 生成入口是否可点:已配模型 + prompt 非空。未配/空 prompt → 禁用 AdoptCandidateCard 的 start。
  const canGenerate = configured && !promptEmpty;

  return (
    <div
      data-slot="asset-generate-region"
      data-testid="production-region"
      data-region="ai-generate"
      className="flex flex-col gap-3"
    >
      <SectionCard
        title="AI 生成素材"
        description="文生图 / 文生视频补隐喻画面(用户可配模型;真出图需配 key)"
      >
        <div className="flex flex-col gap-3" data-slot="asset-generate-form">
          {/* video-asset-kit 决策提示(§2.3)—— 显式挂,避免 AI 素材喧宾夺主。 */}
          <div
            data-slot="asset-generate-guidance"
            className="flex flex-col gap-1 rounded-card border border-brand/15 bg-brand-soft/30 p-2.5 text-[11px] leading-relaxed text-text-subtle"
          >
            <p className="font-medium text-foreground">素材决策(重要)</p>
            <p>
              AI 图/视频只当<strong>隐喻点缀,一条视频 ≤1-2 个</strong>;真证据(数据、
              截图、实拍)请你自己截/录,别让 AI 素材喧宾夺主。
            </p>
            <p>
              动态概念(流程、增长)→ 用<strong>文生视频</strong>;静态意象 →{" "}
              <strong>文生图</strong>;抽象技术概念别硬上 AI,用真截图/数据卡更可信。
            </p>
          </div>

          {/* kind 切换:文生图 / 文生视频 */}
          <div
            data-slot="asset-generate-kind"
            role="radiogroup"
            aria-label="生成类型"
            className="flex gap-1.5"
          >
            {(
              [
                { id: "image" as const, label: "文生图", Icon: ImageIcon },
                { id: "video" as const, label: "文生视频", Icon: Video },
              ]
            ).map(({ id, label, Icon }) => {
              const active = kind === id;
              return (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  data-slot="asset-generate-kind-option"
                  data-kind={id}
                  data-active={active ? "true" : "false"}
                  onClick={() => setKind(id)}
                  className={
                    "inline-flex h-8 items-center gap-1.5 rounded-control border px-3 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 " +
                    (active
                      ? "border-brand/60 bg-brand-soft text-brand"
                      : "border-border bg-surface text-foreground hover:bg-surface-subtle")
                  }
                >
                  <Icon className="size-3.5" strokeWidth={1.75} />
                  {label}
                </button>
              );
            })}
          </div>

          {/* prompt(可从分镜画面带,可编辑)。video-asset-kit：英文最稳 + 扁平/单色/no text。 */}
          <div className="flex flex-col gap-1">
            <label
              htmlFor="asset-generate-prompt"
              className="text-[11px] font-medium text-muted-foreground"
            >
              画面描述(prompt)
            </label>
            <Textarea
              id="asset-generate-prompt"
              data-slot="asset-generate-prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="描述要生成的画面。英文最稳、扁平/单色/无文字、主体 + 隐喻含义。"
              className="min-h-16 text-xs"
            />
            {initialPrompt ? (
              <p className="text-[10px] text-text-subtle">
                已从分镜「画面」字段带入初始描述,可自行修改。
              </p>
            ) : null}
          </div>

          {/* aspectRatio(`[gate-F3]` 默认跟随项目横竖屏) */}
          <div className="flex flex-col gap-1">
            <label
              htmlFor="asset-generate-aspect"
              className="text-[11px] font-medium text-muted-foreground"
            >
              画幅比例
            </label>
            <select
              id="asset-generate-aspect"
              data-slot="asset-generate-aspect"
              aria-label="画幅比例"
              value={aspectRatio}
              onChange={(e) => setAspectRatio(e.target.value)}
              className="h-8 w-fit rounded-control border border-border bg-surface px-2 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            >
              {ASPECT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <p className="text-[10px] text-text-subtle">
              默认跟随项目横竖屏({defaultAspectFor(outputAspectRatio)});抖音竖屏优先。
            </p>
            {showPortraitCropHint ? (
              // `[gate-F3]` provider 只横屏 → 显式提示,不静默产横屏低质候选。
              <p
                data-slot="asset-generate-crop-hint"
                className="rounded-control border border-warning/40 bg-warning/10 px-2 py-1 text-[10px] text-warning"
              >
                注意:部分文生视频 provider(如 MiniMax)默认仅出 16:9,若产出非竖屏,需你自行裁
                成 9:16 后再用。
              </p>
            ) : null}
          </div>

          {/* 未配禁用:该 kind 没配模型 → 引导去设置,不假装能生成(诚实)。 */}
          {!configured ? (
            <div
              data-slot="asset-generate-unconfigured"
              className="flex flex-col gap-1.5 rounded-card border border-border bg-surface-subtle p-2.5"
            >
              <p className="text-[11px] font-medium text-foreground">
                未配置{kind === "image" ? "文生图" : "文生视频"}模型
              </p>
              <p className="text-[11px] text-muted-foreground">
                AI 生成需要你先在设置里配好{kind === "image" ? "文生图" : "文生视频"}
                的 provider / model / key。
              </p>
              <a
                href="/settings"
                data-slot="asset-generate-settings-link"
                className="inline-flex h-7 w-fit items-center rounded-control bg-brand px-2.5 text-[11px] font-medium text-brand-foreground hover:bg-brand/90"
              >
                去设置配{kind === "image" ? "文生图" : "文生视频"}模型
              </a>
            </div>
          ) : null}

          {/* 门槛未过(未配 or 空 prompt)→ 只显禁用生成按钮(不 dispatch);过了 → 下方
              AdoptCandidateCard 承载真 start/候选/采纳。门槛在这层判,dispatch 入参才保证正确。 */}
          {!canGenerate ? (
            <div data-slot="asset-generate-gate" data-enabled="false">
              <button
                type="button"
                data-slot="asset-generate-start-disabled"
                disabled
                aria-disabled="true"
                className="inline-flex h-8 w-fit cursor-not-allowed items-center gap-1.5 rounded-control bg-surface-subtle px-3 text-xs font-medium text-muted-foreground opacity-70"
              >
                ✦ 生成{kind === "image" ? "图片" : "视频"}
              </button>
              {configured && promptEmpty ? (
                <p className="mt-1 text-[10px] text-text-subtle">
                  先填画面描述再生成。
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      </SectionCard>

      {/* dispatch/候选/采纳 —— 复用 AdoptCandidateCard(createAITask→poll→confirmTask 全流程)。
          门槛过了才渲染真 start,避免用户在未配 / 空 prompt 时误触 dispatch;dispatch 入参
          (projectId/prompt/kind/aspectRatio)由上方表单实时驱动。这里当作独立卡承接(不嵌套)。 */}
      {canGenerate ? (
        <div data-slot="asset-generate-gate" data-enabled="true">
          <AdoptCandidateCard<GeneratedAssetItem>
            title="生成候选"
            description="AI 生成的素材是候选,采纳后才绑定项目(铁律:AI 只产候选,人采纳)"
            startLabel={`✦ 生成${kind === "image" ? "图片" : "视频"}`}
            runningLabel="AI 正在生成素材(真出图/视频需配 key,可能要一会儿)…"
            taskType="asset.generate"
            inputData={inputData}
            parseItems={parseGenerated}
            renderItem={renderGenerated}
            adoptLabel={(n) => `采纳（${n}）绑定到当前项目`}
            doneLabel={(n) => `已采纳 ${n} 个素材进用料链(制作阶段)。`}
          />
        </div>
      ) : null}
    </div>
  );
}
