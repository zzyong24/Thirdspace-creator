import { createHash } from 'node:crypto';
import type { RequestContext } from '@creatoros/contract';
import type { StructuredBusinessAdapter } from './structured-business-execution.service';
import type { AssetsService } from '../assets';
export interface AssetProcessingPreparationPorts {
    assets: Pick<AssetsService, 'getAsset' | 'getAssetBytes'>;
    isModelConfigured(ctx: RequestContext, taskType: 'asset.classify' | 'material.extract'): Promise<boolean>;
}
/** 配置缺失保留原可选增强降级；账号与原文件摘要在首轮绑定，不由 Worker 指定。 */
export function createAssetProcessingBusinessAdapter(taskType: 'asset.classify' | 'material.extract', deps: AssetProcessingPreparationPorts): StructuredBusinessAdapter {
    return { skillId: taskType, capability: taskType === 'asset.classify' ? 'asset.classify' : 'script.draft', async prepare(ctx, task) {
            const assetId = typeof task.inputData.assetId === 'string' ? task.inputData.assetId : '';
            if (!assetId)
                throw new Error('素材处理缺少assetId');
            const asset = await deps.assets.getAsset(ctx, assetId), file = await deps.assets.getAssetBytes(ctx, assetId), after = await deps.assets.getAsset(ctx, assetId);
            if (after.currentFileId !== asset.currentFileId)
                throw new Error('素材版本在准备时发生变化');
            const skipModel = !(await deps.isModelConfigured(ctx, taskType));
            return { __assetProcessing: JSON.stringify({ taskType, assetId, fileId: asset.currentFileId, checksum: file ? createHash('sha256').update(file.bytes).digest('hex') : null, fileName: typeof task.inputData.fileName === 'string' ? task.inputData.fileName : asset.name, mimeType: file?.mimeType ?? '', skipModel }) };
        }, project() { throw new Error('素材处理须经非候选完成事务'); } };
}
