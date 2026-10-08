import {z} from 'zod';
import {assistantSystemOperations,type Transport,type RequestContext} from '@creatoros/contract';
import {AuthenticationError} from '../../errors';
import {UnsupportedOperationError} from '../../persistence-transport';
export const ASSISTANT_ACTION_OP_IDS=Object.values(assistantSystemOperations).map(endpoint=>endpoint.id);
export function createAssistantActionTransport(service:{adopt(ctx:RequestContext,source:unknown):Promise<unknown>;receipt(ctx:RequestContext,source:unknown):Promise<unknown>;adoptCanvas(ctx:RequestContext,source:unknown):Promise<unknown>;confirmGeneration(ctx:RequestContext,canvasId:string,nodeId:string,source:unknown):Promise<unknown>}):Transport{
 return {async request(endpoint,input,ctx){
  if(!ctx)throw new AuthenticationError();
  const operation=Object.values(assistantSystemOperations).find(value=>value.id===endpoint.id);
  if(!operation)throw new UnsupportedOperationError(endpoint.id);
  const raw=z.object({params:z.unknown().optional(),query:z.unknown().optional(),body:z.unknown().optional()}).strict().parse(input??{});
  const source=operation.body?operation.body.parse(raw.body):operation.query!.parse(raw.query);
  const params=operation.params?.parse(raw.params);
  let result:unknown;
  switch(operation.id){
   case 'ai.assistantActions.adopt':result=await service.adopt(ctx,source);break;
   case 'ai.assistantActions.receipt':result=await service.receipt(ctx,source);break;
   case 'canvas.create.adopt':result=await service.adoptCanvas(ctx,source);break;
   case 'canvas.generation.confirm':{const target=params as {canvasId:string;nodeId:string};result=await service.confirmGeneration(ctx,target.canvasId,target.nodeId,source);break;}
  }
  return {data:operation.response.parse(result),meta:{requestId:ctx.requestId}};
 }};
}
