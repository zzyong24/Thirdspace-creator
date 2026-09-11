import {publicationTrafficResource,trafficSourcePayloadSchema,type RequestContext,type TrafficSourcePayload} from '@creatoros/contract';
import type {Db} from '@creatoros/backend';
import {createTrafficRepository} from './traffic.repository';
import {requireAccountId} from './analytics.errors';
import type {PublishingService} from '../publishing/publishing.service';
import {OwnershipError} from '../projects';
export function createTrafficService(db:Db,ports:{now:()=>string;publishing:Pick<PublishingService,'getPublication'|'listPublicationIdsByProject'|'listPublicationsForUser'>}){
 const repo=createTrafficRepository(db);
 const account=(ctx:RequestContext)=>requireAccountId(ctx.accountId,'analytics.traffic');
 async function assertPublication(ctx:RequestContext,id:string){
  const p=await ports.publishing.getPublication(ctx,id);
  if(p.accountId!==account(ctx)||p.platform!=='douyin'||!p.externalId||p.hiddenAt||p.status!=='published')throw new OwnershipError('作品不可采集');
  return p;
 }
 return {
  assertPublication,
  async enqueueProject(ctx:RequestContext,projectId:string){
   const ids=await ports.publishing.listPublicationIdsByProject(ctx,projectId);let queued=0;
   for(const id of ids){const p=await ports.publishing.getPublication(ctx,id);if(p.accountId!==account(ctx))throw new OwnershipError('作品归属不符');if(p.platform!=='douyin'||!p.externalId||p.hiddenAt||p.status!=='published')continue;if(await repo.enqueue(ctx.userId,account(ctx),id,p.externalId!,ports.now(),true))queued++;}
   return queued;
  },
  async enqueueVisible(ctx:RequestContext,visibleIds:ReadonlySet<string>){
   let queued=0;for(let offset=0;;offset+=200){
    const rows=await ports.publishing.listPublicationsForUser(ctx,{limit:200,offset});
    for(const p of rows){if(p.platform!=='douyin'||!p.externalId||!visibleIds.has(p.externalId)||p.hiddenAt||p.status!=='published')continue;
     await assertPublication(ctx,p.id);if(await repo.enqueue(ctx.userId,account(ctx),p.id,p.externalId,ports.now(),false))queued++;
    }if(rows.length<200)break;
   }return queued;
  },
  async getProject(ctx:RequestContext,projectId:string){
   const ids=await ports.publishing.listPublicationIdsByProject(ctx,projectId),allowed:string[]=[];
   for(const id of ids){try{await assertPublication(ctx,id);allowed.push(id);}catch(error){if(!(error instanceof OwnershipError))throw error;}}
   const rows=await repo.list(ctx.userId,account(ctx),allowed);
   return {items:rows.map(r=>publicationTrafficResource.parse(r))};
  },
  async pending(ctx:RequestContext,limit=20){return repo.pending(ctx.userId,account(ctx),limit);},
  async failPending(ctx:RequestContext,rows:readonly {publicationId:string;externalId:string;requestedAt:string}[],message:string){return repo.failPending(ctx.userId,account(ctx),rows,ports.now(),message);},
  async summary(ctx:RequestContext,taskId:string){return repo.summary(ctx.userId,account(ctx),taskId);},
  async reconnect(ctx:RequestContext){return repo.reconnect(ctx.userId,account(ctx));},
  async settle(ctx:RequestContext,row:{publicationId:string;requestedAt:string},result:{data:TrafficSourcePayload}|{error:string;status:'failed'|'needs_reconnect'},taskId:string){
   if('data' in result){await assertPublication(ctx,row.publicationId);trafficSourcePayloadSchema.parse(result.data);}
   return repo.settle(ctx.userId,account(ctx),row.publicationId,row.requestedAt,ports.now(),taskId,result);
  },
 };
}
export type TrafficService=ReturnType<typeof createTrafficService>;
