import {executionTaskSpec,type RequestContext} from "@creatoros/contract";
import {chatToolApprovalReceiptSchema,type ExecutionRef} from "@creatoros/contract/execution-worker";
import type {createAiService} from "../ai/ai.service";
import type {createChatHostContextReader} from "../ai/chat-host-context.service";
import type {ChatWorkerDispatcherDeps} from "../execution/model-worker-dispatcher";
import type {ChatBackendTool} from "../execution/execution-chat-tool-ports.service";
import {canonicalJson} from "../ai/canonical-json";
import {buildChatTools,type ChatToolDeps} from "./chat-tools";
import {prepareChatToolDefinitions} from "./chat-tool-definitions";
import {getChatToolApprovalDecider} from "./chat-tool-gate";
export interface ChatAgenticResearchTaskPorts {
 prepareTaskCommit:ReturnType<typeof createAiService>["prepareTaskCommit"];
 wakeTask(context:RequestContext,taskId:string):Promise<void>;
}
/** 仅创建 exec.agentic.research 子任务；Pi 循环、预算和浏览器授权继续由既有持久执行承担。 */
export function createChatAgenticResearchTaskHost(reader:Pick<ReturnType<typeof createChatHostContextReader>,"read">,ports:ChatAgenticResearchTaskPorts):NonNullable<ChatWorkerDispatcherDeps["resolveTools"]>{
 async function current(ctx:RequestContext,ref:ExecutionRef,signal?:AbortSignal){
  const owner={userId:ctx.userId,accountId:ctx.accountId};signal?.throwIfAborted();
  const restored=await reader.read({...ref});signal?.throwIfAborted();
  if(!owner.userId || !owner.accountId || restored.context.userId!==owner.userId || restored.context.accountId!==owner.accountId)throw new Error("自主调研工具账号与原任务不符");
  const frozen=restored.modelInput.tools.find(tool=>tool.name==="research.autonomous");
  if(!frozen || frozen.execution!=="host.task-submit")return null;
  const prototypes=buildChatTools(["research.autonomous"],{} as ChatToolDeps);
  const prepared=await prepareChatToolDefinitions(prototypes,{atomicAgenticResearch:true});
  if(canonicalJson(prepared.definitions[0])!==canonicalJson(frozen))throw new Error("自主调研工具定义与原任务不符");
  return {context:restored.context,chatContext:restored.hostContext.chatContext,tool:prototypes["research.autonomous"]!,definition:prepared.definitions[0]!,parameters:prepared.parameters["research.autonomous"]!.parameters};
 }
 return async(ctx,_input,execution,signal):Promise<Record<string,ChatBackendTool>>=>{
  const initial=await current(ctx,execution,signal);if(!initial)return {};
  return {"research.autonomous":{
   version:initial.definition.version,effect:"committed",execution:"host.task-submit",parameters:initial.parameters,wakeTask:ports.wakeTask,
   async approve(context,input,scope){
    try{const resolved=await current(context,scope.execution,scope.signal);if(!resolved || !resolved.parameters.safeParse(input).success)return {status:"unavailable"};
     const decide=getChatToolApprovalDecider(resolved.tool);return chatToolApprovalReceiptSchema.parse(decide?await decide(input):{status:"not-applicable"});
    }catch{return {status:"unavailable"};}
   },
   async prepareTask(context,input,scope){
    const resolved=await current(context,scope.execution,scope.signal);if(!resolved)throw new Error("原任务未启用自主调研提交");
    const parsed=resolved.parameters.parse(input) as {goal:string;browserAuthorization?:{allowedDomains:string[];allowInteraction:boolean}};
    // 归属只能取冻结聊天上下文；不接受模型指定账号、项目、任务类型、预算或授权回执。
    const projectId=resolved.chatContext.projectId || null;
    const goal=parsed.goal.trim();
    if(!goal)throw new Error("请提供具体调研目标");
    const spec=executionTaskSpec.parse({taskType:"agentic.research",goal,inputs:[],
      params:parsed.browserAuthorization?{browserAuthorization:structuredClone(parsed.browserAuthorization)}:{},
      constraints:{network:"deny",timeoutSec:600,maxOutputMB:512},
    });
    scope.signal?.throwIfAborted();
    const task=await ports.prepareTaskCommit(resolved.context,{taskType:"exec.agentic.research",attemptId:scope.attemptId,inputData:{...(projectId?{projectId}:{}),spec}});
    scope.signal?.throwIfAborted();
    return {task,result:child=>({status:"ok",summary:"已提交自主调研任务；搜索、阅读与核实完成后可在任务卡查看结果",evidence:[],data:{kind:"research.autonomous",taskId:child.id,projectId:child.projectId,error:null},error:null,continuation:null,sideEffect:"committed"})};
   },
  } satisfies ChatBackendTool};
 };
}
