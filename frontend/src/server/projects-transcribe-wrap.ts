import type { Transport, RequestContext } from '@creatoros/contract';
import type { AiService } from '@creatoros/backend/modules/ai';
/** 项目入口只提交与唤醒；来源、查重与回执属于后端事务服务。 */
export function createProjectsWithTranscribe(deps: {
    projects: Transport;
    submit: AiService['createProjectTranscriptionTask'];
    wake: (ctx: RequestContext, task: Awaited<ReturnType<AiService['createProjectTranscriptionTask']>>) => Promise<void>;
}): Transport {
    return { async request(endpoint, input, ctx) {
            if (endpoint.id !== 'projects.transcribe')
                return deps.projects.request(endpoint, input, ctx);
            if (!ctx)
                throw new Error('AuthenticationError: transcribe requires ctx');
            const request = (input ?? {}) as {
                params?: {
                    projectId?: string;
                };
                body?: {
                    attemptId?: string;
                };
            };
            const context = structuredClone(ctx);
            const task = await deps.submit(context, { projectId: request.params?.projectId ?? '', attemptId: request.body?.attemptId ?? '' });
            // 映射任务由持久调度器负责；等待/未知/终态不能送回旧执行包装。
            if (!task.executionTaskId && task.status === 'queued')
                await deps.wake(context, task);
            return { data: { taskId: task.id }, meta: { requestId: context.requestId } };
        } };
}
