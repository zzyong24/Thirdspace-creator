import { afterEach, expect, it } from 'vitest';
import { createDb } from '@creatoros/backend';
import type { RequestContext } from '@creatoros/contract';
import { createProjectRepository } from './projects.repository';
import { createProjectsService } from './projects.service';
import { createArtifactsService } from '../artifacts';
import { createTranscriptArtifactService } from './transcript-artifact.service';
const ctx: RequestContext = { userId: 'transcript-test', accountId: 'transcript-account', source: 'user', requestId: 'test' };
const closes: Array<() => Promise<void>> = [];
afterEach(async () => { await Promise.all(closes.splice(0).map(close => close())); });
async function fixture(searchUpsert?: Parameters<typeof createTranscriptArtifactService>[0]["searchUpsert"]) {
    const { db, client } = await createDb();
    closes.push(() => client.close());
    let seq = 0;
    let failAt = 0;
    const deps = { now: () => new Date().toISOString(), nextId: (prefix: string) => { seq++; if (seq === failAt)
            throw new Error('injected version failure'); return `${prefix}-${seq}`; } };
    const project = await createProjectsService(createProjectRepository(db), deps).ensureImportedProject(ctx, { title: '测试', platform: 'douyin', externalId: 'video' });
    const artifacts = createArtifactsService({ db, ...deps });
    const warnings: string[] = [];
    return { db, project, artifacts, service: createTranscriptArtifactService({ db, ...deps, warn: m => warnings.push(m), searchUpsert }), warnings, failAfter: (n: number) => { failAt = seq + n; } };
}
it('并发绑定只有一份逐字稿和口播脚本，重放不覆盖首份事实', async () => {
    const f = await fixture();
    const results = await Promise.all(Array.from({ length: 4 }, () => f.service.ensure(ctx, { awemeId: 'video', transcript: '首份正文' })));
    expect(results.filter(r => r.status === 'bound')).toHaveLength(1);
    await f.service.ensure(ctx, { awemeId: 'video', transcript: '不得覆盖' });
    const rows = await f.artifacts.listProjectArtifacts(ctx, f.project.projectId);
    expect(rows).toHaveLength(2);
    for (const row of rows) {
        const versions = await f.artifacts.listVersions(ctx, row.id);
        expect(versions.find(v => v.id === row.currentVersionId)?.contentText).toBe('首份正文');
    }
});
it('逐字稿版本失败回滚空稿，下一次可成功', async () => {
    const f = await fixture();
    f.failAfter(3);
    await expect(f.service.ensure(ctx, { awemeId: 'video', transcript: '正文' })).rejects.toThrow('injected');
    expect(await f.artifacts.listProjectArtifacts(ctx, f.project.projectId)).toHaveLength(0);
    expect((await f.service.ensure(ctx, { awemeId: 'video', transcript: '正文' })).status).toBe('bound');
});
it('可选口播版本失败保留逐字稿、不留空稿，重放按原事实补齐', async () => {
    const f = await fixture();
    f.failAfter(6);
    expect((await f.service.ensure(ctx, { awemeId: 'video', transcript: '保存的正文' })).status).toBe('bound');
    expect(await f.artifacts.listProjectArtifacts(ctx, f.project.projectId)).toHaveLength(1);
    expect(f.warnings).toHaveLength(1);
    await f.service.ensure(ctx, { awemeId: 'video', transcript: '重放不同正文' });
    const rows = await f.artifacts.listProjectArtifacts(ctx, f.project.projectId);
    expect(rows).toHaveLength(2);
    const master = rows.find(r => r.artifactType === 'master_script')!;
    expect((await f.artifacts.listVersions(ctx, master.id)).find(v => v.id === master.currentVersionId)?.contentText).toBe('保存的正文');
});
it('图集不建口播稿，已有人工稿不覆盖，跨账号无落稿', async () => {
    const f = await fixture();
    await f.service.ensure(ctx, { awemeId: 'video', transcript: '图集占位', skipMasterScript: true });
    expect(await f.artifacts.listProjectArtifacts(ctx, f.project.projectId)).toHaveLength(1);
    const master = await f.artifacts.createArtifact(ctx, { projectId: f.project.projectId, title: '人工稿', artifactType: 'master_script', stage: 'script' });
    await f.artifacts.createVersion(ctx, master.id, { contentText: '人工正文' });
    await f.service.ensure(ctx, { awemeId: 'video', transcript: '另一次' });
    const current = await f.artifacts.getArtifact(ctx, master.id);
    expect((await f.artifacts.listVersions(ctx, master.id)).find(v => v.id === current.currentVersionId)?.contentText).toBe('人工正文');
    expect((await f.service.ensure({ ...ctx, accountId: 'other' }, { awemeId: 'video', transcript: '越权' })).status).toBe('skipped');
});
it('已落事实可显式补稿，图集和无事实恢复不制造正文', async () => {
    const f = await fixture();
    f.failAfter(6);
    await f.service.ensure(ctx, { awemeId: 'video', transcript: '原稿' });
    await f.service.restoreExisting(ctx, 'video');
    expect(await f.artifacts.listProjectArtifacts(ctx, f.project.projectId)).toHaveLength(2);
    await f.service.restoreExisting(ctx, 'missing');
    const g = await fixture();
    await g.service.ensure(ctx, { awemeId: 'video', transcript: '占位', source: 'image-album', skipMasterScript: true });
    await g.service.restoreExisting(ctx, 'video');
    await g.service.ensure(ctx, { awemeId: 'video', transcript: '错误重放' });
    expect(await g.artifacts.listProjectArtifacts(ctx, g.project.projectId)).toHaveLength(1);
});
it('显式禁止口播初始化在后续恢复中仍然有效', async () => {
    const f = await fixture();
    await f.service.ensure(ctx, { awemeId: 'video', transcript: '非正文锚', skipMasterScript: true });
    await f.service.restoreExisting(ctx, 'video');
    await f.service.ensure(ctx, { awemeId: 'video', transcript: '另一次' });
    expect(await f.artifacts.listProjectArtifacts(ctx, f.project.projectId)).toHaveLength(1);
});

it.each([false, true])('索引在事务后可回读，索引故障不损失事实 (失败=%s)', async (fail) => {
    const indexed: string[] = [];
    const f = await fixture(async (c, input) => {
        const artifact = await f.artifacts.getArtifact(c, input.entityId);
        const current = (await f.artifacts.listVersions(c, artifact.id)).find(v => v.id === artifact.currentVersionId);
        expect(current?.contentText).toBe(input.body);
        indexed.push(input.entityId);
        if (fail) throw new Error('index unavailable');
    });
    await f.service.ensure(ctx, {awemeId: 'video', transcript: '索引正文'});
    expect(indexed).toHaveLength(2);
    expect(await f.artifacts.listProjectArtifacts(ctx, f.project.projectId)).toHaveLength(2);
});
