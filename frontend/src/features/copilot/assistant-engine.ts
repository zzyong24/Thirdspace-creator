import {client} from '@/lib/contract-client';
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
 if(!state.ready||state.saving)throw Error('引擎设置尚未就绪');
 if(engine===state.engine)return state.engine;
 generation++;emit({saving:true,error:null});
 try{const result=await client.patchPreferences({params:undefined,query:undefined,body:{assistantExecutionEngine:engine}});
  if(result.assistantExecutionEngine!=='pi'&&result.assistantExecutionEngine!=='codex')throw Error('引擎保存回执不完整');
  cache(result.assistantExecutionEngine);emit({engine:result.assistantExecutionEngine,saving:false,ready:true,error:null});return state.engine;
 }catch(error){emit({saving:false,error:'引擎保存失败，请重试'});throw error;}
}
export function subscribeAssistantEngine(refresh:()=>void){
 const storage=(event:StorageEvent)=>{if(event.key===null||event.key===key)void loadAssistantEngine(true);};
 const focus=()=>{void loadAssistantEngine(true);};
 window.addEventListener(assistantEngineEvent,refresh);window.addEventListener('storage',storage);window.addEventListener('focus',focus);
 return()=>{window.removeEventListener(assistantEngineEvent,refresh);window.removeEventListener('storage',storage);window.removeEventListener('focus',focus);};
}
export function recheckAssistantEngine(){if(typeof window!=='undefined'){void loadAssistantEngine(true);window.dispatchEvent(new Event(assistantEngineStatusEvent));}}
