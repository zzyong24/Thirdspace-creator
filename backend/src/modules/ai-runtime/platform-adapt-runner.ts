import { preparePlatformAdaptContext,projectPlatformAdaptCandidate } from "./platform-adapt-context";
import type { RequestContext } from "@creatoros/contract";
import type { AiService } from "@creatoros/backend/modules/ai";
import type { ModelSpec, PlatformAdaptOutput } from "@creatoros/ai-worker";
import {
  type ContextDeps,
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

export type { PlatformDraft } from "./platform-adapt-context";
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
    const facets = await preparePlatformAdaptContext(ctx,task,deps);
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
      facets,
    });
    const candidate = projectPlatformAdaptCandidate(task.inputData,object);
    const drafts = candidate.resultData.drafts as unknown[];
    // 结构化路径单发,补一条完成步事件喂窗口步骤日志(诚实:就一步)。
    await deps.ai.recordStep(ctx, task.id, {
      stepNo: 3,
      kind: "step",
      text: `已生成多平台草稿（${drafts.length} 个平台）`,
      toolCalls: [],
    });
    await deps.ai.recordCandidate(ctx, task.id, candidate);
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
