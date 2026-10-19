import type {RequestContext} from '@creatoros/contract';
import {localCodexStatusSchema,localCodexStatusRequestSchema,localCodexStatusResponseSchema} from '@creatoros/contract/execution-worker';
import {createHash} from 'node:crypto';
import {statSync} from 'node:fs';
import {createRequestIoService} from './request-io.service';
import {localCodexWorkerEnv} from '../execution/local-codex-worker-env';

type Status=ReturnType<typeof localCodexStatusSchema.parse>;
type Io=ReturnType<typeof createRequestIoService>;
type Generation={key:string;serial:number;entryPath:string;env:Record<string,string>;io?:Io};
type Observer={resolve:(status:Status)=>void;reject:(error:Error)=>void;cleanup:()=>void};
type Flight={key:string;generation:Generation;context:RequestContext;controller:AbortController;observers:Set<Observer>};
const unavailable=(code='CODEX_STATUS_UNAVAILABLE'):Status=>localCodexStatusSchema.parse({engine:'codex',installed:false,available:false,version:null,loginStatus:'unchecked',errorCode:code});
const cancelled=()=>new DOMException('本次本地Codex检查已取消','AbortError');
const copy=(status:Status):Status=>structuredClone(status);
// 登录成功但没有model/list的真实模型ID，不足以成为后续冻结身份的复用依据。
const reusable=(status:Status)=>status.installed&&status.available&&
 (status.loginStatus==='authenticated'||status.loginStatus==='not-required')&&typeof status.defaultModelId==='string'&&status.defaultModelId.length>0;

/** 状态观测只缓存无秘密协议结果；实际模型执行仍由Worker认证和冻结身份校验。 */
export function createLocalCodexStatusService(deps:{entryPath:()=>string;timeoutMs?:number}){
 const cache=new Map<string,Status>();
 const flights=new Map<string,Flight>();
 const ios=new Set<Io>();
 let generation:Generation|undefined,serial=0,stopped=false,stopPromise:Promise<void>|undefined;
 function currentGeneration():Generation{
  const entryPath=deps.entryPath();
  const env=localCodexWorkerEnv();
  let file:{mtimeMs:number;ctimeMs:number;size:number;ino?:number}|null=null;
  try{const stat=statSync(entryPath);file={mtimeMs:stat.mtimeMs,ctimeMs:stat.ctimeMs,size:stat.size,ino:stat.ino};}
  catch{/* 缺失宿主仍由原request IO返回真实不可用；不借旧路径的成功结果。 */}
  // SEMANTIC_BOUNDARY_ALLOW: 仅按真实宿主文件/环境的机械身份隔离观测，不判断创作语义。
  const key=createHash('sha256').update(JSON.stringify([entryPath,file,Object.entries(env).sort(([a],[b])=>a.localeCompare(b))])).digest('hex');
  if(!generation||generation.key!==key){generation={key,serial:++serial,entryPath,env:{...env}};cache.clear();}
  return generation;
 }
 function ioFor(value:Generation):Io{
  if(!value.io){
   const io=createRequestIoService({entryPath:()=>value.entryPath,extraEnv:{...value.env},timeoutMs:deps.timeoutMs??120000,
    parseInput:input=>localCodexStatusRequestSchema.parse(input),parseResponse:raw=>localCodexStatusResponseSchema.parse(raw)});
   value.io=io;ios.add(io);
  }
  return value.io;
 }
 const flightKey=(value:Generation,ctx:RequestContext)=>JSON.stringify([value.serial,ctx.userId]);
 function removeFlight(flight:Flight){if(flights.get(flight.key)===flight)flights.delete(flight.key);}
 function rejectFlight(flight:Flight,error:Error){
  removeFlight(flight);
  for(const observer of flight.observers){observer.cleanup();observer.reject(error);}
  flight.observers.clear();
 }
 async function execute(flight:Flight):Promise<void>{
  let value:Status;
  try{
   value=localCodexStatusSchema.parse(await ioFor(flight.generation).request(flight.context,{type:'status'},flight.controller.signal));
   if(value.errorCode==='CODEX_STATUS_CANCELLED')throw cancelled();
  }catch(error){
   if(stopped||flight.controller.signal.aborted||(error instanceof Error&&error.name==='AbortError')){rejectFlight(flight,cancelled());return;}
   value=unavailable();
  }
  if(stopped||flight.controller.signal.aborted||!flight.observers.size){rejectFlight(flight,cancelled());return;}
  let current:Generation|undefined;
  try{current=currentGeneration();}catch{/* 无法核宿主代际，不能写入或返回旧成功身份。 */}
  if(current!==flight.generation)value=unavailable('CODEX_CONFIG_CHANGED');
  else cache.set(flight.context.userId,copy(value));
  removeFlight(flight);
  for(const observer of flight.observers){observer.cleanup();observer.resolve(copy(value));}
  flight.observers.clear();
 }
 return {
  peek(context:RequestContext):Status|null{
   if(stopped)return null;
   try{currentGeneration();const value=cache.get(context.userId);return value?copy(value):null;}catch{return null;}
  },
  read(context:RequestContext,signal?:AbortSignal,force=false):Promise<Status>{
   if(stopped||signal?.aborted)return Promise.reject(cancelled());
   let current:Generation;
   try{current=currentGeneration();}catch{return Promise.resolve(unavailable());}
   const key=flightKey(current,context);
   let flight=flights.get(key);
   const cached=cache.get(context.userId);
   if(!flight&&!force&&cached&&reusable(cached))return Promise.resolve(copy(cached));
   const first=!flight;
   if(!flight){flight={key,generation:current,context:{...context},controller:new AbortController(),observers:new Set()};flights.set(key,flight);}
   const observed=flight;
   const promise=new Promise<Status>((resolve,reject)=>{
    const observer:Observer={resolve,reject,cleanup:()=>signal?.removeEventListener('abort',abort)};
    const abort=()=>{
     if(!observed.observers.delete(observer))return;
     observer.cleanup();reject(cancelled());
     if(!observed.observers.size){removeFlight(observed);observed.controller.abort();}
    };
    observed.observers.add(observer);signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
   });
   if(first&&observed.observers.size)void execute(observed);
   return promise;
  },
  stop():Promise<void>{
   if(stopPromise)return stopPromise;
   stopped=true;cache.clear();
   for(const flight of [...flights.values()]){flight.controller.abort();rejectFlight(flight,cancelled());}
   flights.clear();
   stopPromise=Promise.allSettled([...ios].map(io=>io.stop())).then(()=>{ios.clear();generation=undefined;});
   return stopPromise;
  },
 };
}
