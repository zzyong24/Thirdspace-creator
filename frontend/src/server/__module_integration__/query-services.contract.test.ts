import { describe, it, expect, beforeEach } from "vitest";
import type {
  Endpoint,
  RequestContext,
  ProjectOverviewPage,
} from "@creatoros/contract";
import {
  dashboardPage,
  projectOverviewPage,
  globalSearchPage,
} from "@creatoros/contract";
import {
  compositeTransport,
  __resetPersistenceForTests,
} from "@/server/persistence-client";
import { canonicalDataset } from "@/fixtures/canonical";
import { QUERY_SERVICES_OP_IDS } from "@creatoros/backend/modules/query-services";
import {
  loadScriptEditorData,
  resolveScriptArtifactIdFromDb,
  type ScriptDataClient,
} from "@/features/script/script-editor-data";
import {
  buildDraftWorkbenchVm,
  type DraftWorkbenchClient,
} from "@/features/draft-workbench/draft-workbench-data";

// Task 4/6 — the 3 page-read ops are registered into the composite (PERSISTED_OPS)
// and resolve through compositeTransport against the seeded pglite store. Proves
// the composition module is wired into the SAME store the server reads + the
// /api/v1 route share (foundation §1 registry). Each op output validates against
// its contract page DTO; the ownership-404 path + the multi-tenant smoke prove the
// inherited-scope invariant end-to-end (SPEC §19/§20; foundation §9).

const ep = (id: string) => ({ id }) as unknown as Endpoint;
// [T-332 S2] strict 账号门:页面组合读的底层 service 全部 per-account,ctx 必须带
// accountId(未选号 → AccountRequiredError,SPEC §4.2)。测试号按 userId 派生 →
// OWNER/OTHER 天然异号:OTHER 读 OWNER 项目走 (userId, accountId) 双维过滤落空 →
// OwnershipError 404(跨租户断言语义保持,且不会误抛 AccountRequiredError)。
const ctx = (userId: string, accountId = `acct-of-${userId}`): RequestContext => ({
  userId,
  requestId: "req-test",
  source: "user",
  accountId,
});

const noAccountCtx = (userId: string): RequestContext => ({
  userId,
  requestId: "req-test-no-account",
  source: "user",
});

const OWNER = canonicalDataset.user.id; // user-zyongzhu (seeded)
const OTHER = "user-b"; // no seeded data
// [T-050] demo 项目种子已退役 → 每个用例前自建一个 OWNER 项目当被读对象。
let PROJECT_ID = "";

beforeEach(async () => {
  __resetPersistenceForTests();
  const created = (await compositeTransport.request(
    ep("projects.create"),
    {
      params: undefined,
      query: undefined,
      body: {
        title: "query-services 集成测试项目",
        brief: "用于验证 CLI 写后读回",
        briefDetail: {
          targetAudience: "内容创作者",
          contentGoal: "验证真实项目概览",
          contentFormat: "口播",
          targetPlatforms: ["douyin"],
          coreMessage: "所有写入都应从正式读模型回显",
        },
      },
    } as never,
    ctx(OWNER),
  )) as { data: { id: string } };
  PROJECT_ID = created.data.id;
});

describe("query-services ops registered in the composite transport", () => {
  it("the 3 page-read op ids are persistence-backed (reject without ctx)", async () => {
    for (const id of QUERY_SERVICES_OP_IDS) {
      await expect(
        compositeTransport.request(ep(id), {} as never),
      ).rejects.toThrow();
    }
    expect(QUERY_SERVICES_OP_IDS).toHaveLength(3);
  });

  it("pages.dashboard.get → valid dashboardPage, kind=dashboard", async () => {
    const res = (await compositeTransport.request(
      ep("pages.dashboard.get"),
      { params: undefined, query: undefined, body: undefined } as never,
      ctx(OWNER),
    )) as { data: unknown };
    expect(() => dashboardPage.parse(res.data)).not.toThrow();
    expect((res.data as { kind: string }).kind).toBe("dashboard");
  });

  it("T-719 未绑定账号仍由页面边界接管，不伪装成排期服务故障", async () => {
    await expect(
      compositeTransport.request(
        ep("pages.dashboard.get"),
        { params: undefined, query: undefined, body: undefined } as never,
        noAccountCtx(OWNER),
      ),
    ).rejects.toMatchObject({
      code: "AccountRequiredError",
    });
  });

  it("pages.projectOverview.get → valid projectOverviewPage echoing projectId", async () => {
    const res = (await compositeTransport.request(
      ep("pages.projectOverview.get"),
      { params: { projectId: PROJECT_ID }, query: undefined, body: undefined } as never,
      ctx(OWNER),
    )) as { data: { projectId: string } };
    expect(() => projectOverviewPage.parse(res.data)).not.toThrow();
    expect(res.data.projectId).toBe(PROJECT_ID);
  });

  it("CLI 等价写链：项目→输出/脚本/素材→overview 全部真实回显", async () => {
    const owner = ctx(OWNER);
    const output = (await compositeTransport.request(
      ep("projects.outputs.create"),
      {
        params: { projectId: PROJECT_ID },
        query: undefined,
        body: { title: "抖音主成片" },
      } as never,
      owner,
    )) as { data: { id: string } };
    const artifact = (await compositeTransport.request(
      ep("artifacts.create"),
      {
        params: { projectId: PROJECT_ID },
        query: undefined,
        body: {
          title: "项目口播稿",
          artifactType: "output_script",
          stage: "script",
          contentOutputId: output.data.id,
        },
      } as never,
      owner,
    )) as { data: { id: string; contentOutputId: string | null } };
    expect(artifact.data.contentOutputId).toBe(output.data.id);
    await compositeTransport.request(
      ep("artifacts.versions.create"),
      {
        params: { artifactId: artifact.data.id },
        query: undefined,
        body: { contentText: "这是 CLI 写入后必须能读回的正式口播稿。", changeSummary: "测试读回" },
      } as never,
      owner,
    );
    // 真实存量项目含这个历史类型；它不能再让 artifacts.list 整批解析失败，
    // 更不能把同项目合法的 output_script 从桌面稿面一起拖成空态。
    const legacyCoverCopy = (await compositeTransport.request(
      ep("artifacts.create"),
      {
        params: { projectId: PROJECT_ID },
        query: undefined,
        body: {
          title: "历史封面文案",
          artifactType: "cover_copy",
          stage: "publishing",
          contentOutputId: output.data.id,
        },
      } as never,
      owner,
    )) as { data: { id: string } };

    const upload = (await compositeTransport.request(
      ep("assets.uploads.create"),
      {
        params: undefined,
        query: undefined,
        body: { assetType: "video", mimeType: "video/mp4", fileSize: 1024 },
      } as never,
      owner,
    )) as { data: { uploadId: string } };
    const asset = (await compositeTransport.request(
      ep("assets.uploads.complete"),
      {
        params: { uploadId: upload.data.uploadId },
        query: undefined,
        body: { name: "前三秒真实素材.mp4" },
      } as never,
      owner,
    )) as { data: { id: string } };
    await compositeTransport.request(
      ep("materialLinks.create"),
      {
        params: undefined,
        query: undefined,
        body: {
          projectId: PROJECT_ID,
          contentOutputId: output.data.id,
          entityType: "asset",
          entityId: asset.data.id,
          role: "clip",
          stage: "production",
        },
      } as never,
      owner,
    );

    const result = (await compositeTransport.request(
      ep("pages.projectOverview.get"),
      { params: { projectId: PROJECT_ID }, query: undefined, body: undefined } as never,
      owner,
    )) as { data: ProjectOverviewPage };
    expect(() => projectOverviewPage.parse(result.data)).not.toThrow();
    expect(result.data).toMatchObject({
      scenario: "default",
      projectId: PROJECT_ID,
      projectTitle: "query-services 集成测试项目",
      stage: "brief",
      progressPct: 0,
    });
    expect(result.data.stages).toHaveLength(7);
    expect(result.data.outputs).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: output.data.id, title: "抖音主成片" })]),
    );
    expect(result.data.recentFiles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: artifact.data.id, name: "项目口播稿", fileKind: "script" }),
        expect.objectContaining({ id: asset.data.id, name: "前三秒真实素材.mp4", fileKind: "shot" }),
      ]),
    );

    const listedArtifacts = (await compositeTransport.request(
      ep("artifacts.list"),
      { params: { projectId: PROJECT_ID }, query: { page: 1, pageSize: 20 }, body: undefined } as never,
      owner,
    )) as { data: Array<{ id: string; contentOutputId: string | null }> };
    expect(listedArtifacts.data).toContainEqual(
      expect.objectContaining({ id: artifact.data.id, contentOutputId: output.data.id }),
    );
    expect(listedArtifacts.data).toContainEqual(
      expect.objectContaining({ id: legacyCoverCopy.data.id, contentOutputId: output.data.id }),
    );

    // 脚本页使用的正式 reader 也必须命中同一个 output_script + 当前版本。
    const scriptClient: ScriptDataClient = {
      listArtifacts: async (input) =>
        (
          (await compositeTransport.request(
            ep("artifacts.list"),
            input as never,
            owner,
          )) as { data: unknown }
        ).data,
      getArtifact: async (input) =>
        (
          (await compositeTransport.request(
            ep("artifacts.get"),
            input as never,
            owner,
          )) as { data: { currentVersionId: string } }
        ).data,
      listArtifactVersions: async (input) =>
        (
          (await compositeTransport.request(
            ep("artifacts.versions.list"),
            input as never,
            owner,
          )) as { data: unknown }
        ).data,
    };
    const readableArtifactId = await resolveScriptArtifactIdFromDb(
      PROJECT_ID,
      scriptClient,
    );
    expect(readableArtifactId).toBe(artifact.data.id);
    const scriptPageData = await loadScriptEditorData(
      readableArtifactId,
      scriptClient,
    );
    expect(scriptPageData?.editorHtml).toContain(
      "这是 CLI 写入后必须能读回的正式口播稿。",
    );
    expect(scriptPageData?.versions[0]).toMatchObject({
      versionNumber: 2,
      isCurrent: true,
    });

    // `/projects/[projectId]` 实际使用的不是 overview DTO，而是这个稿面组合读。
    // 直接复用同一正式 transport 验证项目标题、脚本正文和视频素材卡同时非空。
    const request = async (operation: string, input: unknown) =>
      (
        (await compositeTransport.request(
          ep(operation),
          input as never,
          owner,
        )) as { data: unknown }
      ).data;
    const draftClient = {
      getProject: (input: unknown) => request("projects.get", input),
      listArtifacts: (input: unknown) => request("artifacts.list", input),
      getArtifact: (input: unknown) => request("artifacts.get", input),
      listArtifactVersions: (input: unknown) =>
        request("artifacts.versions.list", input),
      listOutputs: (input: unknown) => request("projects.outputs.list", input),
      listPublications: (input: unknown) =>
        request("outputs.publications.list", input),
      listPublicationRevisions: (input: unknown) =>
        request("publications.revisions.list", input),
      listMaterialLinks: (input: unknown) => request("materialLinks.list", input),
      getKnowledge: (input: unknown) => request("knowledge.get", input),
      getAsset: (input: unknown) => request("assets.get", input),
      getDownloadUrl: (input: unknown) => request("assets.downloadUrl", input),
    } as unknown as DraftWorkbenchClient;
    const draftVm = await buildDraftWorkbenchVm(PROJECT_ID, draftClient);
    expect(draftVm.project.title).toBe("query-services 集成测试项目");
    expect(draftVm.script.editorHtml).toContain(
      "这是 CLI 写入后必须能读回的正式口播稿。",
    );
    expect(draftVm.ammo).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: asset.data.id,
          kind: "asset",
          title: "前三秒真实素材.mp4",
          assetType: "video",
        }),
      ]),
    );
  });

  it("stage transition 的响应、projects.get 与 overview 使用同一 currentStage/progress", async () => {
    const owner = ctx(OWNER);
    const transitioned = (await compositeTransport.request(
      ep("projects.stage.transition"),
      {
        params: { projectId: PROJECT_ID, stage: "brief" },
        query: undefined,
        body: {},
      } as never,
      owner,
    )) as { data: { currentStage: string; progressPct: number } };
    const reread = (await compositeTransport.request(
      ep("projects.get"),
      { params: { projectId: PROJECT_ID }, query: undefined, body: undefined } as never,
      owner,
    )) as { data: { currentStage: string; progressPct: number } };
    const overview = (await compositeTransport.request(
      ep("pages.projectOverview.get"),
      { params: { projectId: PROJECT_ID }, query: undefined, body: undefined } as never,
      owner,
    )) as { data: { stage: string; progressPct: number } };
    expect(reread.data).toMatchObject(transitioned.data);
    expect(overview.data).toMatchObject({
      stage: transitioned.data.currentStage,
      progressPct: transitioned.data.progressPct,
    });
  });

  it("artifact 与 material link 拒绝关联另一个项目的 output", async () => {
    const owner = ctx(OWNER);
    const otherProject = (await compositeTransport.request(
      ep("projects.create"),
      {
        params: undefined,
        query: undefined,
        body: { title: "另一个项目" },
      } as never,
      owner,
    )) as { data: { id: string } };
    const foreignOutput = (await compositeTransport.request(
      ep("projects.outputs.create"),
      {
        params: { projectId: otherProject.data.id },
        query: undefined,
        body: { title: "另一个项目的输出" },
      } as never,
      owner,
    )) as { data: { id: string } };

    await expect(
      compositeTransport.request(
        ep("artifacts.create"),
        {
          params: { projectId: PROJECT_ID },
          query: undefined,
          body: {
            title: "错误关联稿",
            artifactType: "output_script",
            stage: "script",
            contentOutputId: foreignOutput.data.id,
          },
        } as never,
        owner,
      ),
    ).rejects.toMatchObject({ code: "ValidationError" });

    await expect(
      compositeTransport.request(
        ep("materialLinks.create"),
        {
          params: undefined,
          query: undefined,
          body: {
            projectId: PROJECT_ID,
            contentOutputId: foreignOutput.data.id,
            entityType: "asset",
            entityId: "asset-not-reached",
          },
        } as never,
        owner,
      ),
    ).rejects.toMatchObject({ code: "ValidationError" });
  });

  it("pages.projectOverview.get on ANOTHER user's project id → 404/OwnershipError (no leak)", async () => {
    await expect(
      compositeTransport.request(
        ep("pages.projectOverview.get"),
        { params: { projectId: PROJECT_ID }, query: undefined, body: undefined } as never,
        ctx(OTHER),
      ),
    ).rejects.toMatchObject({ code: expect.stringMatching(/Ownership/i) });
  });

  it("pages.search.get → valid globalSearchPage, query echoed, 4 locked tabs", async () => {
    const res = (await compositeTransport.request(
      ep("pages.search.get"),
      { params: undefined, query: { q: "钩子", type: undefined }, body: undefined } as never,
      ctx(OWNER),
    )) as { data: { query: string; kind: string; resultTabs: Array<{ id: string }> } };
    expect(() => globalSearchPage.parse(res.data)).not.toThrow();
    expect(res.data.query).toBe("钩子");
    expect(res.data.kind).toBe("search");
    expect(res.data.resultTabs.map((t) => t.id)).toEqual([
      "project",
      "knowledge",
      "asset",
      "video",
    ]);
  });

  // ------------------------------------------------------------------------
  // Multi-tenant smoke (foundation §9): user-b sees none of user-zyongzhu's data.
  // ------------------------------------------------------------------------
  it("multi-tenant: dashboard as user-b never surfaces the owner's publications/suggestions", async () => {
    const res = (await compositeTransport.request(
      ep("pages.dashboard.get"),
      { params: undefined, query: undefined, body: undefined } as never,
      ctx(OTHER),
    )) as { data: unknown };
    expect(() => dashboardPage.parse(res.data)).not.toThrow();
    const data = res.data as {
      recentPublications: unknown[];
      suggestions: unknown[];
      todos: unknown[];
    };
    // user-b has no seeded rows → empty composition (no cross-tenant leak).
    expect(data.recentPublications).toEqual([]);
    expect(data.suggestions).toEqual([]);
    expect(data.todos).toEqual([]);
  });

  it("multi-tenant: search as user-b returns no owner documents", async () => {
    const res = (await compositeTransport.request(
      ep("pages.search.get"),
      { params: undefined, query: { q: "AI", type: undefined }, body: undefined } as never,
      ctx(OTHER),
    )) as { data: { projects: unknown[]; knowledge: unknown[]; assets: unknown[]; videos: unknown[] } };
    expect(res.data.projects).toEqual([]);
    expect(res.data.knowledge).toEqual([]);
    expect(res.data.assets).toEqual([]);
    expect(res.data.videos).toEqual([]);
  });
});
