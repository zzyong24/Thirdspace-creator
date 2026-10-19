import {ErrorCode} from "@creatoros/contract";
import type {Db} from '@creatoros/backend';
import type {RequestContext,Transport} from '@creatoros/contract';
import {createMomentsTransport,type MomentsService} from '../../modules/moments';
import {createMomentsModelService} from '../../modules/moments';
import {createMomentsModelAdapter} from '../../modules/moments';
import {createMomentsModelTransport} from '../../modules/moments';
import type {MomentsModelPorts} from '../../modules/moments';
/** 仅装配已审原owner ports，不注册新队列；dispatcher须专用commit，root独占共享整合。 */
export function createMomentsModelRoot(db:Db,deps:{now:()=>string;nextId:(p:string)=>string},ports:MomentsModelPorts,originalFor:(ctx:RequestContext)=>MomentsService){const service=createMomentsModelService({db,...deps,ports}),models=createMomentsModelTransport(service),original=createMomentsTransport(originalFor);const transport:Transport={request:(endpoint,input,ctx)=>endpoint.id.startsWith('moments.candidates.')||endpoint.id==='moments.requests.get'?models.request(endpoint,input,ctx):original.request(endpoint,input,ctx)};return{service,transport,businessAdapters:{'moments.draft':createMomentsModelAdapter(service)}};}
/** 公共generic AI提交不能自报生产预约；原其他任务继续由原adapter执行。 */
export function createPublicMomentsAiAdapter<T extends{createTask:(ctx:RequestContext,input:any)=>Promise<unknown>}>(original:T):T{return{...original,createTask:async(ctx,input)=>{if(input.taskType==='moments.draft')throw Object.assign(new Error('请从朋友圈稿面创建生成候选'),{code:ErrorCode.ConflictError});return original.createTask(ctx,input);}} as T;}
