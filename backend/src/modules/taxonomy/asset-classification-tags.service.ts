import { createHash, randomUUID } from 'node:crypto';
import { and, eq, type Db } from '@creatoros/backend';
import type { RequestContext } from '@creatoros/contract';
import { tags } from './taxonomy.db-schema';
import { createTaxonomyRepository } from './taxonomy.repository';
import { createTaxonomyService } from './taxonomy.service';
/** 已授权素材归类完成事务内复用真实标签，不另造标签候选。 */
export async function assignAssetClassificationTags(tx: Db, ctx: RequestContext, assetId: string, names: readonly string[], now: () => string) {
    const ids: string[] = [];
    for (const name of [...new Set(names)]) {
        const id = `tag_${createHash('sha256').update(JSON.stringify([ctx.userId, name])).digest('hex')}`;
        await tx.insert(tags).values({ id, userId: ctx.userId, name, kind: 'asset-usage', createdAt: now(), updatedAt: now() }).onConflictDoNothing();
        const [tag] = await tx.select().from(tags).where(and(eq(tags.userId, ctx.userId), eq(tags.name, name)));
        if (!tag)
            throw new Error('归类标签保存失败');
        ids.push(tag.id);
    }
    const service = createTaxonomyService(createTaxonomyRepository(tx, { now, nextId: prefix => `${prefix}_${randomUUID()}` }));
    await service.assignTags(ctx, { entityType: 'asset', entityId: assetId, tagIds: ids });
}
