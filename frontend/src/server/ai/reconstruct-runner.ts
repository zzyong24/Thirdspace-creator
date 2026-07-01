import "server-only";
import type { RequestContext } from "@creatoros/contract";
import type { ModelSpec, ReconstructProjectOutput } from "@creatoros/ai-worker";
import {
  assembleCreativeContext,
  type ContextDeps,
  type CreativeContext,
} from "./creative-context";

// 作品初始化 auto-fill 重建 runner(T-030-D4,SPEC §4.5/§6/§7)——
// **仅 source='imported' 的已发布作品**:拿逐字稿(D3 script transcript artifact)+ 真实指标
// (digg/comment/play,来自 analytics)+ 账号定位 brief → runStructuredNode(schema 约束,
// reconstruct.project 模板)产 { research, planning } 重建包 → **物化成 research + planning
// artifact**,经 artifacts.service,**强制 origin='reconstructed'**(F1)。
//
// 与 planning-runner / research-runner 的根本区别:那些为**新选题正向创作**,产 candidate 走
// 人确认门;本 runner 为**已发布作品逆向重建历史记忆**,SPEC §6.1 明确「**不走 candidate 确认
// 路径**」——直接物化(§7 受限例外,靠 origin 标记 + 消费侧隔离守)。故它是**确定性终态**
// runner(markRunning → 物化 → markSucceeded/markFailed,仿 transcribe-runner),不 recordCandidate。
//
// §5 守卫(边界①,F1):runner **断言仅 imported**。manual/topic/新建项目 → 直接失败,
// **绝不触发 auto-fill**(getProjectSource 注入,非 imported → markFailed,不写任何 artifact)。
//
// artifactType(去 validateStageGate 白名单取合法值):
//   research 产物 → "trend_analysis"(research 阶段白名单)
//   planning 产物 → "thesis_tree"(planning 阶段白名单)
// 这样重建产物落在合法阶段交付物上,研究/策划工作台能读回。
//
// 端口全注入(ai / resolveModelSpec / getProjectSource / getTranscript / getMetricsSummary /
// materializeArtifact + ContextDeps),故 runner 可确定性单测(fake 模型 via resolveModelSpec+
// registry 不需要——runStructuredNode 动态 import 真 ai-worker,但测试用 fake materialize/ports 且
// 注入 fake runStructuredNode 经 deps 覆盖)。见下 `runReconstruct` 的 `runNode` 可注入口。

/** 研究/策划重建产物落库的窄端口(host 绑 artifactsService.createArtifact + createVersion,
 *  **强制 origin='reconstructed'**)。runner 不直连 artifacts repo/service(前后端分离:走公开服务)。 */
export interface ReconstructArtifactsPort {
  /** 建一个 origin='reconstructed' 的 artifact 并写入其内容(一次建 artifact + 追一版)。 */
  materializeReconstructed(
    ctx: RequestContext,
    input: {
      projectId: string;
      artifactType: string;
      stage: string;
      title: string;
      contentText: string;
      contentData: Record<string, unknown>;
    },
  ): Promise<{ id: string }>;
}

export interface ReconstructRunnerDeps extends ContextDeps {
  ai: ReconstructAiPort;
  /** 按 capability 解析用户配的 model(Vercel SDK)。 */
  resolveModelSpec: (
    ctx: RequestContext,
    capability: string,
  ) => Promise<ModelSpec>;
  /** 读该 project 的 source(断言仅 imported;非 imported → 整任务失败,不触发 auto-fill)。 */
  getProjectSource: (
    ctx: RequestContext,
    projectId: string,
  ) => Promise<string | null>;
  /** 读该作品逐字稿正文(D3 的 script transcript artifact 当前版本 contentText)。无 → 失败。 */
  getTranscript: (
    ctx: RequestContext,
    projectId: string,
  ) => Promise<string | null>;
  /** 读该作品真实指标摘要(digg/comment/play 等,人类可读串;由 host 从 analytics 装配)。 */
  getMetricsSummary: (
    ctx: RequestContext,
    projectId: string,
  ) => Promise<string>;
  /** 物化重建产物(强制 origin='reconstructed')。 */
  artifacts: ReconstructArtifactsPort;
  /**
   * 结构化节点执行口(默认动态 import ai-worker 的 runStructuredNode + RECONSTRUCT_PROJECT_TEMPLATE)。
   * 抽成注入口是为**确定性单测**(测试传 fake,产固定重建包,不碰真模型)。host 不传即用真节点。
   */
  runNode?: (
    ctx: RequestContext,
    spec: ModelSpec,
    facets: Record<string, string | undefined>,
  ) => Promise<ReconstructProjectOutput>;
}

/** runner 需要的 AI 生命周期窄端口(确定性终态:无候选、无采纳门)。 */
export interface ReconstructAiPort {
  markRunning(ctx: RequestContext, taskId: string): Promise<void>;
  recordStep(
    ctx: RequestContext,
    taskId: string,
    input: { stepNo: number; kind: string; text: string; toolCalls: unknown[] },
  ): Promise<void>;
  markSucceeded(ctx: RequestContext, taskId: string): Promise<void>;
  markFailed(
    ctx: RequestContext,
    taskId: string,
    errorMessage?: string,
  ): Promise<void>;
}

export interface ReconstructTask {
  id: string;
  taskType: string; // reconstruct.project
  projectId: string | null;
  inputData: Record<string, unknown>; // { projectId }
}

// research 产物落 trend_analysis(research 阶段白名单);planning 产物落 thesis_tree(planning 阶段白名单)。
const RESEARCH_ARTIFACT_TYPE = "trend_analysis";
const RESEARCH_STAGE = "research";
const PLANNING_ARTIFACT_TYPE = "thesis_tree";
const PLANNING_STAGE = "planning";

// 把 CreativeContext + 真实数据映射成 reconstruct.project 模板的 facets。
function reconstructFacets(
  context: CreativeContext,
  transcript: string,
  metrics: string,
  title: string,
): Record<string, string | undefined> {
  return {
    positioning: context.positioningBrief
      ? context.positioningBrief
      : "（创作者尚未设置定位——按通用短视频逻辑反推）",
    transcript,
    metrics: metrics || "（暂无真实指标）",
    title: title || "（无标题）",
  };
}

// 默认结构化节点:动态 import 真 ai-worker(与其它 runner 同款),跑 reconstruct.project 模板。
async function defaultRunNode(
  _ctx: RequestContext,
  spec: ModelSpec,
  facets: Record<string, string | undefined>,
): Promise<ReconstructProjectOutput> {
  const { modelFor, runStructuredNode, RECONSTRUCT_PROJECT_TEMPLATE } =
    await import("@creatoros/ai-worker");
  const { object } = await runStructuredNode<ReconstructProjectOutput>({
    model: modelFor(spec),
    template: RECONSTRUCT_PROJECT_TEMPLATE,
    facets,
  });
  return object;
}

// —— 把重建包渲染成 artifact 内容(writer 侧 contract)——

// research 产物:contentText = 可读 Markdown(供搜索);contentData = 结构化(供研究工作台读回)。
function renderResearch(research: ReconstructProjectOutput["research"]): {
  contentText: string;
  contentData: Record<string, unknown>;
} {
  const lines: string[] = ["# 研究重建（AI 历史反推）", ""];
  lines.push(`## 核心主题\n${research.coreTopic}`, "");
  if (research.keyPoints.length > 0) {
    lines.push("## 要点");
    for (const p of research.keyPoints) lines.push(`- ${p}`);
    lines.push("");
  }
  if (research.cases.length > 0) {
    lines.push("## 案例");
    for (const c of research.cases)
      lines.push(`- **${c.title}**${c.note ? `：${c.note}` : ""}`);
    lines.push("");
  }
  if (research.dataPoints.length > 0) {
    lines.push("## 数据点");
    for (const d of research.dataPoints)
      lines.push(`- ${d.stat}${d.note ? `（${d.note}）` : ""}`);
    lines.push("");
  }
  return {
    contentText: lines.join("\n").trimEnd(),
    contentData: { ...research, reconstructed: true },
  };
}

// planning 产物:thesis 论点树 + outline,渲染成 planning 工作台可读的 nodes（core/support）。
function renderPlanning(planning: ReconstructProjectOutput["planning"]): {
  contentText: string;
  contentData: Record<string, unknown>;
} {
  const nodes: Array<{ column: string; title: string; summary: string }> = [];
  nodes.push({
    column: "core",
    title: planning.thesis.coreThesis,
    summary: "",
  });
  for (const s of planning.thesis.supportingPoints) {
    nodes.push({ column: "support", title: s, summary: "" });
  }
  const lines: string[] = ["# 策划重建（AI 历史反推）", ""];
  lines.push(`## 目标受众\n${planning.targetAudience}`, "");
  lines.push(`## 核心论点\n${planning.thesis.coreThesis}`, "");
  if (planning.thesis.supportingPoints.length > 0) {
    lines.push("## 支撑论点");
    for (const s of planning.thesis.supportingPoints) lines.push(`- ${s}`);
    lines.push("");
  }
  if (planning.outline.length > 0) {
    lines.push("## 结构脉络");
    planning.outline.forEach((o, i) => lines.push(`${i + 1}. ${o}`));
    lines.push("");
  }
  return {
    contentText: lines.join("\n").trimEnd(),
    contentData: {
      nodes,
      targetAudience: planning.targetAudience,
      outline: planning.outline,
      reconstructed: true,
    },
  };
}

/**
 * Orchestrate one reconstruct.project task —— 确定性、仅 imported、直接物化(origin='reconstructed')。
 *   markRunning → 断言 imported(§5 守卫,非 imported → markFailed 不写)→ 读逐字稿 + 真实指标 +
 *   定位 → runStructuredNode 产 { research, planning } → 物化 research(trend_analysis) + planning
 *   (thesis_tree),均 origin='reconstructed'(F1)→ recordStep → markSucceeded。
 *   任一步失败 → markFailed(诚实终态,绝不把 task 卡 running / 崩服务)。
 */
export async function runReconstruct(
  ctx: RequestContext,
  task: ReconstructTask,
  deps: ReconstructRunnerDeps,
): Promise<void> {
  const projectId =
    typeof task.inputData.projectId === "string"
      ? task.inputData.projectId
      : (task.projectId ?? "");
  try {
    await deps.ai.markRunning(ctx, task.id);

    if (!projectId) {
      throw new Error("reconstruct-runner: inputData.projectId is required");
    }

    // §5 守卫(边界①):断言仅 imported。manual/topic/新建 → 立即失败,绝不触发 auto-fill。
    const source = await deps.getProjectSource(ctx, projectId);
    if (source !== "imported") {
      throw new Error(
        `reconstruct-runner: 仅 source='imported' 的历史作品可 auto-fill 重建；` +
          `项目 ${projectId} 的 source=${source ?? "(unknown)"} —— 跳过,不触发。`,
      );
    }

    // 逐字稿是重建的事实依据(D3 已绑)。缺 → 失败(没有逐字稿无从反推,别凭空编)。
    const transcript = await deps.getTranscript(ctx, projectId);
    if (!transcript || !transcript.trim()) {
      throw new Error(
        `reconstruct-runner: 项目 ${projectId} 无逐字稿(D3 尚未绑定),无法反推重建`,
      );
    }

    const metrics = await deps.getMetricsSummary(ctx, projectId);
    // 定位 brief(重建不针对某个新选题,topic 传空;assembleCreativeContext 只用来取
    // positioningBrief）。title 从 context.topic 承接(此处为空,标题来源见 facets 兜底）。
    const context = await assembleCreativeContext(
      ctx,
      { projectId, topic: "" },
      deps,
    );
    const title = context.topic.title ?? "";

    // 结构化节点(schema 约束):产 { research, planning } 重建包。任何模型都产可解析输出。
    const spec = await deps.resolveModelSpec(ctx, "planning.thesis");
    const runNode = deps.runNode ?? defaultRunNode;
    const pkg = await runNode(
      ctx,
      spec,
      reconstructFacets(context, transcript, metrics, title),
    );
    if (!pkg?.research?.coreTopic || !pkg?.planning?.thesis?.coreThesis) {
      throw new Error("reconstruct-runner: 模型未产出可用的重建包(research/planning 缺失)");
    }

    // 物化 research + planning,均 origin='reconstructed'(F1 强制,§7 例外的审计前提)。
    const research = renderResearch(pkg.research);
    const researchArtifact = await deps.artifacts.materializeReconstructed(ctx, {
      projectId,
      artifactType: RESEARCH_ARTIFACT_TYPE,
      stage: RESEARCH_STAGE,
      title: "研究重建（AI 反推）",
      contentText: research.contentText,
      contentData: research.contentData,
    });

    const planning = renderPlanning(pkg.planning);
    const planningArtifact = await deps.artifacts.materializeReconstructed(ctx, {
      projectId,
      artifactType: PLANNING_ARTIFACT_TYPE,
      stage: PLANNING_STAGE,
      title: "策划重建（AI 反推）",
      contentText: planning.contentText,
      contentData: planning.contentData,
    });

    await deps.ai.recordStep(ctx, task.id, {
      stepNo: 1,
      kind: "reconstruct",
      text:
        `已重建 2 阶段（研究 ${researchArtifact.id} · 策划 ${planningArtifact.id}）,` +
        `均标记 origin='reconstructed'（AI 历史反推、未经确认）`,
      toolCalls: [],
    });
    await deps.ai.markSucceeded(ctx, task.id);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : String(err ?? "unknown error");
    try {
      await deps.ai.markFailed(ctx, task.id, message);
    } catch {
      /* task may already be terminal */
    }
    // eslint-disable-next-line no-console
    console.error(
      `[reconstruct-runner] reconstruct failed for task ${task.id}:`,
      err,
    );
  }
}
