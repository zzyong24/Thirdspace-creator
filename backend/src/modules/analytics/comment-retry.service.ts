import {createHash} from 'node:crypto';
import {and,asc,eq,inArray,isNull,type Db} from '@creatoros/backend';
import {ENDPOINTS as analyticsOperations,type RequestContext} from '@creatoros/contract';
import {publicationSyncState} from '../../schema/analytics';
import {createPublishingService,ConflictError} from '../publishing';
import {createTrafficService} from './traffic.service';
import {OwnershipError,requireAccountId} from './analytics.errors';

type SyncRow=typeof publicationSyncState.$inferSelect;
const baseline=(row:SyncRow)=>'sha256:'+createHash('sha256').update(JSON.stringify([
 row.userId,row.accountId,row.publicationId,row.externalId,row.capability,row.attemptedAt,row.retryAt,row.failures,row.lastSucceededAt,
 createHash('sha256').update(row.error??'').digest('hex'),
])).digest('hex');
const hasFailure=(row:SyncRow)=>row.capability==='comments'&&row.failures>0&&Boolean(row.error);
const resource=(row:SyncRow)=>analyticsOperations.listCommentFailures.response.parse({publicationId:row.publicationId,externalId:row.externalId,attemptedAt:row.attemptedAt,retryAt:row.retryAt,lastSucceededAt:row.lastSucceededAt,failures:row.failures,failureVersion:baseline(row)});
const conflict=()=>new ConflictError('评论失败状态已变化，请重新读取失败清单后重试');

/** 只调整当前账号明确选中的作品重试时间；不接触平台冷却、采集事实或原任务。 */
export function createCommentRetryService(db:Db,ports:{now:()=>string;assertPublication:(ctx:RequestContext,id:string)=>Promise<{externalId:string|null}>}){
 return {
  async listCommentFailures(ctx:RequestContext,input:{page:number;pageSize:number}){
   const {page,pageSize}=analyticsOperations.listCommentFailures.query.parse(input);
   const accountId=requireAccountId(ctx.accountId,'analytics.comments.failures.list');
   const rows=await db.select().from(publicationSyncState).where(and(eq(publicationSyncState.userId,ctx.userId),eq(publicationSyncState.accountId,accountId),eq(publicationSyncState.capability,'comments'))).orderBy(asc(publicationSyncState.publicationId));
   const visible=[];
   for(const row of rows){
    if(!hasFailure(row))continue;
    try{const publication=await ports.assertPublication(ctx,row.publicationId);if(publication.externalId===row.externalId)visible.push(resource(row));}
    catch(error){if(!(error instanceof OwnershipError))throw error;}
   }
   return {rows:visible.slice((page-1)*pageSize,page*pageSize),total:visible.length};
  },
  async retryComments(ctx:RequestContext,input:{items:Array<{publicationId:string;failureVersion:string}>}){
   const {items}=analyticsOperations.retryComments.body.parse(input);
   const accountId=requireAccountId(ctx.accountId,'analytics.comments.retry');
   return db.transaction(async transaction=>{
    // 同事务的公共 publishing service 复核真实身份，避免复用事务外陈旧作品快照。
    const tx=transaction as unknown as Db;
    const publishing=createPublishingService({db:tx,now:ports.now,nextId:()=>{throw new Error('只读作品校验不可生成ID');}});
    const verifier=createTrafficService(tx,{now:ports.now,publishing});
    const selected=new Map<string,string>();
    for(const item of [...items].sort((a,b)=>a.publicationId.localeCompare(b.publicationId))){
     const publication=await verifier.assertPublication(ctx,item.publicationId);
     selected.set(item.publicationId,publication.externalId!);
    }
    const rows=await transaction.select().from(publicationSyncState).where(and(eq(publicationSyncState.userId,ctx.userId),eq(publicationSyncState.accountId,accountId),eq(publicationSyncState.capability,'comments'),inArray(publicationSyncState.publicationId,items.map(item=>item.publicationId)))).orderBy(asc(publicationSyncState.publicationId)).for('update');
    const byId=new Map(rows.map(row=>[row.publicationId,row]));
    for(const item of items){const row=byId.get(item.publicationId);if(!row||!hasFailure(row)||selected.get(item.publicationId)!==row.externalId||baseline(row)!==item.failureVersion)throw conflict();}
    const now=ports.now();let updated=0;
    const result=[];
    for(const item of items){
     const row=byId.get(item.publicationId)!;
     const retryAt=row.retryAt&&Date.parse(row.retryAt)<=Date.parse(now)?row.retryAt:now;
     if(retryAt!==row.retryAt){
      const changed=await transaction.update(publicationSyncState).set({retryAt}).where(and(
       eq(publicationSyncState.userId,ctx.userId),eq(publicationSyncState.accountId,accountId),eq(publicationSyncState.publicationId,row.publicationId),eq(publicationSyncState.capability,'comments'),
       eq(publicationSyncState.externalId,row.externalId),eq(publicationSyncState.attemptedAt,row.attemptedAt),eq(publicationSyncState.failures,row.failures),
       row.retryAt===null?isNull(publicationSyncState.retryAt):eq(publicationSyncState.retryAt,row.retryAt),
       row.lastSucceededAt===null?isNull(publicationSyncState.lastSucceededAt):eq(publicationSyncState.lastSucceededAt,row.lastSucceededAt),
       row.error===null?isNull(publicationSyncState.error):eq(publicationSyncState.error,row.error),
      )).returning({id:publicationSyncState.publicationId});
      if(changed.length!==1)throw conflict();updated++;
     }
     result.push({publicationId:row.publicationId,retryAt,failureVersion:baseline({...row,retryAt})});
    }
    return analyticsOperations.retryComments.response.parse({items:result,updated});
   });
  },
 };
}
