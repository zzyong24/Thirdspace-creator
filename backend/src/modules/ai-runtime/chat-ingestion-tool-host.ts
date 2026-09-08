import type {RequestContext} from '@creatoros/contract';
import {agenticToolOutcomeSchema,type ExecutionRef} from '@creatoros/contract/execution-worker';
import type {ChatBackendTool} from '../execution/execution-chat-tool-ports.service';
import type {createChatHostContextReader} from '../ai/chat-host-context.service';
import type {ChatWorkerDispatcherDeps} from '../execution/model-worker-dispatcher';
import {canonicalJson} from '../ai/canonical-json';
import {buildChatTools,type ChatToolDeps} from './chat-tools';
import {prepareChatToolDefinitions} from './chat-tool-definitions';
import {getChatToolApprovalDecider,getChatToolNativeExecutor} from './chat-tool-gate';

export interface ChatIngestionToolPorts {
 captureScreenshot(ctx:RequestContext,input:{url:string;fullPage?:boolean;signal?:AbortSignal}):Promise<{assetId:string;name:string;previewUrl:string|null;sourceUrl:string}>;
 dispatchProjectTranscribe(ctx:RequestContext,input:{projectId:string;attemptId?:string}):Promise<{taskId:string}>;
 dispatchDouyinShare(ctx:RequestContext,input:{shareInput:string;transcribe:boolean}):Promise<{taskId:string;ownerId:string}>;
}
const names=new Set(['material.screenshot','project.transcribe','intelligence.douyin.share']);
/** 既有截图/采集服务的持久工具入口；不改变候选采纳和采集任务归属。 */
export function createChatIngestionTaskToolHost(reader:Pick<ReturnType<typeof createChatHostContextReader>,'read'>,ports:ChatIngestionToolPorts):NonNullable<ChatWorkerDispatcherDeps['resolveTools']>{
 async function current(ctx:RequestContext,execution:ExecutionRef,signal?:AbortSignal){
  signal?.throwIfAborted();const restored=await reader.read(execution);signal?.throwIfAborted();
  if(!ctx.accountId||restored.context.userId!==ctx.userId||restored.context.accountId!==ctx.accountId)throw Error('采集工具归属已变化');
  return restored;
 }
 return async(ctx,_input,execution,signal)=>{
  const initial=await current(ctx,execution,signal),definitions=initial.modelInput.tools.filter(t=>names.has(t.name));
  const prototypes=buildChatTools(definitions.map(t=>t.name),{} as ChatToolDeps),prepared=await prepareChatToolDefinitions(prototypes);
  if(canonicalJson(prepared.definitions)!==canonicalJson(definitions))throw Error('采集工具定义与原任务不符');
  return Object.fromEntries(definitions.map(definition=>[definition.name,{
   version:definition.version,effect:definition.effect,parameters:prepared.parameters[definition.name]!.parameters,
   async approve(context,input,scope){await current(context,scope.execution,scope.signal);return await getChatToolApprovalDecider(prototypes[definition.name]!)?.(input)??{status:'not-applicable'};},
   async execute(context,input,scope){
    const restored=await current(context,scope.execution,scope.signal);let failure:unknown;
    const invoke=async<T>(work:()=>Promise<T>)=>{try{scope.signal.throwIfAborted();const value=await work();scope.signal.throwIfAborted();return value;}catch(error){failure=error;throw error;}};
    const tools=buildChatTools([definition.name],{
     projectId:restored.hostContext.chatContext.projectId,
     humanizeError:()=>"采集操作未完成，请查看原任务状态。",
     captureScreenshot:(data:Parameters<ChatToolDeps["captureScreenshot"]>[0])=>invoke(()=>ports.captureScreenshot(restored.context,{...data,signal:scope.signal})),
     dispatchProjectTranscribe:async (data:Parameters<ChatToolDeps["dispatchProjectTranscribe"]>[0])=>{
      const projectId=data.projectId?.trim()||restored.hostContext.chatContext.projectId;
      if(!projectId)return {taskId:null,projectId:null,error:'请先选择需要转写的作品。'};
      const result=await invoke(()=>ports.dispatchProjectTranscribe(restored.context,{projectId,attemptId:`chat-transcribe:${scope.callId}`}));
      return {...result,projectId,error:null};
     },
     dispatchDouyinShare:async (data:Parameters<NonNullable<ChatToolDeps["dispatchDouyinShare"]>>[0])=>({...await invoke(()=>ports.dispatchDouyinShare(restored.context,data)),transcribe:data.transcribe,error:null}),
    } as unknown as ChatToolDeps);
    const tool=tools[definition.name]!,native=getChatToolNativeExecutor(tool);
    if(!native)throw Error('采集工具执行入口缺失');
    const data=await native(input,{toolCallId:scope.toolCallId,messages:[],abortSignal:scope.signal} as never);
    // 既有卡片包装会捕获服务异常；副作用端口未确认时不能当普通空结果重放。
    if(failure)throw failure;
    scope.signal.throwIfAborted();
    const record=data as {kind?:string;error?:unknown};if(record?.kind!==definition.name)throw Error('采集工具返回卡片不符');
    const failed=typeof record.error==='string'&&record.error.length>0;
    return agenticToolOutcomeSchema.parse({status:failed?'error':'ok',summary:failed?record.error:'已提交采集任务或生成待采纳素材',data,evidence:[],error:failed?{code:'invalid_input',retryable:false,recovery:record.error}:null,continuation:null,sideEffect:failed?'none':'committed'});
   },
  } satisfies ChatBackendTool]));
 };
}
