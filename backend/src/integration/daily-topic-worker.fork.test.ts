import { createServer } from 'node:http';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { beforeAll, beforeEach, afterEach, it, expect } from 'vitest';
import { createDb, aiTasks, aiTaskResults, executionTasks, executionCalls, platformAccounts, candidates, jobRuns, eq, type Db } from '@creatoros/backend';
import { buildTrendQuery } from '@creatoros/ai-worker';
import { createCandidateService, countCandidatesForDay, lockCandidateSupply } from '../modules/candidate';
import { lockAccountForSupply } from '../modules/platform-account';
import { createSchedulingService } from '../modules/scheduling/scheduling.service';
import { createDailyTopicRunService } from '../modules/scheduling/daily-topic-run.service';
import { createDailyTopicBusinessAdapter } from '../modules/ai-runtime/daily-topic-business-adapter';
import { createStructuredBusinessExecutionService } from '../modules/ai-runtime/structured-business-execution.service';
import { createModelWorkerDispatcher } from '../modules/execution/model-worker-dispatcher';
import { createPersistentTaskService } from '../modules/execution/persistent-task.service';
import { createExecutionTopicReadService } from '../modules/execution/execution-topic-read.service';
const ctx = { userId: 'daily-u', accountId: 'daily-a', requestId: 'fork', source: 'user' as const }, now = () => new Date().toISOString(), budget = { maxCalls: 15, maxTokens: 2000000, deadlineMs: 120000 };
let f: Awaited<ReturnType<typeof createDb>>, n = 0;
const nextId = (p: string) => `${p}-${++n}`, unused = async (): Promise<never> => { throw new Error('UNUSED'); };
const candidate = (db: Db) => createCandidateService({ db, now, nextId, projects: { createProject: unused }, ingestion: { assertRunExists: unused } });
beforeAll(() => execFileSync(process.execPath, [resolve('../ai-worker/scripts/build.mjs')], { stdio: 'pipe' }), 30000);
beforeEach(async () => { f = await createDb(); n = 0; await f.db.insert(platformAccounts).values({ id: ctx.accountId, userId: ctx.userId, platform: 'douyin', accountHandle: 'daily', createdAt: now(), updatedAt: now() }); });
afterEach(async () => f.client.close());
async function setup(configured = true) {
    const runs = createDailyTopicRunService(f.db, { now }), scheduling = createSchedulingService({ db: f.db, now, nextId });
    const adapter = createDailyTopicBusinessAdapter({ now, dailyLimit: 1, resolveRun: (c, id) => runs.resolveRun(c, id), countCandidatesForDay: (c, d) => countCandidatesForDay(f.db, c, d), hasConfiguredModel: async () => configured, listActivePreferences: async () => [], positioning: { getPositioningCenter: async () => ({ profile: null, currentStatement: null }) }, sourceReader: { listEnabledSources: async () => [] } });
    const business = createStructuredBusinessExecutionService(f.db, { budget, maxOutputTokens: 512, adapters: { 'scheduled.topic.daily': adapter } });
    async function task() { const id = nextId('daily'), job = await scheduling.createJob(ctx, { name: '每日选题', sourceKind: 'topic.daily', schedule: '40 9 * * *' }); const skills = ['topic.generate', 'trend.extract'].map(skillId => ({ skillId, baseVersion: '1', overlayRevision: null, overlayVersion: null, effective: { methodSystem: 'JSON', template: skillId === 'trend.extract' ? '抽取 {{pageText}}' : '最终 {{basisContext}}', tools: [], requiredFacets: [], contextRequirements: [], outputSchema: { type: 'object' }, completionPolicy: null, completionPolicyAdapter: null } })); await f.db.insert(aiTasks).values({ id, userId: ctx.userId, accountId: ctx.accountId, taskType: 'scheduled.topic.daily', idempotencyKey: id, requestFingerprint: 'sha256:' + '0'.repeat(64), inputData: { jobId: job.id }, runtimeData: { skillSnapshot: { snapshotVersion: 1, userId: ctx.userId, accountId: ctx.accountId, resolvedAt: now(), platformPolicyVersion: '1', platformPolicy: '定时选题', skills } }, requestedAt: now() }); await scheduling.createRun(ctx, { jobId: job.id, aiTaskId: id }); const mapped = await business.prepare(ctx, id); return { id, ...mapped }; }
    const ports = { validateRun: runs.validateRun, finishRun: runs.finishRun, lockAccount: async (c: any, tx: any) => { await lockAccountForSupply(tx, c); await lockCandidateSupply(tx, c); }, countCandidatesForDay: (c: any, d: string, tx: any) => countCandidatesForDay(tx, c, d), createCandidate: (c: any, input: any, tx: any) => candidate(tx as Db).createFromAIResult(c, input) };
    return { runs, business, task, ports };
}
async function seedSearch(id: string) { const tasks = createPersistentTaskService(f.db, { now }), claim = await tasks.claimTask({ taskId: id, workerId: 'read-fixture' }); const ref = { executionTaskId: id, attempt: claim!.lease.attempt, fenceToken: claim!.lease.fenceToken }; const runs = createDailyTopicRunService(f.db, { now }), reads = createExecutionTopicReadService(f.db, { now, budget, buildTrendQuery, validateDailyRun: runs.validateRun }); const call = await reads.reserveTopicRead(ref, { target: { kind: 'search' } }); await reads.startTopicRead(ref, { callId: call.callId }); await reads.settleTopicRead(ref, { callId: call.callId, receipt: { kind: 'search', status: 'ok', data: { results: [] } } }); await f.db.update(executionTasks).set({ status: 'queued', leaseOwner: null, leaseExpiresAt: null, heartbeatAt: null }).where(eq(executionTasks.id, id)); }
async function dispatch(setupValue: Awaited<ReturnType<typeof setup>>, expected: number) { let requests = 0, credentials = 0; const server = createServer((req, res) => { req.resume(); req.on('end', () => { requests++; res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ id: 'daily', object: 'chat.completion', created: 1, model: 'fixture', choices: [{ index: 0, message: { role: 'assistant', content: JSON.stringify({ topics: [{ title: '真实每日选题', angle: '切入', predictedScore: 80 }] }) }, finish_reason: 'stop' }], usage: { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 } })); }); }); await new Promise<void>(r => server.listen(0, '127.0.0.1', r)); const workerDeps: Parameters<typeof createModelWorkerDispatcher>[1] = { now, budget, workerId: 'daily-host', entryPath: resolve('../ai-worker/dist/execution-worker.cjs'), dailyTopicPorts: setupValue.ports, resolveModelCredential: async () => { credentials++; return { apiFormat: 'openai_chat', baseUrl: `http://127.0.0.1:${(server.address() as {
            port: number;
        }).port}/v1`, model: 'fixture', token: 'fixture', structuredOutputs: true }; }, projectCandidate: (_c, input) => setupValue.business.projectCandidate(input) }; const worker = createModelWorkerDispatcher(f.db, workerDeps), second = createModelWorkerDispatcher(f.db, { ...workerDeps, workerId: 'daily-host-second' }); try {
    await Promise.all([worker.drainOnce(), second.drainOnce()]);
    await worker.drainOnce();
    await worker.drainOnce();
    expect(requests).toBe(expected);
    expect(credentials).toBe(expected);
}
finally {
    await Promise.all([worker.stop(), second.stop()]);
    await new Promise<void>(r => server.close(() => r()));
} }
it('两已准备daily真实fork供给合计1，重复dispatch不重复生成或入池', async () => { const s = await setup(), a = await s.task(), b = await s.task(); await seedSearch(a.executionTaskId); await seedSearch(b.executionTaskId); await dispatch(s, 2); expect(await f.db.select().from(candidates)).toHaveLength(1); const runs = await f.db.select().from(jobRuns); expect(runs.every(r => r.status === 'succeeded')).toBe(true); expect(runs.reduce((n, r) => n + r.itemsNew, 0)).toBe(1); expect(await f.db.select().from(aiTaskResults)).toHaveLength(2); });
it.each(['quota', 'model_unconfigured'])('%s skip真实fork零模型解析零HTTP', async (reason) => { const s = await setup(reason !== 'model_unconfigured'); if (reason === 'quota')
    await candidate(f.db).createFromAIResult(ctx, { aiTaskId: 'already', resultType: 'candidate', resultData: { title: '已入池', source: 'trend' } }); await s.task(); await dispatch(s, 0); expect((await f.db.select().from(jobRuns))[0]?.status).toBe('succeeded'); expect(await f.db.select().from(executionCalls)).toHaveLength(0); expect((await f.db.select().from(aiTaskResults))[0]?.resultData).toMatchObject({ skipReason: reason, itemsNew: 0, usage: { totalTokens: 0 } }); });
