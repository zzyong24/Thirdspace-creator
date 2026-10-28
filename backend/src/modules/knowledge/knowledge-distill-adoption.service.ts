import {createHash} from 'node:crypto';
import {and,eq,knowledgeAdoptions,workspaceKey,workspaceStamp,workspaceFilter,type Db} from '@creatoros/backend';
import {knowledgeDistillAdoptInput,knowledgeDistillSource,knowledgeDistillReceipt,type KnowledgeDistillSource,type RequestContext} from '@creatoros/contract';
import {lockWorkspaceMembership} from '../platform-account/membership-lock.service';
import {createKnowledgeService} from './knowledge.service';
import {createKnowledgeRepository} from './knowledge.repository';
import {ConflictError} from './knowledge.errors';

export type DistillSourceReader=(ctx:RequestContext,source:KnowledgeDistillSource,store:Db)=>Promise<{source:KnowledgeDistillSource;taskId:string;callId:string;sourceDigest:string;candidate:{atoms:readonly unknown[];originalText:string;suggestedTags:readonly string[]}} >;
export function createKnowledgeDistillAdoptionService(db:Db,deps:{now:()=>string;nextId:(prefix:string)=>string},readSource:DistillSourceReader){
 const receiptKey=(taskId:string,callId:string)=>`distill:${taskId}:${callId}`;
 async function readReceipt(store:Db,ctx:RequestContext,verified:Awaited<ReturnType<DistillSourceReader>>){
  const [row]=await store.select().from(knowledgeAdoptions).where(and(eq(knowledgeAdoptions.userId,ctx.userId),workspaceFilter(knowledgeAdoptions,ctx),eq(knowledgeAdoptions.proposalId,receiptKey(verified.taskId,verified.callId))));
  if(!row)return null;if(row.sourceDigest!==verified.sourceDigest)throw new ConflictError('蒸馏来源已变化，不能覆盖旧采纳回执');
  return knowledgeDistillReceipt.parse(row.result);
 }
 return {
  async receipt(ctx:RequestContext,raw:unknown){const source=knowledgeDistillSource.parse(raw);return {receipt:await readReceipt(db,ctx,await readSource(ctx,source,db))};},
  async adopt(ctx:RequestContext,raw:unknown){
   const input=knowledgeDistillAdoptInput.parse(raw);
   return db.transaction(async tx=>{
    await lockWorkspaceMembership(tx,ctx);const store=tx as unknown as Db,verified=await readSource(ctx,input.source,store);
    const prior=await readReceipt(store,ctx,verified);if(prior)return prior; // First selected subset/archive wins, even after refresh or changed edits.
    const indexes=input.atoms.map(atom=>atom.index);
    if(new Set(indexes).size!==indexes.length||indexes.some(index=>index>=verified.candidate.atoms.length))throw new ConflictError('选中的原子不属于本次蒸馏');
    const proposalId=receiptKey(verified.taskId,verified.callId),scope=workspaceKey(ctx);
    const id=`knowledge-distill-adoption:${createHash('sha256').update(JSON.stringify([ctx.userId,scope,proposalId])).digest('hex')}`;
    const [reserved]=await tx.insert(knowledgeAdoptions).values({id,userId:ctx.userId,...workspaceStamp(scope),proposalId,sourceDigest:verified.sourceDigest,result:{},createdAt:deps.now()}).onConflictDoNothing().returning();
    if(!reserved){const winner=await readReceipt(store,ctx,verified);if(!winner)throw new ConflictError('蒸馏采纳回执尚未完成，请重试读取');return winner;}
    const knowledge=createKnowledgeService(createKnowledgeRepository(store,deps)),knowledgeIds:string[]=[];
    for(const atom of input.atoms){const created=await knowledge.createKnowledge(ctx,{title:atom.title,knowledgeType:atom.type,content:atom.note,sourceNote:atom.sourceNote||null,sourceType:'ai',sourceMetadata:{origin:'knowledge_distill',taskId:verified.taskId,callId:verified.callId,atomIndex:atom.index}});knowledgeIds.push(created.id);}
    let archiveKnowledgeId:string|null=null;
    if(input.archiveOriginal){const content=verified.candidate.originalText;const title=(content.split('\n').map(line=>line.trim()).find(Boolean)??'原文存档').slice(0,60);const archived=await knowledge.createKnowledge(ctx,{title,knowledgeType:'reference',content,sourceType:'import',sourceMetadata:{origin:'knowledge_distill_archive',taskId:verified.taskId,callId:verified.callId}});archiveKnowledgeId=archived.id;}
    const result=knowledgeDistillReceipt.parse({source:verified.source,taskId:verified.taskId,callId:verified.callId,knowledgeIds,atomCount:knowledgeIds.length,archiveKnowledgeId,createdAt:deps.now()});
    await tx.update(knowledgeAdoptions).set({result}).where(eq(knowledgeAdoptions.id,id));return result;
   });
  },
 };
}
