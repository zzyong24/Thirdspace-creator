import type { Db } from '@creatoros/backend';
import type { RequestContext } from '@creatoros/contract';
import { createArtifactsService, type SearchUpsert } from '../artifacts';
import { createProjectRepository } from './projects.repository';
import { lockOwnedProjectForUpdate } from './project-lock.service';
import { ensureTranscriptArtifact, type EnsureTranscriptArtifactInput, type EnsureTranscriptArtifactResult } from './transcript-artifact';
/** 后端独占写入。事实事务与可选口播初始化分开，后者失败不损失已完成的转写。 */
export function createTranscriptArtifactService(deps: {
    db: Db;
    now: () => string;
    nextId: (prefix: string) => string;
    warn?: (message: string) => void;
    searchUpsert?: SearchUpsert;
}) {
    const warn = deps.warn ?? console.warn;
    async function index(ctx: RequestContext, artifactId: string) {
        if (!deps.searchUpsert)
            return;
        try {
            const service = createArtifactsService(deps);
            const row = await service.getArtifact(ctx, artifactId);
            const version = (await service.listVersions(ctx, artifactId)).find(v => v.id === row.currentVersionId);
            if (version)
                await deps.searchUpsert(ctx, { entityType: 'artifact', entityId: row.id, title: row.title, body: version.contentText });
        }
        catch { /* 派生索引失败不反转已经提交的事实。 */ }
    }
    async function restoreMaster(ctx: RequestContext, projectId: string, artifactId: string, awemeId: string) {
        try {
            const masterId = await deps.db.transaction(async (transaction) => {
                const tx = transaction as unknown as Db;
                await lockOwnedProjectForUpdate(tx, ctx, projectId);
                const project = await createProjectRepository(tx).findImportedByRef(ctx, { platform: 'douyin', externalId: awemeId });
                if (project?.id !== projectId)
                    throw new Error('转写项目来源已变化');
                const service = createArtifactsService({ db: tx, now: deps.now, nextId: deps.nextId });
                const rows = await service.listProjectArtifacts(ctx, projectId);
                if (rows.some(r => r.artifactType === 'master_script'))
                    return null;
                const artifact = rows.find(r => r.id === artifactId && r.artifactType === 'output_script');
                if (!artifact)
                    return null;
                const version = (await service.listVersions(ctx, artifact.id)).find(v => v.id === artifact.currentVersionId);
                const data = version?.contentData as Record<string, unknown> | undefined;
                if (!version || data?.awemeId !== awemeId || data.source === 'image-album' || data.skipMasterScript === true)
                    return null;
                const master = await service.createArtifact(ctx, { projectId: projectId, title: '口播脚本', artifactType: 'master_script', stage: 'script' });
                await service.createVersion(ctx, master.id, { contentText: version.contentText, contentData: data, changeSummary: '从逐字稿初始化口播脚本' });
                return master.id;
            });
            if (masterId)
                await index(ctx, masterId);
        }
        catch {
            warn(`[transcript] 逐字稿已保存，口播脚本初始化待重试 (projectId=${projectId})`);
        }
    }
    const service = { async ensure(context: RequestContext, original: EnsureTranscriptArtifactInput): Promise<EnsureTranscriptArtifactResult> {
            const ctx = structuredClone(context), input = structuredClone(original);
            const result = await deps.db.transaction(async (transaction) => {
                const tx = transaction as unknown as Db;
                const projects = createProjectRepository(tx);
                const service = createArtifactsService({ db: tx, now: deps.now, nextId: deps.nextId });
                const contents = new Map<string, Record<string, unknown>>();
                return ensureTranscriptArtifact(ctx, { ...input, skipMasterScript: true }, {
                    async findImportedProjectByAwemeId(c, awemeId) {
                        const project = await projects.findImportedByRef(c, { platform: 'douyin', externalId: awemeId });
                        if (!project)
                            return null;
                        await lockOwnedProjectForUpdate(tx, c, project.id);
                        const current = await projects.findImportedByRef(c, { platform: 'douyin', externalId: awemeId });
                        if (current?.id !== project.id)
                            throw new Error('转写项目来源已变化');
                        return project.id;
                    },
                    async listProjectArtifacts(c, projectId) {
                        const rows = await service.listProjectArtifacts(c, projectId);
                        for (const row of rows.filter(r => r.artifactType === 'output_script' && r.currentVersionId)) {
                            const version = (await service.listVersions(c, row.id)).find(v => v.id === row.currentVersionId);
                            if (version?.contentData)
                                contents.set(version.id, version.contentData as Record<string, unknown>);
                        }
                        return rows;
                    },
                    getVersionContentData: async (_c, id) => contents.get(id) ?? null,
                    createScriptArtifact: (c, data) => service.createArtifact(c, data),
                    createArtifactVersion: (c, id, data) => service.createVersion(c, id, {
                        ...data,
                        // 用户/调用方明确禁止初始化的事实随锚保存，重启后仍有效。
                        contentData: input.skipMasterScript
                            ? { ...data.contentData, skipMasterScript: true }
                            : data.contentData,
                    }), warn,
                });
            });
            if (!result.projectId || !result.artifactId)
                return result;
            await index(ctx, result.artifactId);
            if (input.skipMasterScript)
                return result;
            await restoreMaster(ctx, result.projectId, result.artifactId, input.awemeId);
            return result;
        },
        /** 显式修复已保存事实的派生稿，不下载、不调用模型，也不制造空逐字稿。 */
        async restoreExisting(context: RequestContext, awemeId: string): Promise<void> {
            const ctx = structuredClone(context);
            const project = await createProjectRepository(deps.db).findImportedByRef(ctx, { platform: 'douyin', externalId: awemeId });
            if (!project)
                return;
            const artifacts = createArtifactsService(deps);
            for (const row of await artifacts.listProjectArtifacts(ctx, project.id)) {
                if (row.artifactType !== 'output_script' || !row.currentVersionId)
                    continue;
                const version = (await artifacts.listVersions(ctx, row.id)).find(v => v.id === row.currentVersionId);
                const data = version?.contentData as Record<string, unknown> | undefined;
                if (data?.awemeId !== awemeId || !version)
                    continue;
                // 事务内重读当前事实；若事实已被删除，不重建它。
                if (data.source !== 'image-album')
                    await restoreMaster(ctx, project.id, row.id, awemeId);
                return;
            }
        } };
    return service;
}
