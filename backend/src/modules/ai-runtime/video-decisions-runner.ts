import { z } from "zod";
import type { RequestContext } from "@creatoros/contract";
import type {
  ModelSpec,
  VideoScenesOutput,
  VideoCardsOutput,
  VideoBrollOutput,
  VideoSubtitlesOutput,
  VideoCardKind,
  VideoCardMotion,
} from "@creatoros/ai-worker";
import {
  videoScenesSchema,
  videoCardsSchema,
  videoBrollSchema,
  videoSubtitlesSchema,
} from "@creatoros/ai-worker";
import {
  parseSrt,
  srtStartSet,
  srtTotalDurationSec,
  nearestSrtStart,
  tokenizeForOverlap,
  type SrtLine,
} from "./srt";

// [T-254b] 制作视频「四决策」runner —— 执行层 video.render 管线的「脑」侧
// (SPEC 2026-07-11 §3.1 步骤 2-3):粗剪 SRT + 口播稿(+ 项目素材清单投影)→
//   ① 语义分场 video.scenes ② 信息卡 video.cards ③ B-roll 匹配 video.broll
//   ④ 双语字幕 video.subtitles
// 四个 runStructuredNode 顺序编排(runVideoDecisions),产完整决策 JSON 记成
// `video_decisions` 候选(awaiting_confirmation)→ 前端「分场预览卡」用户过目可改,
// 确认才组装 props 交渲染(铁律②:决策不落库、不渲染,除非用户采纳)。
//
// 跨模型稳定三板斧(SPEC 明写,MiniMax 必须可跑):
//   1. **动态 zod refine**(buildXxxDecisionSchema,以 outputSchema 逃生口传给
//      runStructuredNode):场景边界/插点须离某 SRT 行 start ≤ SNAP_TOLERANCE_SEC、
//      B-roll assetId 必须在清单集合内、字幕行数/序号集不得变 —— 不合 → SDK 自动重试;
//   2. **后处理吸附**:重试过关后仍可能有小偏差,一律 nearestSrtStart 吸附到行 start;
//   3. **可溯剔除**(T-224 同源诚实门):信息卡 content 的数字/关键词必须在口播原文
//      出现,不满足**剔除**(绝不带编造数值进预览卡);B-roll assetId 清单外剔除。
//
// 模型全走 model-config 用户可配:capability = skill id(video.scenes 等),未配回退 default。

/** 决策吸附容差(秒):模型给的时间离最近 SRT 行 start 超过它 → schema refine 失败重试。 */
export const SNAP_TOLERANCE_SEC = 2.5;

export const VIDEO_DECISIONS_TASK_TYPE = "video.decisions";
/** 候选结果 resultType(recordCandidate;T-254c 预览卡从 result 行读它)。 */
export const VIDEO_DECISIONS_RESULT_TYPE = "video_decisions";

// ── 决策产物类型(预览卡/props 组装的输入形状)────────────────────────────────

export interface VideoScene {
  title: string;
  startSec: number;
  endSec: number;
  summary: string;
}

export interface VideoInfoCard {
  sceneIdx: number;
  kind: VideoCardKind;
  content: string;
  at: number;
  /** [T-295] 动画意图(决策层可选产出;缺省组装器/template 按 kind 派生)。 */
  motion?: VideoCardMotion;
}

export interface VideoBrollPick {
  sceneIdx: number;
  assetId: string;
  at: number;
  durationSec: number;
}

export interface BilingualSubtitleLine {
  index: number;
  startSec: number;
  endSec: number;
  zh: string;
  en: string;
}

/** 素材清单投影(项目 material-links/assets 的 label+描述,B-roll 决策的唯一可选集)。 */
export interface BrollAssetRef {
  assetId: string;
  label: string;
  kind: string;
  description: string;
}

/** 四决策完整产物(预览卡渲染 + 确认后组装 props 的单一输入)。 */
export interface VideoDecisions {
  scenes: VideoScene[];
  cards: VideoInfoCard[];
  broll: VideoBrollPick[];
  subtitles: BilingualSubtitleLine[];
  /** 解析后的 SRT(时间真值,预览卡显示字幕样例/组 props 都要)。 */
  srtLines: SrtLine[];
}

// ── 动态输出契约(zod refine,绑定本次输入;runStructuredNode outputSchema 逃生口)──

/** ① 分场:非空 + 每场 startSec 离某 SRT 行 start ≤ 容差(endSec 由后处理推导,不卡)。 */
export function buildScenesDecisionSchema(srtStarts: readonly number[]) {
  return videoScenesSchema.refine(
    (o) =>
      o.scenes.length > 0 &&
      o.scenes.every(
        (s) =>
          Math.abs(s.startSec - nearestSrtStart(s.startSec, srtStarts)) <=
          SNAP_TOLERANCE_SEC,
      ),
    { message: "场景边界必须落在 SRT 行 start 集合上(容差内)" },
  );
}

/** ② 信息卡:sceneIdx 越界即废;at 离某 SRT 行 start ≤ 容差。 */
export function buildCardsDecisionSchema(
  sceneCount: number,
  srtStarts: readonly number[],
) {
  return videoCardsSchema.refine(
    (o) =>
      o.cards.every(
        (c) =>
          c.sceneIdx >= 0 &&
          c.sceneIdx < sceneCount &&
          Math.abs(c.at - nearestSrtStart(c.at, srtStarts)) <=
            SNAP_TOLERANCE_SEC,
      ),
    { message: "卡片 sceneIdx 必须在场景范围内、at 必须落在 SRT 行 start(容差内)" },
  );
}

/** ③ B-roll:assetId 必须在清单集合内(精确匹配禁近似的 schema 面);sceneIdx 越界即废。 */
export function buildBrollDecisionSchema(
  assetIds: readonly string[],
  sceneCount: number,
) {
  const idSet = new Set(assetIds);
  return videoBrollSchema.refine(
    (o) =>
      o.broll.every(
        (b) =>
          idSet.has(b.assetId) && b.sceneIdx >= 0 && b.sceneIdx < sceneCount,
      ),
    { message: "B-roll assetId 必须来自素材清单(禁编造),sceneIdx 必须在场景范围内" },
  );
}

/** ④ 双语字幕:行数不变 + 序号集合与输入一致(时间轴由后处理强制回原值)。 */
export function buildSubtitlesDecisionSchema(srtLines: readonly SrtLine[]) {
  const wanted = new Set(srtLines.map((l) => l.index));
  return videoSubtitlesSchema.refine(
    (o) =>
      o.lines.length === srtLines.length &&
      o.lines.every((l) => wanted.has(l.index)) &&
      new Set(o.lines.map((l) => l.index)).size === o.lines.length,
    { message: "字幕行数/序号必须与输入 SRT 一一对应(禁增删并行)" },
  );
}

// ── 可溯校验(T-224 同源:数值/文案只认口播原文)────────────────────────────────

const NUMBER_RE = /\d+(?:\.\d+)?/g;

/**
 * 信息卡 content 是否可溯源于口播原文:
 *   a) content 里出现的**每个数字**必须在原文出现(一个编造数值即废);
 *   b) content 与原文至少共享一个可核锚点(CJK 连续片段的 4-gram,短片段整段;或
 *      长度 ≥3 的拉丁 token)。锚点集为空且无数字 → 无从核验,按剔除处理(诚实门)。
 */
export function isCardContentTraceable(
  content: string,
  script: string,
): boolean {
  const numbers = content.match(NUMBER_RE) ?? [];
  for (const n of numbers) if (!script.includes(n)) return false;

  const anchors: string[] = [];
  const cjkRuns = content.match(/[一-鿿㐀-䶿]{2,}/g) ?? [];
  for (const run of cjkRuns) {
    if (run.length <= 4) anchors.push(run);
    else for (let i = 0; i + 4 <= run.length; i++) anchors.push(run.slice(i, i + 4));
  }
  for (const t of tokenizeForOverlap(content))
    if (/^[a-z]/.test(t) && t.length >= 3) anchors.push(t);

  if (anchors.length === 0) return numbers.length > 0;
  const scriptLower = script.toLowerCase();
  return anchors.some((a) => scriptLower.includes(a));
}

// ── facet 序列化(模板占位块)────────────────────────────────────────────────

const sec = (n: number) => (Math.round(n * 100) / 100).toString();

export function srtFacet(lines: readonly SrtLine[]): string {
  return lines
    .map((l) => `${l.index} | ${sec(l.startSec)}s-${sec(l.endSec)}s | ${l.text}`)
    .join("\n");
}

export function scenesFacet(scenes: readonly VideoScene[]): string {
  return scenes
    .map(
      (s, i) =>
        `${i} | ${sec(s.startSec)}s-${sec(s.endSec)}s | ${s.title} | ${s.summary}`,
    )
    .join("\n");
}

export function libraryFacet(inventory: readonly BrollAssetRef[]): string {
  return inventory
    .map(
      (a) =>
        `· ${a.assetId} | ${a.label}${a.kind ? ` (${a.kind})` : ""}${
          a.description ? ` | ${a.description}` : ""
        }`,
    )
    .join("\n");
}

// ── 结构化调用抽象(默认走 runStructuredNode;测试注入 fake)────────────────────

export interface StructuredCallInput<T> {
  /** skill id(registry 模板 + resolveModelSpec capability 同名)。 */
  skillId: string;
  facets: Readonly<Record<string, string | undefined>>;
  /** 动态输出契约(buildXxxDecisionSchema;逃生口压过 registry 静态 schema)。 */
  outputSchema: z.ZodType<T>;
}
export type StructuredCall = <T>(input: StructuredCallInput<T>) => Promise<T>;

// ── 四决策函数(纯编排:调模型 → 后处理吸附/剔除;各自可独测)──────────────────

/** ① 语义分场:边界吸附 SRT 行 start,排序去重,首场对齐首行,endSec = 下场 start / 总时长。 */
export async function decideScenes(
  input: { srtLines: readonly SrtLine[]; script: string },
  call: StructuredCall,
): Promise<VideoScene[]> {
  const starts = srtStartSet(input.srtLines);
  const out = await call<VideoScenesOutput>({
    skillId: "video.scenes",
    facets: { srt: srtFacet(input.srtLines), script: input.script },
    outputSchema: buildScenesDecisionSchema(starts),
  });
  const total = srtTotalDurationSec(input.srtLines);
  // 吸附 → 按 start 排序 → 同一 start 去重(保留先出现的)。
  const snapped = out.scenes
    .map((s) => ({ ...s, startSec: nearestSrtStart(s.startSec, starts) }))
    .sort((a, b) => a.startSec - b.startSec)
    .filter((s, i, arr) => i === 0 || s.startSec !== arr[i - 1]!.startSec);
  if (snapped.length === 0) throw new Error("分场结果为空");
  // 首场强制从第一行起(不留片头空洞);endSec 一律推导(下一场 start / 总时长),不信模型。
  snapped[0] = { ...snapped[0]!, startSec: starts[0] ?? 0 };
  return snapped.map((s, i) => ({
    title: s.title.trim(),
    startSec: s.startSec,
    endSec: i + 1 < snapped.length ? snapped[i + 1]!.startSec : total,
    summary: s.summary.trim(),
  }));
}

/** ② 信息卡:at 吸附 + 钳进所属场景;content 可溯校验不过 → 剔除(诚实门)。 */
export async function decideCards(
  input: {
    scenes: readonly VideoScene[];
    srtLines: readonly SrtLine[];
    script: string;
  },
  call: StructuredCall,
): Promise<VideoInfoCard[]> {
  const starts = srtStartSet(input.srtLines);
  const out = await call<VideoCardsOutput>({
    skillId: "video.cards",
    facets: {
      scenes: scenesFacet(input.scenes),
      srt: srtFacet(input.srtLines),
      script: input.script,
    },
    outputSchema: buildCardsDecisionSchema(input.scenes.length, starts),
  });
  const kept: VideoInfoCard[] = [];
  for (const c of out.cards) {
    const scene = input.scenes[c.sceneIdx];
    if (!scene) continue; // fake/兜底路径可能没过 refine,双保险
    const content = c.content.trim();
    if (!content) continue;
    // 可溯校验(T-224 同源):数值/关键词不在口播原文 → 剔除,绝不带编造进预览卡。
    if (!isCardContentTraceable(content, input.script)) continue;
    // at:先钳进场景范围,再吸附行 start(吸附结果仍钳一次,防吸到邻场行)。
    const clamped = Math.min(
      Math.max(c.at, scene.startSec),
      Math.max(scene.startSec, scene.endSec - 0.001),
    );
    const sceneStarts = starts.filter(
      (s) => s >= scene.startSec && s < scene.endSec,
    );
    const at = nearestSrtStart(
      clamped,
      sceneStarts.length > 0 ? sceneStarts : starts,
    );
    // [T-295] motion 原样透传(模型不产就不带;缺省由 template 按 kind 派生)。
    kept.push({
      sceneIdx: c.sceneIdx,
      kind: c.kind,
      content,
      at,
      ...(c.motion ? { motion: c.motion } : {}),
    });
  }
  return kept;
}

/** ③ B-roll:清单为空诚实跳过(不编);assetId 清单外剔除;at 吸附;时长钳进场景。 */
export async function decideBroll(
  input: {
    scenes: readonly VideoScene[];
    srtLines: readonly SrtLine[];
    inventory: readonly BrollAssetRef[];
  },
  call: StructuredCall,
): Promise<VideoBrollPick[]> {
  if (input.inventory.length === 0) return []; // 没有素材就没有 B-roll(宁缺毋滥,不调模型)
  const starts = srtStartSet(input.srtLines);
  const ids = input.inventory.map((a) => a.assetId);
  const out = await call<VideoBrollOutput>({
    skillId: "video.broll",
    facets: {
      scenes: scenesFacet(input.scenes),
      library: libraryFacet(input.inventory),
    },
    outputSchema: buildBrollDecisionSchema(ids, input.scenes.length),
  });
  const idSet = new Set(ids);
  const kept: VideoBrollPick[] = [];
  for (const b of out.broll) {
    if (!idSet.has(b.assetId)) continue; // 硬规则:清单外即编造,剔除
    const scene = input.scenes[b.sceneIdx];
    if (!scene) continue;
    const sceneStarts = starts.filter(
      (s) => s >= scene.startSec && s < scene.endSec,
    );
    const at = nearestSrtStart(
      Math.min(Math.max(b.at, scene.startSec), scene.endSec),
      sceneStarts.length > 0 ? sceneStarts : starts,
    );
    // 时长:至少 1s,不越过场景末尾。
    const maxDur = Math.max(1, scene.endSec - at);
    const durationSec = Math.min(Math.max(b.durationSec, 1), maxDur);
    kept.push({ sceneIdx: b.sceneIdx, assetId: b.assetId, at, durationSec });
  }
  return kept;
}

/** zh 校正「改动最小」守门阈值:与原行 token 相似度低于它 → 视为重写,退回原文。 */
export const SUBTITLE_REWRITE_GUARD = 0.6;

// 两段文本的 token 集 Dice 相似度(与 srt.ts 相似度同款 token 化)。
function lineSimilarity(a: string, b: string): number {
  const sa = new Set(tokenizeForOverlap(a));
  const sb = new Set(tokenizeForOverlap(b));
  if (sa.size === 0 && sb.size === 0) return 1;
  if (sa.size === 0 || sb.size === 0) return 0;
  let inter = 0;
  for (const t of sa) if (sb.has(t)) inter++;
  return (2 * inter) / (sa.size + sb.size);
}

/** ④ 双语字幕:行数/时间轴不变(时间从原行回填);zh 改动过大退回原文(改动最小铁律)。 */
export async function decideSubtitles(
  input: { srtLines: readonly SrtLine[] },
  call: StructuredCall,
): Promise<BilingualSubtitleLine[]> {
  const out = await call<VideoSubtitlesOutput>({
    skillId: "video.subtitles",
    facets: { srt: srtFacet(input.srtLines) },
    outputSchema: buildSubtitlesDecisionSchema(input.srtLines),
  });
  const byIndex = new Map(out.lines.map((l) => [l.index, l]));
  return input.srtLines.map((orig) => {
    const got = byIndex.get(orig.index);
    let zh = (got?.zh ?? "").trim() || orig.text;
    // 「ASR 错字校正,改动最小」守门:改得面目全非(相似度 < 阈值)→ 退回原文。
    if (lineSimilarity(zh, orig.text) < SUBTITLE_REWRITE_GUARD) zh = orig.text;
    return {
      index: orig.index,
      startSec: orig.startSec, // 时间轴永远回填原值 —— 模型无权改时钟
      endSec: orig.endSec,
      zh,
      en: (got?.en ?? "").trim(),
    };
  });
}

// ── 编排入口 runVideoDecisions(live dispatch 范式:persistence-client void 调用)──

export interface VideoDecisionsTask {
  id: string;
  projectId: string | null;
  /** { srtText: string; script: string } —— T-254c 创建任务时装入。 */
  inputData: Record<string, unknown>;
}

export interface VideoDecisionsDeps {
  ai: {
    markRunning(ctx: RequestContext, taskId: string): Promise<unknown>;
    recordStep(
      ctx: RequestContext,
      taskId: string,
      step: { stepNo: number; kind: string; text: string; toolCalls: unknown[] },
    ): Promise<unknown>;
    recordCandidate(
      ctx: RequestContext,
      taskId: string,
      result: { resultType: string; resultData: Record<string, unknown> },
    ): Promise<unknown>;
    cancelTask(ctx: RequestContext, taskId: string): Promise<unknown>;
  };
  /** 按 capability 解析用户配的 model(video.scenes 等;未配回退 default)。 */
  resolveModelSpec: (
    ctx: RequestContext,
    capability: string,
  ) => Promise<ModelSpec>;
  /** 素材清单投影(项目 material-links⋈assets 的 label+描述;composition root 绑)。 */
  listBrollInventory: (
    ctx: RequestContext,
    projectId: string | null,
  ) => Promise<BrollAssetRef[]>;
  /** 测试逃生口:替换真模型调用(默认 modelFor + runStructuredNode + registry 模板)。 */
  callStructured?: StructuredCall;
}

// 默认结构化调用:capability=skillId 解析用户配的 model,registry 取(可被 skill_config_overrides
// 覆盖的)模板,动态 schema 走 outputSchema 逃生口(压过 registry 静态 schema —— 约束绑定本次输入)。
function makeDefaultCall(
  ctx: RequestContext,
  deps: Pick<VideoDecisionsDeps, "resolveModelSpec">,
): StructuredCall {
  return async <T>(input: StructuredCallInput<T>): Promise<T> => {
    const spec = await deps.resolveModelSpec(ctx, input.skillId);
    const { modelFor, runStructuredNode, getTemplate } = await import(
      "@creatoros/ai-worker"
    );
    const { object } = await runStructuredNode<T>({
      model: modelFor(spec),
      template: getTemplate(input.skillId),
      facets: input.facets,
      outputSchema: input.outputSchema,
    });
    return object;
  };
}

/** 四步中文名(步骤流/失败报错共用 —— 任一步失败诚实报是哪一步)。 */
export const VIDEO_DECISION_STEPS = [
  "①语义分场",
  "②信息卡",
  "③B-roll 匹配",
  "④双语字幕",
] as const;

/**
 * 编排入口:顺序跑四决策 → recordCandidate(video_decisions,awaiting_confirmation)。
 * 任一步失败:recordStep(kind:"failed",text 指明是哪一步)+ cancelTask(诚实终态,绝不卡
 * running、绝不落半套决策)。产物含素材清单快照(预览卡 B-roll 换选下拉直接用,免再取)。
 */
export async function runVideoDecisions(
  ctx: RequestContext,
  task: VideoDecisionsTask,
  deps: VideoDecisionsDeps,
): Promise<void> {
  let stepIdx = -1; // 失败时指认的当前步(-1 = 备料/解析)
  try {
    await deps.ai.markRunning(ctx, task.id);
    const srtText =
      typeof task.inputData.srtText === "string" ? task.inputData.srtText : "";
    const script =
      typeof task.inputData.script === "string" ? task.inputData.script : "";
    const srtLines = parseSrt(srtText);
    if (srtLines.length === 0) {
      throw new Error("SRT 解析不出任何字幕行(备料:请检查上传的 SRT 文件)");
    }
    if (!script.trim()) {
      throw new Error("缺少口播稿(备料:script 为空,信息卡可溯校验无从谈起)");
    }
    const call = deps.callStructured ?? makeDefaultCall(ctx, deps);

    const step = async (i: number, text: string) => {
      await deps.ai.recordStep(ctx, task.id, {
        stepNo: i + 1,
        kind: "decision",
        text,
        toolCalls: [],
      });
    };

    stepIdx = 0;
    const scenes = await decideScenes({ srtLines, script }, call);
    await step(0, `${VIDEO_DECISION_STEPS[0]}:${scenes.length} 场`);

    stepIdx = 1;
    const cards = await decideCards({ scenes, srtLines, script }, call);
    await step(1, `${VIDEO_DECISION_STEPS[1]}:${cards.length} 张(可溯校验后)`);

    stepIdx = 2;
    const inventory = await deps.listBrollInventory(ctx, task.projectId);
    const broll = await decideBroll({ scenes, srtLines, inventory }, call);
    await step(
      2,
      inventory.length === 0
        ? `${VIDEO_DECISION_STEPS[2]}:素材清单为空,诚实跳过`
        : `${VIDEO_DECISION_STEPS[2]}:${broll.length} 条(清单 ${inventory.length} 项)`,
    );

    stepIdx = 3;
    const subtitles = await decideSubtitles({ srtLines }, call);
    await step(3, `${VIDEO_DECISION_STEPS[3]}:${subtitles.length} 行`);

    const decisions: VideoDecisions = { scenes, cards, broll, subtitles, srtLines };
    await deps.ai.recordCandidate(ctx, task.id, {
      resultType: VIDEO_DECISIONS_RESULT_TYPE,
      resultData: {
        decisions: decisions as unknown as Record<string, unknown>,
        // 素材清单快照:预览卡 B-roll 换选下拉的选项集(与决策同一次投影,防漂移)。
        inventory,
      },
    });
  } catch (err) {
    const where =
      stepIdx >= 0 ? VIDEO_DECISION_STEPS[stepIdx] : "备料(SRT/口播稿校验)";
    try {
      await deps.ai.recordStep(ctx, task.id, {
        stepNo: stepIdx + 2,
        kind: "failed",
        text: `${where} 失败:${err instanceof Error ? err.message : String(err)}`,
        toolCalls: [],
      });
    } catch {
      /* 留痕失败不阻断终态 */
    }
    try {
      await deps.ai.cancelTask(ctx, task.id);
    } catch {
      /* already terminal */
    }
    // eslint-disable-next-line no-console
    console.error(
      `[video-decisions-runner] ${where} failed for task ${task.id}:`,
      err,
    );
  }
}
