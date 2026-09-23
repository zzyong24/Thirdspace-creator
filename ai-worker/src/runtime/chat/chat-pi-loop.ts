import type { LanguageModelV4, LanguageModelV4CallOptions } from "@ai-sdk/provider";
import { windowChatContextV2 } from "./chat-context-window-v2";
import { streamText, wrapLanguageModel, jsonSchema, type ModelMessage, type ToolApprovalStatus, type UIMessage, type UIMessageChunk, type LanguageModel } from "ai";
import { createAssistantMessageEventStream, type AssistantMessage } from "@earendil-works/pi-ai";
import { loadChatPiAgent, type ChatPiAgent } from "./chat-pi-core";
import { windowChatPiMessages } from "./chat-pi-context";
import { sanitizeToolNames, sanitizeToolName, sanitizeSystemToolReferences } from "./tool-names";
import { buildForcedToolInstruction, buildForcedToolSequenceInstruction } from "./chat-loop-policy";
import type { PiResultContent } from "../../capabilities/result-pages";

/** 协议续接文字不决定业务完成；完成判断来自冻结的业务 Skill。 */
export const CHAT_LENGTH_CONTINUATION = "上一次输出达到单次长度上限。请在当前任务与已有结果基础上继续未完成部分，不重复已成功的操作，直到交付满足本轮用户意图。";
export const CHAT_FINAL_RECOVERY = "[宿主生成的最终回复恢复，不是新任务] 上一轮在工具执行后结束，但缺少最终答复。不得调用工具、重复任何操作、生成或修改文件、提交任务或发布内容。仅根据本会话已有证据，用用户的语言给出非空最终答复：哪些已核实完成、哪些尚未完成、有哪些阻塞；只引用已经存在且核实的交付物，不把未完成事项说成已完成。";
export class ChatFinalRecoveryError extends Error {
  constructor(readonly code: "CHAT_FINAL_RECOVERY_EMPTY" | "CHAT_FINAL_RECOVERY_INCOMPLETE" | "CHAT_FINAL_RECOVERY_TOOL_CALL") { super(code); this.name = "ChatFinalRecoveryError"; }
}
export class ChatPlanProgressError extends Error {
  constructor(readonly code: "CHAT_PLAN_NO_PROGRESS" | "CHAT_PLAN_REQUIRES_USER", readonly stepTitles: string[]) { super(`${code}: ${stepTitles.join("、")}`); this.name = "ChatPlanProgressError"; }
}
export interface ChatPlanStatus {
  revision: number;
  /** 可信宿主根据已保存计划与调用回执生成；同一令牌表示没有新进展。 */
  progressToken: string;
  /** 历史模型停止点后已创建过聊天 root 调用（任意状态）；恢复时保持原续行提示。 */
  hasSuccessor?: boolean;
  steps: Array<{stepId:string;title:string;status:"pending"|"running"|"waiting_user"|"succeeded"|"failed"|"cancelled"|"skipped"}>;
}
interface Definition {name:string;description:string;parameters:Record<string,unknown>}
export interface ChatPiLoopOptions {
  contextPolicyVersion?:2;
  model:LanguageModel; system:string;messages:ModelMessage[];definitions:Definition[];
  execute(name:string,input:unknown,options:{toolCallId:string}):Promise<unknown>;
  /** 原回执已结算后，仅投影给模型；UI 卡片继续使用完整业务结果。 */
  presentToolResult?(name:string,output:unknown,toolCallId:string):Promise<PiResultContent[]|null>;
  approve(name:string,input:unknown,options:{toolCallId:string}):Promise<ToolApprovalStatus>;
  approvalId(toolCallId:string):string;
  signal:AbortSignal;maxOutputTokens:number;messageId:string;
  forcedTool?:string;forcedToolSequence?:string[];
  /** 仅由宿主冻结的新运行策略启用；旧账本回放必须沿用原请求序列。 */
  recoverMissingFinal?:boolean;
  terminalToolFailurePolicyVersion?:1;
  /** 由宿主读取原 execution_tasks 计划，不能由模型文本推断完成。 */
  readPlanStatus?():Promise<ChatPlanStatus|null>;
  onChunk?(chunk:UIMessageChunk):Promise<void>;
  replayProjection?:{
    original:ReadonlyMap<string,readonly {current:string;legacy:string}[]>;
    capture(build:()=>Promise<LanguageModelV4CallOptions["prompt"]>):void;
  };
}
/**
 * Pi 是唯一的工具执行与会话循环。streamText 只适配一次供应商调用到既有 V4 账本，
 * 不给 SDK execute、approval 或多步循环；任务权、回执与副作用仍由后端持有。
 */
export async function runChatPiLoop(options:ChatPiLoopOptions){
  const Agent=await loadChatPiAgent();
  let agent:ChatPiAgent;
  let failure:unknown,awaitingApproval=false,finishReason="stop",turn=0;
  let completedTool=false,finalRecovery=false,lastMessageHasFile=false,lengthContinuations=0;
  const terminalPlanFailureState:{stepIds:string[]|null}={stepIds:null};
  const terminalToolFailureState:{callIds:string[]|null}={callIds:null};
  const nonRetryableToolFailures=new Map<string,{callIds:string[]}>();
  let planStatus:ChatPlanStatus|null=null,lastPlanProgress:string|null=null,stalledTurns=0;
  const history:ModelMessage[]=[...options.messages];
  const parts:UIMessage["parts"]=[];
  const definitions=sanitizeToolNames(Object.fromEntries(options.definitions.map(def=>[def.name,def])));
  const tools=Object.fromEntries(Object.entries(definitions).map(([name,def])=>[name,{description:def.description,inputSchema:jsonSchema(def.parameters)}]));
  const system=sanitizeSystemToolReferences(options.forcedToolSequence?.length
    ? `${options.system}\n\n${buildForcedToolSequenceInstruction(options.forcedToolSequence.map(sanitizeToolName))}`
    : options.forcedTool?`${options.system}\n\n${buildForcedToolInstruction(sanitizeToolName(options.forcedTool))}`:options.system,
    Object.fromEntries(options.definitions.map(def=>[def.name,def])));
  const blank=():AssistantMessage=>({role:"assistant",content:[],api:"openai-completions",provider:"creatoros-durable",model:"chat",usage:{input:0,output:0,cacheRead:0,cacheWrite:0,totalTokens:0,cost:{input:0,output:0,cacheRead:0,cacheWrite:0,total:0}},stopReason:"stop",timestamp:0});
  const streamFn=()=>{
    const events=createAssistantMessageEventStream();
    void(async()=>{
      const message=blank();
      const idle=new AbortController();
      let idleTimer:ReturnType<typeof setTimeout>|undefined;
      const heartbeat=()=>{clearTimeout(idleTimer);idleTimer=setTimeout(()=>idle.abort(new Error("CHAT_MODEL_IDLE_TIMEOUT")),180_000);};
      try{
        heartbeat();
        options.signal.throwIfAborted();
        if(awaitingApproval)throw Error("CHAT_APPROVAL_PENDING");
        const step=turn++;
        if(terminalToolFailureState.callIds && !finalRecovery){
          // Pi 在工具回执后会自动请求下一轮；在该轮开始时切换成无工具收口，避免重复错误再次派发。
          finalRecovery=true;
          history.push({role:"user",content:CHAT_FINAL_RECOVERY});
        }
        const recoveryRequest=finalRecovery;
        lastMessageHasFile=false;
        const forced=options.forcedToolSequence?.[step]??(step===0?options.forcedTool:undefined);
        // 单步协议适配：工具没有 execute，SDK 不会规划下一步或执行副作用。
        const projectWindow=(messages:ModelMessage[])=>options.contextPolicyVersion===2 ? windowChatContextV2(messages,system,options.definitions,240000,options.messages.length) : windowChatPiMessages(messages);
        const window=projectWindow(history);
        const windowSystem=(value:typeof window)=>value.shortened?`${system}\n\n[传输上下文窗口] ${options.contextPolicyVersion===2?"较早消息与长结果可能省略，这不是语义摘要。需要原用户约束时先调用 history.read（不传索引）获取冻结历史目录再分页读回；工具结果调用 tool.result.read（不传toolCallId）获取已结算结果目录，禁止重做原操作。":"较早的助手/工具回合已按时间省略，长工具结果可能仅展示片段；这不是摘要，也不代表原任务或资料被删除。用户原始要求仍保留，需要原证据时请继续读取。"}`:system;
        const requestOptions={tools:recoveryRequest?{}:tools,maxRetries:0,maxOutputTokens:options.maxOutputTokens,
          abortSignal:AbortSignal.any([options.signal,idle.signal]),
          ...(recoveryRequest?{toolChoice:"none" as const}:forced?{toolChoice:{type:"tool" as const,toolName:sanitizeToolName(forced)}}:{})};
        if(options.replayProjection){
          // 仅改本轮宿主投影，冻结的用户/助手/工具历史不参与替换。
          // 两个候选走同一个窗口算法，长 JSON 再次裁剪后仍能做完整摘要匹配。
          const legacyHistory=history.map((message,index):ModelMessage=>{
            if(index<options.messages.length || message.role!=="tool")return message;
            return {...message,content:message.content.map(part=>{
              if(part.type!=="tool-result" || part.output.type!=="content")return part;
              const pairs=options.replayProjection!.original.get(part.toolCallId);
              if(!pairs)return part;
              return {...part,output:{...part.output,value:part.output.value.map(item=>item.type==="text"
                ? {...item,text:pairs.find(pair=>pair.current===item.text)?.legacy??item.text}:item)}};
            })};
          });
          const legacyWindow=projectWindow(legacyHistory);
          // notice 长度可能改变整回合保留集合与 shortened/system 后缀。
          // 完整旧窗口走同一个 SDK 的规范化；捕获模型绝不进入账本或供应商。
          options.replayProjection.capture(async()=>{
            let prompt:LanguageModelV4CallOptions["prompt"]|undefined;
            if(typeof options.model==="string")throw Error("CHAT_REPLAY_REQUIRES_RESOLVED_MODEL");
            const captureModel=wrapLanguageModel({model:options.model as LanguageModelV4,middleware:{
              specificationVersion:"v4",
              wrapGenerate:async()=>{throw Error("CHAT_REPLAY_REQUIRES_STREAM");},
              wrapStream:async({params})=>{
                prompt=params.prompt;
                return {stream:new ReadableStream({start(controller){
                  controller.enqueue({type:"finish",finishReason:{unified:"stop",raw:"stop"},usage:{inputTokens:{total:0,noCache:0,cacheRead:0,cacheWrite:0},outputTokens:{total:0,text:0,reasoning:0}}});
                  controller.close();
                }})};
              },
            }});
            const normalized=streamText({...requestOptions,model:captureModel,system:windowSystem(legacyWindow),messages:legacyWindow.messages});
            for await(const event of normalized.fullStream)if(event.type==="error")throw event.error;
            if(!prompt)throw Error("CHAT_REPLAY_PROMPT_UNAVAILABLE");
            return prompt;
          });
        }
        const response=streamText({...requestOptions,model:options.model,system:windowSystem(window),messages:window.messages});
        parts.push({type:"step-start"});
        events.push({type:"start",partial:message});
        let text="",reasoning="";
        for await(const event of response.fullStream){
          // 首响应前也计时；每个新供应商事件刷新，绝不累计成整项任务截止。
          heartbeat();
          if(event.type==="error")throw event.error;
          if(event.type==="text-delta"){
            text+=event.text;
            await options.onChunk?.({type:"text-delta",id:`${options.messageId}:${step}`,delta:event.text});
          }else if(event.type==="reasoning-delta")reasoning+=event.text;
          else if(event.type==="file" || event.type==="reasoning-file"){
            if(event.type==="file")lastMessageHasFile=true;
            parts.push({type:event.type,mediaType:event.file.mediaType,url:`data:${event.file.mediaType};base64,${event.file.base64}`});
          }
          else if(event.type==="source")parts.push(event.sourceType==="url"
            ? {type:"source-url",sourceId:event.id,url:event.url,title:event.title}
            : {type:"source-document",sourceId:event.id,mediaType:event.mediaType,title:event.title,filename:event.filename});
          else if(event.type==="tool-call"){
            if(recoveryRequest)throw new ChatFinalRecoveryError("CHAT_FINAL_RECOVERY_TOOL_CALL");
            const def=definitions[event.toolName];
            if(!def)throw Error("CHAT_TOOL_OUTSIDE_FROZEN_SCOPE");
            // Pi 仅派发已结算调用 ID；真实参数由宿主从模型回执恢复和校验，
            // 不让第二次 SDK 参数校验吞掉错误调用而绕过工具账本。
            message.content.push({type:"toolCall",id:event.toolCallId,name:event.toolName,arguments:{}});
            parts.push({type:`tool-${event.toolName}`,toolCallId:event.toolCallId,input:event.input,state:"input-available"} as UIMessage["parts"][number]);
          }
        }
        finishReason=await response.finishReason;
        if(text){message.content.unshift({type:"text",text});parts.push({type:"text",text,state:"done"});}
        if(reasoning)parts.push({type:"reasoning",text:reasoning,state:"done"});
        const result=await response.response;
        history.push(...result.messages.filter(message=>message.role==="assistant"));
        const usage=await response.usage;
        message.usage={...message.usage,input:usage.inputTokens??0,output:usage.outputTokens??0,totalTokens:usage.totalTokens??0};
        message.stopReason=message.content.some(part=>part.type==="toolCall")?"toolUse":finishReason==="length"?"length":"stop";
        if(finishReason==="error" || finishReason==="unknown")throw Error("CHAT_MODEL_FINISH_UNKNOWN");
        planStatus=null;
        if(!recoveryRequest && message.stopReason==="stop" && options.readPlanStatus){
          planStatus=await options.readPlanStatus();
          const waiting=planStatus?.steps.filter(step=>step.status==="waiting_user")??[];
          if(waiting.length)throw new ChatPlanProgressError("CHAT_PLAN_REQUIRES_USER",waiting.map(step=>step.title));
        }
        if(recoveryRequest){
          if(!text.trim())throw new ChatFinalRecoveryError("CHAT_FINAL_RECOVERY_EMPTY");
          if(finishReason!=="stop")throw new ChatFinalRecoveryError("CHAT_FINAL_RECOVERY_INCOMPLETE");
        }
        events.push({type:"done",reason:message.stopReason,message});
      }catch(error){
        failure??=error;message.stopReason=options.signal.aborted?"aborted":"error";
        message.errorMessage=error instanceof Error?error.message:String(error);
        events.push({type:"error",reason:message.stopReason,error:message});
      }finally{clearTimeout(idleTimer);}
    })();
    return events;
  };
  agent=new Agent({initialState:{systemPrompt:system,tools:Object.entries(definitions).map(([name,def])=>({
    name,label:def.name,description:def.description,
    // 后端保留唯一参数权威；不能让 Pi 在账本外吞掉参数错误、制造未结算工具。
    parameters:{type:"object",additionalProperties:true},
    async execute(toolCallId,args){
      try{
        options.signal.throwIfAborted();
        if(awaitingApproval) return {content:[{type:"text" as const,text:"等待用户授权"}]};
        const decision=await options.approve(def.name,args,{toolCallId});
        const status=typeof decision==="object"?decision.type:decision;
        const part=parts.find(value=>"toolCallId" in value && value.toolCallId===toolCallId) as Record<string,unknown>|undefined;
        if(status==="user-approval"){
          awaitingApproval=true;
          if(part){part.state="approval-requested";part.approval={id:options.approvalId(toolCallId)};}
          agent.abort();
          return {content:[{type:"text" as const,text:"等待用户授权，本次尚未执行。"}]};
        }
        let output:unknown;
        if(status==="denied"){
          output={denied:true};if(part){part.state="output-denied";part.approval={id:options.approvalId(toolCallId),approved:false};}
        }else{
          output=await options.execute(def.name,args,{toolCallId});
          if(part){part.state="output-available";part.output=output;}
        }
        const failureRecord=output&&typeof output==="object"&&!Array.isArray(output)?output as Record<string,unknown>:{},errorRecord=failureRecord.error&&typeof failureRecord.error==="object"&&!Array.isArray(failureRecord.error)?failureRecord.error as Record<string,unknown>:{};
        if(options.terminalToolFailurePolicyVersion===1 && failureRecord.status==="error" && failureRecord.sideEffect==="none" && errorRecord.retryable===false && typeof errorRecord.code==="string"){
          const canonical=(value:unknown):unknown=>Array.isArray(value)?value.map(canonical):value&&typeof value==="object"?Object.fromEntries(Object.entries(value as Record<string,unknown>).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>[key,canonical(item)])):value;
          const signature=JSON.stringify([def.name,errorRecord.code,canonical(args)]);
          const previous=nonRetryableToolFailures.get(signature);
          const callIds=[...(previous?.callIds??[]),toolCallId];
          nonRetryableToolFailures.set(signature,{callIds});
          if(callIds.length>=2)terminalToolFailureState.callIds=callIds;
        }
        completedTool=true;
        const presented=await options.presentToolResult?.(def.name,output,toolCallId);
        const content=presented??[{type:"text" as const,text:JSON.stringify(output??null)}];
        history.push({role:"tool",content:[{type:"tool-result",toolCallId,toolName:name,output:presented?{type:"content" as const,value:content.map(item=>item.type==="image"?{type:"file" as const,data:{type:"data" as const,data:item.data},mediaType:item.mimeType}:item)}:{type:"json" as const,value:JSON.parse(JSON.stringify(output??null))}}]});
        return {content,details:output};
      }catch(error){failure??=error;agent.abort();throw error;}
    },
  }))},streamFn,toolExecution:"sequential"});
  const unsubscribe=agent.subscribe(event=>{
    if(event.type==="message_end" && !awaitingApproval && !failure){
      const length=event.message?.stopReason==="length";
      // SEMANTIC_BOUNDARY_ALLOW: 只识别供应商空响应，不判断内容质量或业务完成。
      const empty=finishReason==="stop" && event.message?.role==="assistant" && !event.message.content.some(part=>part.type==="toolCall" || (part.type==="text" && part.text.trim().length>0)) && !(options.recoverMissingFinal?lastMessageHasFile:parts.some(part=>part.type==="file"));
      const unfinished=event.message?.role==="assistant" ? planStatus?.steps.filter(step=>step.status==="pending" || step.status==="running" || step.status==="failed" || step.status==="cancelled" || step.status==="skipped")??[] : [];
      const failed=event.message?.role==="assistant" ? planStatus?.steps.filter(step=>step.status==="failed" || step.status==="cancelled" || step.status==="skipped")??[] : [];
      const active=event.message?.role==="assistant" ? planStatus?.steps.some(step=>step.status==="pending" || step.status==="running" || step.status==="waiting_user")??false : false;
      if(!length && finishReason==="stop" && failed.length && !active && !planStatus?.hasSuccessor){terminalPlanFailureState.stepIds=failed.map(step=>step.stepId);return;}
      if(!length && !empty && !unfinished.length)return;
      if(options.recoverMissingFinal && empty && !unfinished.length){
        // 空答复只补一次无工具终稿；无论前面是否执行过工具，都不能无限续问。
        if(finalRecovery){failure??=new ChatFinalRecoveryError("CHAT_FINAL_RECOVERY_EMPTY");agent.abort();return;}
        finalRecovery=true;
        history.push({role:"user",content:CHAT_FINAL_RECOVERY});
        agent.followUp({role:"user",content:CHAT_FINAL_RECOVERY,timestamp:0});
        return;
      }
      // 单次截断先在同一任务内自动续写；供应商若持续截断，有限次数后保留
      // 已结算的全部正文并以 partial 收口，避免 Agent 永久占用运行态。
      if(length && lengthContinuations>=2)return;
      if(length)lengthContinuations++;
      if(!length && unfinished.length){
        const token=planStatus!.progressToken;
        stalledTurns=token===lastPlanProgress?stalledTurns+1:0;
        lastPlanProgress=token;
        if(stalledTurns>=2){failure??=new ChatPlanProgressError("CHAT_PLAN_NO_PROGRESS",unfinished.map(step=>step.title));agent.abort();return;}
      }
      const continuation=length?CHAT_LENGTH_CONTINUATION:unfinished.length
        ? `当前已接受计划仍有未完成步骤：${unfinished.map(step=>step.title).join("、")}。请沿原任务继续调用必要工具，核对回执与文件后再交付；不要仅凭上轮正文宣称完成。`
        :"上一轮响应没有可见正文或工具行动。请继续当前用户请求，执行所需工具或交付实际结果。";
      history.push({role:"user",content:continuation});
      agent.followUp({role:"user",content:continuation,timestamp:0});
    }
  });
  const abort=()=>agent.abort();options.signal.addEventListener("abort",abort,{once:true});
  try{
    options.signal.throwIfAborted();
    // 真正给模型的输入是上方冻结历史；Pi 的启动消息仅触发其工具循环。
    await agent.prompt("执行当前已绑定的用户请求");
    if(failure && !awaitingApproval)throw failure;
    options.signal.throwIfAborted();
    const message:UIMessage={id:options.messageId,role:"assistant",parts};
    const terminalPlanFailureStepIds=terminalPlanFailureState.stepIds;
    const terminalToolFailureCallIds=terminalToolFailureState.callIds;
    return {message,text:parts.filter(part=>part.type==="text").map(part=>part.text).join(""),finishReason,awaitingApproval,...(terminalPlanFailureStepIds?{terminalPlanFailureStepIds}:{}),...(terminalToolFailureCallIds?{terminalToolFailureCallIds}:{})};
  }finally{unsubscribe();options.signal.removeEventListener("abort",abort);}
}
