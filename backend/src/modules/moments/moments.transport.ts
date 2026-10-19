import {ENDPOINTS,type RequestContext,type Transport} from "@creatoros/contract";
import {AuthenticationError,UnsupportedOperationError} from "@creatoros/backend";
import type {MomentsService} from "./moments.service";
export const MOMENTS_OP_IDS=Object.values(ENDPOINTS).map(endpoint=>endpoint.id).filter(id=>id.startsWith("moments."));
/** DTO 仅由原 owner 正式版本及持久回执构造。 */
export function createMomentsTransport(serviceFor:(ctx:RequestContext)=>MomentsService):Transport{
 return{async request(endpoint,input,ctx){
  if(!ctx)throw new AuthenticationError();const service=serviceFor(ctx),payload=(input??{}) as {params?:Record<string,string>;query?:Record<string,unknown>;body?:unknown},p=payload.params??{},q=payload.query??{},meta={requestId:ctx.requestId};
  const list=<T>(items:T[])=>{const page=Number(q.page??1),pageSize=Number(q.pageSize??20);return{data:items.slice((page-1)*pageSize,page*pageSize),meta:{...meta,page,pageSize,total:items.length}};};
  switch(endpoint.id){
   case "moments.create":{const body=ENDPOINTS.createMoments.body!.parse(payload.body),moments=await service.create(ctx,body);return{data:{moments,request:await service.request(ctx,body.clientRequestId)},meta};}
   case "moments.get":return{data:await service.get(ctx,p.momentsId!),meta};
   case "moments.list":return list(await service.list(ctx,String(q.projectId??"")));
   case "moments.versions.list":return list(await service.history(ctx,p.momentsId!));
   case "moments.versions.get":return{data:await service.readVersion(ctx,p.momentsId!,p.versionId!),meta};
   case "moments.requests.get":return{data:await service.request(ctx,p.clientRequestId!),meta};
   case "moments.versions.create":{const body=ENDPOINTS.createMomentsVersion.body!.parse(payload.body),version=await service.save(ctx,p.momentsId!,body),receipt=await service.saveReceipt(ctx,p.momentsId!,body.clientRequestId);return{data:{version,receipt},meta};}
   default:throw new UnsupportedOperationError(endpoint.id);
  }
 }};
}
