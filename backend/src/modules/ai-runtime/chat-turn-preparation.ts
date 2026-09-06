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
