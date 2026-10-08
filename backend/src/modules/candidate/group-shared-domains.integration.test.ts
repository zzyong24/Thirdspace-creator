import {afterEach,beforeEach,describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {createDb,type RequestContext} from '@creatoros/backend';
import {accountGroups} from '../../schema/account-groups';
import {createCandidateService} from './candidate.service';
import {createLearningsService} from '../learnings/learnings.service';
import {createReviewsService} from '../reviews/reviews.service';
import {createArtifactsService} from '../artifacts/artifacts.service';
import {createCalibrationService} from '../calibration/calibration.service';
import {createTopicWorkspaceService} from './topic-workspace.service';
import {emptyTopicWorkspaceConfig} from '@creatoros/contract';
const NOW='2026-10-04T00:00:00.000Z';
const ctx:RequestContext={userId:'owner',groupId:'group-a',requestId:'test',source:'user'};
let opened:Awaited<ReturnType<typeof createDb>>;
let next=0;
const nextId=(prefix:string)=>`${prefix}-${++next}`;
const migration=fileURLToPath(new URL('../../../drizzle/0105_group_shared_domains.sql',import.meta.url));
function services(){
 const db=opened.db;
 const assertProject=async(c:RequestContext,id:string)=>{
  if(c.userId!=='owner'||c.groupId!=='group-a'||id!=='project')throw Object.assign(new Error('Project not found'),{name:'OwnershipError'});
 };
 const review=createReviewsService({db,now:()=>NOW,nextId,projects:{verifyProjectOwned:assertProject,verifyOutputOwned:async()=>{},recordActivity:async()=>{}},publishing:{listProjectPublications:async()=>[]},analytics:{getProjectSnapshots:async()=>({})}});
 const artifact=createArtifactsService({db,now:()=>NOW,nextId,assertProjectOwned:assertProject});
 return {
  candidate:createCandidateService({db,now:()=>NOW,nextId,projects:{createProject:async()=>({id:'project'})},ingestion:{assertRunExists:async()=>{} }}),
  learning:createLearningsService({db,now:()=>NOW,nextId,projects:{assertOwnsProject:assertProject,recordActivity:async()=>{}},assertReviewOwned:(c,id)=>review.getReview(c,id),assertArtifactOwned:(c,id)=>artifact.getArtifact(c,id)}),
  review,artifact,
  calibration:createCalibrationService({db,now:()=>NOW,nextId} as any),
  workspace:createTopicWorkspaceService({db,now:()=>NOW}),
 };
}
beforeEach(async()=>{opened=await createDb();next=0;await opened.client.exec(readFileSync(migration,'utf8'));await opened.db.insert(accountGroups).values(['group-a','group-b'].map(id=>({id,userId:'owner',name:id,createdAt:NOW,updatedAt:NOW})));await opened.client.query('INSERT INTO projects(id,user_id,group_id,title,brief,creation_mode,status,current_stage,started_at,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$9,$9)',['project','owner','group-a','真实组内父项目','','free','active','script',NOW]);});
afterEach(async()=>{await opened.client.close();});
describe('T-1022 共享领域组隔离',()=>{
 it('空组可创建和读回五种领域数据；具体账号筛选不改变组数据',async()=>{const s=services();const candidate=await s.candidate.createCandidate(ctx,{title:'组内选题'});const learning=await s.learning.createLearning(ctx,{title:'组内经验'});const review=await s.review.createReview(ctx,'project',{reviewType:'project'});const artifact=await s.artifact.createArtifact(ctx,{projectId:'project',artifactType:'master_script',stage:'scripting',title:'组内稿'} as any);const rubric=await s.calibration.createRubric(ctx,{name:'组内标准',dimensions:[{key:'clarity',label:'清楚',weight:0.5},{key:'altruism',label:'依据',weight:0.5}]} );const filtered={...ctx,accountId:'actual-other-account'};
 expect((await s.candidate.listCandidates(filtered,{limit:20,offset:0})).rows.map(r=>r.id)).toContain(candidate.id);expect((await s.learning.getLearning(filtered,learning.id)).id).toBe(learning.id);expect((await s.review.getReview(filtered,review.id)).id).toBe(review.id);expect((await s.artifact.getArtifact(filtered,artifact.id)).id).toBe(artifact.id);expect((await s.calibration.getRubric(filtered,rubric.id)).id).toBe(rubric.id);
 for(const table of ['candidates','learnings','reviews','artifacts','rubrics']){const r=await opened.client.query<{group_id:string;account_id:null}>(`SELECT group_id,account_id FROM ${table}`);expect(r.rows).toEqual([{group_id:'group-a',account_id:null}]);}
 });
 it('跨组、跨用户真实ID读取统一拒绝，不受同accountId影响',async()=>{const s=services(),c=await s.candidate.createCandidate(ctx,{title:'隔离'}),l=await s.learning.createLearning(ctx,{title:'隔离经验'}),r=await s.review.createReview(ctx,'project',{reviewType:'project'}),a=await s.artifact.createArtifact(ctx,{projectId:'project',artifactType:'master_script',stage:'scripting',title:'隔离稿'} as any),rub=await s.calibration.createRubric(ctx,{name:'隔离标准',dimensions:[{key:'clarity',label:'清楚',weight:0.5},{key:'altruism',label:'依据',weight:0.5}]} );for(const other of [{...ctx,groupId:'group-b'},{...ctx,userId:'stranger'}]){for(const read of [()=>s.candidate.getCandidate(other,c.id),()=>s.learning.getLearning(other,l.id),()=>s.review.getReview(other,r.id),()=>s.artifact.getArtifact(other,a.id),()=>s.calibration.getRubric(other,rub.id)])await expect(read()).rejects.toMatchObject({name:'OwnershipError'});}});
 it('归档组所有新增入口拒绝且不落库',async()=>{const s=services();await opened.client.exec("UPDATE account_groups SET status='archived' WHERE id='group-a'");for(const write of [()=>s.candidate.createCandidate(ctx,{title:'拒绝'}),()=>s.learning.createLearning(ctx,{title:'拒绝'}),()=>s.review.createReview(ctx,'project',{reviewType:'project'}),()=>s.artifact.createArtifact(ctx,{projectId:'project',artifactType:'master_script',stage:'scripting',title:'拒绝'} as any),()=>s.calibration.createRubric(ctx,{name:'拒绝',dimensions:[{key:'clarity',label:'清楚',weight:0.5},{key:'altruism',label:'依据',weight:0.5}]})])await expect(write()).rejects.toMatchObject({name:'OwnershipError'});});
 it('选题配置为空组保存，其他账号筛选共享，组间各自版本和幂等',async()=>{const s=services();const cmd={config:emptyTopicWorkspaceConfig(),expectedVersion:0,idempotencyKey:'save'};expect((await s.workspace.save(ctx,cmd)).version).toBe(1);expect((await s.workspace.get({...ctx,accountId:'actual'})).version).toBe(1);expect((await s.workspace.get({...ctx,groupId:'group-b'})).version).toBe(0);expect((await s.workspace.save({...ctx,groupId:'group-b'},cmd)).version).toBe(1);await opened.client.exec("UPDATE account_groups SET status='archived' WHERE id='group-a'");await expect(s.workspace.save(ctx,{...cmd,expectedVersion:1,idempotencyKey:'save-2'})).rejects.toMatchObject({name:'OwnershipError'});});
 it('子版本、洞察和经验应用不跨组，归档后编辑也拒绝',async()=>{const s=services(),other={...ctx,groupId:'group-b'};const a=await s.artifact.createArtifact(ctx,{projectId:'project',artifactType:'master_script',stage:'scripting',title:'稿'} as any),r=await s.review.createReview(ctx,'project',{reviewType:'project'}),l=await s.learning.createLearning(ctx,{title:'经验'});const insight=await s.review.createInsight(ctx,r.id,{insightType:'strategy',title:'洞察'});expect((await s.review.listReviewInsights({...ctx,accountId:'another'},r.id)).map(i=>i.id)).toContain(insight.id);await expect(s.artifact.listVersions(other,a.id)).rejects.toMatchObject({name:'OwnershipError'});await expect(s.artifact.createVersion(other,a.id,{contentText:'跨组',changeSummary:'不应写入'})).rejects.toMatchObject({name:'OwnershipError'});await expect(s.review.createInsight(other,r.id,{insightType:'strategy',title:'跨组'})).rejects.toMatchObject({name:'OwnershipError'});await expect(s.learning.applyLearning(other,l.id,{projectId:'project'})).rejects.toMatchObject({name:'OwnershipError'});await opened.client.exec("UPDATE account_groups SET status='archived' WHERE id='group-a'");await expect(s.artifact.createVersion(ctx,a.id,{contentText:'归档写入',changeSummary:'不应写入'})).rejects.toMatchObject({name:'OwnershipError'});await expect(s.learning.patchLearning(ctx,l.id,{title:'不应变更'})).rejects.toMatchObject({name:'OwnershipError'});await expect(s.review.createInsight(ctx,r.id,{insightType:'strategy',title:'不应新增'})).rejects.toMatchObject({name:'OwnershipError'});});
 it('经验采纳、偏好与选题配置按组独立幂等，同组不同账号复用',async()=>{const s=services(),filtered={...ctx,accountId:'another'},other={...ctx,groupId:'group-b'};const first=await s.learning.adoptLearning(ctx,{title:'经验',insight:'共同文本'});expect((await s.learning.adoptLearning(filtered,{title:'经验',insight:'共同文本'})).id).toBe(first.id);expect((await s.learning.adoptLearning(other,{title:'经验',insight:'共同文本'})).id).not.toBe(first.id);await s.candidate.upsertTopicPreference(ctx,{keyword:'用户明确偏好',direction:'prefer',signal:'用户选择',exampleCount:3});await s.candidate.upsertTopicPreference(filtered,{keyword:'用户明确偏好',direction:'prefer',signal:'更新',exampleCount:4});await s.candidate.upsertTopicPreference(other,{keyword:'用户明确偏好',direction:'prefer',signal:'另一组',exampleCount:3});expect((await s.candidate.listActiveTopicPreferences(ctx))).toHaveLength(1);expect((await s.candidate.listActiveTopicPreferences(other))).toHaveLength(1);});
 it('迁移重复执行保留记录与版本，legacy账号插入冻结真实组而非伪账号',async()=>{await opened.client.exec(`INSERT INTO account_groups(id,user_id,name,created_at,updated_at) VALUES('grp_legacy_legacy-account','owner','历史账号组','${NOW}','${NOW}'); INSERT INTO platform_accounts(id,user_id,platform,account_handle,created_at,updated_at) VALUES('legacy-account','owner','douyin','旧账号','${NOW}','${NOW}'); INSERT INTO account_group_memberships(id,user_id,group_id,platform_account_id,joined_at) VALUES('legacy-member','owner','grp_legacy_legacy-account','legacy-account','${NOW}');`);const s=services();const c=await s.candidate.createCandidate({...ctx,groupId:null,accountId:'legacy-account'},{title:'旧入口'});expect((await s.candidate.getCandidate({...ctx,groupId:'grp_legacy_legacy-account'},c.id)).id).toBe(c.id);const before=await opened.client.query('SELECT id,account_id,group_id,title FROM candidates ORDER BY id');await opened.client.exec(readFileSync(migration,'utf8'));await opened.client.exec(readFileSync(migration,'utf8'));expect((await opened.client.query('SELECT id,account_id,group_id,title FROM candidates ORDER BY id')).rows).toEqual(before.rows);await expect(s.candidate.getCandidate({...ctx,groupId:null,accountId:'other-account'},c.id)).rejects.toMatchObject({name:'OwnershipError'});});

 it('AI候选和经验采纳只接受任务冻结组，成员筛选不能重新归属',async()=>{
  await opened.client.exec(`INSERT INTO ai_tasks(id,user_id,group_id,task_type,idempotency_key,requested_at) VALUES('task-a','owner','group-a','topic_generate','test-task','${NOW}')`);
  const s=services(),filtered={...ctx,accountId:'actual-filter'},other={...ctx,groupId:'group-b'};
  const input={aiTaskId:'task-a#1',resultType:'candidate' as const,resultData:{title:'AI选题',source:'trend' as const}};
  const first=await s.candidate.createFromAIResult(filtered,input);
  expect((await s.candidate.createFromAIResult(ctx,input)).id).toBe(first.id);
  await expect(s.candidate.createFromAIResult(other,input)).rejects.toMatchObject({name:'OwnershipError'});
  const body={title:'AI经验',adoptionKey:'ai-result:item',sourceTaskId:'task-a'};
  const learning=await s.learning.createLearning(filtered,body);
  expect((await s.learning.createLearning(ctx,body)).id).toBe(learning.id);
  await expect(s.learning.createLearning(other,body)).rejects.toMatchObject({name:'OwnershipError'});
  await expect(s.learning.createLearning(ctx,{...body,adoptionKey:'missing-task',sourceTaskId:undefined})).rejects.toMatchObject({name:'OwnershipError'});
 });

 it('复盘和脚本产生经验先校验真实来源，跨组ID不落库',async()=>{
  const s=services(),other={...ctx,groupId:'group-b'};
  const review=await s.review.createReview(ctx,'project',{reviewType:'project'});
  const artifact=await s.artifact.createArtifact(ctx,{projectId:'project',artifactType:'master_script',stage:'scripting',title:'稿'} as any);
  const insight={reviewId:review.id,insightTitle:'经验',insightBody:'依据',learningType:'strategy',recommendation:''};
  expect((await s.learning.promoteReviewInsight(ctx,insight)).reviewId).toBe(review.id);
  expect(await s.learning.captureEditDelta(ctx,{artifactId:artifact.id,projectId:'project',before:'旧脚本',after:'修改脚本'})).not.toBeNull();
  await expect(s.learning.promoteReviewInsight(other,insight)).rejects.toMatchObject({name:'OwnershipError'});
  await expect(s.learning.captureEditDelta(other,{artifactId:artifact.id,projectId:null,before:'旧脚本',after:'修改脚本'})).rejects.toMatchObject({name:'OwnershipError'});
 });

});
