import {z} from 'zod';
import {CodexHostError,type CodexRpcSession,type CodexDynamicTool,codexThreadParameters,codexTurnParameters,verifyCodexThreadMcp} from './codex-app-server';
const record=(value:unknown):Record<string,unknown>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
const toolCall=z.object({threadId:z.string(),turnId:z.string(),callId:z.string().min(1).max(256),tool:z.string(),namespace:z.string().nullable().optional(),arguments:z.json()});
export interface NativeTurnResult{sessionId:string;providerTurnId:string;text:string;images?:Array<{id:string;base64:string}>;model?:string;modelProvider?:string;usage:{inputTokens:number|null;outputTokens:number|null;totalTokens:number|null;cachedReadTokens:number|null;thoughtTokens:number|null}|null}
function completedResult(threadId:string,turn:Record<string,unknown>,usage:NativeTurnResult['usage']):NativeTurnResult{
 if(turn.status!=='completed'||typeof turn.id!=='string'||!Array.isArray(turn.items)||(turn.itemsView!==undefined&&turn.itemsView!=='full'))throw new CodexHostError('CODEX_TURN_RESULT_UNKNOWN');
 const messages=turn.items.map(record).filter(item=>item.type==='agentMessage'&&typeof item.text==='string');
 const final=messages.filter(item=>item.phase==='final_answer');
 const text=(final.length?final:messages).map(item=>item.text as string).join('\n\n');
 const images=turn.items.map(record).filter(item=>item.type==='imageGeneration'&&item.status==='completed'&&typeof item.result==='string'&&typeof item.id==='string').map(item=>({id:item.id as string,base64:item.result as string}));
 if((!text.trim()&&!images.length)||text.length>2_000_000)throw new CodexHostError('CODEX_TURN_RESULT_UNKNOWN');
 return {sessionId:threadId,providerTurnId:turn.id,text,usage,...(images.length?{images}:{})};
}
function mergeCompletedItems(items:Record<string,unknown>[],observed:Iterable<Record<string,unknown>>):Record<string,unknown>[] {
 const merged:Record<string,unknown>[]=[],byId=new Map<string,Record<string,unknown>>();
 for(const item of [...items,...observed]){
  if(typeof item.id!=='string'){merged.push(item);continue;}
  const previous=byId.get(item.id);
  if(previous){
   if(previous.type!==item.type||(item.type==='agentMessage'&&((previous.phase??null)!==(item.phase??null)||previous.text!==item.text))||(item.type==='imageGeneration'&&(previous.status!==item.status||previous.result!==item.result)))throw new CodexHostError('CODEX_TURN_RESULT_UNKNOWN');
  }else{byId.set(item.id,item);merged.push(item);}
 }
 return merged;
}
/** 恢复只对账同一真实回合，不发送提示词、不重放工具。 */
async function readCompletedTurn(rpc:CodexRpcSession,threadId:string,providerTurnId:string|undefined,signal?:AbortSignal):Promise<Record<string,unknown>>{
 signal?.throwIfAborted();
 if(!providerTurnId)throw new CodexHostError('CODEX_TURN_RESULT_UNKNOWN');
 const response=record(await rpc.request('thread/read',{threadId,includeTurns:true}));signal?.throwIfAborted();
 const thread=record(response.thread);
 if(thread.id!==threadId||!Array.isArray(thread.turns))throw new CodexHostError('CODEX_TURN_RESULT_UNKNOWN');
 const turn=thread.turns.map(record).find(item=>item.id===providerTurnId);
 if(!turn||turn.status!=='completed'||!Array.isArray(turn.items)||(turn.itemsView!==undefined&&turn.itemsView!=='full'))throw new CodexHostError('CODEX_TURN_RESULT_UNKNOWN');
 return {...turn,items:mergeCompletedItems(turn.items.map(record),[])};
}
export async function recoverCodexNativeTurn(rpc:CodexRpcSession,threadId:string,providerTurnId?:string,signal?:AbortSignal):Promise<NativeTurnResult>{
 return completedResult(threadId,await readCompletedTurn(rpc,threadId,providerTurnId,signal),null);
}
export async function runCodexNativeTurn(options:{rpc:CodexRpcSession;mcpNames:string[];cwd:string;prompt:string;signal:AbortSignal;tools:CodexDynamicTool[];
 outputSchema?:Record<string,unknown>;images?:Array<{url:string}>;model?:string;
 onThread:(id:string)=>Promise<void>;onAdmission:(id:string)=>Promise<void>;onTurn:(id:string)=>Promise<void>;
 onUsage?:(usage:NonNullable<NativeTurnResult['usage']>)=>void|boolean|Promise<void|boolean>;
 onTool:(callId:string,name:string,input:unknown)=>Promise<{text:string;success:boolean}>;onText?:(text:string)=>void|Promise<void>;
}):Promise<NativeTurnResult>{
 const {rpc,signal}=options;let threadId='',turnId='',actualModel:string|undefined,modelProvider:string|undefined;const completedItems=new Map<string,Record<string,unknown>>();let terminal=false,completionSeen=false;let usage:NativeTurnResult['usage']=null;
 let resolve!:(result:NativeTurnResult)=>void,reject!:(error:Error)=>void,acknowledged=false,acknowledgement:Promise<void>|undefined;
 const completion=new Promise<NativeTurnResult>((yes,no)=>{resolve=yes;reject=no;});
 // 预备失败可能在等待完成前发生；保留 rejection，避免未处理Promise告警。
 void completion.catch(()=>{});
 const knownTools=new Set(options.tools.map(tool=>tool.name));
 rpc.onFailure=error=>{terminal=true;reject(error);};
 rpc.onAbort=async()=>{terminal=true;
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
  const params=record(raw);if(params.threadId!==threadId||terminal)return;
  if(method==='model/rerouted'&&params.turnId===turnId&&typeof params.toModel==='string'){actualModel=params.toModel;return;}
  if(method==='item/completed'&&params.turnId===turnId){const item=record(params.item);if(typeof item.id==='string'&&item.id&&((item.type==='agentMessage'&&typeof item.text==='string')||item.type==='imageGeneration')){
    try{mergeCompletedItems([...completedItems.values()],[item]);completedItems.set(item.id,item);}catch(error){terminal=true;reject(error as Error);}
   }}
  if(method==='turn/started'){await bindTurn(record(params.turn).id);return;}
  if(method==='item/agentMessage/delta'&&params.turnId===turnId&&typeof params.delta==='string'){signal.throwIfAborted();await options.onText?.(params.delta);return;}
  if(method==='thread/tokenUsage/updated'&&params.turnId===turnId){
   const last=record(record(params.tokenUsage).total),count=(key:string)=>typeof last[key]==='number'&&Number.isSafeInteger(last[key])&&(last[key] as number)>=0?last[key] as number:null;
   const nextUsage={inputTokens:count('inputTokens'),outputTokens:count('outputTokens'),totalTokens:count('totalTokens'),cachedReadTokens:count('cachedInputTokens'),thoughtTokens:count('reasoningOutputTokens')};
   if(usage&&JSON.stringify(usage)===JSON.stringify(nextUsage))return;usage=nextUsage;
   if(await options.onUsage?.(usage)===true){
    terminal=true;
    // 已观测费用由原账本保留，只打断真实thread/turn；不生成替代调用。
    await rpc.request('turn/interrupt',{threadId,turnId},1000).catch(()=>{});
    reject(new CodexHostError('CODEX_TOKEN_BUDGET_EXHAUSTED'));
   }
  }
  if(method==='turn/completed'){
   const turn=record(params.turn);if(turn.id!==turnId||completionSeen)return;completionSeen=true;
   try{
    signal.throwIfAborted();if(turn.status!=='completed'||!Array.isArray(turn.items))throw new CodexHostError('CODEX_TURN_RESULT_UNKNOWN');
    let result:NativeTurnResult;
    if(turn.itemsView===undefined||turn.itemsView==='full'){
     result=completedResult(threadId,{...turn,items:mergeCompletedItems(turn.items.map(record),completedItems.values())},usage);
    }else if(turn.itemsView==='notLoaded'||turn.itemsView==='summary'){
     const items=[...completedItems.values()];
     if(items.some(item=>item.type==='agentMessage'&&item.phase==='final_answer'&&typeof item.text==='string'&&item.text.trim())||items.some(item=>item.type==='imageGeneration'&&item.status==='completed'&&typeof item.result==='string')){
      result=completedResult(threadId,{...turn,itemsView:'full',items},usage);
     }else{
      signal.throwIfAborted();const recovered=await readCompletedTurn(rpc,threadId,turnId,signal);
      if(terminal)throw new CodexHostError('CODEX_TURN_CANCELLED');
      result=completedResult(threadId,{...recovered,items:mergeCompletedItems((recovered.items as Record<string,unknown>[]),completedItems.values())},usage);
     }
    }else throw new CodexHostError('CODEX_TURN_RESULT_UNKNOWN');
    signal.throwIfAborted();terminal=true;
    resolve({...result,...(actualModel?{model:actualModel}:{}),...(modelProvider?{modelProvider}:{})});
   }catch(error){terminal=true;reject(error as Error);}
  }
 };
 try{
  signal.throwIfAborted();const response=record(await rpc.request('thread/start',{...codexThreadParameters(options.cwd,options.tools),...(options.model?{model:options.model}:{})}));
  const id=record(response.thread).id;if(typeof id!=='string'||!id)throw new CodexHostError('CODEX_THREAD_ID_MISSING');threadId=id;
  actualModel=typeof response.model==='string'?response.model:undefined;modelProvider=typeof response.modelProvider==='string'?response.modelProvider:undefined;
  await options.onThread(threadId);await verifyCodexThreadMcp(rpc,threadId,options.mcpNames);
  signal.throwIfAborted();await options.onAdmission(threadId);signal.throwIfAborted();
  const started=record(await rpc.request('turn/start',{...codexTurnParameters(threadId,options.prompt),input:[{type:'text',text:options.prompt},...(options.images??[]).map(image=>({type:'image',url:image.url}))],...(options.outputSchema?{outputSchema:options.outputSchema}:{})}));
  await bindTurn(record(started.turn).id);
  return await completion;
 }finally{rpc.onFailure=undefined;rpc.onNotification=undefined;rpc.onRequest=undefined;rpc.onAbort=undefined;}
}
