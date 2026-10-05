import {ENDPOINTS,type Endpoint,type Transport} from "@creatoros/contract";
import {AuthenticationError,UnsupportedOperationError} from "@creatoros/backend";
import type {createCreativeCanvasService} from "./creative-canvas.service";

export const CREATIVE_CANVAS_OP_IDS=["canvas.material.adopt","canvas.capabilities","canvas.list","canvas.create","canvas.get","canvas.save","canvas.archive","canvas.node.generate","canvas.node.tasks","canvas.node.preview","canvas.agent.proposals","canvas.agent.apply"] as const;
export function createCreativeCanvasTransport(service:ReturnType<typeof createCreativeCanvasService>,adoption?:{adopt(ctx:import("@creatoros/contract").RequestContext,canvasId:string,raw:unknown):Promise<{publication:unknown;revision:unknown}>}):Transport{
 return {async request(endpoint:Endpoint,input,ctx){
  if(!ctx)throw new AuthenticationError();
  const raw=(input??{}) as {params?:{canvasId?:string;nodeId?:string};body?:Record<string,unknown>};
  const id=raw.params?.canvasId??"",nodeId=raw.params?.nodeId??"",body=raw.body??{};
  let data:unknown;
  switch(endpoint.id){
   case "canvas.material.adopt":{
    if(!adoption)throw new Error("发布物料采纳端口尚未配置");
    const result=await adoption.adopt(ctx,id,body);data=ENDPOINTS.adoptCanvasMaterial.response.parse(result);break;
   }
   case "canvas.capabilities":data=await service.capabilities(ctx);break;
   case "canvas.list":data=await service.list(ctx);break;
   case "canvas.create":data=await service.create(ctx,body as {title:string;projectId?:string|null});break;
   case "canvas.get":data=await service.get(ctx,id);break;
   case "canvas.save":data=await service.save(ctx,id,body as {expectedRevision:number;document:unknown;title?:string;projectId?:string|null});break;
   case "canvas.archive":data=await service.archive(ctx,id);break;
   case "canvas.node.generate":data=await service.generate(ctx,id,nodeId,body as {expectedRevision:number;attemptId:string});break;
   case "canvas.node.tasks":data=await service.listTasks(ctx,id);break;
   case "canvas.node.preview":data=await service.previewNode(ctx,id,nodeId);break;
   case "canvas.agent.proposals":data=await service.listProposals(ctx,id);break;
   case "canvas.agent.apply":data=await service.applyProposal(ctx,id,(raw.params as {proposalId?:string})?.proposalId??"",body.expectedRevision as number);break;
   default:throw new UnsupportedOperationError(endpoint.id);
  }
  return {data,meta:{requestId:ctx.requestId,...(Array.isArray(data)?{page:1,pageSize:Math.max(data.length,1),total:data.length}:{})}};
 }};
}
