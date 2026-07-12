import type { RequestContext } from "@creatoros/contract";
import type { AiService } from "@creatoros/backend/modules/ai";
import type { ModelSpec, ThesisTreeOutput } from "@creatoros/ai-worker";
import {
  assembleCreativeContext,
  type ContextDeps,
  type CreativeContext,
} from "./creative-context";

// 论点树 runner (planning.thesis node, 机制③④). Mirrors script-runner but DRAFTS a
// thesis tree (论点树) from the creative context, then records an `artifact_version`
// CANDIDATE. On 采纳, the AI service's EXISTING artifact_version confirm branch appends
// a new ArtifactVersion (createdByType:"ai") onto the project's `thesis_tree` artifact —
// we REUSE that path (the candidate carries `artifactId` + `resultData.body`/`summary`/
// `contentData`). No web tools: the draft is grounded purely in positioningBrief +
// topic + learningsBrief.
//
// The contentData shape (writer ↔ reader contract): `{ nodes: [{ column, title, summary }] }`
// where column ∈ "core"|"support"|"evidence"|"counter" — exactly the ThesisNodeView shape
// the planning workspace reads back (planning-workspace-data.ts).

export interface PlanningDeps extends ContextDeps {
  ai: AiService;
  /** 按 capability 解析用户配的 model(Vercel SDK)。 */
  resolveModelSpec: (
    ctx: RequestContext,
    capability: string,
  ) => Promise<ModelSpec>;
}

export interface PlanningTask {
  id: string;
  projectId: string | null;
  inputData: Record<string, unknown>;
}

// One thesis-tree branch — the agent's JSON branch element.
type ThesisColumn = "support" | "evidence" | "counter";

interface ThesisBranch {
  column: ThesisColumn;
  title: string;
  summary: string;
}

// The parsed thesis tree the agent returns: a single core thesis + the branches.
interface ThesisTree {
  core: { title: string; summary: string };
  branches: ThesisBranch[];
}

// A serialized node as it rides into contentData.nodes (writer side of the contract).
interface ThesisNode {
  column: "core" | ThesisColumn;
  title: string;
  summary: string;
}

// 把 CreativeContext 映射成 planning.thesis 模板的 facets(占位化原 buildThesisPrompt 的上下文块）。
// [T-269/T-270] 接地根:论点树此前**只**注 positioning+learnings+topic(无 brief、无素材、无 anti-
// fabrication → 两头悬空)。补三样:
//   ① projectBriefHard(立项硬锚,项目态):core 论点锚定钦定核心信息,不自创矛盾主张;
//   ② userMaterialHard/Ref(用户素材=论据/证据弹药):evidence 分支有据可溯而非脑补;
//   ③ anti-fabrication:模板正文已静态嵌 ANTI_FABRICATION_CLAUSE(单一真值),facets 无需重复注。
function thesisFacets(
  context: CreativeContext,
): Record<string, string | undefined> {
  return {
    positioning: context.positioningBrief
      ? context.positioningBrief
      : "（创作者尚未设置定位——按通用爆款逻辑构建论点树）",
    // [T-270] 立项硬锚(项目态;creative-context 已装配含「必须遵守」段头,账号态为空则整段省略)。
    projectBriefHard: context.projectBriefHard
      ? `\n${context.projectBriefHard}`
      : "",
    learnings: context.learningsBrief
      ? `\n【过往复盘爆款要素】\n${context.learningsBrief}`
      : "",
    // [T-269] 用户素材=论点/证据的可溯弹药(此前论点树生成链完全没传素材)。
    userMaterialHard: context.userMaterialHardBrief
      ? `\n${context.userMaterialHardBrief}`
      : "",
    userMaterialRef: context.userMaterialRefBrief
      ? `\n【参考素材(AI 搜集,参考级)】\n${context.userMaterialRefBrief}`
      : "",
    topic: context.topic.title
      ? `\n【本期选题】${context.topic.title}${
          context.topic.angle ? `（切入：${context.topic.angle}）` : ""
        }`
      : "",
  };
}

function normalizeColumn(raw: unknown): ThesisColumn | null {
  if (raw === "support" || raw === "evidence" || raw === "counter") return raw;
  if (raw === "支撑" || raw === "支持" || raw === "支持依据") return "support";
  if (raw === "证据") return "evidence";
  if (raw === "反驳" || raw === "反对") return "counter";
  return null;
}

// Normalize the schema-validated object into a ThesisTree (T-025:结构化后拿的是已解析对象,
// 归一逻辑原样保留 —— normalizeColumn 归一列名、trim、滤掉空分支)。
function normalizeThesisTree(obj: ThesisTreeOutput): ThesisTree {
  const core = {
    title: (obj.core?.title ?? "").trim(),
    summary: (obj.core?.summary ?? "").trim(),
  };
  const branches = (obj.branches ?? [])
    .map((o): ThesisBranch | null => {
      const column = normalizeColumn(o.column);
      const title = (o.title ?? "").trim();
      const summary = (o.summary ?? "").trim();
      if (!column || (!title && !summary)) return null;
      return { column, title, summary };
    })
    .filter((b): b is ThesisBranch => b !== null);
  return { core, branches };
}

// Serialize the parsed tree into the contentData.nodes the planning workspace reads back
// (writer side of the contract): one core node + the branch nodes.
function renderNodes(tree: ThesisTree): ThesisNode[] {
  const nodes: ThesisNode[] = [];
  if (tree.core.title || tree.core.summary) {
    nodes.push({
      column: "core",
      title: tree.core.title,
      summary: tree.core.summary,
    });
  }
  for (const b of tree.branches) {
    nodes.push({ column: b.column, title: b.title, summary: b.summary });
  }
  return nodes;
}

const COLUMN_LABEL: Record<"core" | ThesisColumn, string> = {
  core: "核心论点",
  support: "支撑依据",
  evidence: "证据",
  counter: "反驳",
};

// A readable Markdown rendering (the ArtifactVersion's contentText) — used for search and
// as the flat blob the confirm branch requires (`resultData.body`).
function renderBody(tree: ThesisTree): string {
  const lines: string[] = ["# 论点树", ""];
  if (tree.core.title) {
    lines.push(`## 核心论点：${tree.core.title}`);
    if (tree.core.summary) lines.push(tree.core.summary);
    lines.push("");
  }
  for (const column of ["support", "evidence", "counter"] as const) {
    const branch = tree.branches.filter((b) => b.column === column);
    if (branch.length === 0) continue;
    lines.push(`### ${COLUMN_LABEL[column]}`);
    for (const b of branch) {
      lines.push(`- **${b.title}**${b.summary ? `：${b.summary}` : ""}`);
    }
    lines.push("");
  }
  return lines.join("\n").trimEnd();
}

export async function runPlanningThesis(
  ctx: RequestContext,
  task: PlanningTask,
  deps: PlanningDeps,
): Promise<void> {
  try {
    await deps.ai.markRunning(ctx, task.id);
    const artifactId =
      typeof task.inputData.artifactId === "string"
        ? task.inputData.artifactId
        : "";
    if (!artifactId) {
      // The confirm path appends a NEW ArtifactVersion onto this artifact; without it the
      // candidate cannot be materialized. Fail loud (caught below → cancelTask).
      throw new Error("planning-runner: inputData.artifactId is required");
    }
    const topic =
      typeof task.inputData.topic === "string" ? task.inputData.topic : "";
    const context = await assembleCreativeContext(
      ctx,
      { projectId: task.projectId, topic },
      deps,
    );
    // Vercel AI SDK 路径:按 capability 解析 model + 跑 ai-worker 结构化节点(外置 planning.thesis 模板
    // + outputSchema)。T-025:改 runStructuredNode(generateObject 绑 schema,落空→文本兜底),
    // 让用户默认的 MiniMax 也稳定吐可解析论点树(旧 runTemplatedNode 自由文本路径 MiniMax 下常失败)。
    const spec = await deps.resolveModelSpec(ctx, "planning.thesis");
    // T-040b:运行时 getTemplate 取被服务端覆盖后的 REGISTRY 对象(而非编译期 import 快照),
    // 让 planning.thesis 的 system/template/tools 也能吃到 skill_config_overrides 覆盖。
    const { modelFor, runStructuredNode, getTemplate, buildGroundingHaystack, annotateUngroundedClaims } =
      await import("@creatoros/ai-worker");
    const { object } = await runStructuredNode<ThesisTreeOutput>({
      model: modelFor(spec),
      template: getTemplate("planning.thesis"),
      facets: thesisFacets(context),
    });
    const tree = normalizeThesisTree(object);
    // [T-269] 可溯后处理(参照 T-224):校验论点树各节点(核心/支撑/证据/反驳)的具体 claim(数字/
    // 命名)是否命中已注入的定位/立项 brief/素材/知识库;不可溯的 → 非破坏式在 summary 追加「⚠️含未
    // 溯源数据」标注(不删,提示用户/写脚本时核实)。治「evidence 分支凭空造数字撑论点」。
    const haystack = buildGroundingHaystack(
      context.positioningBrief,
      context.projectBriefHard,
      context.userMaterialHardBrief,
      context.userMaterialRefBrief,
      context.knowledgeBrief,
      context.topic.title,
      context.topic.angle,
    );
    tree.core.summary = annotateUngroundedClaims(tree.core.summary, haystack).text;
    for (const b of tree.branches) {
      b.summary = annotateUngroundedClaims(b.summary, haystack).text;
    }
    const nodes = renderNodes(tree);
    if (nodes.length === 0) {
      throw new Error("planning-runner: agent returned no parseable thesis nodes");
    }
    // 结构化路径单发,补一条完成步事件喂窗口步骤日志(诚实:就一步)。
    await deps.ai.recordStep(ctx, task.id, {
      stepNo: 1,
      kind: "step",
      text: `已生成论点树（${nodes.length} 节点）`,
      toolCalls: [],
    });
    await deps.ai.recordCandidate(ctx, task.id, {
      resultType: "artifact_version",
      artifactId,
      resultData: {
        body: renderBody(tree),
        summary: "AI 论点树草稿",
        // Raw nodes — kept so the 采纳 card preview (PlanningThesisIsland.parseNodes)
        // renders the columns/titles/summaries.
        nodes,
        // Structured editable payload forwarded by the AI confirm branch to
        // createVersion as `contentData` (round-trips into the 策划 论点树 read side).
        contentData: { nodes },
      },
    });
  } catch (err) {
    try {
      await deps.ai.cancelTask(ctx, task.id);
    } catch {
      /* already terminal */
    }
    // eslint-disable-next-line no-console
    console.error(`[planning-runner] draft failed for task ${task.id}:`, err);
  }
}
