import {z} from "zod";
import type {RequestContext} from "@creatoros/contract";
import {agenticToolOutcomeSchema,type ExecutionRef} from "@creatoros/contract/execution-worker";
import type {createChatHostContextReader} from "../ai/chat-host-context.service";
import type {ChatWorkerDispatcherDeps} from "../execution/model-worker-dispatcher";
import type {ChatBackendTool} from "../execution/execution-chat-tool-ports.service";
import type {createLocalReadHost} from "./local-read-host";
import {canonicalJson} from "../ai/canonical-json";
import {buildChatTools,type ChatToolDeps} from "./chat-tools";
import {prepareChatToolDefinitions} from "./chat-tool-definitions";
import {getChatToolApprovalDecider,getChatToolNativeExecutor} from "./chat-tool-gate";

export type ChatLocalReadPorts=Pick<ReturnType<typeof createLocalReadHost>,"readLocalFile"|"decideLocalReadAccess">;
const blocked=(summary:string,data:unknown)=>agenticToolOutcomeSchema.parse({status:"blocked",summary,evidence:[],data,error:{code:"permission",retryable:false,recovery:"按原卡片完成授权或选择文件后继续"},continuation:null,sideEffect:"none"});

/** 本机短读取由宿主执行；一次授权属于副作用，必须经执行账本保存回执后才能回放。 */
export function createChatLocalReadTaskToolHost(reader:Pick<ReturnType<typeof createChatHostContextReader>,"read">,ports:ChatLocalReadPorts):NonNullable<ChatWorkerDispatcherDeps["resolveTools"]>{
 async function current(context:RequestContext,execution:ExecutionRef,signal?:AbortSignal){
  const owner={userId:context.userId,accountId:context.accountId??null,groupId:context.groupId??null};signal?.throwIfAborted();
  const restored=structuredClone(await reader.read({...execution}));signal?.throwIfAborted();
  if(!owner.userId || (!owner.accountId && !owner.groupId) || restored.context.userId!==owner.userId || (restored.context.accountId??null)!==owner.accountId || (restored.context.groupId??null)!==owner.groupId)throw new Error("本地读取账号与原任务不符");
  const frozen=restored.modelInput.tools.find(tool=>tool.name==="local.read");if(!frozen)return null;
  const prototype=buildChatTools(["local.read"],{
   decideLocalRead:async input=>{signal?.throwIfAborted();const decision=await ports.decideLocalReadAccess(restored.context,input);signal?.throwIfAborted();return decision;},
  } as ChatToolDeps)["local.read"]!;
  const prepared=await prepareChatToolDefinitions({"local.read":prototype});
  if(canonicalJson(prepared.definitions[0])!==canonicalJson(frozen))throw new Error("本地读取定义与原任务不符");
  return {context:restored.context,prototype,definition:prepared.definitions[0]!,parameters:prepared.parameters["local.read"]!.parameters};
 }
 return async(context,_input,execution,signal):Promise<Record<string,ChatBackendTool>>=>{
  const initial=await current(context,execution,signal);if(!initial)return {};
  return {"local.read":{
   version:initial.definition.version,effect:"committed",parameters:initial.parameters,
   async approve(ctx,input,scope){
    try{const resolved=await current(ctx,scope.execution,scope.signal);if(!resolved || !resolved.parameters.safeParse(input).success)return {status:"unavailable"};
     return await getChatToolApprovalDecider(resolved.prototype)!(input);
    }catch{return {status:"unavailable"};}
   },
   async execute(ctx,input,scope){
    const resolved=await current(ctx,scope.execution,scope.signal);if(!resolved)throw new Error("原任务没有本地读取工具");
    const parsed=resolved.parameters.parse(input) as {path:string;offset?:number;maxChars?:number};
    const decision=await getChatToolApprovalDecider(resolved.prototype)!(parsed);
    if(decision.status!=="not-applicable")return blocked(decision.status==="denied"?"本次读取已被拒绝":"本次读取需要用户授权",{kind:"local.read",recoveryState:"chat_authorization_required",...(decision.status==="denied"?{denied:true}:{})});
    scope.signal.throwIfAborted();
    // 先取得宿主事实，再用原工具投影卡片。不能让旧 execute 的 catch 把未知提交变成可重试错误。
    const fact=await ports.readLocalFile(resolved.context,{path:parsed.path.trim(),signal:scope.signal});
    const projectionPorts:Pick<ChatToolDeps,"readLocal">={readLocal:async()=>fact};
    const prototype=buildChatTools(["local.read"],projectionPorts as ChatToolDeps)["local.read"]!;
    const data=z.json().parse(JSON.parse(JSON.stringify(await getChatToolNativeExecutor(prototype)!(parsed,{}))));
    if(fact.status==="denied")return agenticToolOutcomeSchema.parse({status:"error",summary:"当前路径不可读取",evidence:[],data,error:{code:"no_evidence",retryable:false,recovery:"按工具说明提供可读取的文件或上传素材"},continuation:null,sideEffect:"none"});
    if(fact.status!=="file" && fact.status!=="dir")return blocked("需要用户确认读取目标",{...data as Record<string,unknown>,recoveryState:"chat_authorization_required"});
    // 成功事实可能已经消费授权；即使随后取消也交给账本结算，不伪装成无副作用错误。
    return agenticToolOutcomeSchema.parse({status:"ok",summary:fact.status==="file"?"已读取本地文件正文":"已读取本地目录清单",evidence:[],data,error:null,continuation:null,sideEffect:"committed"});
   },
  }};
 };
}
