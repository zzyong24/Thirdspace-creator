import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { createDb, aiTasks, aiTaskResults, executionTasks, executionCalls, candidates, platformAccounts, eq, sql, type Db } from '@creatoros/backend';
import {accountGroups} from '../schema/account-groups';
import { createDailyTopicCompletionService } from '../modules/ai/daily-topic-completion.service';
import { createExecutionAuthorityService } from '../modules/execution/execution-authority.service';
import { createPersistentTaskService } from '../modules/execution/persistent-task.service';
import { createExecutionCallLedgerService } from '../modules/execution/execution-call-ledger.service';
import { createCandidateService } from '../modules/candidate/candidate.service';
const ctx = { userId: 'u', accountId: 'a', requestId: 'r', source: 'user' as const }, stamp = '2026-09-06T00:00:00.000Z', now = () => stamp;
let f: Awaited<ReturnType<typeof createDb>>, serial = 0, fail = false;
const nextId = (p: string) => `${p}-${++serial}`;
const unused = async (): Promise<never> => { throw new Error('UNUSED'); };
const domain = (db: Db) => createCandidateService({ db, now, nextId, projects: { createProject: unused }, ingestion: { assertRunExists: unused } });
beforeEach(async () => { f = await createDb(); serial = 0; fail = false; });
afterEach(async () => f.client.close());
const ports = () => ({ validateRun: async () => { }, lockAccount: async (_c: unknown, tx: any) => { await tx.execute(sql `SELECT pg_advisory_xact_lock(12345)`); }, countCandidatesForDay: async (_c: unknown, day: string, tx: any) => { expect(day).toBe('2026-09-06'); return Number((await tx.select({ value: sql `count(*)` }).from(candidates))[0].value); }, createCandidate: async (c: any, input: any, tx: any) => domain(tx as Db).createFromAIResult(c, input), finishRun: async () => {
        if (fail)
            throw new Error('RUN_WRITE_FAILED');
    } });
async function seed(id: string) { await f.db.insert(aiTasks).values({ id, userId: 'u', accountId: 'a', taskType: 'scheduled.topic.daily', idempotencyKey: id, requestedAt: stamp }); const mapped = await createExecutionAuthorityService(f.db, { now }).bindAiTask(ctx, id); await f.db.update(executionTasks).set({ payload: { aiTaskId: id, modelInput: { kind: 'model.structured', skillId: 'topic.generate', facets: { __topicGenerate: JSON.stringify({ version: 1, mode: 'daily', basis: 'positioning', projectId: null, context: { positioningBrief: '', knowledgeBrief: '', learningsBrief: '' }, qualityNow: stamp, qualityInputs: { signals: [], knowledge: [], positioning: null }, qualityProfile: { comments: { count: 0, coveredWorks: 0, strongSignalRatio: 0, noiseRatio: 0 }, positioning: { filledFacets: 0, totalFacets: 0, rulesFilled: 0, completeness: 0 }, knowledge: { count: 0, recentRatio: null }, trend: { sourceCount: 0, signalCount: 0 } }, basisBrief: '', trendSources: [] }), __dailyTopic: JSON.stringify({ jobId: 'j', jobRunId: id, dayKey: '2026-09-05', dailyLimit: 1, preferences: [], rankingNow: stamp }) } } } }).where(eq(executionTasks.id, mapped.executionTaskId)); const tasks = createPersistentTaskService(f.db, { now }), claim = await tasks.claimTask({ taskId: mapped.executionTaskId, workerId: 'w' }), ref = { executionTaskId: mapped.executionTaskId, attempt: claim!.lease.attempt, fenceToken: claim!.lease.fenceToken }; const ledger = createExecutionCallLedgerService(f.db, { now, budget: { maxCalls: 5, maxTokens: 10000, deadlineMs: 120000 } }), call = await ledger.reserve(ref, { kind: 'model', operationKey: 'model/1', inputDigest: 'sha256:' + 'a'.repeat(64), reservedTokens: 100 }); await ledger.start(ref, call.id); const object = { topics: [{ title: '题目', angle: '角度', source: 'demand', predictedScore: 90 }] }; const text = JSON.stringify({ object, generation: { finishReason: 'stop', usage: { inputTokens: 2, outputTokens: 3, cachedTokens: 0, totalTokens: 5 }, attempts: [] } }); await ledger.settle(ref, call.id, { status: 'settled', usage: { totalTokens: 5 }, resultText: text, providerResult: { content: [{ type: 'text', text: JSON.stringify(object) }], finishReason: { unified: 'stop', raw: 'stop' }, usage: { inputTokens: { total: 2 }, outputTokens: { total: 3 } }, warnings: [] } }); return { ref, tasks, call, commit: { outcome: 'succeeded', callId: call.id, text } }; }
it('并发不同任务供给上限1，重复回执不重建删除内容', async () => { const a = await seed('a'), b = await seed('b'), s = createDailyTopicCompletionService(f.db, { now, ports: ports() }); await Promise.all([s.commitResult(a.ref, a.commit), s.commitResult(b.ref, b.commit)]); expect(await f.db.select().from(candidates)).toHaveLength(1); expect(await f.db.select().from(aiTaskResults)).toHaveLength(2); await f.db.delete(candidates); await s.commitResult(a.ref, a.commit); expect(await f.db.select().from(candidates)).toHaveLength(0); });
it('run收尾失败回滚全部候选及任务状态', async () => { const a = await seed('rollback'); fail = true; await expect(createDailyTopicCompletionService(f.db, { now, ports: ports() }).commitResult(a.ref, a.commit)).rejects.toThrow('RUN_WRITE_FAILED'); expect(await f.db.select().from(candidates)).toHaveLength(0); expect(await f.db.select().from(aiTaskResults)).toHaveLength(0); expect((await a.tasks.get(ctx, a.ref.executionTaskId)).status).toBe('running'); });
it('取消与未知调用拒绝新领域提交', async () => { const a = await seed('cancel'); await a.tasks.command(ctx, { taskIds: [a.ref.executionTaskId], command: 'cancel', idempotencyKey: 'cancel' }); const s = createDailyTopicCompletionService(f.db, { now, ports: ports() }); await expect(s.commitResult(a.ref, a.commit)).rejects.toThrow(); const b = await seed('unknown'); await f.db.update(executionCalls).set({ status: 'unknown' }).where(eq(executionCalls.id, b.call.id)); await expect(s.commitResult(b.ref, b.commit)).rejects.toThrow(); expect(await f.db.select().from(candidates)).toHaveLength(0); });
it('旧fence及伪模式不能入池', async () => { const a = await seed('bad-mode'), s = createDailyTopicCompletionService(f.db, { now, ports: ports() }); await expect(s.commitResult({ ...a.ref, fenceToken: a.ref.fenceToken + 1 }, a.commit)).rejects.toThrow(); const [task] = await f.db.select().from(executionTasks).where(eq(executionTasks.id, a.ref.executionTaskId)); const payload = task!.payload as {
    modelInput: {
        facets: {
            __topicGenerate: string;
        };
    };
}; const topic = JSON.parse(payload.modelInput.facets.__topicGenerate); topic.basis = 'trend'; payload.modelInput.facets.__topicGenerate = JSON.stringify(topic); await f.db.update(executionTasks).set({ payload }).where(eq(executionTasks.id, a.ref.executionTaskId)); await expect(s.commitResult(a.ref, a.commit)).rejects.toThrow(); expect(await f.db.select().from(candidates)).toHaveLength(0); });
it('配额计数超过1000仍不额外入池，真实模型用量保留', async () => { const a = await seed('full-day'); const p = ports(); p.countCandidatesForDay = async () => 1001; await createDailyTopicCompletionService(f.db, { now, ports: p }).commitResult(a.ref, a.commit); expect(await f.db.select().from(candidates)).toHaveLength(0); expect((await f.db.select().from(aiTaskResults))[0]?.resultData).toMatchObject({ itemsNew: 0, usage: { totalTokens: 5 } }); });

async function seedGroup(id:string){
 const value=await seed(id),groupId=`group-${id}`;
 await f.db.insert(accountGroups).values({id:groupId,userId:'u',name:id,status:'active',version:1,createdAt:stamp,updatedAt:stamp});
 await f.db.update(aiTasks).set({groupId,accountId:null,groupVersion:1,membershipVersion:null}).where(eq(aiTasks.id,id));
 await f.db.update(executionTasks).set({groupId,accountId:null,groupVersion:1,membershipVersion:null}).where(eq(executionTasks.id,value.ref.executionTaskId));
 return {...value,groupId};
}
function queryTrace(){
 const queries:string[]=[];
 const logger=(f.db as unknown as {session:{logger:{logQuery:(query:string,params:unknown[])=>void}}}).session.logger;
 const spy=vi.spyOn(logger,'logQuery').mockImplementation(query=>{queries.push(query.toLowerCase());});
 return {queries,restore:()=>spy.mockRestore()};
}
/** 只在真实外层snapshot查询返回后，使用同一个真实tx注入竞争；不替换lease/准入/领域端口。 */
function afterSnapshotDb(action:(tx:any)=>Promise<void>):Db{
 let injected=false;
 function query(q:any,table?:unknown):any{return new Proxy(q,{get(target,key){
  if(key==='then')return (resolve:any,reject:any)=>Promise.resolve(target).then(async rows=>{if(table===executionTasks&&!injected){injected=true;await action(activeTx);}return rows;}).then(resolve,reject);
  const member=Reflect.get(target,key,target);
  if(typeof member!=='function')return member;
  return (...args:any[])=>{const result=member.apply(target,args);return result&&typeof result==='object'?query(result,key==='from'?args[0]:table):result;};
 }});}
 let activeTx:any;
 return new Proxy(f.db,{get(target,key){
  if(key==='transaction')return (body:any)=>target.transaction(async tx=>{activeTx=tx;return body(new Proxy(tx,{get(inner,name){if(name==='select')return (...args:any[])=>query((inner.select as any)(...args));const member=Reflect.get(inner,name,inner);return typeof member==='function'?member.bind(inner):member;}}));});
  const member=Reflect.get(target,key,target);return typeof member==='function'?member.bind(target):member;
 }});
}
it('真实PGlite同session nested savepoint：组锁先于execution锁，认领竞争不反向取组锁',async()=>{
 const a=await seedGroup('lock-order'),trace=queryTrace();
 try{
  const s=createDailyTopicCompletionService(f.db,{now,ports:ports()});
  const results=await Promise.all([s.commitResult(a.ref,a.commit),createPersistentTaskService(f.db,{now}).claimTask({taskId:a.ref.executionTaskId,workerId:'competing-claim'})]);
  expect(results[0]).toMatchObject({aiTaskId:'lock-order'});expect(results[1]).toBeNull();
  const group=trace.queries.findIndex(q=>q.includes('from "account_groups"')&&q.includes('for update'));
  const execution=trace.queries.findIndex(q=>q.includes('from "execution_tasks"')&&q.includes('for update'));
  expect(group).toBeGreaterThanOrEqual(0);expect(execution).toBeGreaterThan(group);
  expect(trace.queries.some(q=>q.startsWith('savepoint '))).toBe(true);
  expect(trace.queries.some(q=>q.startsWith('release savepoint '))).toBe(true);
 }finally{trace.restore();}
});
it('真实归档竞争按工作区锁序串行，完成或拒绝均原子，终态归档后只读重放',async()=>{
 const a=await seedGroup('archive-race'),s=createDailyTopicCompletionService(f.db,{now,ports:ports()});
 const results=await Promise.allSettled([s.commitResult(a.ref,a.commit),f.db.transaction(async tx=>{await tx.select().from(accountGroups).where(eq(accountGroups.id,a.groupId)).for('update');await tx.update(accountGroups).set({status:'archived'}).where(eq(accountGroups.id,a.groupId));})]);
 expect(results[1].status).toBe('fulfilled');
 const [task]=await f.db.select().from(executionTasks).where(eq(executionTasks.id,a.ref.executionTaskId));
 if(results[0].status==='fulfilled'){
  expect(task!.status).toBe('succeeded');const trace=queryTrace();
  try{await s.commitResult(a.ref,a.commit);expect(trace.queries.some(q=>/^(insert|update|delete)\s/.test(q))).toBe(false);expect(trace.queries.some(q=>q.includes('from "account_groups"'))).toBe(false);}finally{trace.restore();}
 }else{expect(task!.status).toBe('running');expect(await f.db.select().from(candidates)).toHaveLength(0);expect(await f.db.select().from(aiTaskResults)).toHaveLength(0);}
});
it('snapshot后换组、版本、owner、attempt或fence变化逐一拒绝且外层全回滚',async()=>{
 const a=await seedGroup('snapshot-change');
 await f.db.insert(accountGroups).values({id:'other-snapshot-group',userId:'u',name:'其他组',status:'active',version:1,createdAt:stamp,updatedAt:stamp});
 for(const patch of [{groupId:'other-snapshot-group'},{groupVersion:2},{ownerId:'other-owner'},{attempt:a.ref.attempt+1},{fenceToken:a.ref.fenceToken+1}]){
  const raced=afterSnapshotDb(tx=>tx.update(executionTasks).set(patch).where(eq(executionTasks.id,a.ref.executionTaskId)));
  await expect(createDailyTopicCompletionService(raced,{now,ports:ports()}).commitResult(a.ref,a.commit)).rejects.toThrow();
  const [current]=await f.db.select().from(executionTasks).where(eq(executionTasks.id,a.ref.executionTaskId));
  expect(current).toMatchObject({groupId:a.groupId,groupVersion:1,ownerId:'snapshot-change',attempt:a.ref.attempt,fenceToken:a.ref.fenceToken,status:'running'});
 }
 expect(await f.db.select().from(candidates)).toHaveLength(0);
});
it('已完成snapshot在锁前退回running不得升级成活动提交',async()=>{
 const a=await seedGroup('terminal-race'),s=createDailyTopicCompletionService(f.db,{now,ports:ports()});await s.commitResult(a.ref,a.commit);
 const before=await f.db.select().from(aiTaskResults);
 const raced=afterSnapshotDb(tx=>tx.update(executionTasks).set({status:'running'}).where(eq(executionTasks.id,a.ref.executionTaskId)));
 await expect(createDailyTopicCompletionService(raced,{now,ports:ports()}).commitResult(a.ref,a.commit)).rejects.toThrow('历史完成事实已改变');
 expect(await f.db.select().from(aiTaskResults)).toEqual(before);expect(await f.db.select().from(candidates)).toHaveLength(1);
});
