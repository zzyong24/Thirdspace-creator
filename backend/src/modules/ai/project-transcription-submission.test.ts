import {createAccountGroupService} from '../platform-account/account-group.service';
import {platformAccounts} from '../../schema/platform-account';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { createDb, projects, aiTasks, executionTasks, projectTranscriptionRequests, eq, sql, type Db } from '@creatoros/backend';
import { createAiService, type ServiceDeps } from './ai.service';
import { createProjectTranscriptionTargetService } from '../projects/project-transcription-target.service';
import { createTranscriptArtifactService } from '../projects/transcript-artifact.service';
let db: Db, close: () => Promise<void>, seq = 0;
beforeAll(async () => { const f = await createDb(); db = f.db; close = () => f.client.close(); });
afterAll(async () => close());
async function fixture() {
    const ctx = { userId: 'transcribe-submit', accountId: `account-${++seq}`, requestId: 'req', source: 'user' as const };
    const now = () => new Date().toISOString(), nextId = (p: string) => `${p}-${++seq}`, projectId = nextId('project');
    await db.insert(projects).values({ id: projectId, userId: ctx.userId, accountId: ctx.accountId, title: '转写项目', source: 'imported', platformRef: { platform: 'douyin', externalId: 'video' }, creationMode: 'manual', status: 'active', currentStage: 'script', startedAt: now(), createdAt: now(), updatedAt: now() });
    const deps = { db, now, nextId, projectTranscriptionTargets: createProjectTranscriptionTargetService(), resolveTaskRuntimeData: async () => ({}) } as unknown as ServiceDeps;
    const service = createAiService(deps), input = { projectId, attemptId: `transcribe-request-${++seq}` };
    return { ctx, service, input, deps, transcripts: createTranscriptArtifactService({ db, now, nextId }) };
}
it('并发不同请求共用一个在途任务，各请求持久重放，正文后来落地不影响回执', async () => {
    const f = await fixture();
    const second = { ...f.input, attemptId: f.input.attemptId + '-other' };
    const [a, b] = await Promise.all([f.service.createProjectTranscriptionTask(f.ctx, f.input), f.service.createProjectTranscriptionTask(f.ctx, second)]);
    expect(a.id).toBe(b.id);
    await f.transcripts.ensure(f.ctx, { awemeId: 'video', transcript: '保存正文' });
    const restarted = createAiService(f.deps);
    expect((await restarted.createProjectTranscriptionTask(f.ctx, second)).id).toBe(a.id);
    await expect(restarted.createProjectTranscriptionTask(f.ctx, { ...f.input, attemptId: f.input.attemptId + '-new' })).rejects.toThrow('已经有逐字稿');
});
it('同请求改项目拒绝，缺账号和跨账号不创建任务', async () => {
    const f = await fixture();
    await f.service.createProjectTranscriptionTask(f.ctx, f.input);
    await expect(f.service.createProjectTranscriptionTask(f.ctx, { ...f.input, projectId: 'other' })).rejects.toMatchObject({ code: 'ATTEMPT_PAYLOAD_MISMATCH' });
    await expect(f.service.createProjectTranscriptionTask({ ...f.ctx, accountId: 'other' }, f.input)).rejects.toThrow();
    await expect(f.service.createProjectTranscriptionTask({ ...f.ctx, accountId: null }, f.input)).rejects.toThrow();
});
it('无来源拒绝，删除已提交任务不能凭旧回执重建', async () => {
    const f = await fixture();
    await db.update(projects).set({ platformRef: {} }).where(eq(projects.id, f.input.projectId));
    await expect(f.service.createProjectTranscriptionTask(f.ctx, f.input)).rejects.toThrow('没有关联抖音');
    await db.update(projects).set({ platformRef: { platform: 'douyin', externalId: 'video' } }).where(eq(projects.id, f.input.projectId));
    const task = await f.service.createProjectTranscriptionTask(f.ctx, f.input);
    await db.delete(aiTasks).where(eq(aiTasks.id, task.id));
    await expect(f.service.createProjectTranscriptionTask(f.ctx, f.input)).rejects.toThrow();
    expect(await f.service.findTaskByAttempt(f.ctx, 'transcribe.douyin', f.input.attemptId)).toBeNull();
});
it('任务与回执同事务回滚，失败后的新请求可新建，旧请求仍回原任务', async () => {
    const f = await fixture();
    const broken = createAiService({ ...f.deps, nextId: (p: string) => { if (p === 'transcription-request')
            throw new Error('receipt failure'); return f.deps.nextId(p); } });
    await expect(broken.createProjectTranscriptionTask(f.ctx, f.input)).rejects.toThrow('receipt failure');
    expect(await f.service.findTaskByAttempt(f.ctx, 'transcribe.douyin', f.input.attemptId)).toBeNull();
    const a = await f.service.createProjectTranscriptionTask(f.ctx, f.input);
    await db.update(aiTasks).set({ status: 'failed' }).where(eq(aiTasks.id, a.id));
    const b = await f.service.createProjectTranscriptionTask(f.ctx, { ...f.input, attemptId: f.input.attemptId + '-new' });
    expect(b.id).not.toBe(a.id);
    expect((await f.service.createProjectTranscriptionTask(f.ctx, f.input)).id).toBe(a.id);
});
it.each(['unknown_result', 'waiting_user', 'paused'])('执行真相 %s 时复用原任务，失效配置不阻止取回在途任务', async (status) => {
    const f = await fixture();
    const task = await f.service.createProjectTranscriptionTask(f.ctx, f.input);
    const executionId = f.deps.nextId('execution');
    await db.insert(executionTasks).values({ id: executionId, userId: f.ctx.userId, accountId: f.ctx.accountId, kind: 'ai_task', ownerType: 'ai_task', ownerId: task.id, status, idempotencyKey: executionId, createdAt: f.deps.now(), updatedAt: f.deps.now() });
    await db.update(aiTasks).set({ status: 'failed', executionTaskId: executionId }).where(eq(aiTasks.id, task.id));
    const service = createAiService({ ...f.deps, resolveTaskRuntimeData: async () => { throw new Error('配置不可用'); } });
    const reused = await service.createProjectTranscriptionTask(f.ctx, { ...f.input, attemptId: f.input.attemptId + '-second' });
    expect(reused.id).toBe(task.id);
    expect(reused.runtimeStatus).toBe(status);
});
it('配置读取不占写事务，准备期间来源变化拒绝且不留任务或回执', async () => {
    const f = await fixture();
    const service = createAiService({ ...f.deps, resolveTaskRuntimeData: async () => {
            await db.update(projects).set({ platformRef: { platform: 'douyin', externalId: 'changed' } }).where(eq(projects.id, f.input.projectId));
            return {};
        } });
    await expect(service.createProjectTranscriptionTask(f.ctx, f.input)).rejects.toThrow('来源已变化');
    expect(await f.service.findTaskByAttempt(f.ctx, 'transcribe.douyin', f.input.attemptId)).toBeNull();
    expect(await db.select().from(projectTranscriptionRequests).where(eq(projectTranscriptionRequests.projectId, f.input.projectId))).toHaveLength(0);
});
it('同账号两个项目竞争同请求键，失败方整体回滚', async () => {
    const f = await fixture();
    const [row] = await db.select().from(projects).where(eq(projects.id, f.input.projectId));
    const other = f.deps.nextId('project');
    await db.insert(projects).values({ ...row!, id: other, platformRef: { platform: 'douyin', externalId: 'other-video' } });
    const results = await Promise.allSettled([f.service.createProjectTranscriptionTask(f.ctx, f.input), f.service.createProjectTranscriptionTask(f.ctx, { ...f.input, projectId: other })]);
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter(r => r.status === 'rejected')).toHaveLength(1);
    expect((await f.service.listTasks(f.ctx, { limit: 200, offset: 0 })).rows).toHaveLength(1);
});
it('旧单请求任务接入回执，不改变原任务；迁移重复执行保留回执', async () => {
    const f = await fixture();
    const old = await f.service.createTask(f.ctx, { taskType: 'transcribe.douyin', attemptId: f.input.attemptId, inputData: { projectId: f.input.projectId, awemeIds: ['video'] } });
    await f.transcripts.ensure(f.ctx, { awemeId: 'video', transcript: '旧任务已落正文' });
    expect((await f.service.createProjectTranscriptionTask(f.ctx, f.input)).id).toBe(old.id);
    const { readFile } = await import('node:fs/promises');
    const ddl = await readFile(new URL('../../../drizzle/0089_project_transcription_requests.sql', import.meta.url), 'utf8');
    await db.execute(sql.raw(ddl));
    await db.execute(sql.raw(ddl));
    expect((await createAiService(f.deps).createProjectTranscriptionTask(f.ctx, f.input)).id).toBe(old.id);
});
it('旧任务没有回执且项目来源后来清空，同请求仍回原任务', async () => {
    const f = await fixture();
    const old = await f.service.createTask(f.ctx, { taskType: 'transcribe.douyin', attemptId: f.input.attemptId, inputData: { projectId: f.input.projectId, awemeIds: ['video'] } });
    await db.update(projects).set({ platformRef: {} }).where(eq(projects.id, f.input.projectId));
    expect((await f.service.createProjectTranscriptionTask(f.ctx, f.input)).id).toBe(old.id);
});
it('关闭并重开隔离磁盘数据库后，第二个请求仍回原任务', async () => {
    const { mkdtemp, rm } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const root = await mkdtemp(join(tmpdir(), 't915-transcription-receipts-'));
    let client: Awaited<ReturnType<typeof createDb>>['client'] | undefined;
    try {
        let opened = await createDb({ dataDir: join(root, 'db') });
        client = opened.client;
        const ctx = { userId: 'disk-user', accountId: 'disk-account', requestId: 'disk', source: 'user' as const };
        const now = () => new Date().toISOString(), nextId = (p: string) => `${p}-${++seq}`;
        await opened.db.insert(projects).values({ id: 'disk-project', userId: ctx.userId, accountId: ctx.accountId, title: '磁盘', source: 'imported', platformRef: { platform: 'douyin', externalId: 'disk-video' }, creationMode: 'manual', status: 'active', currentStage: 'script', startedAt: now(), createdAt: now(), updatedAt: now() });
        const deps = { now, nextId, projectTranscriptionTargets: createProjectTranscriptionTargetService(), resolveTaskRuntimeData: async () => ({}) };
        const service = createAiService({ db: opened.db, ...deps } as unknown as ServiceDeps);
        const first = await service.createProjectTranscriptionTask(ctx, { projectId: 'disk-project', attemptId: 'disk-first-attempt' });
        await service.createProjectTranscriptionTask(ctx, { projectId: 'disk-project', attemptId: 'disk-second-attempt' });
        await client.close();
        client = undefined;
        opened = await createDb({ dataDir: join(root, 'db') });
        client = opened.client;
        const restored = createAiService({ db: opened.db, ...deps } as unknown as ServiceDeps);
        expect((await restored.createProjectTranscriptionTask(ctx, { projectId: 'disk-project', attemptId: 'disk-second-attempt' })).id).toBe(first.id);
        expect((await restored.listTasks(ctx, { limit: 200, offset: 0 })).total).toBe(1);
    }
    finally {
        await client?.close();
        await rm(root, { recursive: true, force: true });
    }
});

async function groupFixture() {
    const userId = `group-transcription-user-${++seq}`;
    const base = { userId, requestId: 'group-transcription', source: 'user' as const };
    const now = () => new Date().toISOString(), nextId = (p: string) => `${p}-${++seq}`;
    const groups = createAccountGroupService({ db, now, nextId });
    const group = await groups.create(base, { name: '空组创作', idempotencyKey: 'empty-source' });
    const other = await groups.create(base, { name: '另一组', idempotencyKey: 'other-source' });
    const ctx = { ...base, groupId: group.id, accountId: null };
    const projectId = nextId('group-project');
    await db.insert(projects).values({ id: projectId, userId, groupId: group.id, accountId: null, title: '空组内已有视频素材的项目', source: 'imported', platformRef: { platform: 'douyin', externalId: 'group-video-source' }, creationMode: 'manual', status: 'active', currentStage: 'script', startedAt: now(), createdAt: now(), updatedAt: now() });
    const deps = { db, now, nextId, projectTranscriptionTargets: createProjectTranscriptionTargetService(), resolveTaskRuntimeData: async () => ({}) } as unknown as ServiceDeps;
    return { ctx, other, groups, deps, service: createAiService(deps), input: { projectId, attemptId: `group-transcription-attempt-${++seq}` } };
}
it('空组已有项目的视频素材可提交转写，不创建或虚构平台账号；同请求持久幂等', async () => {
    const f = await groupFixture();
    const [a,b] = await Promise.all([f.service.createProjectTranscriptionTask(f.ctx,f.input),f.service.createProjectTranscriptionTask(f.ctx,f.input)]);
    expect(a.id).toBe(b.id);
    expect((await db.select().from(aiTasks).where(eq(aiTasks.id,a.id)))[0]).toMatchObject({groupId:f.ctx.groupId,accountId:null});
    expect(a).toMatchObject({groupId:f.ctx.groupId,projectId:f.input.projectId,inputData:{awemeIds:['group-video-source']}});
    expect((await createAiService(f.deps).createProjectTranscriptionTask(f.ctx,f.input)).id).toBe(a.id);
    const receipts = await db.select().from(projectTranscriptionRequests).where(eq(projectTranscriptionRequests.projectId,f.input.projectId));
    expect(receipts).toHaveLength(1);expect(receipts[0]).toMatchObject({groupId:f.ctx.groupId,accountId:null,aiTaskId:a.id});
    expect(await db.select().from(platformAccounts).where(eq(platformAccounts.userId,f.ctx.userId))).toHaveLength(0);
});
it('项目转写跨组提交和回执重放都拒绝；同组请求改变项目拒绝且不留输家任务', async () => {
    const f = await groupFixture();
    await expect(f.service.createProjectTranscriptionTask({...f.ctx,groupId:f.other.id},f.input)).rejects.toMatchObject({code:'OwnershipError'});
    const task = await f.service.createProjectTranscriptionTask(f.ctx,f.input);
    await expect(f.service.createProjectTranscriptionTask({...f.ctx,groupId:f.other.id},f.input)).rejects.toMatchObject({code:'OwnershipError'});
    const [project] = await db.select().from(projects).where(eq(projects.id,f.input.projectId));
    const nextProjectId = f.deps.nextId('another-group-project');
    await db.insert(projects).values({...project!,id:nextProjectId,platformRef:{platform:'douyin',externalId:'other-group-video'}});
    await expect(f.service.createProjectTranscriptionTask(f.ctx,{...f.input,projectId:nextProjectId})).rejects.toMatchObject({code:'ATTEMPT_PAYLOAD_MISMATCH'});
    expect((await f.service.listTasks(f.ctx,{limit:200,offset:0})).rows).toHaveLength(1);
});
it('两个真实组可用相同attempt；同组不同请求合并在途任务，真实选号仍保存account与member freeze', async () => {
    const f = await groupFixture();
    const first = await f.service.createProjectTranscriptionTask(f.ctx,f.input);
    const second = await f.service.createProjectTranscriptionTask(f.ctx,{...f.input,attemptId:f.input.attemptId+'-second'});
    expect(second.id).toBe(first.id);
    const [project] = await db.select().from(projects).where(eq(projects.id,f.input.projectId));
    const otherProjectId = f.deps.nextId('other-workspace-project');
    await db.insert(projects).values({...project!,id:otherProjectId,groupId:f.other.id,platformRef:{platform:'douyin',externalId:'other-workspace-video'}});
    const accountId = f.deps.nextId('real-douyin-account');
    await db.insert(platformAccounts).values({id:accountId,userId:f.ctx.userId,platform:'douyin',accountHandle:'真实账号fixture',externalAccountId:'sec_group_transcription',createdAt:f.deps.now(),updatedAt:f.deps.now()});
    const otherCtx = {...f.ctx,groupId:f.other.id,accountId};
    await f.groups.registerAccount(otherCtx,accountId);
    const other = await f.service.createProjectTranscriptionTask(otherCtx,{...f.input,projectId:otherProjectId});
    expect(other.id).not.toBe(first.id);expect((await db.select().from(aiTasks).where(eq(aiTasks.id,other.id)))[0]).toMatchObject({groupId:f.other.id,accountId,membershipVersion:1});expect(other).toMatchObject({groupId:f.other.id,membershipVersion:1,projectId:otherProjectId,inputData:{awemeIds:['other-workspace-video']}});
    const [receipt] = await db.select().from(projectTranscriptionRequests).where(eq(projectTranscriptionRequests.projectId,otherProjectId));
    expect(receipt).toMatchObject({groupId:f.other.id,accountId,aiTaskId:other.id});
});
it('T1382 内部准备提交复用projects.transcribe业务，冻结父证明和原绝对期限',async()=>{
 const f=await fixture(),{projectSourceReferences}=await import('../../schema/projects'),{createPersistentTaskService}=await import('../execution/persistent-task.service');
 const tasks=createPersistentTaskService(db,f.deps),referenceId=f.deps.nextId('raw-source');
 await db.insert(projectSourceReferences).values({id:referenceId,projectId:f.input.projectId,sourceKey:referenceId,sourceKind:'platform_work',accountId:f.ctx.accountId,platform:'douyin',externalId:'video',createdAt:f.deps.now(),updatedAt:f.deps.now()});
 const parent=await tasks.enqueue(f.ctx,{kind:'project_preparation',ownerType:'project',ownerId:f.input.projectId,idempotencyKey:'preparation-parent',payload:{schemaVersion:1,projectId:f.input.projectId,sourceReferenceIds:[referenceId]},executionBudget:{maxCalls:20,maxTokens:100000,deadlineMs:1800000}}),claim=(await tasks.claimTask({taskId:parent.id,workerId:'preparation'}))!;
 const module=await import('./project-transcription-submission');
 const task=await module.submitProjectPreparationTranscription(f.deps,f.ctx,f.input,{claim,referenceId});
 const {createTranscribeBusinessExecutionService}=await import('../ai-runtime/transcribe-business-execution.service');
 const adapter=createTranscribeBusinessExecutionService(db,{now:f.deps.now,budget:{maxCalls:20,maxTokens:100000,deadlineMs:1800000},resolveSpec:async()=>({kind:'audio',provider:'local',model:'base',baseUrl:null,apiKey:null,settings:{}} as never)});
 const mapped=await adapter.prepare(f.ctx,task.id);expect(mapped.legacy).not.toBe(true);
 const [execution]=await db.select().from(executionTasks).where(eq(executionTasks.id,mapped.executionTaskId!)),[original]=await db.select().from(executionTasks).where(eq(executionTasks.id,parent.id));
 expect(execution!.deadlineAt).toBe(original!.deadlineAt);expect(execution!.payload).toMatchObject({preparationParentProof:{parentTaskId:parent.id,projectId:f.input.projectId,sourceReferenceId:referenceId},preparationPolicy:{skipMasterScript:true,autoReconstruct:false}});
 expect((await module.submitProjectPreparationTranscription(f.deps,f.ctx,f.input,{claim,referenceId})).id).toBe(task.id);
 await expect(module.submitProjectPreparationTranscription(f.deps,f.ctx,{...f.input,attemptId:f.input.attemptId+'-wrong'},{claim:{...claim,lease:{...claim.lease,fenceToken:'wrong'}},referenceId})).rejects.toThrow();
});
