import type { RequestContext } from "@creatoros/contract";
import type { ChatRuntime } from "./persistence-client";
import { chatExecutionResponse } from "./chat-execution-stream";

type OriginalTask={conversationId:string;sourceMessageId:string;executionTaskId:string;intent:"observe"|"resume"};
function originalTaskOf(raw:unknown):OriginalTask|null{
  if(!raw||typeof raw!=="object"||Array.isArray(raw))return null;
  const value=raw as Record<string,unknown>,ids=["conversationId","sourceMessageId","executionTaskId"];
  if(Object.keys(value).length!==4||ids.some(key=>typeof value[key]!=="string"||!(value[key] as string).trim()||(value[key] as string).length>160)||(value.intent!=="observe"&&value.intent!=="resume"))return null;
  return value as OriginalTask;
}
const refused=()=>Response.json({code:"CHAT_RESULT_UNCONFIRMED",error:"原任务状态或归属已变化，请核对历史记录；系统没有重新提交。"},{status:409});

/** 原回执只观察；明确继续仅交给既有安全 resume，绝不经过会创建重试任务的 submit。 */
export async function recoverChatExecution(runtime:ChatRuntime,ctx:RequestContext,raw:unknown,signal:AbortSignal):Promise<Response>{
  const original=originalTaskOf(raw);
  if(!original)return refused();
  try{
    signal.throwIfAborted();
    const execution=await runtime.durable.get(ctx,original.executionTaskId);
    if(execution.id!==original.executionTaskId||execution.kind!=="ai_task"||execution.ownerType!=="ai_task")return refused();
    const task=await runtime.ai.getTask(ctx,execution.ownerId);
    const input=task.inputData as Record<string,unknown>;
    if(task.id!==execution.ownerId||task.taskType!=="copilot.assist"||task.executionTaskId!==execution.id||input?.kind!=="chat.run"||input.conversationId!==original.conversationId||input.sourceMessageId!==original.sourceMessageId)return refused();
    const conversation=await runtime.ai.getConversation(ctx,original.conversationId);
    const messages=await runtime.ai.listMessages(ctx,original.conversationId);
    const source=messages.find(message=>message.id===original.sourceMessageId);
    if(conversation.id!==original.conversationId||(conversation.projectId??null)!==(task.projectId??null)||source?.role!=="user"||source.modelMetadata?.chatTaskId!==task.id)return refused();
    signal.throwIfAborted();
    if(original.intent==="resume"){
      // 错误码只选择用户明确要求的入口；真正恢复许可仍由后端逐条核验调用账本。
      // 未知工具、取消/失败终态与身份变化一律不会借此另建请求。
      if(execution.runtimeStatus!=="unknown_result"||execution.errorCode!=="MODEL_RESULT_UNKNOWN")return refused();
      await runtime.durable.command(ctx,execution.id,"resume");
      signal.throwIfAborted();
    }
    const response=chatExecutionResponse(runtime.durable,ctx,original,signal);
    response.headers.set("x-source-message-id",original.sourceMessageId);
    response.headers.set("x-ai-task-id",task.id);
    return response;
  }catch{
    // 包括后端拒绝混合未知工具的 resume；不回退提交，不泄露他人任务或私有异常。
    return refused();
  }
}
