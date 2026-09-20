import type {RequestContext} from "@creatoros/contract";
import type {ChatTurnInput,AssembleChatDeps} from "./chat-assembly-types";
import { validateChatHostContext, type ChatHostContext } from "../ai/chat-host-context";
import {prepareChatToolDefinitions} from "./chat-tool-definitions";
import {prepareChatAssembly} from "./chat-assembly";
import {latestUserText,detectCopilotMediaRoute,isScratchPositioningConversation} from "./chat-assembly-context";
import {prepareChatModelMessages} from "./chat-model-messages";
import {defineWorkbenchChatTool} from "./chat-tool-gate";
import {chatWorkbenchPlanCapability} from "./chat-workbench-plan-tool";
import type { WorkbenchCapability } from "@creatoros/contract/agent-workbench";
/** 新执行入口共用既有上下文、白名单、可信来源和历史转换；此步骤不取主模型凭据。 */
export async function prepareChatTurn(ctx:RequestContext,input:ChatTurnInput,deps:AssembleChatDeps,options:NonNullable<Parameters<typeof prepareChatToolDefinitions>[1]>={}){
 const frozenOptions={...options};
 const assembly=await prepareChatAssembly(ctx,input.chatContext,deps,detectCopilotMediaRoute(input.messages),{
  positioningScratch:isScratchPositioningConversation(input.messages),
  verbatimSources:input.trustedScriptSources??[],
  latestUserInstruction:latestUserText(input.messages),
 });
 if(options.workbenchCapabilities?.some(capability=>capability.name===chatWorkbenchPlanCapability.name)){
  assembly.tools[chatWorkbenchPlanCapability.name]=defineWorkbenchChatTool(chatWorkbenchPlanCapability,async()=>{throw new Error("PLAN_EXECUTION_REQUIRES_ORIGINAL_TASK_LEASE");});
 }
 for (const capability of options.workbenchCapabilities ?? []) {
  if (capability.name === chatWorkbenchPlanCapability.name) continue;
  if (Object.hasOwn(assembly.tools, capability.name)) throw new Error(`Workbench 能力覆盖正式工具：${capability.name}`);
  assembly.tools[capability.name] = defineWorkbenchChatTool(capability, async () => { throw new Error("WORKBENCH_EXECUTION_REQUIRES_ORIGINAL_TASK_LEASE"); });
 }
 const preparedTools=await prepareChatToolDefinitions(assembly.tools,frozenOptions);
 return {assembly,toolParameters:preparedTools.parameters,toolDefinitions:preparedTools.definitions,modelMessages:await prepareChatModelMessages(input.messages,assembly)};
}

/** 仅接服务端已验归属的消息/来源与快照；不从客户端输入解析权限或当前配置。 */
export async function prepareDurableChatTurn(
 ctx: RequestContext,
 input: ChatTurnInput,
 deps: AssembleChatDeps,
 skillSnapshot: ChatHostContext["skillSnapshot"],
 options: {atomicCoverGenerate?:boolean;atomicAgenticResearch?:boolean;workerScriptDraft?:boolean;workerWebRead?:boolean;workerResearch?:boolean;atomicMaterialGenerate?:boolean;atomicScriptReview?:boolean;atomicPublishPackage?:boolean;workbenchPlans?:boolean;workbenchCapabilities?:readonly WorkbenchCapability[];workbenchPlatform?:WorkbenchCapability["platforms"][number];scriptHooksGeneration?:ChatHostContext["scriptHooksGeneration"];structuredGeneration?:ChatHostContext["structuredGeneration"]} = {},
) {
 // 必须在首个 await 前复制，工具闭包也不能持有调用方可变的账号/选区对象。
 const context=structuredClone(ctx), messages=structuredClone(input.messages), abortSignal=input.abortSignal;
 const atomicCoverGenerate=options.atomicCoverGenerate===true;
 const atomicAgenticResearch=options.atomicAgenticResearch===true;
 const workerScriptDraft=options.workerScriptDraft===true;
 const workerWebRead=options.workerWebRead===true;
 const workerResearch=options.workerResearch===true;
 const atomicPublishPackage=options.atomicPublishPackage===true;
 const atomicScriptReview=options.atomicScriptReview===true;
 const atomicMaterialGenerate=options.atomicMaterialGenerate===true;
 const structuredGeneration=structuredClone(options.structuredGeneration);
 const scriptHooksGeneration=structuredClone(options.scriptHooksGeneration);
 const workbenchCapabilities=structuredClone([...(options.workbenchCapabilities??[])]);
 if(!context.userId || !context.accountId) throw new Error("持久聊天准备缺少真实账号");
 const hostContext=validateChatHostContext({
  schemaVersion:1,chatContext:input.chatContext,
  mediaRoute:detectCopilotMediaRoute(messages),
  positioningScratch:isScratchPositioningConversation(messages),
  trustedScriptSources:input.trustedScriptSources??[],skillSnapshot,
  ...(workerScriptDraft?{scriptDraftContext:{latestUserInstruction:latestUserText(messages)}}:{}),
 },{userId:context.userId,accountId:context.accountId,projectId:input.chatContext.projectId??null});
 const {runWithEffectiveSkillSnapshot}=await import("@creatoros/ai-worker");
 const prepared=await runWithEffectiveSkillSnapshot(hostContext.skillSnapshot,()=>prepareChatTurn(context,{
  messages,chatContext:hostContext.chatContext,trustedScriptSources:hostContext.trustedScriptSources,
  abortSignal,
 },deps,{atomicCoverGenerate,atomicAgenticResearch,workerScriptDraft,workerWebRead,workerResearch,atomicMaterialGenerate,atomicScriptReview,atomicPublishPackage,workerScriptHooks:Boolean(scriptHooksGeneration),atomicPlanningThesis:true,workerStructuredNodes:Boolean(structuredGeneration),workbenchCapabilities:[...(options.workbenchPlans?[chatWorkbenchPlanCapability]:[]),...workbenchCapabilities]}));
 if(structuredGeneration && prepared.toolDefinitions.some(tool=>tool.execution==="worker.structured-node" && !hostContext.skillSnapshot.skills.some(skill=>skill.skillId===(tool.name==="review.analyze"?"review.insights":tool.name))))throw new Error("原任务缺少生成节点 Skill");
 // 返回独立副本；调用方更改待持久化对象不会改变已建立的工具闭包。
 const completeHostContext=validateChatHostContext({
  ...hostContext,...(workerResearch && prepared.assembly.researchContext?{researchContext:prepared.assembly.researchContext}:{}),...(structuredGeneration && prepared.assembly.structuredContext ? {structuredContext:prepared.assembly.structuredContext,structuredGeneration} : {}),...(prepared.assembly.scriptHooksContext ? {scriptHooksContext:prepared.assembly.scriptHooksContext,...(scriptHooksGeneration?{scriptHooksGeneration}:{})} : {}),
 },{userId:context.userId,accountId:context.accountId,projectId:hostContext.chatContext.projectId??null});
 return {...prepared,workbenchCapabilities,...(workbenchCapabilities.length?{workbenchPlatform:options.workbenchPlatform}:{}),hostContext:structuredClone(completeHostContext)};
}
