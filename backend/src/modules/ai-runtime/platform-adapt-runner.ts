import type { RequestContext } from "@creatoros/contract";
import type { AiService } from "@creatoros/backend/modules/ai";
import type { ModelSpec, PlatformAdaptOutput } from "@creatoros/ai-worker";
import {
  assembleCreativeContext,
  type ContextDeps,
  type CreativeContext,
} from "./creative-context";
import {
  formatErrorDiagnostic,
  safeErrorMessage,
} from "./error-diagnostics";

// 一稿多平台 runner (publish.platform_adapt node, 机制③④). Mirrors topic-runner but ADAPTS
// one finished script into a per-platform draft (抖音竖屏短 / B站横屏中视频 / 小红书图文 /
// 公众号长文), each with its own title/body/tags/coverIdea. Records a `publication_drafts`
// CANDIDATE; on 采纳, each draft becomes a real Publication (+ revision) through the AI
// service's publishing port. No web tools — the adaptation is grounded purely in the
// positioning brief + topic + scriptText.

export interface PlatformDraft {
  platform: string;
  title: string;
  body: string;
  tags: string[];
  coverIdea: string;
  // L6 对齐 cheat-package:该条草稿过发布审核 SOP 的结论(命中了什么 + 怎么改的)。
  // 硬规则已在 draft 本体改成合规版,这里只记改动;经验项记建议。前端发布页据此显审核结论。
  auditFlags: string[];
}

export interface PlatformAdaptDeps extends ContextDeps {
  ai: AiService;
  /** 按 capability 解析用户配的 model(Vercel SDK)。 */
  resolveModelSpec: (
    ctx: RequestContext,
    capability: string,
  ) => Promise<ModelSpec>;
}

export interface PlatformAdaptTask {
  id: string;
  projectId: string | null;
  inputData: Record<string, unknown>;
}

// Default fan-out when the caller names no platforms — the four 编导 surfaces. "wechat"
// here is the agent-facing label; the materialization port maps it to the publishing
// platform enum (wechatVideo).
const DEFAULT_PLATFORMS = ["douyin", "bilibili", "xiaohongshu", "wechat"];

const PLATFORM_LABEL: Record<string, string> = {
  douyin: "抖音（竖屏短视频，强钩子、快节奏、口语化）",
  bilibili: "B站（横屏中视频，信息密度高、可展开、标题党适度）",
  xiaohongshu: "小红书（图文/笔记体，emoji、分点、种草感、话题标签）",
  wechat: "公众号（长文，结构完整、有标题有小标题、可深读）",
};

// 把 CreativeContext + 脚本 + 目标平台映射成 platform.adapt 模板的 facets(占位化原 buildAdaptPrompt
// 的上下文块）。targets(目标平台清单)是必需 facet,调用方按 platforms 计算。
function adaptFacets(
  context: CreativeContext,
  scriptText: string,
  platforms: string[],
): Record<string, string | undefined> {
  return {
    positioning: context.positioningBrief
      ? context.positioningBrief
      : "（创作者尚未设置定位——按通用爆款逻辑适配）",
    topic: context.topic.title
      ? `\n【本期选题】${context.topic.title}${
          context.topic.angle ? `（切入：${context.topic.angle}）` : ""
        }`
      : "",
    script: scriptText ? `\n【原始脚本/内容】\n${scriptText}` : "",
    targets: platforms
      .map((p) => `· ${p}：${PLATFORM_LABEL[p] ?? p}`)
      .join("\n"),
  };
}

// Normalize the schema-validated drafts array into per-platform drafts (T-025:结构化后拿的是
// 已解析对象,归一逻辑原样保留 —— trim、滤掉缺 platform/title 的项、清空标签)。
// L6:透传 auditFlags(发布审核 SOP 结论)——同 tags 的清洗(trim + 滤空),只加不改既有字段。
function normalizePlatformDrafts(
  drafts: PlatformAdaptOutput["drafts"],
): PlatformDraft[] {
  return (drafts ?? [])
    .map((o): PlatformDraft | null => {
      const platform = (o.platform ?? "").trim();
      const title = (o.title ?? "").trim();
      if (!platform || !title) return null;
      // 发布平台简介用于直接复制粘贴；模型常按段落输出空行，这里只折叠空白，
      // 不改写任何文字、标点或创作取舍。
      const body = (o.body ?? "").replace(/\s+/gu, " ").trim();
      if (!body) {
        throw new Error(
          `发布物料缺少简介(body)：${platform || "未知平台"}`,
        );
      }
      const tags = (o.tags ?? [])
        .map((t) => (typeof t === "string" ? t.trim() : ""))
        .filter((t): t is string => t.length > 0);
      const auditFlags = (o.auditFlags ?? [])
        .map((f) => (typeof f === "string" ? f.trim() : ""))
        .filter((f): f is string => f.length > 0);
      return {
        platform,
        title,
        body,
        tags,
        coverIdea: o.coverIdea ?? "",
        auditFlags,
      };
    })
    .filter((d): d is PlatformDraft => d !== null);
}

export async function runPlatformAdapt(
  ctx: RequestContext,
  task: PlatformAdaptTask,
  deps: PlatformAdaptDeps,
): Promise<void> {
  try {
    await deps.ai.markRunning(ctx, task.id);
    await deps.ai.recordStep(ctx, task.id, {
      stepNo: 1,
      kind: "step",
      text: "正在读取定位与整稿上下文",
      toolCalls: [],
    });
    const outputId =
      typeof task.inputData.outputId === "string" ? task.inputData.outputId : "";
    if (!outputId) {
      // The confirm path creates Publications under this output; without it the
      // candidate cannot be materialized. Fail loud (caught below → cancelTask).
      throw new Error("platform-adapt-runner: inputData.outputId is required");
    }
    const topic =
      typeof task.inputData.topic === "string" ? task.inputData.topic : "";
    const scriptText =
      typeof task.inputData.scriptText === "string"
        ? task.inputData.scriptText
        : "";
    const platforms =
      Array.isArray(task.inputData.platforms) &&
      task.inputData.platforms.length > 0
        ? task.inputData.platforms.filter(
            (p): p is string => typeof p === "string",
          )
        : DEFAULT_PLATFORMS;
    const context = await assembleCreativeContext(
      ctx,
      { projectId: task.projectId, topic },
      deps,
    );
    // Vercel AI SDK 路径:按 "script.rewrite" capability 解析 model + 跑 ai-worker 结构化节点
    // (外置 platform.adapt 模板 + outputSchema)。T-025:改 runStructuredNode(generateObject 绑
    // schema,落空→文本兜底),让用户默认的 MiniMax 也稳定吐可解析多平台草稿(旧 runTemplatedNode
    // 自由文本路径 MiniMax 下常失败)。顶层是对象,取 object.drafts 再 normalize(归一逻辑原样保留)。
    const spec = await deps.resolveModelSpec(ctx, "script.rewrite");
    // T-040b:运行时 getTemplate 取被服务端覆盖后的 REGISTRY 对象(而非编译期 import 快照),
    // 让 platform.adapt 的 system/template/tools 也能吃到 skill_config_overrides 覆盖。
    const { modelFor, runStructuredNode, getTemplate } =
      await import("@creatoros/ai-worker");
    await deps.ai.recordStep(ctx, task.id, {
      stepNo: 2,
      kind: "step",
      text: "正在调用文本模型生成标题、简介、标签和封面文案",
      toolCalls: [],
    });
    const { object } = await runStructuredNode<PlatformAdaptOutput>({
      model: modelFor(spec),
      template: getTemplate("platform.adapt"),
      facets: adaptFacets(context, scriptText, platforms),
    });
    const drafts = normalizePlatformDrafts(object.drafts);
    if (drafts.length === 0) {
      throw new Error(
        "platform-adapt-runner: agent returned no parseable drafts",
      );
    }
    // 结构化路径单发,补一条完成步事件喂窗口步骤日志(诚实:就一步)。
    await deps.ai.recordStep(ctx, task.id, {
      stepNo: 3,
      kind: "step",
      text: `已生成多平台草稿（${drafts.length} 个平台）`,
      toolCalls: [],
    });
    await deps.ai.recordCandidate(ctx, task.id, {
      resultType: "publication_drafts",
      resultData: { drafts, outputId },
    });
  } catch (err) {
    const failureMessage = safeErrorMessage(err);
    try {
      await deps.ai.recordStep(ctx, task.id, {
        stepNo: 99,
        kind: "error",
        text: failureMessage,
        toolCalls: [],
      });
    } catch {
      /* 记录诊断失败不阻断终态 */
    }
    try {
      await deps.ai.cancelTask(ctx, task.id, failureMessage);
    } catch {
      /* already terminal */
    }
    console.error(
      `[platform-adapt-runner] adapt failed task=${task.id} ${formatErrorDiagnostic(err)}`,
    );
  }
}
