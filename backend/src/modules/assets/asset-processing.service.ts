import { and, eq, type Db } from '@creatoros/backend';
import type { RequestContext } from '@creatoros/contract';
import type { z } from 'zod';
import { assetProcessingInputSchema, materialExtractionSchema } from '@creatoros/contract/execution-worker';
import { assets, assetFiles } from './assets.db-schema';
import { OwnershipError } from './assets.errors';
type Target = z.infer<typeof assetProcessingInputSchema>;
/** 仅原文件仍为当前版本时写抽取/描述；锁顺序 asset→file。 */
export function createAssetProcessingService() {
    const lock = async (tx: Db, ctx: RequestContext, target: Target) => {
        const [asset] = await tx.select().from(assets).where(and(eq(assets.id, target.assetId), eq(assets.userId, ctx.userId), eq(assets.accountId, ctx.accountId ?? ''))).for('update');
        if (!asset || !['active', 'pending'].includes(asset.status) || asset.currentFileId !== target.fileId)
            throw new OwnershipError('素材版本或归属已变化');
        if (target.fileId) {
            const [file] = await tx.select().from(assetFiles).where(and(eq(assetFiles.id, target.fileId), eq(assetFiles.assetId, asset.id))).for('update');
            if (!file)
                throw new OwnershipError('原素材文件不存在');
        }
        return asset;
    };
    return { lock, async saveExtraction(tx: Db, ctx: RequestContext, target: Target, value: z.infer<typeof materialExtractionSchema>) {
            await lock(tx, ctx, target);
            if (target.fileId)
                await tx.update(assetFiles).set({ extractedText: value.status === 'done' ? value.text! : null, extractStatus: value.status }).where(and(eq(assetFiles.id, target.fileId), eq(assetFiles.assetId, target.assetId)));
        }, async annotate(tx: Db, ctx: RequestContext, target: Target, patch: Record<string, unknown>) {
            await lock(tx, ctx, target);
            if (!target.fileId)
                throw new OwnershipError('原素材文件不存在');
            const [file] = await tx.select().from(assetFiles).where(and(eq(assetFiles.id, target.fileId), eq(assetFiles.assetId, target.assetId)));
            if (!file)
                throw new OwnershipError('原素材文件不存在');
            await tx.update(assetFiles).set({ mediaMetadata: { ...(file.mediaMetadata as Record<string, unknown> ?? {}), ...patch } }).where(eq(assetFiles.id, file.id));
        } };
}
