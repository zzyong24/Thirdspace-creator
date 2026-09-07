import { z } from 'zod';
import { AsrExecutionInterruption, throwIfAsrAborted, type AsrRequest, type ExecuteAsrRequest } from '../runtime/asr-request';
const resultSchema = z.object({ text: z.string(), language: z.string().optional() }).strict();
export interface DurableAsrPorts {
    reserve(input: {
        operationKey: string;
        request: AsrRequest;
    }): Promise<{
        callId: string;
        status: string;
        result?: unknown;
        rejectionStatus?: number;
    }>;
    start(callId: string): Promise<void>;
    settle(callId: string, input: {
        status: 'settled';
        result: z.infer<typeof resultSchema>;
    } | {
        status: 'unknown';
    } | {
        status: 'rejected';
        rejectionStatus?: number;
    }): Promise<void>;
}
/** 一片一回执；未知启动/结算响应不重发。宿主必须验证请求指纹、预算、归属与租约。 */
export function createDurableAsrRequestExecutor(input: {
    operationKey: string;
    ports: DurableAsrPorts;
    signal?: AbortSignal;
}): ExecuteAsrRequest {
    return async (request, execute) => {
        throwIfAsrAborted(input.signal);
        let reserved: Awaited<ReturnType<DurableAsrPorts['reserve']>>;
        try {
            reserved = await input.ports.reserve({ operationKey: `${input.operationKey}/asr/${request.chunkIndex + 1}`, request });
        }
        catch {
            throwIfAsrAborted(input.signal);
            throw new AsrExecutionInterruption();
        }
        throwIfAsrAborted(input.signal);
        if (reserved.status === 'settled') {
            const result = resultSchema.safeParse(reserved.result);
            if (!result.success)
                throw new AsrExecutionInterruption();
            return result.data;
        }
        if (reserved.status === 'rejected')
            throw Object.assign(new Error('ASR 请求已被拒绝'), { statusCode: reserved.rejectionStatus });
        if (reserved.status !== 'reserved')
            throw new AsrExecutionInterruption();
        try {
            await input.ports.start(reserved.callId);
        }
        catch {
            throw new AsrExecutionInterruption();
        }
        let result: z.infer<typeof resultSchema>, dispatched = false;
        try {
            throwIfAsrAborted(input.signal);
            dispatched = true;
            result = resultSchema.parse(await execute());
        }
        catch (error) {
            const status = error && typeof error === 'object' ? (error as {
                statusCode?: unknown;
            }).statusCode : undefined;
            // 网关超时与服务端错误可能发生在受理之后，不能据此认定未执行。
            const rejected = typeof status === 'number' && [400, 401, 402, 403, 404, 405, 413, 415, 422, 429].includes(status);
            try {
                await input.ports.settle(reserved.callId, !dispatched ? { status: 'rejected' } : rejected ? { status: 'rejected', rejectionStatus: status } : { status: 'unknown' });
            }
            catch {
                throw new AsrExecutionInterruption();
            }
            throwIfAsrAborted(input.signal);
            if (!dispatched || rejected)
                throw error;
            throw new AsrExecutionInterruption();
        }
        try {
            await input.ports.settle(reserved.callId, { status: 'settled', result });
        }
        catch {
            throw new AsrExecutionInterruption();
        }
        throwIfAsrAborted(input.signal);
        return result;
    };
}
