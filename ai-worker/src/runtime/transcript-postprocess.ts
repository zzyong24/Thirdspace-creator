import type { LanguageModel } from "ai";
import type { ModelSpec } from "./provider-factory";
import { isAsrExecutionControlError } from "./asr-request";
import { GenerationFailure } from "../execution/generation-error";

export function isTranscriptExecutionControlError(error: unknown): boolean {
  return isAsrExecutionControlError(error) || (error instanceof GenerationFailure && error.outcome === 'unknown_result');
}

// [T-357] 采集逐字稿后处理 —— ASR 原始文本落库前的「轻 AI 校正」一遍:
//   ① 同音/近音认错字纠正(ASR 把「定位」听成「定为」类)
//   ② 补标点(ASR 原始输出常无标点)
//   ③ 按语义分段换行(整坨长文切自然段)
//
// 定位:**校正,不是改写**。与 T-320a(video.subtitles 对上传 SRT 依口播稿纠错)同任务族,
// 但采集场景没有口播稿参照 —— 靠可选注入的账号定位/作品标题上下文帮专名纠正(有就带,
// 没有裸纠),纠错条款(同音/近音、专名、改动最小、语气词不动)复用 T-320a 的打法。
//
// 铁律落点:
//   - 模型走 model-config capability 解析(TRANSCRIPT_POSTPROCESS_CAPABILITY),绝不写死厂商
//     (multimodal-models-user-configurable);capability 复用既有 `video.subtitles`(见下),
//     不新造一个还要用户去配的档。
//   - 结构化输出走 runStructuredNode 绑显式 JSON schema { correctedText }(ai-nodes-structured-
//     cross-model:自由文本 parse 在 MiniMax 下会 cancelled);内联模板不注册 registry
//     (同 material-summary 先例:借 capability + 内联 skill,不进 registry 契约面)。
//   - **失败诚实落原文不阻断**:模型未配置 / 调用失败 / 输出异常 / 越权改写 → 返回原文 +
//     applied:false + reason,取消和结果未知必须交回任务层。
//   - **防篡改护栏**:对输出做保真校验(去标点/空白后的长度比 + 编辑距离阈值,见
//     checkTranscriptFidelity),超阈值视为模型越权改写 → 弃用落原文。

/**
 * 后处理用的文本模型 capability。**复用既有 `video.subtitles`**,论证:
 *   - 语义最贴合:video.subtitles(T-320a)就是「ASR 认错字校正」任务族的既有档 —— 用户若为
 *     字幕纠错调过模型,逐字稿纠错自动同款(一处调优两处受益);
 *   - 它已是活 capability(制作视频四决策链 resolveModelSpec 同 id 在用),非新造;
 *   - 未配时 resolveLlmConfig 自动回退 `default` 行 → env → 内置默认,用户零新增配置负担
 *     (仓里无 script.rewrite 之类更贴的档;script.draft 是生成、script.review 是审核门专用)。
 */
export const TRANSCRIPT_POSTPROCESS_CAPABILITY = "video.subtitles";

// 内联 skill 模板(不注册 registry —— 同 material-summary 先例;outputSchema 走
// runStructuredNode 的显式逃生口,不依赖 registry 解析)。
// 纠错条款复用 T-320a video.subtitles 的打法:同音/近音认错字、专名、改动最小、
// 语气词/口语重复不动、拿不准不改。
export const TRANSCRIPT_POSTPROCESS_TEMPLATE = {
  id: "transcript.postprocess.inline",
  version: "v1",
  system: [
    "你是这位创作者的「逐字稿整理 agent」。输入是一段 ASR 机器转写的逐字稿原文(可能没有标点、",
    "不分段、含同音/近音认错字)。你只做三件事:①同音/近音认错字纠正 ②补标点 ③按语义分段换行。",
    "这是**校正**,不是改写 —— 绝不润色、绝不增删内容、绝不调整语序。",
  ].join("\n"),
  template: `整理下面这段 ASR 逐字稿:纠正认错字、补标点、按语义分段。
{{context}}
【逐字稿原文】
{{transcript}}

【只允许做的三件事】
1. 同音/近音认错字纠正:ASR 把某字/专名**听成同音或近音的错字**时,改回正确写法(如「定位」误作「定为」、产品名/人名/术语听错)。上面的账号定位/作品标题(若有)可作专名参照。
2. 补标点:按语义补全中文标点(,。?!、「」等),不改变任何字。
3. 分段换行:按语义把长文切成自然段(段落间用空行分隔),一般每段 2~5 句;不加标题、不加序号。

【硬约束(违反即废)】
- 逐字保真:除认错字替换外,**不增字、不删字、不换措辞、不调语序**;语气词、口语重复照原样保留。
- 拿不准是不是错字 → 一律不改(改动最小)。
- 不添加任何解释、总结、标题或原文没有的内容。

【输出】只输出一个 JSON 对象 {"correctedText": "整理后的全文"}(不要多余文字、不要代码块)。`,
  requiredFacets: ["transcript"] as const,
} as const;

// 输出契约(JSON Schema,经 ai 的 jsonSchema 包装喂 runStructuredNode;显式传入压过 registry)。
// 禁止模型自由发挥附加解释:schema 只有 correctedText 一个字段,additionalProperties:false。
export const TRANSCRIPT_POSTPROCESS_SCHEMA = {
  type: "object",
  properties: {
    correctedText: { type: "string" },
  },
  required: ["correctedText"],
  additionalProperties: false,
};

/** 模型吐的原始结构(校验前;对齐 runStructuredNode<T> 泛型)。 */
interface RawCorrected {
  correctedText?: unknown;
}

// ── 保真护栏(防篡改:校正≠改写)────────────────────────────────────────────────

/**
 * 保真比较前的归一化:剔除**全部空白 + 标点/符号**。后处理被允许的两类改动(补标点、
 * 分段换行)在归一化后完全不可见 —— 剩下的差异只能来自「字」的变化,恰好是要卡的维度。
 */
export function normalizeForFidelity(text: string): string {
  return text.replace(/[\s\p{P}\p{S}]+/gu, "");
}

/**
 * SEMANTIC_BOUNDARY_ALLOW: 仅用于 ASR 重叠片段去重/协议纠错，不参与内容归类、创作选择或素材匹配。
 * 带上限的编辑距离(banded Levenshtein):距离 ≤ maxDist 时返回真实距离,超过即早停返回
 * maxDist+1。只算 |i-j| ≤ maxDist 的带内格子,复杂度 O(n·maxDist) —— 逐字稿可达数千字,
 * 全量 O(n²) DP 会白烧;护栏只关心「是否超阈值」,带状 DP 足够且诚实。
 */
export function boundedEditDistance(
  a: string,
  b: string,
  maxDist: number,
): number {
  if (a === b) return 0;
  const n = a.length;
  const m = b.length;
  if (Math.abs(n - m) > maxDist) return maxDist + 1;
  const INF = maxDist + 1;
  let prev: number[] = new Array<number>(m + 1).fill(INF);
  let curr: number[] = new Array<number>(m + 1).fill(INF);
  for (let j = 0; j <= Math.min(m, maxDist); j++) prev[j] = j;
  for (let i = 1; i <= n; i++) {
    const from = Math.max(1, i - maxDist);
    const to = Math.min(m, i + maxDist);
    curr.fill(INF);
    curr[0] = i <= maxDist ? i : INF;
    let rowMin = curr[0]!;
    for (let j = from; j <= to; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const v = Math.min(prev[j]! + 1, curr[j - 1]! + 1, prev[j - 1]! + cost);
      curr[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > maxDist) return maxDist + 1; // 整行都超 → 不可能再回到阈值内,早停
    [prev, curr] = [curr, prev];
  }
  return prev[m]! <= maxDist ? prev[m]! : maxDist + 1;
}

/**
 * 保真阈值(带理由,防篡改护栏的「多少算越权」):
 *
 * - 长度比(归一化后 corrected/original)必须落在 [0.90, 1.10]:
 *   同音错字纠正是**等长(或近似等长)替换**,补标点/换行已被归一化剔除 —— 正常校正的
 *   归一化长度几乎不变;±10% 只为个别专名字数变化留余量。超出 = 模型增删了内容
 *   (续写/截断/总结),按越权改写弃用。
 * - 归一化编辑距离 ≤ 15%(占原文归一化长度):
 *   中文 ASR 字错率通常 <10%,纠错只动错字,正常校正的编辑距离远低于 15%;而润色/改写
 *   动辄 >30%。15% 给专名密集/口音重的场景留余量,同时稳稳挡住重写。
 */
export const FIDELITY_LENGTH_RATIO_MIN = 0.9;
export const FIDELITY_LENGTH_RATIO_MAX = 1.1;
export const FIDELITY_EDIT_DISTANCE_RATIO_MAX = 0.15;

export interface FidelityVerdict {
  ok: boolean;
  reason?: string;
}

/** 保真校验(纯函数):判模型输出是「校正」还是「越权改写」。 */
export function checkTranscriptFidelity(
  original: string,
  corrected: string,
): FidelityVerdict {
  if (!corrected.trim()) {
    return { ok: false, reason: "模型输出为空文本" };
  }
  const normO = normalizeForFidelity(original);
  const normC = normalizeForFidelity(corrected);
  const baseLen = Math.max(1, normO.length);
  const ratio = normC.length / baseLen;
  if (ratio < FIDELITY_LENGTH_RATIO_MIN || ratio > FIDELITY_LENGTH_RATIO_MAX) {
    return {
      ok: false,
      reason: `长度比 ${ratio.toFixed(2)} 超出保真区间 [${FIDELITY_LENGTH_RATIO_MIN}, ${FIDELITY_LENGTH_RATIO_MAX}](疑似增删内容)`,
    };
  }
  const maxDist = Math.ceil(baseLen * FIDELITY_EDIT_DISTANCE_RATIO_MAX);
  const dist = boundedEditDistance(normO, normC, maxDist);
  if (dist > maxDist) {
    return {
      ok: false,
      reason: `编辑距离超过原文 ${Math.round(FIDELITY_EDIT_DISTANCE_RATIO_MAX * 100)}%(疑似改写而非校正)`,
    };
  }
  return { ok: true };
}

// ── 主入口 ─────────────────────────────────────────────────────────────────────

export interface TranscriptPostprocessInput {
  /** ASR 原始逐字稿。 */
  transcript: string;
  signal?: AbortSignal;
  maxOutputTokens?: number;
  /** 可选上下文:账号定位一句话(帮专名纠正;没有就裸纠)。 */
  accountPositioning?: string;
  /** 可选上下文:作品标题(同上)。 */
  title?: string;
}

/** 后处理结果:applied=true 时 transcript 是校正稿;false 时是原文 + 未执行原因。 */
export type TranscriptPostprocessOutcome =
  | { applied: true; transcript: string }
  | { applied: false; transcript: string; reason: string };

export interface TranscriptPostprocessRuntimeDeps {
  /** 独立执行入口注入已有 durable model，保留每次真实调用的预算与回执。 */
  model?: LanguageModel;
  callStructured?: (input: {spec: ModelSpec; facets: Readonly<Record<string, string | undefined>>; signal?: AbortSignal; maxOutputTokens?: number; model?: LanguageModel}) => Promise<RawCorrected>;
}

// 默认结构化调用:modelFor(spec) + runStructuredNode(内联模板 + 显式 JSON schema)。
// 动态 import 与 material-summary / video-decisions 同款(backend 不静态吃 ai-worker 运行时)。
async function defaultCallStructured(input: {
  model?: LanguageModel;
  spec: ModelSpec;
  facets: Readonly<Record<string, string | undefined>>;
  signal?: AbortSignal;
  maxOutputTokens?: number;
}): Promise<RawCorrected> {
  const { modelFor } = await import("./provider-factory");
  const { runStructuredNode } = await import("../nodes/structured-node");
  const { jsonSchema } = await import("ai");
  const { object } = await runStructuredNode<RawCorrected>({
    model: input.model ?? modelFor(input.spec),
    signal: input.signal,
    maxOutputTokens: input.maxOutputTokens,
    template: TRANSCRIPT_POSTPROCESS_TEMPLATE,
    facets: input.facets,
    outputSchema: jsonSchema<RawCorrected>(
      TRANSCRIPT_POSTPROCESS_SCHEMA as Parameters<typeof jsonSchema>[0],
    ),
  });
  return object;
}

/** 组装可选上下文 facet(有就带,没有为空串 → bindPrompt 把占位替换成空)。 */
export function buildContextFacet(input: TranscriptPostprocessInput): string {
  const lines: string[] = [];
  if (input.accountPositioning?.trim()) {
    lines.push(`【账号定位(专名参照)】${input.accountPositioning.trim()}`);
  }
  if (input.title?.trim()) {
    lines.push(`【作品标题(专名参照)】${input.title.trim()}`);
  }
  return lines.length > 0 ? `\n${lines.join("\n")}\n` : "";
}

/**
 * 跑一遍采集逐字稿后处理(同音错字纠正 + 补标点 + 语义分段)。
 *
 * 普通失败(模型未配置 / 调用失败 / 输出异常 / 越权改写)→ 返回
 * { applied:false, transcript: 原文, reason },由调用方(transcribe-runner)把 reason
 * 注记进步骤日志 —— 转写链绝不因后处理挂掉(失败诚实落原文不阻断)。
 */
export async function runTranscriptPostprocessRuntime(
  spec: ModelSpec,
  input: TranscriptPostprocessInput,
  deps: TranscriptPostprocessRuntimeDeps = {},
): Promise<TranscriptPostprocessOutcome> {
  input.signal?.throwIfAborted();
  const original = input.transcript;
  if (!original.trim()) {
    return { applied: false, transcript: original, reason: "原文为空,跳过" };
  }

  // 2) 结构化调用(schema 卡死 { correctedText };失败 → 落原文)。
  let raw: RawCorrected;
  try {
    const call = deps.callStructured ?? defaultCallStructured;
    raw = await call({
      spec,
      model: deps.model,
      signal: input.signal,
      maxOutputTokens: input.maxOutputTokens,
      facets: {
        transcript: original,
        context: buildContextFacet(input),
      },
    });
    input.signal?.throwIfAborted();
  } catch (err) {
    input.signal?.throwIfAborted();
    if (isTranscriptExecutionControlError(err)) throw err;
    return {
      applied: false,
      transcript: original,
      reason: `模型调用失败:${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // 3) 输出形状 + 保真护栏(越权改写 → 弃用落原文)。
  const corrected =
    typeof raw?.correctedText === "string" ? raw.correctedText : "";
  const verdict = checkTranscriptFidelity(original, corrected);
  if (!verdict.ok) {
    return {
      applied: false,
      transcript: original,
      reason: `输出未过保真校验:${verdict.reason ?? "未知"}`,
    };
  }
  return { applied: true, transcript: corrected };
}
