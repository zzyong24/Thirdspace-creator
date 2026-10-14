import {client} from '@/lib/contract-client';
import {modelRoutingResourceSchema,modelRoutingPutSchema} from '@creatoros/contract';
import {readCurrentGroupId,readCurrentAccountId,CURRENT_GROUP_KEY,CURRENT_ACCOUNT_KEY} from '@/lib/http-transport';
export type AssistantEngine = 'pi'|'codex';
const key='creatoros:assistant-engine:v1';
export const assistantEngineEvent='creatoros:assistant-engine-change';
export const assistantEngineStatusEvent='creatoros:assistant-engine-status-refresh';
export interface AssistantEnginePreference {engine:AssistantEngine;ready:boolean;saving:boolean;error:string|null}
let state:AssistantEnginePreference={engine:'pi',ready:false,saving:false,error:null};
let reading:Promise<void>|null=null,generation=0;
export function readAssistantEngine():AssistantEngine{return state.engine;}
export function readAssistantEnginePreference(){return state;}
export const serverAssistantEnginePreference:AssistantEnginePreference={engine:'pi',ready:false,saving:false,error:null};
function emit(patch:Partial<AssistantEnginePreference>){state={...state,...patch};if(typeof window!=='undefined')window.dispatchEvent(new Event(assistantEngineEvent));}
function cache(engine:AssistantEngine){try{window.localStorage.setItem(key,engine);}catch{/* 后端仍为真值；本地缓存不可用不改变保存结果。 */}}
/** 旧浏览器选择只在服务值未设时比较写入，返回值始终服从后端。 */
export async function loadAssistantEngine(force=false):Promise<void>{
 if(typeof window==='undefined'||state.saving||!force&&state.ready)return;
 if(routingState.ready&&routingState.resource){const legacy=routingState.resource.legacyExecutionEngine;emit({engine:legacy==='codex'?'codex':'pi',ready:true,error:null});return;}
 if(reading)return reading;
 const fence=generation;
 const current=(async()=>{try{
  let preference=await client.getPreferences({params:undefined,query:undefined,body:undefined});
  if(preference.assistantExecutionEngine===null){
   let legacy:AssistantEngine='pi';try{if(window.localStorage.getItem(key)==='codex')legacy='codex';}catch{}
   preference=await client.patchPreferences({params:undefined,query:undefined,body:{assistantExecutionEngine:legacy,initializeAssistantExecutionEngine:true}});
  }
  if(fence!==generation)return;
  if(preference.assistantExecutionEngine!=='pi'&&preference.assistantExecutionEngine!=='codex')throw Error('引擎偏好未取得');
  cache(preference.assistantExecutionEngine);emit({engine:preference.assistantExecutionEngine,ready:true,error:null});
 }catch{if(fence===generation)emit({error:'引擎设置暂未取得，请重试'});}})();
 reading=current;try{await current;}finally{if(reading===current)reading=null;}
}
export async function writeAssistantEngine(engine:AssistantEngine):Promise<AssistantEngine>{
 if(typeof window==='undefined')throw Error('引擎保存需要本地界面');
 if(!state.ready)await loadAssistantEngine();
 const scope=routingScope(),synchronizeRouting=routingState.scope===scope;
 if(!state.ready||state.saving||synchronizeRouting&&routingState.saving)throw Error('引擎设置尚未就绪');
 if(engine===state.engine&&(!synchronizeRouting||routingState.resource?.legacyExecutionEngine===engine))return state.engine;
 const fence=++generation,routingFence=synchronizeRouting?++routingGeneration:null;
 const current=()=>fence===generation&&scope===routingScope()&&(!synchronizeRouting||routingFence===routingGeneration&&routingState.scope===scope);
 if(synchronizeRouting){routingRead=null;routingEmit({saving:true,reading:false,error:null});}
 emit({saving:true,error:null});let accepted=false;
 try{const result=await client.patchPreferences({params:undefined,query:undefined,body:{assistantExecutionEngine:engine}});accepted=true;
  if(result.assistantExecutionEngine!=='pi'&&result.assistantExecutionEngine!=='codex')throw Error('引擎保存回执不完整');
  // 旧PATCH只保存legacy字段；完整来源及v2选择仍只服从原GET，不由旧回执拼造。
  if(!current())throw Error('账号组已变化，请在当前范围重新核对');
  const resource=synchronizeRouting?modelRoutingResourceSchema.parse(await client.getModelRouting({params:undefined,query:undefined,body:undefined})):null;
  if(!current())throw Error('账号组已变化，请在当前范围重新核对');
  if(resource&&resource.legacyExecutionEngine!==result.assistantExecutionEngine)throw Error('保存后的当前引擎尚未确认，请重新读取');
  if(resource)routingEmit({resource,ready:true,reading:false,saving:false,error:null});
  cache(result.assistantExecutionEngine);emit({engine:result.assistantExecutionEngine,saving:false,ready:true,error:null});return state.engine;
 }catch(error){
  if(fence===generation)emit({saving:false,error:accepted?'引擎保存已受理，但当前值尚未确认，请重新读取':'引擎保存失败，请重试'});
  if(current()&&synchronizeRouting)routingEmit({saving:false,reading:false,...(accepted?{ready:false}:{}),error:accepted?'引擎保存已受理，但当前值尚未确认，请重新读取':'引擎保存失败，请重试'});
  throw error;
 }
}
export function subscribeAssistantEngine(refresh:()=>void){
 const storage=(event:StorageEvent)=>{if(event.key===null||event.key===key)void loadAssistantEngine(true);};
 const focus=()=>{void loadAssistantEngine(true);};
 window.addEventListener(assistantEngineEvent,refresh);window.addEventListener('storage',storage);window.addEventListener('focus',focus);
 return()=>{window.removeEventListener(assistantEngineEvent,refresh);window.removeEventListener('storage',storage);window.removeEventListener('focus',focus);};
}
export function recheckAssistantEngine(){if(typeof window!=='undefined'){void loadAssistantEngine(true);window.dispatchEvent(new Event(assistantEngineStatusEvent));}}

// T1278 同一用户来源真值；scope 只用于能力状态与晚回执隔离，不把选择改成组级设置。
export interface ModelRoutingPreference {
 resource:import('@creatoros/contract').ModelRoutingResource|null;
 scope:string;ready:boolean;reading:boolean;saving:boolean;error:string|null;
}
export const modelRoutingEvent='creatoros:model-routing-change';
export const serverModelRoutingPreference:ModelRoutingPreference={resource:null,scope:'',ready:false,reading:false,saving:false,error:null};
let routingState:ModelRoutingPreference=serverModelRoutingPreference,routingGeneration=0;
let routingRead:{scope:string;promise:Promise<void>}|null=null;
const routingScope=()=>JSON.stringify([readCurrentGroupId(),readCurrentAccountId()]);
export function readModelRoutingPreference(){return routingState;}
function routingEmit(patch:Partial<ModelRoutingPreference>){routingState={...routingState,...patch};if(typeof window!=='undefined')window.dispatchEvent(new Event(modelRoutingEvent));}
export async function loadModelRouting(force=false):Promise<void>{
 if(typeof window==='undefined')return;
 const scope=routingScope();
 if(routingState.scope!==scope){routingGeneration++;routingEmit({resource:null,scope,ready:false,reading:false,saving:false,error:null});}
 if(routingState.saving||!force&&routingState.ready)return;
 if(routingRead?.scope===scope)return routingRead.promise;
 const fence=routingGeneration;const current=()=>fence===routingGeneration&&scope===routingScope();
 routingEmit({reading:true,error:null});
 const promise=(async()=>{try{
  const resource=modelRoutingResourceSchema.parse(await client.getModelRouting({params:undefined,query:undefined,body:undefined}));
  if(current())routingEmit({resource,ready:true,reading:false,error:null});
 }catch{if(current())routingEmit({reading:false,error:'模型来源暂未取得，请重新读取'});}})();
 routingRead={scope,promise};try{await promise;}finally{if(routingRead?.promise===promise)routingRead=null;}
}
export async function writeModelRouting(choices:import('@creatoros/contract').ModelRoutingChoices,expectedRevision:number){
 const scope=routingScope();
 if(!routingState.ready||routingState.scope!==scope||routingState.saving)throw Error('模型来源尚未就绪');
 const input=modelRoutingPutSchema.parse({schemaVersion:1,choices,expectedRevision}),fence=++routingGeneration;
 const current=()=>fence===routingGeneration&&scope===routingScope();let accepted=false;
 routingEmit({saving:true,error:null});
 try{
  const receipt=modelRoutingResourceSchema.parse(await client.putModelRouting({params:undefined,query:undefined,body:input}));accepted=true;
  if(receipt.revision<=expectedRevision||JSON.stringify(receipt.choices)!==JSON.stringify(input.choices))throw Error('保存回执与本次选择不符');
  const resource=modelRoutingResourceSchema.parse(await client.getModelRouting({params:undefined,query:undefined,body:undefined}));
  if(!current())throw Error('账号组已变化，请在当前范围重新核对');
  if(resource.revision<receipt.revision)throw Error('保存后的当前设置尚未读回');
  routingEmit({resource,ready:true,reading:false,saving:false,error:null});
  if(JSON.stringify(resource.choices)!==JSON.stringify(input.choices))throw Error('保存后其它窗口又更新了来源，请核对当前值；草稿已保留');
  if(typeof window!=='undefined')try{window.localStorage.setItem('creatoros:model-routing:revision',String(resource.revision));}catch{}
  return resource;
 }catch(error){if(current())routingEmit({saving:false,error:accepted?'保存已受理，但当前值尚未确认；请重新读取核对，草稿已保留':(error as {status?:number})?.status===409?'其它窗口已更新模型来源，请重新读取后核对；草稿已保留':'模型来源保存失败，草稿已保留'});throw error;}
}
export function subscribeModelRouting(refresh:()=>void){
 const reload=()=>{void loadModelRouting(true);};
 const storage=(event:StorageEvent)=>{if(event.key===null||[CURRENT_ACCOUNT_KEY,CURRENT_GROUP_KEY,key,'creatoros:model-routing:revision'].includes(event.key))reload();};
 window.addEventListener(modelRoutingEvent,refresh);window.addEventListener('focus',reload);window.addEventListener('storage',storage);window.addEventListener('creatoros:accounts-changed',reload);
 return()=>{window.removeEventListener(modelRoutingEvent,refresh);window.removeEventListener('focus',reload);window.removeEventListener('storage',storage);window.removeEventListener('creatoros:accounts-changed',reload);};
}
