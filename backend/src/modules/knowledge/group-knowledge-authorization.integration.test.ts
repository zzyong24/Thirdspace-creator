import {afterEach,beforeEach,describe,expect,it} from 'vitest';
import {eq} from 'drizzle-orm';
import {createDb,knowledgeItems,knowledgeAdoptions,knowledgeRelations,resourceAccessGrants,materialLinks,contentOutputs,publications,platformAccounts} from '@creatoros/backend';
import {createAccountGroupService} from '../platform-account/account-group.service';
import {createAiService} from '../ai/ai.service';
import {createAgenticProposalAdoptionService} from '../ai/agentic-proposal-adoption.service';
import {createKnowledgeProposalAdoptionService,prepareKnowledgeProposal} from './knowledge-proposal-adoption.service';
import {createKnowledgeRepository} from './knowledge.repository';
import {createProjectRepository,createProjectsService} from '../projects';
import type {RequestContext} from '@creatoros/contract';

let store:Awaited<ReturnType<typeof createDb>>,serial=0;
const now=()=>new Date().toISOString(),nextId=(p:string)=>`${p}-${++serial}`;
const base:RequestContext={userId:'group-knowledge-user',requestId:'knowledge-group',source:'user'};
let groups:ReturnType<typeof createAccountGroupService>,a:RequestContext,b:RequestContext,foreign:RequestContext;
beforeEach(async()=>{
 store=await createDb();serial=0;groups=createAccountGroupService({db:store.db,now,nextId});
 const source=await groups.create(base,{name:'当前组',idempotencyKey:'a'}),other=await groups.create(base,{name:'另一组',idempotencyKey:'b'});
 const differentUser={...base,userId:'foreign-knowledge-user'},outside=await groups.create(differentUser,{name:'其他用户组',idempotencyKey:'foreign'});
 a={...base,groupId:source.id,accountId:null};b={...base,groupId:other.id,accountId:null};foreign={...differentUser,groupId:outside.id,accountId:null};
});
afterEach(async()=>store.client.close());
describe('知识组权限的真实数据库链路',()=>{
 it('公开AI候选确认可在空组产生知识及回执；重试只一份，跨组确认和归档新写拒绝',async()=>{
  const knowledge=createKnowledgeProposalAdoptionService(store.db,now);
  const adoption=createAgenticProposalAdoptionService(store.db,{knowledge:(ctx,p,tx)=>knowledge.adopt(ctx,p,tx),assetTagsBatch:async()=>{throw new Error('不应写素材标签');}},now);
  const notUsed=async():Promise<never>=>{throw new Error('不应调用其它创作服务');};
  const ai=createAiService({db:store.db,now,nextId,agenticProposals:adoption,
   artifacts:{createVersion:notUsed},knowledge:{createKnowledge:notUsed},candidate:{createFromAIResult:notUsed,enrichCard:notUsed},
   learnings:{createLearning:notUsed},publishing:{createPublicationFromDraft:notUsed},materialLinks:{link:notUsed},
   positioning:{upsertProfile:notUsed,createStatementVersion:notUsed},calibration:{createDraftPrediction:notUsed},
  });
  const task=await ai.createTask(a,{taskType:'exec.agentic.research',inputData:{goal:'形成待确认资料'}});
  const proposal=prepareKnowledgeProposal(a,{proposalId:'empty-group-proposal',title:'实际候选知识',note:'候选正文',sourceNote:'公开证据',source:{taskId:task.id,toolCallId:'knowledge-call',evidenceRefs:['https://example.com/evidence']}});
  await ai.markRunning(a,task.id);await ai.recordCandidate(a,task.id,{resultType:'agentic_proposals',resultData:{proposals:[proposal]}});
  await expect(ai.confirmTask(b,task.id)).rejects.toMatchObject({code:'OwnershipError'});
  const results=await Promise.all([ai.confirmTask(a,task.id),ai.confirmTask(a,task.id)]);
  expect(results.map(r=>r.status)).toEqual(['succeeded','succeeded']);
  const [item]=await store.db.select().from(knowledgeItems);expect(item).toMatchObject({groupId:a.groupId,accountId:null,title:'实际候选知识'});
  const [receipt]=await store.db.select().from(knowledgeAdoptions);expect(receipt).toMatchObject({groupId:a.groupId,accountId:null,result:{knowledgeId:item!.id}});
  expect(await store.db.select().from(platformAccounts)).toHaveLength(0);
  await expect(knowledge.adopt(b,proposal)).rejects.toMatchObject({code:'ConflictError'});
  const before=await groups.get(a,a.groupId!);await groups.archive(a,a.groupId!,before.version);
  const later=prepareKnowledgeProposal(a,{proposalId:'archived-proposal',title:'归档后不应落库',note:'正文',sourceNote:'证据',source:proposal.source});
  await expect(knowledge.adopt(a,later)).rejects.toMatchObject({code:'OwnershipError'});
  expect(await store.db.select().from(knowledgeItems)).toHaveLength(1);
 });
 it('关系必须两端同user并在当前组owned或显式grant可读，撤销grant即时隐藏双向边',async()=>{
  const repo=createKnowledgeRepository(store.db,{now,nextId}),keyA={kind:'group' as const,id:a.groupId!},keyB={kind:'group' as const,id:b.groupId!};
  const own=await repo.create(a.userId,keyA,{title:'当前组笔记'}),local=await repo.create(a.userId,keyA,{title:'当前组另一笔记'}),remote=await repo.create(b.userId,keyB,{title:'其它组笔记'}),outside=await repo.create(foreign.userId,{kind:'group',id:foreign.groupId!},{title:'其它用户笔记'});
  // 真正的历史软边fixture；读取不能假设旧写路径已经验证两端。
  for(const [id,sourceKnowledgeId,targetKnowledgeId] of [['local-edge',own.id,local.id],['hidden-group-edge',own.id,remote.id],['hidden-user-edge',own.id,outside.id],['reverse-grant-edge',remote.id,own.id]] as const)
   await store.db.insert(knowledgeRelations).values({id,sourceKnowledgeId,targetKnowledgeId,relationType:'related'});
  expect((await repo.listRelations(a.userId,keyA,own.id)).map(r=>r.id)).toEqual(['local-edge']);
  expect((await repo.listAllRelations(a.userId,keyA)).map(r=>r.id)).toEqual(['local-edge']);
  await store.db.insert(resourceAccessGrants).values({id:'knowledge-readable-grant',userId:a.userId,targetGroupId:a.groupId!,resourceType:'knowledge',resourceId:remote.id,originGroupId:b.groupId!,migrationId:'permission-fixture',createdAt:now()});
  expect(new Set((await repo.listAllRelations(a.userId,keyA)).map(r=>r.id))).toEqual(new Set(['local-edge','hidden-group-edge','reverse-grant-edge']));
  expect((await repo.listRelations(a.userId,keyA,remote.id)).map(r=>r.id)).toEqual(['reverse-grant-edge']);
  await store.db.update(resourceAccessGrants).set({revokedAt:now()}).where(eq(resourceAccessGrants.id,'knowledge-readable-grant'));
  expect((await repo.listAllRelations(a.userId,keyA)).map(r=>r.id)).toEqual(['local-edge']);
 });
 it('共享知识在两组合法复用，战绩只计算当前组用料；别组已发布不影响当前组',async()=>{
  const repo=createKnowledgeRepository(store.db,{now,nextId}),keyA={kind:'group' as const,id:a.groupId!},keyB={kind:'group' as const,id:b.groupId!};
  const note=await repo.create(a.userId,keyA,{title:'显式授权的笔记'});
  await store.db.insert(resourceAccessGrants).values({id:'stats-grant',userId:a.userId,targetGroupId:b.groupId!,resourceType:'knowledge',resourceId:note.id,originGroupId:a.groupId!,migrationId:'stats-fixture',createdAt:now()});
  const svc=createProjectsService(createProjectRepository(store.db),{now,nextId});
  const pa=await svc.createProject(a,{title:'当前组创作',creationMode:'free',targetPlatforms:[]}),pb=await svc.createProject(b,{title:'别组创作',creationMode:'free',targetPlatforms:[]});
  for(const [id,ctx,projectId] of [['stats-a',a,pa.id],['stats-b1',b,pb.id],['stats-b2',b,pb.id]] as const)
   await store.db.insert(materialLinks).values({id,userId:ctx.userId,groupId:ctx.groupId!,accountId:null,projectId,entityType:'knowledge',entityId:note.id,createdAt:now()});
  const accountId='stats-platform-account';await store.db.insert(platformAccounts).values({id:accountId,userId:a.userId,platform:'douyin',accountHandle:'真实平台fixture',externalAccountId:'sec_stats',createdAt:now(),updatedAt:now()});await groups.registerAccount(b,accountId);
  await store.db.insert(contentOutputs).values({id:'stats-output',projectId:pb.id,title:'另一组已发布稿',contentType:'video',status:'draft',createdAt:now(),updatedAt:now()});
  await store.db.insert(publications).values({id:'stats-publication',userId:a.userId,groupId:b.groupId!,accountId,contentOutputId:'stats-output',platform:'douyin',accountReference:'sec_stats',status:'published',externalId:'aweme_stats',createdAt:now(),updatedAt:now()});
  expect(await repo.get(a.userId,keyA,note.id)).toMatchObject({usedCount:1,usedInPublished:false});
  expect(await repo.get(a.userId,keyB,note.id)).toMatchObject({usedCount:2,usedInPublished:true});
  expect((await repo.list(a.userId,keyA))[0]).toMatchObject({usedCount:1,usedInPublished:false});
 });
});
