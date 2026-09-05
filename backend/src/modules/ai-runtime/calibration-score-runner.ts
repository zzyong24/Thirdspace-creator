import type { RequestContext } from "@creatoros/contract";
import type { CalibrationScoreOutput } from "@creatoros/ai-worker";
import {
  type CreativeContext,
} from "./creative-context";

// 编导评分共享提示与真实维度归一；模型执行和持久生命周期由Worker负责。
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
    status: string;
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
export function scoreFacets(
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
