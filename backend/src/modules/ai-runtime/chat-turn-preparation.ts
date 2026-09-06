import { validateChatHostContext, type ChatHostContext } from "../ai/chat-host-context";
import {prepareChatToolDefinitions} from "./chat-tool-definitions";
import {prepareChatAssembly,latestUserText,detectCopilotMediaRoute,isScratchPositioningConversation,type runChatStream} from "./chat-runner";
import {prepareChatModelMessages} from "./chat-model-messages";
/** 新执行入口共用既有上下文、白名单、可信来源和历史转换；此步骤不取主模型凭据。 */
export async function prepareChatTurn(ctx:Parameters<typeof runChatStream>[0],input:Parameters<typeof runChatStream>[1],deps:Parameters<typeof runChatStream>[2]){
 const assembly=await prepareChatAssembly(ctx,input.chatContext,deps,detectCopilotMediaRoute(input.messages),{
  positioningScratch:isScratchPositioningConversation(input.messages),
  verbatimSources:input.trustedScriptSources??[],
  latestUserInstruction:latestUserText(input.messages),
 });
 const preparedTools=await prepareChatToolDefinitions(assembly.tools);
 return {assembly,toolParameters:preparedTools.parameters,toolDefinitions:preparedTools.definitions,modelMessages:await prepareChatModelMessages(input.messages,assembly)};
}

/** 仅接服务端已验归属的消息/来源与快照；不从客户端输入解析权限或当前配置。 */
export async function prepareDurableChatTurn(
 ctx: Parameters<typeof runChatStream>[0],
 input: Parameters<typeof runChatStream>[1],
 deps: Parameters<typeof runChatStream>[2],
 skillSnapshot: ChatHostContext["skillSnapshot"],
) {
 // 必须在首个 await 前复制，工具闭包也不能持有调用方可变的账号/选区对象。
 const context=structuredClone(ctx), messages=structuredClone(input.messages), abortSignal=input.abortSignal;
 if(!context.userId || !context.accountId) throw new Error("持久聊天准备缺少真实账号");
 const hostContext=validateChatHostContext({
  schemaVersion:1,chatContext:input.chatContext,
  mediaRoute:detectCopilotMediaRoute(messages),
  positioningScratch:isScratchPositioningConversation(messages),
  trustedScriptSources:input.trustedScriptSources??[],skillSnapshot,
 },{userId:context.userId,accountId:context.accountId,projectId:input.chatContext.projectId??null});
 const {runWithEffectiveSkillSnapshot}=await import("@creatoros/ai-worker");
 const prepared=await runWithEffectiveSkillSnapshot(hostContext.skillSnapshot,()=>prepareChatTurn(context,{
  messages,chatContext:hostContext.chatContext,trustedScriptSources:hostContext.trustedScriptSources,
  abortSignal,
 },deps));
 // 返回独立副本；调用方更改待持久化对象不会改变已建立的工具闭包。
 const completeHostContext=validateChatHostContext({
  ...hostContext,...(prepared.assembly.scriptHooksContext ? {scriptHooksContext:prepared.assembly.scriptHooksContext} : {}),
 },{userId:context.userId,accountId:context.accountId,projectId:hostContext.chatContext.projectId??null});
 return {...prepared,hostContext:structuredClone(completeHostContext)};
}
