import { buildChatTools, type ChatToolDeps } from "./chat-tools";
import { prepareChatToolDefinitions } from "./chat-tool-definitions";
import type { chatWorkerInputSchema } from "@creatoros/contract/execution-worker";
import type { z } from "zod";

/** 原生产解析顺序是旧调用摘要的一部分；恢复时先核对完整定义，不能由 JSONB 键序重建。 */
export async function resolveSubmittedChatToolParameters(frozen:z.infer<typeof chatWorkerInputSchema>["tools"][number]) {
 const tools=buildChatTools([frozen.name],{} as ChatToolDeps);
 const prepared=await prepareChatToolDefinitions(tools,{
  workerScriptDraft:frozen.execution==="worker.script-draft",
  atomicCoverGenerate:true,atomicAgenticResearch:true,atomicPlanningThesis:true,
  atomicMaterialGenerate:true,atomicScriptReview:true,atomicPublishPackage:true,
 });
 const actual=prepared.definitions[0];
 if(!actual || actual.name!==frozen.name || actual.version!==frozen.version || actual.execution!==frozen.execution || actual.effect!==frozen.effect)throw new Error("提交工具定义版本不兼容");
 return prepared.parameters[frozen.name]!;
}
