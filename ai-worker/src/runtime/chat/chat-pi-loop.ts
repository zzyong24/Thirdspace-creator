import { streamText, jsonSchema, type ModelMessage, type ToolApprovalStatus, type UIMessage, type UIMessageChunk, type LanguageModel } from "ai";
import { createAssistantMessageEventStream, type AssistantMessage } from "@earendil-works/pi-ai";
import { loadChatPiAgent, type ChatPiAgent } from "./chat-pi-core";
import { windowChatPiMessages } from "./chat-pi-context";
import { sanitizeToolNames, sanitizeToolName, sanitizeSystemToolReferences } from "./tool-names";
import { buildForcedToolInstruction, buildForcedToolSequenceInstruction } from "./chat-loop-policy";

/** 协议续接文字不决定业务完成；完成判断来自冻结的业务 Skill。 */
export const CHAT_LENGTH_CONTINUATION = "上一次输出达到单次长度上限。请在当前任务与已有结果基础上继续未完成部分，不重复已成功的操作，直到交付满足本轮用户意图。";
interface Definition {name:string;description:string;parameters:Record<string,unknown>}
export interface ChatPiLoopOptions {
  model:LanguageModel; system:string;messages:ModelMessage[];definitions:Definition[];
  execute(name:string,input:unknown,options:{toolCallId:string}):Promise<unknown>;
  approve(name:string,input:unknown,options:{toolCallId:string}):Promise<ToolApprovalStatus>;
  approvalId(toolCallId:string):string;
  signal:AbortSignal;maxOutputTokens:number;messageId:string;
  forcedTool?:string;forcedToolSequence?:string[];
  onChunk?(chunk:UIMessageChunk):Promise<void>;
}
/**
 * Pi 是唯一的工具执行与会话循环。streamText 只适配一次供应商调用到既有 V4 账本，
 * 不给 SDK execute、approval 或多步循环；任务权、回执与副作用仍由后端持有。
 */
export async function runChatPiLoop(options:ChatPiLoopOptions){
  const Agent=await loadChatPiAgent();
  let agent:ChatPiAgent;
  let failure:unknown,awaitingApproval=false,finishReason="stop",turn=0;
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
        const forced=options.forcedToolSequence?.[step]??(step===0?options.forcedTool:undefined);
        // 单步协议适配：工具没有 execute，SDK 不会规划下一步或执行副作用。
        const window=windowChatPiMessages(history);
        const response=streamText({model:options.model,
          system:window.shortened?`${system}\n\n[传输上下文窗口] 较早的助手/工具回合已按时间省略，长工具结果可能仅展示片段；这不是摘要，也不代表原任务或资料被删除。用户原始要求仍保留，需要原证据时请继续读取。`:system,
          messages:window.messages,tools,maxRetries:0,

          maxOutputTokens:options.maxOutputTokens,abortSignal:AbortSignal.any([options.signal,idle.signal]),
          ...(forced?{toolChoice:{type:"tool" as const,toolName:sanitizeToolName(forced)}}:{}),
        });
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
          else if(event.type==="file" || event.type==="reasoning-file")parts.push({type:event.type,mediaType:event.file.mediaType,url:`data:${event.file.mediaType};base64,${event.file.base64}`});
          else if(event.type==="source")parts.push(event.sourceType==="url"
            ? {type:"source-url",sourceId:event.id,url:event.url,title:event.title}
            : {type:"source-document",sourceId:event.id,mediaType:event.mediaType,title:event.title,filename:event.filename});
          else if(event.type==="tool-call"){
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
        history.push({role:"tool",content:[{type:"tool-result",toolCallId,toolName:name,output:{type:"json",value:JSON.parse(JSON.stringify(output??null))}}]});
        return {content:[{type:"text" as const,text:JSON.stringify(output??null)}],details:output};
      }catch(error){failure??=error;agent.abort();throw error;}
    },
  }))},streamFn,toolExecution:"sequential"});
  const unsubscribe=agent.subscribe(event=>{
    if(event.type==="message_end" && !awaitingApproval && !failure){
      const length=event.message?.stopReason==="length";
      // SEMANTIC_BOUNDARY_ALLOW: 只识别供应商空响应，不判断内容质量或业务完成。
      const empty=finishReason==="stop" && event.message?.role==="assistant" && !event.message.content.some(part=>part.type==="toolCall" || (part.type==="text" && part.text.trim().length>0)) && !parts.some(part=>part.type==="file");
      if(!length && !empty)return;
      const continuation=length?CHAT_LENGTH_CONTINUATION:"上一轮响应没有可见正文或工具行动。请继续当前用户请求，执行所需工具或交付实际结果。";
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
    return {message,text:parts.filter(part=>part.type==="text").map(part=>part.text).join(""),finishReason,awaitingApproval};
  }finally{unsubscribe();options.signal.removeEventListener("abort",abort);}
}
