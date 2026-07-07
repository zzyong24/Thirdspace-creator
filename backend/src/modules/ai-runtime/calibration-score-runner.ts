import type { RequestContext } from "@creatoros/contract";
import type { AiService } from "@creatoros/backend/modules/ai";
import type { ModelSpec, CalibrationScoreOutput } from "@creatoros/ai-worker";
import {
  assembleCreativeContext,
  type ContextDeps,
  type CreativeContext,
} from "./creative-context";

// B2 编导自动评分 runner (calibration.score node, 数据底座 SPEC §5 / §2 回看·校准). 把校准从
// 「手填维度分」翻成「编导读真实指标自动评分,人审核」。
//
// 输入 = 一条**已锁定盲预测**的维度(key + 当初预测分)+ 该作品**发布后的真实指标**
// (播放/完播/点赞/评论/转化,从 analytics/metric 经注入端口读;不跨模块直连 repo,SPEC §22)。
// 输出 = 每个维度的**真实评分 1-5 候选** + 一句据真实数据的理由(结构化,Zod schema 卡死)。
//
// 铁律(产品定位 §9 / SPEC §0):
//   - 全程 Vercel AI SDK:resolveModelSpec 按 capability 解析 model + 跑 ai-worker 结构化模板节点
//     (外置 calibration.score 模板 + generateObject 绑 Zod,每轮 schema 约束、校验失败自动重试)。
//   - AI 只产候选:记一条 **不可 formalize** 的 `calibration_score` 候选(resultData.dimensions),
//     前端读它**预填**录入框,人改/确认后走现有 createResult(采纳门)落 calibration_result。
//     本 runner **绝不**直接写 calibration_result(那是人确认后 backend service 的活)。
//   - 提示词外置模板;不造轮子:复用现有 calibration 维度约定 + 录入表单,不另起一套。

// 维度真实分候选 schema(calibrationScoreSchema)定义在 @creatoros/ai-worker(本仓 zod 依赖只在
// ai-worker / backend / contract;frontend 不直引 zod)。generateObject 在下面的 dynamic import
// 块里绑它,模型必须吐这个形状(score 1-5 整数),校验失败 Vercel SDK 自动重试(每轮 schema 约束)。
// 这里只引**类型**(type-only,安全),schema 值在运行时取。
type CalibrationScore = CalibrationScoreOutput;

// 一个维度的真实分候选(前端预填录入框读它)。
export interface ScoreDimensionResult {
  key: string;
  score: number; // 1–5 整数
  reason: string;
}

// Narrow read port — 被评分的那条**已锁定盲预测**(标题 + 维度 key/label/当初预测分 + 该作品
// 真实指标的归属主体)。绑到 calibration 的 getPrediction(ownership-gated)+ rubric 维度 label。
export interface ScorePredictionReader {
  get(
    ctx: RequestContext,
    predictionId: string,
  ): Promise<{
    subjectType: "content_output" | "publication";
    subjectId: string;
    title: string;
    // 维度 key + label + 当初盲预测分(label 由 rubric version 解析,取不到回退 key)。
    dimensions: Array<{ key: string; label: string; predicted: number | null }>;
  }>;
}

// 一条真实指标(键 + 数值 + 单位)。键名对齐 douyin 真实采集 / seed:
// views/likes/comments/shares/favorites/finish_rate/follower_gain 等。
export interface MetricItem {
  key: string;
  value: number;
  unit?: string;
}

// Narrow read port — 该作品**发布后的真实指标**。绑到 analytics(经 publishing 解析作品→发布)的
// 公共 service(不跨模块直连 repo,SPEC §22)。无快照 → 返回 [](诚实:界面/提示词标「暂无真实指标」)。
export interface ScoreMetricsReader {
  forSubject(
    ctx: RequestContext,
    subjectType: "content_output" | "publication",
    subjectId: string,
  ): Promise<MetricItem[]>;
}

export interface CalibrationScoreDeps extends ContextDeps {
  ai: AiService;
  /** 按 capability 解析用户配的 model(Vercel SDK)。 */
  resolveModelSpec: (
    ctx: RequestContext,
    capability: string,
  ) => Promise<ModelSpec>;
  prediction: ScorePredictionReader;
  metrics: ScoreMetricsReader;
}

export interface CalibrationScoreTask {
  id: string;
  inputData: Record<string, unknown>;
}

// 真实指标 → 提示词 metricsBlock(一行一个指标,中文标签 + 数值)。无真实指标时给诚实兜底串
// (模型据此「按现有信息保守给分并说明依据有限」,而非编造)。
const METRIC_LABELS: Record<string, string> = {
  views: "播放量",
  likes: "点赞数",
  comments: "评论数",
  shares: "转发数",
  favorites: "收藏数",
  finish_rate: "完播率",
  follower_gain: "涨粉数",
  conversion: "转化数",
};
function metricsBlock(metrics: MetricItem[]): string {
  if (metrics.length === 0) {
    return "（暂无采集到的真实指标——请基于标题与定位做尽力评分，并在理由里说明真实数据缺失）";
  }
  return metrics
    .map((m) => {
      const label = METRIC_LABELS[m.key] ?? m.key;
      const unit = m.unit ? m.unit : "";
      return `· ${label}（${m.key}）：${m.value}${unit}`;
    })
    .join("\n");
}

// 维度 + 当初预测分 → 提示词 rubricBlock(一行一个维度,带 key/label/当初盲预测分)。
function rubricBlock(
  dimensions: Array<{ key: string; label: string; predicted: number | null }>,
): string {
  return dimensions
    .map((d, i) => {
      const pred =
        d.predicted !== null ? `当初盲预测 ${d.predicted} 分` : "当初未给预测分";
      return `${i + 1}. ${d.label}（key=${d.key}）—— ${pred}`;
    })
    .join("\n");
}

// 把 CreativeContext + prediction 维度 + 真实指标映射成 calibration.score 模板的 facets。
function scoreFacets(
  context: CreativeContext,
  subjectTitle: string,
  dimensions: Array<{ key: string; label: string; predicted: number | null }>,
  metrics: MetricItem[],
): Record<string, string | undefined> {
  return {
    positioning: context.positioningBrief
      ? context.positioningBrief
      : "（创作者尚未设置定位——按通用爆款逻辑判断）",
    subjectTitle: subjectTitle || "（未命名作品）",
    rubricBlock: rubricBlock(dimensions),
    metricsBlock: metricsBlock(metrics),
  };
}

// 把模型已校验的结构化输出收敛到 prediction 的真实维度 key 上(幻觉 key 丢弃;score 已被 Zod
// 卡在 1-5 整数)。返回的每个维度都对得上一条真实盲预测维度,前端据 key 预填对应录入框。
export function normalizeScore(
  object: CalibrationScore,
  rubricKeys: Set<string>,
): ScoreDimensionResult[] {
  const out: ScoreDimensionResult[] = [];
  for (const d of object.dimensions) {
    if (!rubricKeys.has(d.key)) continue; // 只保留真实盲预测维度
    out.push({
      key: d.key,
      score: d.score,
      reason: typeof d.reason === "string" ? d.reason.trim() : "",
    });
  }
  return out;
}

// Orchestrate one calibration.score task end to end. Owns its lifecycle: on any failure
// (missing predictionId, prediction has no dimensions, schema-invalid output even after
// Vercel SDK retries, LlmCredentialError when no key is configured) it cancels the task
// (→ a terminal the UI renders as 失败) so it never lingers in `running`. Swallows so a
// background failure never crashes the server.
export async function runCalibrationScore(
  ctx: RequestContext,
  task: CalibrationScoreTask,
  deps: CalibrationScoreDeps,
): Promise<void> {
  try {
    await deps.ai.markRunning(ctx, task.id); // honest status while the LLM works
    const predictionId =
      typeof task.inputData.predictionId === "string"
        ? task.inputData.predictionId
        : "";
    if (!predictionId) {
      throw new Error(
        "calibration-score-runner: inputData.predictionId is required",
      );
    }
    // Read the locked prediction's dimensions (ownership-gated) + the subject's REAL
    // metrics (analytics, via the injected port — no cross-module repo import).
    const prediction = await deps.prediction.get(ctx, predictionId);
    if (prediction.dimensions.length === 0) {
      throw new Error(
        "calibration-score-runner: prediction has no scoring dimensions",
      );
    }
    const metrics = await deps.metrics.forSubject(
      ctx,
      prediction.subjectType,
      prediction.subjectId,
    );
    const context = await assembleCreativeContext(
      ctx,
      { projectId: null, topic: prediction.title, angle: "" },
      deps,
    );
    // Vercel AI SDK 路径:按 capability 解析 model + 跑 ai-worker 结构化模板节点(外置
    // calibration.score 模板 + generateObject 绑 Zod,每轮 schema 约束 + 校验失败自动重试)。
    // outputSchema **不再手传** —— runStructuredNode 从 registry 取(SPEC §4.2 统一防发散入口,
    // 还吃 JSON Schema 配置覆盖);此处只用泛型把回来的 object 标成 CalibrationScoreOutput。
    const spec = await deps.resolveModelSpec(ctx, "calibration.score");
    // T-040b:运行时 getTemplate 取被服务端覆盖后的 REGISTRY 对象(而非编译期 import 快照),
    // 让 calibration.score 的 system/template/tools 也能吃到 skill_config_overrides 覆盖。
    const { modelFor, runStructuredNode, getTemplate } =
      await import("@creatoros/ai-worker");
    const { object } = await runStructuredNode<CalibrationScoreOutput>({
      model: modelFor(spec),
      template: getTemplate("calibration.score"),
      facets: scoreFacets(
        context,
        prediction.title,
        prediction.dimensions,
        metrics,
      ),
    });
    const dimensions = normalizeScore(
      object,
      new Set(prediction.dimensions.map((d) => d.key)),
    );
    if (dimensions.length === 0) {
      throw new Error(
        "calibration-score-runner: model returned no usable dimension score",
      );
    }
    // Record a NON-formalizing `calibration_score` candidate (resultData.dimensions). The
    // frontend reads it via listTaskResults to **prefill** the 录入真实表现 form; the human
    // edits/confirms and the existing createResult path (采纳门) lands the calibration_result.
    // This runner NEVER writes calibration_result directly (铁律②). We also echo the
    // predictionId so the FE binds the candidate to the right prediction.
    await deps.ai.recordCandidate(ctx, task.id, {
      resultType: "calibration_score",
      resultData: {
        predictionId,
        dimensions,
        // 真实指标随候选回带 —— 前端可在录入框旁展示「依据了哪些真实数据」。
        metrics: metrics.map((m) => ({ key: m.key, value: m.value })),
      },
    });
  } catch (err) {
    try {
      await deps.ai.cancelTask(ctx, task.id);
    } catch {
      /* task may already be terminal */
    }
    // eslint-disable-next-line no-console
    console.error(
      `[calibration-score-runner] score failed for task ${task.id}:`,
      err,
    );
  }
}
