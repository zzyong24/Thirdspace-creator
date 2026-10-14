import { assetProcessingInputSchema, assetProcessingReadSchema, materialExtractionSchema, executionModelSpecSchema, type structuredGenerationInputSchema, type WorkerPort } from '@creatoros/contract/execution-worker';
import type { z } from 'zod';
import { extractDocumentText, classifyDocMime, truncateForSummary } from '../runtime/document-text';
import { generateStructuredInWorker } from './structured-worker-generation';
import { GenerationFailure } from './generation-error';
/** 原图与文档文本层只在 Worker 消费；私有端口未知不降级为成功。 */
export async function runAssetProcessingInWorker(input: z.infer<typeof structuredGenerationInputSchema>, signal: AbortSignal, call: (port: WorkerPort, data: unknown, signal?: AbortSignal) => Promise<unknown>) {
    const target = assetProcessingInputSchema.parse(JSON.parse(input.facets.__assetProcessing ?? 'null'));
    const controlled = async (port: WorkerPort, data: unknown) => { signal.throwIfAborted(); try {
        return await call(port, data, signal);
    }
    catch (error) {
        signal.throwIfAborted();
        if (error instanceof GenerationFailure)
            throw error;
        throw new GenerationFailure('unknown_result', 'ASSET_PROCESSING_RECEIPT_UNKNOWN');
    } };
    let file;
    try {
        file = assetProcessingReadSchema.parse(await controlled('readProcessingAsset', {}));
    }
    catch (error) {
        if (error instanceof GenerationFailure)
            throw error;
        throw new GenerationFailure('unknown_result', 'ASSET_PROCESSING_FILE_RECEIPT_INVALID');
    }
    let extraction = file.extraction;
    if (target.taskType === 'material.extract' && !extraction) {
        const family = classifyDocMime(file.mimeType, target.fileName);
        if (!file.bytes)
            extraction = { status: 'failed', note: '文件缺失，无法抽取文本。' };
        else if (family === 'unsupported')
            extraction = { status: 'unsupported', note: `不支持自动解析的文档类型(${file.mimeType || target.fileName || '未知'})。` };
        else {
            try {
                const text = await extractDocumentText(family, file.bytes, signal);
                extraction = text.trim() ? { status: 'done', text, note: `已抽取全文(${text.length} 字符)。` } : { status: 'failed', note: '文档无可提取的文本层(可能是扫描件/纯图片 PDF)。AI 将读不到其内容。' };
            }
            catch (error) {
                signal.throwIfAborted();
                extraction = { status: 'failed', note: `文本抽取失败(可能是扫描件/加密/损坏):${error instanceof Error ? error.message : 'unknown'}。AI 将读不到其内容。` };
            }
        }
        try {
            extraction = materialExtractionSchema.parse(await controlled('saveMaterialExtraction', extraction));
        }
        catch (error) {
            if (error instanceof GenerationFailure)
                throw error;
            throw new GenerationFailure('unknown_result', 'MATERIAL_EXTRACTION_RECEIPT_INVALID');
        }
    }
    if (target.skipModel || (target.taskType === 'asset.classify' && (!file.bytes || !file.mimeType.startsWith('image/'))) || (target.taskType === 'material.extract' && extraction?.status !== 'done')) {
        await controlled('completeAssetProcessing', {});
        return;
    }
    let model;
    try {
        model = executionModelSpecSchema.parse(await controlled('resolveModelCredential', { capability: input.capability }));
    }
    catch (error) {
        if (error instanceof GenerationFailure)
            throw error;
        throw new GenerationFailure('unknown_result', 'ASSET_PROCESSING_CREDENTIAL_INVALID');
    }
    let result;
    try {
        result = await generateStructuredInWorker(target.taskType === 'material.extract' ? { ...input, facets: { ...input.facets, fullText: truncateForSummary(extraction!.text!).text } } : input, model, signal, call, target.taskType === 'asset.classify' ? { bytes: file.bytes!, mimeType: file.mimeType } : undefined);
    }
    catch (error) {
        signal.throwIfAborted();
        if (target.taskType === 'material.extract' && error instanceof GenerationFailure && error.outcome !== 'unknown_result') {
            await controlled('completeAssetProcessing', {});
            return;
        }
        throw error;
    }
    await controlled('completeAssetProcessing', result);
}
