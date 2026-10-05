import {AuthenticationError,UnsupportedOperationError,type Db} from "@creatoros/backend";
import type {RequestContext,Transport} from "@creatoros/contract";
import {ENDPOINTS} from "@creatoros/contract";
import type {WorkSourceSelectBody} from "@creatoros/contract";
export const WORK_SOURCE_OP_IDS=["work.sources.select"] as const;
export function createWorkSourcesTransport(serviceFor:(ctx:RequestContext)=>{select(ctx:RequestContext,body:WorkSourceSelectBody,tx:Db):Promise<unknown>},db:Db):Transport{return{async request(endpoint,input,ctx){
 if(!ctx)throw new AuthenticationError();if(endpoint.id!=="work.sources.select")throw new UnsupportedOperationError(endpoint.id);
 const e=ENDPOINTS.selectWorkSource,body=e.body!.parse((input as {body?:unknown})?.body);
 const data=await db.transaction(tx=>serviceFor(ctx).select(ctx,body,tx as unknown as Db));
 return{data:e.response.parse(data),meta:{requestId:ctx.requestId}};
}};}
