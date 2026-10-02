import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { createDb, aiTasks, aiTaskResults, type Db } from '@creatoros/backend';
import { readFileSync } from 'node:fs';
import { createTopicWorkspaceService } from './topic-workspace.service';
const ctx = { userId: 'u', accountId: 'a', requestId: 'r', source: 'user' as const };
const stamp = '2026-10-02T12:00:00.000Z';
const config = { audience: '抖音技术小白', platform: 'douyin', preparationMinutes: 240, audienceGrid: [], industryGrid: [], problems: [], authorMaterials: [] };
describe('观众任务工作区真实持久化', () => {
 let db: Db; let close:()=>Promise<void>; let service: ReturnType<typeof createTopicWorkspaceService>;
 beforeEach(async () => { const opened=await createDb(); db=opened.db; close=()=>opened.client.close(); service = createTopicWorkspaceService({ db, now: () => stamp }); });
 afterEach(async () => { await close(); });
 it('空配置、保存回读、CAS、幂等及账号隔离', async () => {
  expect((await service.get(ctx)).version).toBe(0);
  const cmd = { config, expectedVersion: 0, idempotencyKey: 'first' };
  const saved = await service.save(ctx, cmd);
  expect(saved.version).toBe(1);
  expect(await service.save(ctx, cmd)).toEqual(saved);
  await expect(service.save(ctx, { ...cmd, config: { ...config, audience: '其他' } })).rejects.toThrow('幂等');
  await expect(service.save(ctx, { ...cmd, idempotencyKey: 'second' })).rejects.toThrow('版本');
  expect((await service.get({ ...ctx, accountId: 'b' })).config.audience).toBe('');
  expect((await service.get({ ...ctx, userId: 'v' })).version).toBe(0);
 });
 it('月明完整v02保存16入口、冻结8代表材料与8语义配对', async () => {
  const personalized=JSON.parse(readFileSync(new URL('../../../../docs/features/audience-task-topics/moonlit-v02.workspace.json',import.meta.url),'utf8'));
  const saved=await service.save(ctx,{config:personalized,expectedVersion:0,idempotencyKey:'v02'});
  expect(saved.config.authorMaterials).toHaveLength(16);
  expect((await service.get(ctx)).config).toEqual(saved.config);
  const context=await service.recommendationContext(ctx);
  expect(context.config.authorMaterials).toHaveLength(8);
  expect(context.config.semanticPairs).toHaveLength(8);
  expect(context.config.audienceCenter).toBe('技术小白，用AI把手头的事做成');
  expect(context.config.audienceGrid.map(c=>c.position)).toEqual([0,1,2,3,5,6,7,8]);
  expect(context.config.problems.every(p=>p.readScope.includes('未自行网络复验'))).toBe(true);
 });
 it('反馈从持久结果回读，重试幂等且不跨账号/项目', async () => {
  await db.insert(aiTasks).values({id:'task',userId:'u',accountId:'a',taskType:'topic.generate',status:'awaiting_confirmation',idempotencyKey:'gen',requestedAt:stamp});
  await db.insert(aiTaskResults).values({id:'result',aiTaskId:'task',resultType:'candidate_list',resultData:{items:[],originalAudienceItems:[{proposalId:'proposal:0',title:'真实原题',angle:'真实角度',audienceTask:{propositionKey:'original'}}]}});
  const cmd={taskId:'task',proposalId:'proposal:0',reason:'audience_mismatch',note:'工程题不适合小白',idempotencyKey:'reject'};
  const saved=await service.feedback(ctx,cmd);
  expect(await service.feedback(ctx,cmd)).toEqual(saved);
  await expect(service.feedback(ctx,{...cmd,note:'其他'})).rejects.toThrow('幂等');
  await expect(service.feedback({...ctx,accountId:'b'},cmd)).rejects.toThrow('不存在');
  const context=await service.recommendationContext(ctx);
  expect(context.rejected).toMatchObject([{title:'真实原题',propositionKey:'original',reason:'audience_mismatch 工程题不适合小白'}]);
  expect((await service.recommendationContext({...ctx,userId:'v'})).rejected).toEqual([]);
 });
 it('定位或配置版本改变后旧结果必须重审', async () => {
  let version='p1';
  const scoped=createTopicWorkspaceService({db,now:()=>stamp,currentPositioningVersion:async()=>version});
  const assessment={workspaceVersion:0,positioningVersionId:'p1'} as Parameters<typeof scoped.assertCurrent>[1];
  await scoped.assertCurrent(ctx,assessment);
  version='p2';await expect(scoped.assertCurrent(ctx,assessment)).rejects.toThrow('重审');
 });
 it('项目材料仅在明确归属与当前项目范围读取', async () => {
  const scoped=createTopicWorkspaceService({db,now:()=>stamp,assertProject:async(_ctx,id)=>{if(id!=='p')throw new Error('归属');}});
  const material={id:'private',text:'项目私有',sourceRef:'项目记录',projectId:'p',contextRef:null};
  await scoped.save(ctx,{config:{...config,authorMaterials:[material]},expectedVersion:0,idempotencyKey:'project'});
  expect((await scoped.recommendationContext(ctx)).config.authorMaterials).toEqual([]);
  expect((await scoped.recommendationContext(ctx,'p')).config.authorMaterials).toHaveLength(1);
  await expect(scoped.recommendationContext(ctx,'other')).rejects.toThrow('归属');
 });
 it('不接受重复格子或伪造来源记录', async () => {
  const cell = { id: 'c', text: '会议', evidence: 'hypothesis', sourceRefs: [] };
  await expect(service.save(ctx, { config: { ...config, audienceGrid: [cell, cell] }, expectedVersion: 0, idempotencyKey: 'x' })).rejects.toThrow();
 });
 it('并发首次保存只能有一个赢家，不静默覆盖', async () => {
  const results = await Promise.allSettled(['x','y'].map(idempotencyKey => service.save(ctx, { config, expectedVersion: 0, idempotencyKey })));
  expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
 });
});
