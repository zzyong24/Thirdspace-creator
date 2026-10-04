import {z} from 'zod';
import {CodexHostError,type CodexRpcSession,type CodexDynamicTool,codexThreadParameters,codexTurnParameters,verifyCodexThreadMcp} from './codex-app-server';
const record=(value:unknown):Record<string,unknown>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
const toolCall=z.object({threadId:z.string(),turnId:z.string(),callId:z.string().min(1).max(256),tool:z.string(),namespace:z.string().nullable().optional(),arguments:z.json()});
export interface NativeTurnResult{sessionId:string;providerTurnId:string;text:string;usage:{inputTokens:number|null;outputTokens:number|null;totalTokens:number|null;cachedReadTokens:number|null;thoughtTokens:number|null}|null}
function completedResult(threadId:string,turn:Record<string,unknown>,usage:NativeTurnResult['usage']):NativeTurnResult{
 if(turn.status!=='completed'||typeof turn.id!=='string'||!Array.isArray(turn.items))throw new CodexHostError('CODEX_TURN_RESULT_UNKNOWN');
 const messages=turn.items.map(record).filter(item=>item.type==='agentMessage'&&typeof item.text==='string');
 const final=messages.filter(item=>item.phase==='final_answer');
 const text=(final.length?final:messages).map(item=>item.text as string).join('\n\n');
 if(!text.trim()||text.length>2_000_000)throw new CodexHostError('CODEX_TURN_RESULT_UNKNOWN');
 return {sessionId:threadId,providerTurnId:turn.id,text,usage};
}
/** 恢复只对账同一真实回合，不发送提示词、不重放工具。 */
export async function recoverCodexNativeTurn(rpc:CodexRpcSession,threadId:string,providerTurnId?:string):Promise<NativeTurnResult>{
 if(!providerTurnId)throw new CodexHostError('CODEX_TURN_RESULT_UNKNOWN');
 const response=record(await rpc.request('thread/read',{threadId,includeTurns:true})),thread=record(response.thread);
 if(thread.id!==threadId||!Array.isArray(thread.turns))throw new CodexHostError('CODEX_TURN_RESULT_UNKNOWN');
 const turn=thread.turns.map(record).find(item=>item.id===providerTurnId);
 if(!turn)throw new CodexHostError('CODEX_TURN_RESULT_UNKNOWN');
 return completedResult(threadId,turn,null);
}
export async function runCodexNativeTurn(options:{rpc:CodexRpcSession;mcpNames:string[];cwd:string;prompt:string;signal:AbortSignal;tools:CodexDynamicTool[];
 onThread:(id:string)=>Promise<void>;onAdmission:(id:string)=>Promise<void>;onTurn:(id:string)=>Promise<void>;
 onTool:(callId:string,name:string,input:unknown)=>Promise<{text:string;success:boolean}>;onText?:(text:string)=>void|Promise<void>;
}):Promise<NativeTurnResult>{
 const {rpc,signal}=options;let threadId='',turnId='',usage:NativeTurnResult['usage']=null;
 let resolve!:(result:NativeTurnResult)=>void,reject!:(error:Error)=>void,acknowledged=false,acknowledgement:Promise<void>|undefined;
 const completion=new Promise<NativeTurnResult>((yes,no)=>{resolve=yes;reject=no;});
 // 预备失败可能在等待完成前发生；保留 rejection，避免未处理Promise告警。
 void completion.catch(()=>{});
 const knownTools=new Set(options.tools.map(tool=>tool.name));
 rpc.onFailure=error=>reject(error);
 rpc.onAbort=async()=>{
  try{if(threadId&&turnId)await rpc.request('turn/interrupt',{threadId,turnId},1000);}finally{reject(new CodexHostError('CODEX_TURN_CANCELLED'));}
 };
 const bindTurn=async(id:unknown)=>{
  if(typeof id!=='string'||!id||(turnId&&turnId!==id))throw new CodexHostError('CODEX_TURN_ID_MISMATCH');
  turnId=id;acknowledgement??=options.onTurn(id);await acknowledgement;acknowledged=true;
 };
 rpc.onRequest=async(method,raw)=>{
  if(method!=='item/tool/call')throw new CodexHostError('CODEX_INTERACTION_UNSUPPORTED');
  const params=toolCall.parse(raw);
  if(params.threadId!==threadId||params.turnId!==turnId||!acknowledged||!knownTools.has(params.tool)||params.namespace)throw new CodexHostError('CODEX_TOOL_SCOPE_MISMATCH');
  signal.throwIfAborted();const result=await options.onTool(params.callId,params.tool,params.arguments);
  signal.throwIfAborted();return {contentItems:[{type:'inputText',text:result.text}],success:result.success};
 };
 rpc.onNotification=async(method,raw)=>{
  const params=record(raw);if(params.threadId!==threadId)return;
  if(method==='turn/started'){await bindTurn(record(params.turn).id);return;}
  if(method==='item/agentMessage/delta'&&params.turnId===turnId&&typeof params.delta==='string'){signal.throwIfAborted();await options.onText?.(params.delta);return;}
  if(method==='thread/tokenUsage/updated'&&params.turnId===turnId){
   const last=record(record(params.tokenUsage).last),count=(key:string)=>typeof last[key]==='number'&&Number.isSafeInteger(last[key])&&(last[key] as number)>=0?last[key] as number:null;
   usage={inputTokens:count('inputTokens'),outputTokens:count('outputTokens'),totalTokens:count('totalTokens'),cachedReadTokens:count('cachedInputTokens'),thoughtTokens:count('reasoningOutputTokens')};
  }
  if(method==='turn/completed'){
   const turn=record(params.turn);if(turn.id!==turnId)return;
   try{signal.throwIfAborted();resolve(completedResult(threadId,turn,usage));}catch(error){reject(error as Error);}
  }
 };
 try{
  signal.throwIfAborted();const response=record(await rpc.request('thread/start',codexThreadParameters(options.cwd,options.tools)));
  const id=record(response.thread).id;if(typeof id!=='string'||!id)throw new CodexHostError('CODEX_THREAD_ID_MISSING');threadId=id;
  await options.onThread(threadId);await verifyCodexThreadMcp(rpc,threadId,options.mcpNames);
  signal.throwIfAborted();await options.onAdmission(threadId);signal.throwIfAborted();
  const started=record(await rpc.request('turn/start',codexTurnParameters(threadId,options.prompt)));
  await bindTurn(record(started.turn).id);
  return await completion;
 }finally{rpc.onFailure=undefined;rpc.onNotification=undefined;rpc.onRequest=undefined;rpc.onAbort=undefined;}
}
