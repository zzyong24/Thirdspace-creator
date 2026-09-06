import { createHash } from "node:crypto";
import type { ToolSet } from "ai";
import type { z } from "zod";
import type { chatWorkerInputSchema } from "@creatoros/contract/execution-worker";
import { getChatToolNativeExecutor, getChatToolRegisteredName } from "./chat-tool-gate";
import { prepareChatToolParameters } from "./chat-tool-parameters";
type Definition = z.infer<typeof chatWorkerInputSchema>["tools"][number];
/** 最大可能副作用，不代表每次执行均已写入。实现语义变化时必须提升此版本。 */
const IMPLEMENTATION_REVISION = "chat-tools-v1";
/** 显式审计表；不能根据工具名称或候选是否需要采纳来猜测副作用。 */
export const CHAT_TOOL_EFFECTS: Readonly<Record<string, Definition["effect"]>> = Object.freeze({
  "creatoros.guide": "none",
  "topic.generate": "proposal",
  "topic.enrich": "proposal",
  "script.hooks": "proposal",
  "script.patch": "proposal",
  "script.draft": "committed",
  "video.edit.render": "proposal",
  "publish.package": "committed",
  "project.transcribe": "committed",
  "material.gather": "none",
  "material.screenshot": "committed",
  "web.read": "committed",
  "intelligence.douyin.share": "committed",
  "local.read": "committed",
  "local.tools": "none",
  "local.workspace": "none",
  "material.generate": "committed",
  "cover.generate": "committed",
  "calibration.diagnose": "proposal",
  "review.analyze": "proposal",
  "review.script": "committed",
  "planning.thesis": "committed",
  "learning.capture": "proposal",
  "brief.fill": "proposal",
  "positioning.generate": "proposal",
  "knowledge.distill": "proposal",
  "context.projects": "none",
  "context.projects.search": "none",
  "context.comments": "none",
  "context.knowledge": "none",
  "context.materials": "none",
  "context.project.detail": "none",
  "context.project.lifecycle": "none",
  "context.review.report": "none",
  "context.positioning.detail": "none",
  "context.knowledge.detail": "none",
  "context.artifacts": "none",
  "context.artifact.text": "none",
  "context.knowledge.text": "none",
  "context.publications": "none",
  "context.metrics": "none",
  "context.learnings": "none",
  "context.candidates": "none",
  "context.predictions": "none",
});

/** 只准备当轮实际工具；模型/浏览器闭包仍须迁至 Worker，不能因拥有声明便视为迁移完成。 */
export async function prepareChatToolDefinitions(tools: ToolSet, options:{workerScriptHooks?:boolean;atomicPlanningThesis?:boolean;workerStructuredNodes?:boolean}={}) {
  const workerScriptHooks=options.workerScriptHooks===true;
  const entries = await Promise.all(Object.entries(tools).map(async ([name, tool]) => {
    if (!Object.hasOwn(CHAT_TOOL_EFFECTS, name)) throw new Error(`工具缺少副作用定义：${name}`);
    if (!getChatToolNativeExecutor(tool) || getChatToolRegisteredName(tool) !== name) throw new Error(`工具原始执行入口未登记或名称不匹配：${name}`);
    if (!tool.inputSchema || typeof tool.description !== "string") throw new Error(`工具缺少参数或描述：${name}`);
    const prepared = await prepareChatToolParameters(tool.inputSchema);
    const effect = CHAT_TOOL_EFFECTS[name]!;
    // 绑定真实schema变体与描述，避免不同上下文的同名工具共用错误版本。
    const execution=options.workerStructuredNodes && (name==="topic.enrich" || name==="positioning.generate") ? "worker.structured-node" as const : options.atomicPlanningThesis && name==="planning.thesis" ? "host.task-submit" as const : workerScriptHooks && name==="script.hooks" ? "worker.script-hooks" as const : undefined;
    const revision=execution==="worker.structured-node"?"chat-tools-worker-structured-v1":execution==="host.task-submit"?"chat-tools-atomic-planning-v1":execution?"chat-tools-worker-hooks-v1":(name==="local.tools"||name==="local.workspace")?"chat-tools-local-host-v2":IMPLEMENTATION_REVISION;
    const version = `${revision}:${createHash("sha256").update(JSON.stringify({ name, effect, description: tool.description, parameters: prepared.schema })).digest("hex")}`;
    const definition: Definition = { name, version, description: tool.description, effect, parameters: structuredClone(prepared.schema),...(execution?{execution}:{}) };
    return { name, prepared, definition };
  }));
  return { definitions: entries.map(entry => entry.definition), parameters: Object.fromEntries(entries.map(entry => [entry.name, entry.prepared])) };
}
