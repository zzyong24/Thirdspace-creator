import { createHash } from 'node:crypto';
import type { GeneratedTranscript, MultimodalSpec, TranscribeAudioOptions } from './multimodal-factory';
import type {AsrRequest} from "@creatoros/contract/execution-worker";
export type {AsrRequest} from "@creatoros/contract/execution-worker";
export type ExecuteAsrRequest = (request: AsrRequest, execute: () => Promise<GeneratedTranscript>) => Promise<GeneratedTranscript>;
/** 仅带固定诊断，允许穿过渠道脱敏与本地回退包装，不附带供应商正文。 */
export class AsrExecutionInterruption extends Error {
    readonly code = 'ASR_RESULT_UNKNOWN';
    readonly outcome = 'unknown_result';
    constructor() { super('转写结果待核对，不能重复提交'); this.name = 'AsrExecutionInterruption'; }
}
export function isAsrExecutionControlError(error: unknown) {
    return error instanceof AsrExecutionInterruption || (error !== null && typeof error === 'object' && 'name' in error && error.name === 'AbortError');
}
export function throwIfAsrAborted(signal?: AbortSignal) {
    if (signal?.aborted)
        throw new DOMException('转写已取消', 'AbortError');
}
const digest = (input: string | Uint8Array) => `sha256:${createHash('sha256').update(input).digest('hex')}`;
/** 指纹只用于精确恢复相同音频请求，不进行任何语义判断。凭据不进入描述。 */
export function createAsrRequestExecutor(spec: MultimodalSpec, opts: TranscribeAudioOptions, endpoint: string, protocol: AsrRequest["protocol"], chunks: Uint8Array[] = [opts.audioBytes]) {
    const common = { chunks: chunks.map(chunk=>({digest:digest(chunk),byteLength:chunk.byteLength})), protocol, provider: spec.provider, model: spec.model, endpointDigest: digest(endpoint), audioDigest: digest(opts.audioBytes), audioByteLength: opts.audioBytes.byteLength, language: opts.language ?? null };
    return async (chunk: Uint8Array, chunkIndex: number, chunkCount: number, execute: () => Promise<GeneratedTranscript>) => {
        throwIfAsrAborted(opts.signal);
        const request = { ...common, chunkDigest: digest(chunk), chunkByteLength: chunk.byteLength, chunkIndex, chunkCount };
        const dispatch = async () => { throwIfAsrAborted(opts.signal); return execute(); };
        const result = await (opts.executeRequest ? opts.executeRequest(request, dispatch) : dispatch());
        throwIfAsrAborted(opts.signal);
        return result;
    };
}

/** 在适配器入口冻结输入，等待回执期间调用方修改 Buffer 不得改变已登记请求。 */
export function snapshotAsrInput(spec: MultimodalSpec, opts: TranscribeAudioOptions) {
    throwIfAsrAborted(opts.signal);
    return {spec: structuredClone(spec), opts: {...opts, audioBytes: Uint8Array.from(opts.audioBytes)}};
}
