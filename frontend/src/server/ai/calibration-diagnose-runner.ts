import "server-only";
import type { RequestContext } from "@creatoros/contract";
import type { AiService } from "@/server/modules/ai";
import {
  assembleCreativeContext,
  type ContextDeps,
  type CreativeContext,
} from "./creative-context";
import { parseJsonLoose } from "@/server/ai/llm/parse";
import type {
  LlmCompleteOptions,
  LlmCompleter,
} from "@/server/ai/llm/provider";

// AI 编导诊断 runner (calibration.diagnose node, 校准中心大改 Slice 1). Reads ONE content
// subject (script / content_output) + the creator's current 变现加权 rubric + creative
// context, then asks Claude to score every rubric dimension 1–5 (with 打分理由 + 修改建议),
// estimate 发布前表现 chips, and write a 综合判断/主要问题/优先修改 诊断. Records a
// `calibration_diagnosis` CANDIDATE; on 采纳, the AI service's calibration_diagnosis confirm
// branch mints ONE draft prediction (predictedConversion/predictedMetrics filled by the
// 维度评分约定) via the AiCalibrationPort.
//
// Mirrors topic-enrich-runner (deps.llm → real configurable LLM; narrow injected readers;
// owns its lifecycle — markRunning → recordCandidate, cancel on any failure). The subject's
// content is read through a narrow injected reader (no cross-module repo import); the rubric
// dimensions come from a narrow rubric reader bound to the calibration service.

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

export interface CalibrationDiagnoseDeps extends ContextDeps {
  ai: AiService;
  llm: LlmCompleter;
  subject: DiagnosisSubjectReader;
  rubric: DiagnosisRubricReader;
}

type Complete = (
  prompt: string,
  opts?: LlmCompleteOptions,
) => Promise<{ text: string }>;

export interface CalibrationDiagnoseTask {
  id: string;
  inputData: Record<string, unknown>;
}

function buildDiagnosePrompt(
  context: CreativeContext,
  subject: { title: string; scriptText: string },
  dimensions: Array<{ key: string; label: string; description?: string }>,
): string {
  const positioning = context.positioningBrief
    ? context.positioningBrief
    : "（创作者尚未设置定位——按通用爆款逻辑判断）";
  const learnings = context.learningsBrief
    ? `\n【过往复盘爆款要素】\n${context.learningsBrief}`
    : "";
  const script = subject.scriptText
    ? subject.scriptText
    : "（暂无文稿——请基于标题与定位做尽力诊断，拿不准的指标给 null）";
  // The rubric block the agent scores against — one line per dimension with its anchor.
  const rubricBlock = dimensions
    .map((d, i) => {
      const anchor = d.description ? ` —— ${d.description}` : "";
      return `${i + 1}. ${d.label}（key=${d.key}）${anchor}`;
    })
    .join("\n");

  return `你是这位创作者的「AI 编导」。下面是一条**发布前的内容**，请你按创作者的**变现加权评分标准**逐维度盲评，并给出编导诊断。

【创作者定位】
${positioning}${learnings}

【评分维度（必须逐条打分，key 原样回填）】
${rubricBlock}

【待诊断内容】
标题：${subject.title}
文稿：
${script}

【任务】像一个严苛的内容主编：① 对上面每个维度给 1-5 分（1=很差 5=极强），写一句**打分理由**和一句**修改建议**；② 估计发布后表现（完播率/收藏率/评论率/转化意向，0-100，拿不准给 null，别编）；③ 写综合判断、主要问题、优先修改。confidence 给你对这次诊断的整体把握（high/med/low）。

【输出】只输出一个 JSON 对象（不要多余文字、不要代码块包裹），形如：
{"dimensions":[{"key":"原样回填的key","score":1到5的整数,"reason":"打分理由一句","suggestion":"修改建议一句"}],
 "performance":{"完播率":0-100或null,"收藏率":0-100或null,"评论率":0-100或null,"转化意向":0-100或null},
 "verdict":"综合判断一句",
 "mainIssues":["主要问题1","主要问题2"],
 "priorityFixes":["优先修改1","优先修改2"],
 "confidence":"high|med|low"}`;
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

// Tolerant parse of the agent's final text into a CalibrationDiagnosis, intersected with
// the rubric's real dimension keys (the agent must score the actual rubric — a hallucinated
// key is dropped). Returns null when nothing parseable OR no dimension scored (→ cancel).
export function parseDiagnosis(
  text: string,
  rubricKeys: Set<string>,
): CalibrationDiagnosis | null {
  const parsed = parseJsonLoose(text);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const o = parsed as Record<string, unknown>;

  const rawDims = Array.isArray(o.dimensions) ? o.dimensions : [];
  const dimensions: DiagnosisDimensionScore[] = [];
  for (const raw of rawDims) {
    const d = (raw ?? {}) as Record<string, unknown>;
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

  const p = (o.performance ?? {}) as Record<string, unknown>;
  return {
    dimensions,
    performance: {
      完播率: perf(p["完播率"]),
      收藏率: perf(p["收藏率"]),
      评论率: perf(p["评论率"]),
      转化意向: perf(p["转化意向"]),
    },
    verdict: str(o.verdict),
    mainIssues: strArr(o.mainIssues),
    priorityFixes: strArr(o.priorityFixes),
    confidence: confidence(o.confidence),
  };
}

async function generateDiagnosis(
  context: CreativeContext,
  subject: { title: string; scriptText: string },
  dimensions: Array<{ key: string; label: string; description?: string }>,
  complete: Complete,
): Promise<CalibrationDiagnosis | null> {
  const { text } = await complete(
    buildDiagnosePrompt(context, subject, dimensions),
    { schema: true },
  );
  const rubricKeys = new Set(dimensions.map((d) => d.key));
  return parseDiagnosis(text, rubricKeys);
}

// Orchestrate one calibration.diagnose task end to end. Owns its lifecycle: on any failure
// (missing subject ids, no current rubric, unparseable output, LlmCredentialError when no
// key is configured) it cancels the task (→ a terminal the UI renders as 失败) so it never
// lingers in `running`. Swallows so a background failure never crashes the server.
export async function runCalibrationDiagnose(
  ctx: RequestContext,
  task: CalibrationDiagnoseTask,
  deps: CalibrationDiagnoseDeps,
): Promise<void> {
  try {
    await deps.ai.markRunning(ctx, task.id); // honest status while the LLM works
    const subjectType =
      typeof task.inputData.subjectType === "string"
        ? task.inputData.subjectType
        : "";
    const subjectId =
      typeof task.inputData.subjectId === "string"
        ? task.inputData.subjectId
        : "";
    if (!subjectType || !subjectId) {
      throw new Error(
        "calibration-diagnose-runner: inputData.subjectType + subjectId are required",
      );
    }
    // Read the subject's content (ownership-gated) + the creator's current rubric. The
    // rubric reader resolves the rubricVersionId the draft prediction will reference, so a
    // caller need not pass it (but inputData.rubricVersionId, if present, is the override).
    const subject = await deps.subject.get(ctx, subjectType, subjectId);
    const rubric = await deps.rubric.current(ctx);
    if (rubric.dimensions.length === 0) {
      throw new Error("calibration-diagnose-runner: rubric has no dimensions");
    }
    const context = await assembleCreativeContext(
      ctx,
      { projectId: null, topic: subject.title, angle: "" },
      deps,
    );
    const diagnosis = await generateDiagnosis(
      context,
      subject,
      rubric.dimensions,
      (prompt, opts) => deps.llm(ctx, "calibration.diagnose", prompt, opts),
    );
    if (!diagnosis) {
      throw new Error(
        "calibration-diagnose-runner: LLM returned no parseable 诊断",
      );
    }
    // Record the diagnosis candidate; 采纳 → createDraftPrediction via the
    // calibration_diagnosis confirm branch. Carry the subject + resolved rubricVersionId so
    // confirm can mint the prediction against the right rubric version.
    await deps.ai.recordCandidate(ctx, task.id, {
      resultType: "calibration_diagnosis",
      resultData: {
        subjectType,
        subjectId,
        rubricVersionId: rubric.rubricVersionId,
        diagnosis,
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
      `[calibration-diagnose-runner] diagnose failed for task ${task.id}:`,
      err,
    );
  }
}
