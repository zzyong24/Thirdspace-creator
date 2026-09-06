import { convertToModelMessages,type UIMessage } from "ai";
import {projectChatHistory,formatChatContextLog,resolveToolResultKeepTurns,resolveTruncateKeepTurns,resolveContextWindowTokens,dropAbandonedApprovalParts,dropUnavailableScriptPatchParts} from "./chat-history-window";
/** 只处理喂模型的副本：先清理悬空工具，再按原规则截窗及转换附件，持久消息保持原样。 */
export async function prepareChatModelMessages(messages:UIMessage[],assembly:{system:string;tools:Record<string,unknown>}){
 const sanitized=dropUnavailableScriptPatchParts(dropAbandonedApprovalParts(messages),Boolean(assembly.tools["script.patch"]));
 const projection=projectChatHistory(sanitized,{
  systemText:assembly.system,
  keepToolResultTurns:resolveToolResultKeepTurns(process.env),
  keepTurns:resolveTruncateKeepTurns(process.env),
  contextWindowTokens:resolveContextWindowTokens(process.env),
 });
 console.info(formatChatContextLog(projection));
 return convertToModelMessages(projection.messages,{ignoreIncompleteToolCalls:true});
}
