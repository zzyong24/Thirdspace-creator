import type { Db } from '@creatoros/backend';
import type { RequestContext } from '@creatoros/contract';
import { createProjectRepository } from './projects.repository';
import { lockOwnedProjectForUpdate } from './project-lock.service';
import { createArtifactsService } from '../artifacts';
/** 同项目转写提交与落稿共用项目锁；当前版本是正文是否已经落地的唯一判断。 */
export function createProjectTranscriptionTargetService() {
    return { lock: lockOwnedProjectForUpdate, async read(tx: Db, ctx: RequestContext, projectId: string) {
            const project = await createProjectRepository(tx).get(ctx, projectId);
            const ref = project.platformRef as {
                platform?: string;
                externalId?: string;
            } | null;
            const awemeId = ref?.platform === 'douyin' && typeof ref.externalId === 'string' ? ref.externalId.trim() : '';
            if (!awemeId)
                throw Object.assign(new Error('ValidationError: 该项目没有关联抖音作品(无 platformRef.externalId),无法抓取逐字稿'), { code: 'ValidationError' });
            const artifacts = createArtifactsService({ db: tx, now: () => { throw new Error('只读端口'); }, nextId: () => { throw new Error('只读端口'); } });
            for (const row of await artifacts.listProjectArtifacts(ctx, projectId)) {
                if (row.artifactType !== 'output_script' || !row.currentVersionId)
                    continue;
                const version = (await artifacts.listVersions(ctx, row.id)).find(v => v.id === row.currentVersionId);
                if ((version?.contentData as Record<string, unknown> | undefined)?.awemeId === awemeId)
                    return { awemeId, hasTranscript: true };
            }
            return { awemeId, hasTranscript: false };
        } };
}
