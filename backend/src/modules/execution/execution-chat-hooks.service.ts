import { z } from "zod";
import { prepareScriptHooks, finalizeHookItems } from "@creatoros/ai-worker/chat";
import { clampExtraBrief } from "../ai-runtime/chat-tools";
import { ConflictError } from "./execution.errors";
import { createExecutionChatTextNodeService } from "./execution-chat-text-node.service";
const argsSchema = z.object({topic:z.string().optional(),direction:z.string().optional(),extraBrief:z.string().optional()}).strict();
const preparationSchema=z.object({prompt:z.string(),system:z.string(),grounding:z.array(z.string())}).strict();
/** 开场仍使用原提示词、主模型身份、操作键与持久化节点版本。 */
export function createExecutionChatHooksService(...[db,deps]:[Parameters<typeof createExecutionChatTextNodeService>[0],Parameters<typeof createExecutionChatTextNodeService>[1]]) {
  return createExecutionChatTextNodeService(db,deps,{
    name:"script.hooks",execution:"worker.script-hooks",effect:"proposal",version:"script.hooks.v1",prefix:"hooks",schema:preparationSchema,
    maxOutputTokens(frozen){
      if(!frozen.hostContext.scriptHooksContext || !frozen.hostContext.scriptHooksGeneration)throw new ConflictError("原任务缺少冻结开场生成配置");
      return frozen.hostContext.scriptHooksGeneration.maxOutputTokens;
    },
    async prepare(frozen,input){const args=argsSchema.parse(input);return prepareScriptHooks(frozen.hostContext.scriptHooksContext!,{...args,extraBrief:clampExtraBrief(args.extraBrief)});},
    hasModel:()=>true,resumable:recovery=>recovery.resumableHooks,
    finalize(text,unsupported,prepared){return unsupported?
      {status:"error",summary:"模型未返回可用的开场文本",evidence:[],error:{code:"no_evidence",retryable:false,recovery:"检查模型返回格式后重新发起生成"},continuation:null,sideEffect:"none"}:
      {status:"ok",summary:"开场候选已生成",evidence:[],data:{kind:"script.hooks",items:finalizeHookItems(text,preparationSchema.parse(prepared).grounding)},error:null,continuation:null,sideEffect:"proposal"};},
  });
}
