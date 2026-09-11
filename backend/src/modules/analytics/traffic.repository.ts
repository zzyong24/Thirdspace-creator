import {and,asc,eq,inArray,type Db} from '@creatoros/backend';
import {publicationTraffic} from '../../schema/analytics';
import type {TrafficSourcePayload} from '@creatoros/contract';
export function createTrafficRepository(db:Db){
 const owned=(userId:string,accountId:string)=>and(eq(publicationTraffic.userId,userId),eq(publicationTraffic.accountId,accountId));
 return {
  async enqueue(userId:string,accountId:string,publicationId:string,externalId:string,stamp:string,force:boolean){
   const [old]=await db.select().from(publicationTraffic).where(and(owned(userId,accountId),eq(publicationTraffic.publicationId,publicationId)));
   if(old?.status==='pending'&&old.externalId===externalId)return false;
   if(!force&&old?.externalId===externalId&&old?.capturedAt&&Date.parse(stamp)-Date.parse(old.capturedAt)<24*60*60_000)return false;
   if(old){const rows=await db.update(publicationTraffic).set({status:'pending',error:null,requestedAt:stamp,externalId,...(old.externalId!==externalId?{data:null,capturedAt:null,attemptedAt:null,lastTaskId:null}:{})}).where(and(owned(userId,accountId),eq(publicationTraffic.publicationId,publicationId),eq(publicationTraffic.requestedAt,old.requestedAt))).returning({id:publicationTraffic.publicationId});return rows.length>0;}
   const rows=await db.insert(publicationTraffic).values({userId,accountId,publicationId,externalId,requestedAt:stamp,status:'pending'}).onConflictDoNothing().returning({id:publicationTraffic.publicationId});return rows.length>0;
  },
  async list(userId:string,accountId:string,ids:readonly string[]){if(!ids.length)return [];return db.select().from(publicationTraffic).where(and(owned(userId,accountId),inArray(publicationTraffic.publicationId,[...ids])));},
  async pending(userId:string,accountId:string,limit:number){return db.select().from(publicationTraffic).where(and(owned(userId,accountId),eq(publicationTraffic.status,'pending'))).orderBy(asc(publicationTraffic.requestedAt),asc(publicationTraffic.publicationId)).limit(limit);},
  async settle(userId:string,accountId:string,publicationId:string,requestedAt:string,stamp:string,taskId:string,result:{data:TrafficSourcePayload}|{error:string;status:'failed'|'needs_reconnect'}){
   return db.update(publicationTraffic).set('data' in result?{lastTaskId:taskId,status:'succeeded',capturedAt:stamp,attemptedAt:stamp,error:null,data:result.data}:{lastTaskId:taskId,status:result.status,attemptedAt:stamp,error:result.error}).where(and(owned(userId,accountId),eq(publicationTraffic.publicationId,publicationId),eq(publicationTraffic.requestedAt,requestedAt),eq(publicationTraffic.status,'pending'))).returning();
  },
  async failPending(userId:string,accountId:string,rows:readonly {publicationId:string;externalId:string;requestedAt:string}[],stamp:string,error:string){
   for(const row of rows)await db.update(publicationTraffic).set({status:'failed',attemptedAt:stamp,error}).where(and(owned(userId,accountId),eq(publicationTraffic.publicationId,row.publicationId),eq(publicationTraffic.externalId,row.externalId),eq(publicationTraffic.requestedAt,row.requestedAt),eq(publicationTraffic.status,'pending')));
  },
  async summary(userId:string,accountId:string,taskId:string){
   const rows=await db.select({status:publicationTraffic.status}).from(publicationTraffic).where(and(owned(userId,accountId),eq(publicationTraffic.lastTaskId,taskId)));
   return {written:rows.filter(r=>r.status==='succeeded').length,failed:rows.filter(r=>r.status==='failed'||r.status==='needs_reconnect').length};
  },
  async reconnect(userId:string,accountId:string){await db.update(publicationTraffic).set({status:'pending',error:null}).where(and(owned(userId,accountId),eq(publicationTraffic.status,'needs_reconnect')));},
 };
}
