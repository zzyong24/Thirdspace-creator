import {and,eq,intelligenceItems,sourceSnapshots,OwnershipError,requireAccountId,type Db} from "@creatoros/backend";
import type {RequestContext} from "@creatoros/contract";
/** 原雷达不可变采集快照的纯读取。没有插入转写状态、补采集、轮询或当前版本兜底。 */
export function createIntelligenceSnapshotReader(db:Db){return{
 async readImmutableSnapshot(ctx:RequestContext,itemId:string,snapshotId:string){
  const accountId=requireAccountId(ctx.accountId,"intelligence.snapshot");
  const [item]=await db.select().from(intelligenceItems).where(and(eq(intelligenceItems.id,itemId),eq(intelligenceItems.userId,ctx.userId),eq(intelligenceItems.accountId,accountId)));
  if(!item)throw new OwnershipError("雷达来源不存在");
  const [snapshot]=await db.select().from(sourceSnapshots).where(and(eq(sourceSnapshots.id,snapshotId),eq(sourceSnapshots.itemId,itemId),eq(sourceSnapshots.userId,ctx.userId),eq(sourceSnapshots.accountId,accountId)));
  if(!snapshot||snapshot.safeExtract===null)throw new OwnershipError("雷达原不可变正文快照不可用，请明确选择可用历史来源");
  return{itemId,versionId:snapshot.id,text:snapshot.safeExtract};
 }
};}
