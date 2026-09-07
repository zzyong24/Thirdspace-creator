import { expect, it, vi } from 'vitest';
import { ENDPOINTS, type RequestContext, type Transport } from '@creatoros/contract';
import { createProjectsWithTranscribe } from './projects-transcribe-wrap';
const ctx: RequestContext = { userId: 'u', accountId: 'a', requestId: 'req', source: 'user' };
const input = { params: { projectId: 'project' }, body: { attemptId: 'transcribe-attempt-01' }, query: undefined };
function fixture() {
    const task = { status: 'queued', executionTaskId: null as string | null, id: 'original-task', attemptId: 'original-attempt', taskType: 'transcribe.douyin', inputData: { awemeIds: ['video'] } };
    const submit = vi.fn(async () => task), wake = vi.fn(async () => { }), request = vi.fn(async () => ({ data: 'passthrough' }));
    const wrapped = createProjectsWithTranscribe({ projects: { request } as Transport, submit: submit as never, wake });
    return { task, submit, wake, request, wrapped };
}
it('透传用户请求键，返回并唤醒后端原任务，不重新解析来源', async () => {
    const f = fixture();
    const result = await f.wrapped.request(ENDPOINTS.transcribeProjectWork, input, ctx);
    expect(result).toEqual({ data: { taskId: 'original-task' }, meta: { requestId: 'req' } });
    expect(f.submit).toHaveBeenCalledWith(ctx, { projectId: 'project', attemptId: 'transcribe-attempt-01' });
    expect(f.wake).toHaveBeenCalledWith(ctx, f.task);
    expect(f.request).not.toHaveBeenCalled();
});
it('唤醒失败后可重发同请求，不在宿主生成新任务键', async () => {
    const f = fixture();
    f.wake.mockRejectedValueOnce(new Error('wake failed'));
    await expect(f.wrapped.request(ENDPOINTS.transcribeProjectWork, input, ctx)).rejects.toThrow('wake failed');
    expect(await f.wrapped.request(ENDPOINTS.transcribeProjectWork, input, ctx)).toMatchObject({ data: { taskId: 'original-task' } });
    expect(f.submit.mock.calls).toHaveLength(2);
});
it('后端拒绝或缺少上下文均不唤醒', async () => {
    const f = fixture();
    f.submit.mockRejectedValueOnce(new Error('ConflictError'));
    await expect(f.wrapped.request(ENDPOINTS.transcribeProjectWork, input, ctx)).rejects.toThrow('ConflictError');
    await expect(f.wrapped.request(ENDPOINTS.transcribeProjectWork, input, undefined)).rejects.toThrow('AuthenticationError');
    expect(f.wake).not.toHaveBeenCalled();
});
it('其他操作保留原 transport', async () => {
    const f = fixture();
    await f.wrapped.request(ENDPOINTS.getProject, { params: { projectId: 'project' }, query: undefined, body: undefined }, ctx);
    expect(f.request).toHaveBeenCalledTimes(1);
    expect(f.submit).not.toHaveBeenCalled();
});
it('映射后的队列、未知或等待任务不进入旧唤醒包装', async () => {
    const f = fixture();
    f.task.executionTaskId = 'execution-original';
    for (const status of ['queued', 'running', 'failed']) {
        f.task.status = status;
        expect(await f.wrapped.request(ENDPOINTS.transcribeProjectWork, input, ctx)).toMatchObject({ data: { taskId: 'original-task' } });
    }
    expect(f.wake).not.toHaveBeenCalled();
});
