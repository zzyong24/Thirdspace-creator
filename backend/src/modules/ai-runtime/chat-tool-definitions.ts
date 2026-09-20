import { createHash } from "node:crypto";
import type { ToolSet } from "ai";
import type { z } from "zod";
import type { chatWorkerInputSchema } from "@creatoros/contract/execution-worker";
import { workbenchCapabilitySchema, type WorkbenchCapability } from "@creatoros/contract/agent-workbench";
import { getChatToolNativeExecutor, getChatToolRegisteredName, getChatToolWorkbenchCapability } from "./chat-tool-gate";
import { prepareChatToolParameters } from "./chat-tool-parameters";
type Definition = z.infer<typeof chatWorkerInputSchema>["tools"][number];
/** 最大可能副作用，不代表每次执行均已写入。实现语义变化时必须提升此版本。 */
const IMPLEMENTATION_REVISION = "chat-tools-v1";
/** 显式审计表；不能根据工具名称或候选是否需要采纳来猜测副作用。 */
export const CHAT_TOOL_EFFECTS: Readonly<Record<string, Definition["effect"]>> = Object.freeze({
  "history.read": "none",
  "tool.result.read": "none",
  "skill.read": "none",
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
  "redfox.query": "committed",
  "research.autonomous": "committed",
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

/** 最大可能副作用；read 不收费或免授权的推断不在此发生。 */
export function workbenchChatEffect(descriptor: WorkbenchCapability): Definition["effect"] {
  const effects = workbenchCapabilitySchema.parse(descriptor).effects;
  if (effects.some(effect => effect === "task_write" || effect === "external_write" || effect === "process")) return "committed";
  if (effects.includes("domain_candidate")) return "proposal";
  return "none";
}

/** 只准备当轮实际工具；模型/浏览器闭包仍须迁至 Worker，不能因拥有声明便视为迁移完成。 */
export async function prepareChatToolDefinitions(tools: ToolSet, options:{workerScriptDraft?:boolean;workerWebRead?:boolean;workerResearch?:boolean;workerScriptHooks?:boolean;atomicCoverGenerate?:boolean;atomicAgenticResearch?:boolean;atomicPlanningThesis?:boolean;atomicMaterialGenerate?:boolean;atomicScriptReview?:boolean;atomicPublishPackage?:boolean;workerStructuredNodes?:boolean;workbenchCapabilities?:readonly WorkbenchCapability[]}={}) {
  const workerScriptHooks=options.workerScriptHooks===true;
  const workbench = new Map<string, WorkbenchCapability>();
  for (const raw of options.workbenchCapabilities ?? []) {
    const descriptor = workbenchCapabilitySchema.parse(raw);
    if (workbench.has(descriptor.name) || Object.hasOwn(CHAT_TOOL_EFFECTS, descriptor.name)) throw new Error(`Workbench 工具名重复或覆盖正式工具：${descriptor.name}`);
    workbench.set(descriptor.name, descriptor);
  }
  const entries = await Promise.all(Object.entries(tools).map(async ([name, tool]) => {
    const descriptor = workbench.get(name);
    if (!Object.hasOwn(CHAT_TOOL_EFFECTS, name) && !descriptor) throw new Error(`工具缺少副作用定义：${name}`);
    if (!getChatToolNativeExecutor(tool) || getChatToolRegisteredName(tool) !== name) throw new Error(`工具原始执行入口未登记或名称不匹配：${name}`);
    if (descriptor && JSON.stringify(getChatToolWorkbenchCapability(tool)) !== JSON.stringify(descriptor)) throw new Error(`Workbench 冻结目录与执行入口不匹配：${name}`);
    if (!tool.inputSchema || typeof tool.description !== "string") throw new Error(`工具缺少参数或描述：${name}`);
    const prepared = await prepareChatToolParameters(tool.inputSchema);
    if (descriptor && (tool.description !== descriptor.description || JSON.stringify(prepared.schema) !== JSON.stringify(descriptor.inputSchema))) throw new Error(`Workbench 工具 schema 或描述漂移：${name}`);
    const effect = descriptor ? workbenchChatEffect(descriptor) : CHAT_TOOL_EFFECTS[name]!;
    // 绑定真实schema变体与描述，避免不同上下文的同名工具共用错误版本。
    const execution=name==="redfox.query"?"worker.redfox" as const:options.workerScriptDraft && name==="script.draft" ? "worker.script-draft" as const : options.workerWebRead && name==="web.read" ? "worker.web-read" as const : options.workerResearch && name==="material.gather" ? "worker.research" as const : options.workerStructuredNodes && ["topic.enrich","positioning.generate","calibration.diagnose","topic.generate","review.analyze","knowledge.distill"].includes(name) ? "worker.structured-node" as const : (options.atomicCoverGenerate && name==="cover.generate") || (options.atomicAgenticResearch && name==="research.autonomous") || (options.atomicPlanningThesis && name==="planning.thesis") || (options.atomicMaterialGenerate && name==="material.generate") || (options.atomicScriptReview && name==="review.script") || (options.atomicPublishPackage && name==="publish.package") ? "host.task-submit" as const : workerScriptHooks && name==="script.hooks" ? "worker.script-hooks" as const : undefined;
    const revision=descriptor?`workbench-v${descriptor.schemaVersion}`:name==="redfox.query"?"chat-tools-worker-redfox-v1":name==="script.patch"?"chat-tools-script-patch-v2":execution==="worker.script-draft"?"chat-tools-worker-script-draft-v2":execution==="worker.web-read"?"chat-tools-worker-web-read-v1":execution==="worker.research"?"chat-tools-worker-research-v2":execution==="worker.structured-node"?(name==="calibration.diagnose"?"chat-tools-calibration-diagnose-v2":"chat-tools-worker-structured-v1"):execution==="host.task-submit"?(name==="cover.generate"?"chat-tools-atomic-cover-v1":name==="research.autonomous"?"chat-tools-atomic-agentic-research-v1":name==="material.generate"?"chat-tools-atomic-material-v1":"chat-tools-atomic-planning-v1"):execution?"chat-tools-worker-hooks-v1":(name==="local.tools"||name==="local.workspace")?"chat-tools-local-host-v2":IMPLEMENTATION_REVISION;
    const version = `${revision}:${createHash("sha256").update(JSON.stringify({ name, effect, description: tool.description, parameters: prepared.schema, ...(descriptor ? { descriptor } : {}) })).digest("hex")}`;
    const definition: Definition = { name, version, description: tool.description, effect, parameters: structuredClone(prepared.schema),...(execution?{execution}:{}) };
    return { name, prepared, definition };
  }));
  for (const name of workbench.keys()) if (!Object.hasOwn(tools, name)) throw new Error(`Workbench 能力未装配执行入口：${name}`);
  return { definitions: entries.map(entry => entry.definition), parameters: Object.fromEntries(entries.map(entry => [entry.name, entry.prepared])) };
}
