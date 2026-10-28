import {describe, expect, it, vi} from "vitest";
import {artifacts, createDb, eq, type Db} from "@creatoros/backend";
import {accountGroups} from "../../schema/account-groups";
import type {RequestContext} from "@creatoros/contract";
import {createProjectRepository, createProjectsService} from "../projects";
import {createArtifactsService} from "../artifacts";
import {createArticlesService} from "./articles.service";

vi.setConfig({testTimeout: 180000, hookTimeout: 180000});
const now = "2026-10-24T08:00:00.000Z";
const owner: RequestContext = {userId: "reader", groupId: "read-group", accountId: null, source: "user", requestId: "read"};

async function fixture() {
  const opened = await createDb();
  const db = opened.db;
  let seq = 0;
  const ids = {now: () => now, nextId: (prefix: string) => `${prefix}-${++seq}`};
  const projectsFor = (store: Db) => createProjectsService(createProjectRepository(store), ids);
  const artifactsFor = (store: Db) => createArtifactsService({db: store, ...ids,
    assertProjectOwned: (ctx, id) => projectsFor(store).getProject(ctx, id),
    resolveOutputProjectId: (ctx, id) => projectsFor(store).getProjectIdByOutput(ctx, id),
  });
  const getOutput = vi.fn((ctx: RequestContext, id: string) => projectsFor(db).getOutput(ctx, id));
  const getArtifact = vi.fn((ctx: RequestContext, id: string) => artifactsFor(db).getArtifact(ctx, id));
  const listVersions = vi.fn((ctx: RequestContext, id: string) => artifactsFor(db).listVersions(ctx, id));
  const service = createArticlesService(db, {...ids,
    projects: store => ({...projectsFor(store), ...(store === db ? {getOutput} : {})}),
    artifacts: store => ({...artifactsFor(store), ...(store === db ? {getArtifact, listVersions} : {})}),
    assertAssetFile: async () => {}, resolveDocumentSource: async () => null, resolveSelectedBrand: async () => null,
    submitGeneration: async () => {throw new Error("本测试不调用生成");},
    readGeneration: async () => {throw new Error("本测试不调用生成");},
  });
  await db.insert(accountGroups).values({id: owner.groupId!, userId: owner.userId, name: "文章读取组", status: "active", version: 1, createdAt: now, updatedAt: now});
  const project = await projectsFor(db).createProject(owner, {title: "读取性能项目", brief: ""});
  const output = await service.createOutput(owner, project.id, {title: "多版本文章", clientRequestId: "read-output"});
  const query = vi.spyOn(opened.client, "query");
  const resetCounts = () => {getOutput.mockClear(); getArtifact.mockClear(); listVersions.mockClear(); query.mockClear();};
  const anchorReads = () => query.mock.calls.filter(([sql]) => typeof sql === "string" && sql.includes('from "article_anchors"')).length;
  return {opened, db, service, project, output, getOutput, getArtifact, listVersions, resetCounts, anchorReads};
}

describe("T-1425 文章首读的真实库读取预算", () => {
  it("多个历史版本只读取一次归属链及版本列表，当前正文与历史保持一致", async () => {
    const f = await fixture();
    try {
      const initial = await f.service.getArticle(owner, f.output.id);
      let currentVersionId = initial.currentVersionId;
      for (let index = 1; index <= 4; index++) {
        const saved = await f.service.createVersion(owner, f.output.id, {expectedCurrentVersionId: currentVersionId,
          clientRequestId: `read-save-${index}`, document: {...initial.current, title: `版本${index}`, summary: `正文${index}`}});
        currentVersionId = saved.versionId;
      }
      f.resetCounts();
      const read = await f.service.getArticle(owner, f.output.id);
      expect(read.currentVersionId).toBe(currentVersionId);
      expect(read.current).toMatchObject({title: "版本4", summary: "正文4"});
      expect(read.versions).toHaveLength(5);
      expect({outputReads: f.getOutput.mock.calls.length, artifactReads: f.getArtifact.mock.calls.length,
        anchorReads: f.anchorReads(), versionReads: f.listVersions.mock.calls.length})
        .toEqual({outputReads: 1, artifactReads: 1, anchorReads: 1, versionReads: 1});
      expect((await f.service.getVersion(owner, f.output.id, initial.currentVersionId)).document).toEqual(initial.current);
      expect((await f.service.getArticle(owner, f.output.id)).currentVersionId).toBe(currentVersionId);
    } finally {await f.opened.client.close();}
  });

  it("当前指针未命中版本列表时诚实报错，不回退到其他历史正文", async () => {
    const f = await fixture();
    try {
      const initial = await f.service.getArticle(owner, f.output.id);
      await f.db.update(artifacts).set({currentVersionId: "missing-version"}).where(eq(artifacts.id, initial.artifactId));
      f.resetCounts();
      await expect(f.service.getArticle(owner, f.output.id)).rejects.toMatchObject({code: "OwnershipError", message: "文章版本不存在"});
      expect(f.getOutput).toHaveBeenCalledTimes(1);
      expect(f.anchorReads()).toBe(1);
      expect(f.listVersions).toHaveBeenCalledTimes(1);
      expect((await f.service.getVersion(owner, f.output.id, initial.currentVersionId)).document).toEqual(initial.current);
    } finally {await f.opened.client.close();}
  });

  it("每个请求重新核验组与用户，已读正文不会成为跨scope缓存", async () => {
    const f = await fixture();
    try {
      const initial = await f.service.getArticle(owner, f.output.id);
      for (const foreign of [{...owner, groupId: "other-group"}, {...owner, userId: "other-user"}]) {
        f.resetCounts();
        await expect(f.service.getArticle(foreign, f.output.id)).rejects.toThrow();
        expect(f.getOutput).toHaveBeenCalledTimes(1);
        expect(f.listVersions).not.toHaveBeenCalled();
      }
      const saved = await f.service.createVersion(owner, f.output.id, {expectedCurrentVersionId: initial.currentVersionId,
        clientRequestId: "after-read-save", document: {...initial.current, title: "读取后真实保存"}});
      f.resetCounts();
      expect((await f.service.getArticle(owner, f.output.id)).currentVersionId).toBe(saved.versionId);
      expect(f.getOutput).toHaveBeenCalledTimes(1);
      expect(f.anchorReads()).toBe(1);
      expect(f.listVersions).toHaveBeenCalledTimes(1);
    } finally {await f.opened.client.close();}
  });
});
