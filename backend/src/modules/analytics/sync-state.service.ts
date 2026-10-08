import {factFilter} from "../../workspace-scope";
import {and,eq,type Db} from '@creatoros/backend';
import {publicationSyncState} from '../../schema/analytics';
import type {RequestContext} from '@creatoros/contract';
import {requireAccountId} from './analytics.errors';
import {isSyncDue,type SyncCapability} from './sync-policy';
/** 持久水位经业务服务写入；零结果也是成功，排队/失败不伪造成功。 */
export function createPublicationSyncService(db:Db,ports:{now:()=>string;assertPublication:(ctx:RequestContext,id:string)=>Promise<{externalId:string|null;publishedAt?:string|null}>}){
 const scope=(ctx:RequestContext,id:string,capability:SyncCapability)=>and(eq(publicationSyncState.userId,ctx.userId),factFilter(publicationSyncState,ctx),eq(publicationSyncState.publicationId,id),eq(publicationSyncState.capability,capability));
 async function read(ctx:RequestContext,id:string,capability:SyncCapability){return(await db.select().from(publicationSyncState).where(scope(ctx,id,capability)))[0];}
 return {
  read,
  async failures(ctx:RequestContext,capabilities:readonly SyncCapability[]){
   const rows=await db.select().from(publicationSyncState).where(and(eq(publicationSyncState.userId,ctx.userId),factFilter(publicationSyncState,ctx)));
   let count=0;for(const row of rows){if(!row.error||!capabilities.includes(row.capability as SyncCapability))continue;try{await ports.assertPublication(ctx,row.publicationId);count++;}catch{/* 已隐藏/移除作品不阻塞当前同步 */}}
   return count;
  },
  async due(ctx:RequestContext,id:string,capability:SyncCapability){const pub=await ports.assertPublication(ctx,id);const state=await read(ctx,id,capability);return isSyncDue({publishedAt:pub.publishedAt,...(state?.externalId===pub.externalId?state:{})},ports.now());},
  async settle(ctx:RequestContext,id:string,capability:SyncCapability,result:{success:true}|{success:false;error:string}){
   const pub=await ports.assertPublication(ctx,id);const stamp=ports.now();const old=await read(ctx,id,capability);const same=old?.externalId===pub.externalId;
   const failures=result.success?0:(same?old?.failures??0:0)+1;
   const values={userId:ctx.userId,accountId:requireAccountId(ctx.accountId,'analytics.sync'),publicationId:id,capability,externalId:pub.externalId??'',lastSucceededAt:result.success?stamp:same?old?.lastSucceededAt??null:null,attemptedAt:stamp,failures,retryAt:result.success?null:new Date(Date.parse(stamp)+Math.min(6*3600000,15*60000*2**Math.min(failures-1,5))).toISOString(),error:result.success?null:result.error.slice(0,500)};
   await db.insert(publicationSyncState).values(values).onConflictDoUpdate({target:[publicationSyncState.userId,publicationSyncState.accountId,publicationSyncState.publicationId,publicationSyncState.capability],set:values});
  },
 };
}
export type PublicationSyncService=ReturnType<typeof createPublicationSyncService>;
