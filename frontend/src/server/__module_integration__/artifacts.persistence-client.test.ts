import { describe, it, expect, beforeEach } from "vitest";
import type { Endpoint, RequestContext } from "@creatoros/contract";
import {
  compositeTransport,
  getChatRuntime,
  __resetPersistenceForTests,
} from "@/server/persistence-client";
import { canonicalDataset } from "@/fixtures/canonical";
import { ARTIFACT_OP_IDS } from "@creatoros/backend/modules/artifacts";

// Step 4/5 — the 8 artifacts ops are registered into the composite (PERSISTED_OPS)
// and a versions.create round-trips through compositeTransport against the seeded
// pglite store. Proves the module is wired into the SAME store server reads + the
// /api/v1 route share (foundation §1 registry) — this is the FE save path.

const ep = (id: string, isList = false) =>
  ({ id, isList }) as unknown as Endpoint;
// [T-332 S2] strict 账号门:per-account op(projects/artifacts)必须带 ctx.accountId
// (未选号 → AccountRequiredError,SPEC §4.2)。测试号按 userId 派生;composite 层 ctx
// 是可信输入,无需真建账号行。
const ctx = (userId: string, accountId = `acct-of-${userId}`): RequestContext => ({
  userId,
  requestId: "req-test",
  source: "user",
  accountId,
});

// [T-050] canonical demo 项目/artifact 种子已退役 → 每个用例前自建
// project + master_script artifact(走真实 create ops,与 FE 保存路径同链)。
let PROJECT_ID = "";
let SCRIPT_ARTIFACT_ID = "";

beforeEach(async () => {
  __resetPersistenceForTests();
  const owner = ctx(canonicalDataset.user.id);
  const project = (await compositeTransport.request(
    ep("projects.create"),
    {
      params: undefined,
      query: undefined,
      body: { title: "artifacts 集成测试项目", brief: "" },
    } as never,
    owner,
  )) as { data: { id: string } };
  PROJECT_ID = project.data.id;
  const artifact = (await compositeTransport.request(
    ep("artifacts.create"),
    {
      params: { projectId: PROJECT_ID },
      query: undefined,
      body: { title: "口播稿", artifactType: "master_script", stage: "script" },
    } as never,
    owner,
  )) as { data: { id: string } };
  SCRIPT_ARTIFACT_ID = artifact.data.id;
  // createArtifact 已自动建立空白 v1；再建立一版真实稿面，供版本切换和局部改稿使用。
  await compositeTransport.request(
    ep("artifacts.versions.create"),
    {
      params: { artifactId: SCRIPT_ARTIFACT_ID },
      query: undefined,
      body: { contentText: "初稿正文", changeSummary: "初稿" },
    } as never,
    owner,
  );
});

describe("artifacts ops registered in the composite transport", () => {
  it("the 8 artifacts op ids are persistence-backed (not the mock)", async () => {
    // A persisted op called with NO ctx throws AuthenticationError; a mock op
    // would resolve. Use that to assert each id is routed to the real transport.
    for (const id of ARTIFACT_OP_IDS) {
      await expect(
        compositeTransport.request(ep(id), {} as never),
      ).rejects.toThrow();
    }
    expect(ARTIFACT_OP_IDS).toHaveLength(8);
  });

  it("artifacts.list returns the seeded artifacts for the owner (user-scoped)", async () => {
    const res = (await compositeTransport.request(
      ep("artifacts.list", true),
      {
        params: { projectId: PROJECT_ID },
        query: { page: 1, pageSize: 50 },
        body: undefined,
      } as never,
      ctx(canonicalDataset.user.id),
    )) as { data: Array<{ id: string; projectId: string }> };
    expect(res.data.length).toBeGreaterThan(0);
    for (const row of res.data) {
      expect(row.projectId).toBe(PROJECT_ID);
    }
  });

  it("artifacts.versions.create round-trips: the new version is the current one + listable", async () => {
    const owner = ctx(canonicalDataset.user.id);
    const created = (await compositeTransport.request(
      ep("artifacts.versions.create"),
      {
        params: { artifactId: SCRIPT_ARTIFACT_ID },
        query: undefined,
        body: { contentText: "保存的新版本", changeSummary: "FE 保存" },
      } as never,
      owner,
    )) as { data: { id: string; versionNumber: number } };
    expect(created.data.id).toBeTruthy();

    const got = (await compositeTransport.request(
      ep("artifacts.get"),
      { params: { artifactId: SCRIPT_ARTIFACT_ID }, query: undefined, body: undefined } as never,
      owner,
    )) as { data: { currentVersionId: string } };
    expect(got.data.currentVersionId).toBe(created.data.id);

    const list = (await compositeTransport.request(
      ep("artifacts.versions.list", true),
      {
        params: { artifactId: SCRIPT_ARTIFACT_ID },
        query: { page: 1, pageSize: 50 },
        body: undefined,
      } as never,
      owner,
    )) as { data: Array<{ id: string }> };
    expect(list.data.some((r) => r.id === created.data.id)).toBe(true);
  });

  it("artifacts.restore round-trips: restoring re-points to the selected immutable version", async () => {
    const owner = ctx(canonicalDataset.user.id);
    const versionsBefore = (await compositeTransport.request(
      ep("artifacts.versions.list", true),
      {
        params: { artifactId: SCRIPT_ARTIFACT_ID },
        query: { page: 1, pageSize: 50 },
        body: undefined,
      } as never,
      owner,
    )) as { data: Array<{ id: string }> };
    const oldVersionId = versionsBefore.data[0]!.id;

    const restored = (await compositeTransport.request(
      ep("artifacts.restore"),
      {
        params: { artifactId: SCRIPT_ARTIFACT_ID },
        query: undefined,
        body: { versionId: oldVersionId },
      } as never,
      owner,
    )) as { data: { currentVersionId: string } };
    expect(restored.data.currentVersionId).toBe(oldVersionId);

    const versionsAfter = (await compositeTransport.request(
      ep("artifacts.versions.list", true),
      {
        params: { artifactId: SCRIPT_ARTIFACT_ID },
        query: { page: 1, pageSize: 50 },
        body: undefined,
      } as never,
      owner,
    )) as { data: Array<{ id: string }> };
    expect(versionsAfter.data).toHaveLength(versionsBefore.data.length);
  });

  it("artifacts.scriptPatches.apply round-trips through the deterministic write command", async () => {
    const owner = ctx(canonicalDataset.user.id);
    const source = (await compositeTransport.request(
      ep("artifacts.versions.create"),
      {
        params: { artifactId: SCRIPT_ARTIFACT_ID },
        query: undefined,
        body: {
          contentText: "第一段\n\n第二段",
          contentData: {
            sections: [
              { id: "section-1", body: "第一段" },
              { id: "section-2", body: "第二段" },
            ],
          },
          changeSummary: "结构化脚本",
        },
      } as never,
      owner,
    )) as { data: { id: string } };

    const patched = (await compositeTransport.request(
      ep("artifacts.scriptPatches.apply"),
      {
        params: { artifactId: SCRIPT_ARTIFACT_ID },
        query: undefined,
        body: {
          expectedVersionId: source.data.id,
          sectionId: "section-2",
          expectedOriginalText: "第二段",
          replacementText: "只改第二段",
          changeSummary: "局部改稿",
        },
      } as never,
      owner,
    )) as { data: { id: string; contentData: { sections: Array<{ body: string }> } } };

    expect(patched.data.contentData.sections.map((section) => section.body)).toEqual([
      "第一段",
      "只改第二段",
    ]);
  });

  it("[T-732] 当前 AI 整稿没有历史 section id 时仍能按第 2 段重绑", async () => {
    const owner = ctx(canonicalDataset.user.id);
    const current = (await compositeTransport.request(
      ep("artifacts.versions.create"),
      {
        params: { artifactId: SCRIPT_ARTIFACT_ID },
        query: undefined,
        body: {
          contentText: "第一段\n\n第二段",
          contentData: {
            sections: [
              { heading: "第一段", body: "正文一" },
              { heading: "第二段", body: "正文二" },
            ],
          },
          changeSummary: "历史 AI 整稿",
        },
      } as never,
      owner,
    )) as { data: { id: string } };

    const runtime = await getChatRuntime();
    await expect(
      runtime.resolveCurrentScriptSelection?.(owner, {
        artifactId: SCRIPT_ARTIFACT_ID,
        versionId: current.data.id,
        sectionId: "script-saved-1",
        sectionIndex: 1,
        excerpt: "正文二",
      }),
    ).resolves.toEqual({
      artifactId: SCRIPT_ARTIFACT_ID,
      versionId: current.data.id,
      sectionId: "script-saved-1",
      originalText: "正文二",
      matchStrategy: "id",
    });
  });
});
