import {z} from "zod";
import {prepareScriptDraftInput,finalizeScriptDraftImport,type PreparedScriptDraftInput} from "../ai-runtime/chat-script-draft-preparation";
import {createExecutionChatTextNodeService} from "./execution-chat-text-node.service";
import {createExecutionChatTaskSubmissionService,ChatTaskPreparationFailure} from "./execution-chat-task-submission.service";
import type {ChatBackendTool} from "./execution-chat-tool-ports.service";
import {ConflictError} from "./execution.errors";
const source=z.object({ref:z.string(),label:z.string(),text:z.string(),truncated:z.boolean(),sourceType:z.enum(["message","attachment","project_text"]).optional(),sourceId:z.string().optional()}).strict();
const draft=z.discriminatedUnion("mode",[
 z.object({mode:z.literal("generate"),dispatchInput:z.record(z.string(),z.json())}).strict(),
 z.object({mode:z.literal("verbatim"),source,authorization:z.object({prompt:z.string(),system:z.string()}).strict()}).strict(),
]);
const schema=z.object({prompt:z.string(),system:z.string(),draft:draft.optional(),error:z.string().optional(),mode:z.enum(["generate","verbatim"])}).strict();
/** 主模型只判授权；来源恢复、子任务与父回执的原子提交全部留在宿主。 */
export function createExecutionChatScriptDraftService(db:Parameters<typeof createExecutionChatTextNodeService>[0],deps:Omit<Parameters<typeof createExecutionChatTextNodeService>[1],"tools">&{tools:Record<string,ChatBackendTool>}){
 const submissions=createExecutionChatTaskSubmissionService(db,deps);
 return createExecutionChatTextNodeService(db,deps,{
  name:"script.draft",execution:"worker.script-draft",effect:"committed",version:"script.draft.v1",prefix:"script-draft",schema,
  maxOutputTokens(frozen){if(!frozen.hostContext.scriptDraftContext)throw new ConflictError("原任务缺少整稿授权上下文");return frozen.modelInput.maxOutputTokens;},
  async prepare(frozen,input){
   const args=z.record(z.string(),z.json()).parse(input),mode=args.mode==="verbatim"?"verbatim" as const:"generate" as const;
   try{
    const prepared=prepareScriptDraftInput(args,frozen.hostContext.trustedScriptSources,frozen.hostContext.scriptDraftContext!.latestUserInstruction);
    return schema.parse({mode,draft:JSON.parse(JSON.stringify(prepared)),...(prepared.mode==="verbatim"?prepared.authorization:{prompt:"",system:""})});
   }catch(error){return {mode,prompt:"",system:"",error:error instanceof Error?error.message:String(error)};}
  },
  hasModel:prepared=>schema.parse(prepared).draft?.mode==="verbatim",
  resumable:recovery=>recovery.scriptDrafts,
  finalize(){throw new ConflictError("整稿必须通过原子提交完成");},
  async commit(ref,input,signal){
   const prepared=schema.parse(input.prepared);
   return submissions.execute(ref,{callId:input.callId},signal,{
    inputDigest:input.inputDigest,children:input.children,
    async prepare(context,scope){
     let dispatch:Record<string,unknown>;
     try{
      if(prepared.error)throw new Error(prepared.error);
      if(!prepared.draft || input.unsupported)throw new Error("AI 没能可靠识别完整稿件边界，请再明确哪一段是稿件正文后重试。");
      dispatch=prepared.draft.mode==="generate"?prepared.draft.dispatchInput: {...finalizeScriptDraftImport(prepared.draft as Extract<PreparedScriptDraftInput,{mode:"verbatim"}>,input.text)};
     }catch(error){
      const message=error instanceof Error?error.message:String(error);
      throw new ChatTaskPreparationFailure({status:"error",summary:message,evidence:[],data:{kind:"script.draft",draftMode:prepared.mode,taskId:null,projectId:null,error:message},error:{code:"no_evidence",retryable:false,recovery:message},continuation:null,sideEffect:"none"});
     }
     const tool=deps.tools["script.draft"];
     if(!tool?.prepareTask)throw new ConflictError("整稿事务端口未装配");
     return tool.prepareTask(context,z.json().parse(JSON.parse(JSON.stringify(dispatch))),scope);
    },
   });
  },
 });
}
