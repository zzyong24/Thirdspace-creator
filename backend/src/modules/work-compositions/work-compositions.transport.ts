import {ENDPOINTS,type RequestContext,type Transport} from "@creatoros/contract";
import {AuthenticationError,UnsupportedOperationError} from "@creatoros/backend";
import type {WorkMaterialsService} from "./work-materials.service";
import type {WorkCompositionsService} from "./work-compositions.service";
export const WORK_COMPOSITION_OP_IDS=Object.values(ENDPOINTS).map(endpoint=>endpoint.id).filter(id=>id.startsWith("workCompositions."));
export function createWorkCompositionsTransport(serviceFor:(ctx:RequestContext)=>WorkCompositionsService,materialsFor?:(ctx:RequestContext)=>WorkMaterialsService):Transport{
 return{async request(endpoint,input,ctx){
  if(!ctx)throw new AuthenticationError();const service=serviceFor(ctx),payload=(input??{}) as {params?:Record<string,string>;query?:Record<string,unknown>;body?:unknown},p=payload.params??{},q=payload.query??{},meta={requestId:ctx.requestId},id=p.compositionId!;
  const list=<T>(items:T[])=>{const page=Number(q.page??1),pageSize=Number(q.pageSize??20);return{data:items.slice((page-1)*pageSize,page*pageSize),meta:{...meta,page,pageSize,total:items.length}};};
  const write=async(composition:Awaited<ReturnType<WorkCompositionsService["get"]>>,requestId:string)=>({data:{composition,request:await service.request(ctx,requestId)},meta});
  switch(endpoint.id){
   case "workCompositions.create":{const body=ENDPOINTS.createWorkComposition.body!.parse(payload.body);return write(await service.create(ctx,body),body.clientRequestId);}
   case "workCompositions.get":return{data:await service.get(ctx,id),meta};
   case "workCompositions.list":return list(await service.list(ctx,String(q.projectId??"")));
   case "workCompositions.versions.list":return list(await service.history(ctx,id));
   case "workCompositions.versions.get":return{data:await service.version(ctx,id,Number(p.revision)),meta};
   case "workCompositions.requests.get":return{data:await service.request(ctx,p.clientRequestId!),meta};
   case "workCompositions.basis.versions.get":return{data:await service.basisVersion(ctx,id,p.versionId!),meta};
   case "workCompositions.members.requests.get":return{data:await service.memberReservation(ctx,id,p.clientRequestId!),meta};
   case "workCompositions.selection.save":{const body=ENDPOINTS.saveWorkCompositionSelection.body!.parse(payload.body);return write(await service.saveSelection(ctx,id,body),body.clientRequestId);}
   case "workCompositions.basis.save":{const body=ENDPOINTS.saveWorkCompositionBasis.body!.parse(payload.body),composition=await service.saveBasis(ctx,id,body),request=await service.request(ctx,body.clientRequestId);if(request.resultRevision===null)throw Error("共享依据缺少正式提交版本");const committed=await service.version(ctx,id,request.resultRevision);return{data:{composition,basis:await service.basisVersion(ctx,id,committed.basisVersionId),request},meta};}
   case "workCompositions.members.bind":{const body=ENDPOINTS.bindWorkCompositionMember.body!.parse(payload.body);return write(await service.bindMember(ctx,id,body),body.clientRequestId);}
   case "workCompositions.members.create":{const body=ENDPOINTS.createWorkCompositionMember.body!.parse(payload.body);return write(await service.createMember(ctx,id,body),body.clientRequestId);}
   case "workCompositions.members.cancel":{const body=ENDPOINTS.cancelWorkCompositionMemberReservation.body!.parse(payload.body);return write(await service.cancelMemberReservation(ctx,id,body),body.clientRequestId);}
   case "workCompositions.canvasContext.get":if(materialsFor)return{data:await materialsFor(ctx).canvasContext(ctx,id,ENDPOINTS.getWorkCompositionCanvasContext.body!.parse(payload.body)),meta};throw new UnsupportedOperationError(endpoint.id);
   case "workCompositions.materials.list":if(materialsFor)return list(await materialsFor(ctx).list(ctx,id));throw new UnsupportedOperationError(endpoint.id);
   case "workCompositions.dependencies.get":if(materialsFor)return list(await materialsFor(ctx).dependencies(ctx,id));throw new UnsupportedOperationError(endpoint.id);
   case "workCompositions.materials.attach":if(materialsFor)return{data:await materialsFor(ctx).attach(ctx,id,ENDPOINTS.attachWorkCompositionMaterial.body!.parse(payload.body)),meta};throw new UnsupportedOperationError(endpoint.id);
   case "workCompositions.materials.replace":if(materialsFor)return{data:await materialsFor(ctx).replace(ctx,id,ENDPOINTS.replaceWorkCompositionMaterial.body!.parse(payload.body)),meta};throw new UnsupportedOperationError(endpoint.id);
   case "workCompositions.materials.detach":if(materialsFor)return{data:await materialsFor(ctx).detach(ctx,id,ENDPOINTS.detachWorkCompositionMaterial.body!.parse(payload.body)),meta};throw new UnsupportedOperationError(endpoint.id);
   default:throw new UnsupportedOperationError(endpoint.id);
  }
 }};
}
