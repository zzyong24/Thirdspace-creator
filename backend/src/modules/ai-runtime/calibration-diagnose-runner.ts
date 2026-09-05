import type { RequestContext } from "@creatoros/contract";
import type { DiagnosisOutput } from "@creatoros/ai-worker";
import {
  type CreativeContext,
} from "./creative-context";
import { parseJsonLoose } from "./llm/parse";

// 编导诊断共享提示与归一；prepare/project由calibration-positioning-business-adapters承接，执行生命周期归Worker。

// One dimension score the agent returns (the 中栏 评分表 row): rubric key + 1–5 + 理由 + 建议.
export interface DiagnosisDimensionScore {
  key: string;
  score: number; // 1–5
  reason: string;
  suggestion: string;
}

// The full 诊断 the agent returns (writer ↔ confirm contract).
export interface CalibrationDiagnosis {
  dimensions: DiagnosisDimensionScore[];
  // 发布前预测表现 chips (0–100 or null when 拿不准).
  performance: {
    完播率: number | null;
    收藏率: number | null;
    评论率: number | null;
    转化意向: number | null;
  };
  verdict: string; // 综合判断一句
  mainIssues: string[]; // 主要问题
  priorityFixes: string[]; // 优先修改
  confidence: "high" | "med" | "low";
}

// Narrow read port — the subject's title + 文稿 the runner diagnoses. Bound at the
// composition root to the projects/artifacts services (ownership-gated). The scriptText is
// the storyboard / content text the agent reasons against; "" when the subject has no
// drafted文稿 yet (the agent then scores from title + context only).
export interface DiagnosisSubjectReader {
  get(
    ctx: RequestContext,
    subjectType: string,
    subjectId: string,
  ): Promise<{ title: string; scriptText: string }>;
}

// Narrow read port — the creator's current 变现加权 rubric (version id + dimensions). Bound
// to the calibration service's getCurrentRubricVersion. The agent scores exactly these
// dimensions (key + label + the 0/3/5 anchor description when present).
export interface DiagnosisRubricReader {
  current(
    ctx: RequestContext,
  ): Promise<{
    rubricVersionId: string;
    dimensions: Array<{ key: string; label: string; description?: string }>;
  }>;
}


export interface CalibrationDiagnoseTask {
  id: string;
  inputData: Record<string, unknown>;
}

// 把 CreativeContext + 待诊断主体 + rubric 维度映射成 calibration.diagnose 模板的 facets
// (占位化原 buildDiagnosePrompt 的上下文块）。rubricBlock(逐维度评分清单)是必需 facet,
// 调用方按 dimensions 计算;title/script 来自 subject(文稿沿用原兜底文案)。
export function diagnoseFacets(
  context: CreativeContext,
  subject: { title: string; scriptText: string },
  dimensions: Array<{ key: string; label: string; description?: string }>,
): Record<string, string | undefined> {
  // The rubric block the agent scores against — one line per dimension with its anchor.
  const rubricBlock = dimensions
    .map((d, i) => {
      const anchor = d.description ? ` —— ${d.description}` : "";
      return `${i + 1}. ${d.label}（key=${d.key}）${anchor}`;
    })
    .join("\n");
  return {
    positioning: context.positioningBrief
      ? context.positioningBrief
      : "（创作者尚未设置定位——按通用爆款逻辑判断）",
    learnings: context.learningsBrief
      ? `\n【过往复盘爆款要素】\n${context.learningsBrief}`
      : "",
    rubricBlock,
    title: subject.title,
    script: subject.scriptText
      ? subject.scriptText
      : "（暂无文稿——请基于标题与定位做尽力诊断，拿不准的指标给 null）",
  };
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}
function strArr(v: unknown): string[] {
  return Array.isArray(v)
    ? v
        .filter((x): x is string => typeof x === "string")
        .map((x) => x.trim())
        .filter(Boolean)
    : [];
}
// A rubric score is clamped to the 1–5 integer scale; out-of-range / non-numeric → null
// (the dimension is dropped so the prediction never carries a fabricated score).
function dimScore(v: unknown): number | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  const r = Math.round(v);
  if (r < 1 || r > 5) return null;
  return r;
}
// A 0–100 performance estimate; out-of-range / non-numeric → null (拿不准, never fabricated).
function perf(v: unknown): number | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  if (v < 0 || v > 100) return null;
  return Math.round(v);
}
function confidence(v: unknown): "high" | "med" | "low" {
  return v === "high" || v === "med" || v === "low" ? v : "med";
}

// Normalize the schema-validated object into a CalibrationDiagnosis, intersected with the
// rubric's real dimension keys (the agent must score the actual rubric — a hallucinated key
// is dropped). Returns null when no dimension scored (→ cancel). T-025:结构化后拿的是已解析
// 对象,容错逻辑原样保留 —— rubricKeys 交集、dimScore 夹 1-5、perf 夹 0-100、confidence 归一。
export function normalizeDiagnosis(
  obj: DiagnosisOutput,
  rubricKeys: Set<string>,
): CalibrationDiagnosis | null {
  const rawDims = obj.dimensions ?? [];
  const dimensions: DiagnosisDimensionScore[] = [];
  for (const d of rawDims) {
    const key = str(d.key);
    if (!key || !rubricKeys.has(key)) continue; // only real rubric dimensions
    const score = dimScore(d.score);
    if (score === null) continue; // a dimension with no usable score is dropped
    dimensions.push({
      key,
      score,
      reason: str(d.reason),
      suggestion: str(d.suggestion),
    });
  }
  if (dimensions.length === 0) return null; // no usable score → no diagnosis

  const p = obj.performance ?? {};
  return {
    dimensions,
    performance: {
      完播率: perf(p["完播率"]),
      收藏率: perf(p["收藏率"]),
      评论率: perf(p["评论率"]),
      转化意向: perf(p["转化意向"]),
    },
    verdict: str(obj.verdict),
    mainIssues: strArr(obj.mainIssues),
    priorityFixes: strArr(obj.priorityFixes),
    confidence: confidence(obj.confidence),
  };
}

// Tolerant text → 诊断 parse for the CHAT path (chat-runner 的 diagnoseContent 工具仍走
// runTemplatedNode 拿自由文本)。结构化 runner 已改走 normalizeDiagnosis(拿已校验对象);这里
// 是文本兜底薄壳:宽容抽 JSON 对象 → 交给同一 normalizeDiagnosis(容错单点收口)。抽不出返回 null。
export function parseDiagnosis(
  text: string,
  rubricKeys: Set<string>,
): CalibrationDiagnosis | null {
  const parsed = parseJsonLoose(text);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  return normalizeDiagnosis(parsed as DiagnosisOutput, rubricKeys);
}
