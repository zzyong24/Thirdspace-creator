import { afterEach, expect, it } from 'vitest';
import { createDb, artifacts as artifactRows, artifactVersions, projects as projectRows, asc } from '@creatoros/backend';
import type { RequestContext } from '@creatoros/contract';
import { createPlatformAccountService } from '../platform-account/platform-account.service';
import { createAccountGroupService } from '../platform-account/account-group.service';
import { createProjectRepository } from './projects.repository';
import { createProjectsService } from './projects.service';
import { createArtifactsService } from '../artifacts';
import { createTranscriptArtifactService } from './transcript-artifact.service';

// 每例仅 createDb() 自产内存 PGlite；不选 configured DB 或 persistence/runtime。
const closes: Array<() => Promise<void>> = [];
afterEach(async () => { await Promise.all(closes.splice(0).map(close => close())); });
type ScopeKind = 'legacy' | 'explicit';
async function fixture() {
    const opened = await createDb();
    closes.push(() => opened.client.close());
    let sequence = 0;
    const deps = {
        db: opened.db,
        now: () => '2026-10-10T00:00:00.000Z',
        nextId: (prefix: string) => `${prefix}-ownership-${++sequence}`,
    };
    const groups = createAccountGroupService(deps);
    const accounts = createPlatformAccountService(deps);
    const projects = createProjectsService(createProjectRepository(opened.db), deps);
    const artifacts = createArtifactsService({ ...deps,
        assertProjectOwned: (ctx, id) => projects.getProject(ctx, id),
    });
    const warnings: string[] = [];
    const transcripts = createTranscriptArtifactService({ ...deps, warn: message => warnings.push(message) });
    async function scope(userId: string, kind: ScopeKind): Promise<RequestContext> {
        const base: RequestContext = { userId, source: 'user', requestId: deps.nextId('request') };
        const selected = kind === 'explicit'
            ? { ...base, groupId: (await groups.create(base, { name: '本人创作组', idempotencyKey: deps.nextId('group-command') })).id }
            : base;
        const account = await accounts.createAccount(selected, {
            platform: 'douyin', accountHandle: deps.nextId('account'), idempotencyKey: deps.nextId('account-command'),
        });
        const member = await groups.forAccount(base, account.id);
        const group = await groups.get(base, member.groupId);
        expect(group.status).toBe('active');
        expect(group.members.some(row => row.accountId === account.id)).toBe(true);
        if (kind === 'legacy') expect(group.id).toBe(`grp_legacy_${account.id}`);
        // 与真实 execution binding 一样使用已注册 legacy 父组，而非删掉 group 绕 guard。
        return { ...base, accountId: account.id, groupId: group.id,
            groupVersion: group.version, membershipVersion: member.version };
    }
    async function imported(ctx: RequestContext, awemeId: string) {
        const result = await projects.ensureImportedProject(ctx, { title: '已导入本人作品', platform: 'douyin', externalId: awemeId });
        expect((await projects.getProject(ctx, result.projectId)).groupId).toBe(ctx.groupId);
        return result.projectId;
    }
    async function current(ctx: RequestContext, id: string) {
        const artifact = await artifacts.getArtifact(ctx, id);
        const versions = await artifacts.listVersions(ctx, id);
        const version = versions.find(row => row.id === artifact.currentVersionId);
        if (!version) throw new Error('公开工件没有真实当前版本');
        return { artifact, versions, version };
    }
    async function snapshot() {
        return {
            projects: await opened.db.select().from(projectRows).orderBy(asc(projectRows.id)),
            artifacts: await opened.db.select().from(artifactRows).orderBy(asc(artifactRows.id)),
            versions: await opened.db.select().from(artifactVersions).orderBy(asc(artifactVersions.id)),
        };
    }
    return { ...opened, deps, scope, imported, current, snapshot, projects, artifacts, transcripts, warnings };
}

it.each<ScopeKind>(['legacy', 'explicit'])('真实 %s 账号组保存正文并公开回读，同作品恢复不重复', async kind => {
    const f = await fixture(), ctx = await f.scope('owner', kind);
    const projectId = await f.imported(ctx, 'owned-video');
    const result = await f.transcripts.ensure(ctx, { awemeId: 'owned-video', transcript: '本人已确认的原正文' });
    expect(result).toMatchObject({ status: 'bound', projectId, awemeId: 'owned-video' });
    if (!result.artifactId) throw new Error('保存结果缺真实稿件 ID');
    const output = await f.current(ctx, result.artifactId);
    expect(output.artifact.artifactType).toBe('output_script');
    expect(output.version.contentText).toBe('本人已确认的原正文');
    expect(output.version.contentData).toMatchObject({ awemeId: 'owned-video', transcript: '本人已确认的原正文', source: 'transcribed' });
    const rows = await f.artifacts.listProjectArtifacts(ctx, projectId);
    expect(rows).toHaveLength(2);
    const master = rows.find(row => row.artifactType === 'master_script');
    if (!master) throw new Error('没有真实口播稿');
    expect((await f.current(ctx, master.id)).version.contentText).toBe('本人已确认的原正文');
    expect(await f.transcripts.hasExisting(ctx, 'owned-video')).toBe(true);
    const saved = await f.snapshot();
    expect(await f.transcripts.ensure(ctx, { awemeId: 'owned-video', transcript: '不得覆盖首份正文' }))
        .toMatchObject({ status: 'skipped', reason: 'already-exists', projectId, artifactId: result.artifactId });
    await f.transcripts.restoreExisting(ctx, 'owned-video');
    await f.transcripts.restoreExisting(ctx, 'owned-video');
    expect(await f.snapshot()).toEqual(saved);
    expect(f.warnings).toHaveLength(0);
}, 180_000);

it.each(['user', 'group'] as const)('真实跨 %s 范围拒绝写原项目，工件与版本零变动', async boundary => {
    const f = await fixture();
    const owner = await f.scope('owner', 'explicit');
    const attacker = await f.scope(boundary === 'user' ? 'other-owner' : 'owner', 'explicit');
    const projectId = await f.imported(owner, 'owner-only-video');
    // 预置合法人工稿亦经真实 Projects 公共 guard，而非本次待修 transcript 装配。
    const savedArtifact = await f.artifacts.createArtifact(owner, { projectId, title: '本人原稿', artifactType: 'output_script', stage: 'script' });
    await f.artifacts.createVersion(owner, savedArtifact.id, { contentText: '应完整保留的本人正文', contentData: { awemeId: 'owner-only-video' } });
    const before = await f.snapshot();
    await expect(f.projects.getProject(attacker, projectId)).rejects.toMatchObject({ code: 'OwnershipError' });
    await expect(f.artifacts.createArtifact(attacker, { projectId, title: '越权稿', artifactType: 'output_script', stage: 'script' }))
        .rejects.toMatchObject({ code: 'OwnershipError' });
    expect(await f.transcripts.ensure(attacker, { awemeId: 'owner-only-video', transcript: '越权正文' }))
        .toMatchObject({ status: 'skipped', reason: 'no-imported-project' });
    expect(await f.transcripts.hasExisting(attacker, 'owner-only-video')).toBe(false);
    await f.transcripts.restoreExisting(attacker, 'owner-only-video');
    await expect(f.artifacts.getArtifact(attacker, savedArtifact.id)).rejects.toMatchObject({ code: 'OwnershipError' });
    expect(await f.snapshot()).toEqual(before);
    expect((await f.current(owner, savedArtifact.id)).version.contentText).toBe('应完整保留的本人正文');
}, 180_000);

it('原 Artifacts 缺必需项目归属端口仍拒绝，不能绕过 guard', async () => {
    const f = await fixture(), ctx = await f.scope('owner', 'explicit');
    const projectId = await f.imported(ctx, 'guard-video');
    const before = await f.snapshot();
    await expect(createArtifactsService(f.deps).createArtifact(ctx, { projectId, title: '应拒绝', artifactType: 'output_script', stage: 'script' }))
        .rejects.toMatchObject({ code: 'OwnershipError', message: '项目归属校验不可用' });
    expect(await f.snapshot()).toEqual(before);
}, 180_000);

it('真实 master-only CHECK 故障保正文和版本，解除后仅补一次派生稿', async () => {
    const f = await fixture(), ctx = await f.scope('owner', 'legacy');
    const projectId = await f.imported(ctx, 'recover-video');
    await f.client.exec("ALTER TABLE artifacts ADD CONSTRAINT t216_master_only_fault CHECK (artifact_type <> 'master_script')");
    let outputId: string;
    let original: Awaited<ReturnType<typeof f.current>>;
    try {
        const result = await f.transcripts.ensure(ctx, { awemeId: 'recover-video', transcript: '已保存不能丢失的正文' });
        expect(result).toMatchObject({ status: 'bound', projectId });
        if (!result.artifactId) throw new Error('保存结果缺真实稿件 ID');
        outputId = result.artifactId;
        original = await f.current(ctx, outputId);
        expect(original.version.contentText).toBe('已保存不能丢失的正文');
        expect(original.version.contentData).toMatchObject({ awemeId: 'recover-video' });
        expect(original.versions).toHaveLength(2);
        expect(await f.artifacts.listProjectArtifacts(ctx, projectId)).toHaveLength(1);
        expect(f.warnings).toHaveLength(1);
    } finally {
        // 只恢复本例内存库故障；即使主断言失败也不留下故障约束。
        await f.client.exec('ALTER TABLE artifacts DROP CONSTRAINT t216_master_only_fault');
    }
    await f.transcripts.restoreExisting(ctx, 'recover-video');
    expect(await f.current(ctx, outputId)).toEqual(original);
    const rows = await f.artifacts.listProjectArtifacts(ctx, projectId);
    expect(rows).toHaveLength(2);
    const master = rows.find(row => row.artifactType === 'master_script');
    if (!master) throw new Error('派生稿未恢复');
    expect((await f.current(ctx, master.id)).version.contentText).toBe('已保存不能丢失的正文');
    const restored = await f.snapshot();
    await f.transcripts.restoreExisting(ctx, 'recover-video');
    await f.transcripts.ensure(ctx, { awemeId: 'recover-video', transcript: '重放不能换正文' });
    expect(await f.snapshot()).toEqual(restored);
    expect(f.warnings).toHaveLength(1);
}, 180_000);

it('真实组图集锚保留且恢复不制造口播稿或不存在的正文', async () => {
    const f = await fixture(), ctx = await f.scope('owner', 'explicit');
    const projectId = await f.imported(ctx, 'album');
    const result = await f.transcripts.ensure(ctx, { awemeId: 'album', transcript: '已确认图集跳过记录', source: 'image-album', skipMasterScript: true });
    expect(result).toMatchObject({ status: 'bound', projectId });
    if (!result.artifactId) throw new Error('图集保存缺真实工件 ID');
    const current = await f.current(ctx, result.artifactId);
    expect(current.version.contentData).toMatchObject({ awemeId: 'album', source: 'image-album', skipMasterScript: true });
    const saved = await f.snapshot();
    await f.transcripts.restoreExisting(ctx, 'album');
    await f.transcripts.restoreExisting(ctx, 'not-imported');
    expect(await f.snapshot()).toEqual(saved);
    expect(await f.artifacts.listProjectArtifacts(ctx, projectId)).toHaveLength(1);
}, 180_000);
