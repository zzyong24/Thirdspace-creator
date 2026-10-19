import { it, expect } from 'vitest';
import { createDb, aiTasks, executionTasks, aiTaskResults, eq } from '@creatoros/backend';
import { createExecutionAuthorityService } from '../execution/execution-authority.service';
import { createPersistentTaskService } from '../execution/persistent-task.service';
import { createDailyTopicCompletionService } from './daily-topic-completion.service';
it('冻结quota决定可跨日结算，零调用且回执幂等', async () => { const f = await createDb(); try {
    const stamp = '2026-09-06T00:00:00.000Z', now = () => stamp, ctx = { userId: 'u', accountId: 'a', requestId: 'r', source: 'user' as const };
    await f.db.insert(aiTasks).values({ id: 'd', userId: 'u', accountId: 'a', taskType: 'scheduled.topic.daily', idempotencyKey: 'd', requestedAt: stamp });
    const mapped = await createExecutionAuthorityService(f.db, { now }).bindAiTask(ctx, 'd');
    await f.db.update(executionTasks).set({ payload: { aiTaskId: 'd', modelInput: { kind: 'model.structured', skillId: 'topic.generate', facets: { __topicGenerate: JSON.stringify({ mode: 'daily' }), __dailyTopic: JSON.stringify({ jobId: 'j', jobRunId: 'r', dayKey: '2026-09-05', dailyLimit: 2, observedCount: 2, preferences: [], rankingNow: stamp, skipReason: 'quota' }) } } } }).where(eq(executionTasks.id, mapped.executionTaskId));
    const claim = await createPersistentTaskService(f.db, { now }).claimTask({ taskId: mapped.executionTaskId, workerId: 'w' });
    const ref = { executionTaskId: mapped.executionTaskId, attempt: claim!.lease.attempt, fenceToken: claim!.lease.fenceToken };
    let count = 1, finished = 0;
    const service = createDailyTopicCompletionService(f.db, { now, ports: { validateRun: async () => { }, lockAccount: async () => { }, countCandidatesForDay: async (_c, day) => { throw new Error('SKIP_MUST_NOT_RECOUNT'); }, createCandidate: async () => { throw new Error('NO_WRITE'); }, finishRun: async () => { finished++; } } });
    const receipt = await service.completeDailyTopicSkip(ref);
    expect(await service.completeDailyTopicSkip(ref)).toEqual(receipt);
    expect(finished).toBe(1);
}
finally {
    await f.client.close();
} });
