import type {WorkspaceWriteTx} from "../../workspace-write";
import {createDb} from "@creatoros/backend";
import {createProjectRepository,createProjectsService} from "../projects";
import {artifacts} from "../../schema/artifacts";
const closeGuardFixtures:Array<()=>Promise<void>>=[];
afterAll(async()=>{for(const close of closeGuardFixtures)await close();});
import {afterAll,describe, expect, it, vi} from "vitest";
// 新增真实隔离Db迁移与父锁IO需容纳初始化；不改产品请求deadline/取消或任何业务断言。
vi.setConfig({testTimeout:30_000});
import type {RequestContext} from "@creatoros/contract";
import {createGraphicPostMediaAdapter, type GraphicPostMediaPorts} from "./graphic-post-media.adapter";

const ctx = {userId: "user-1", accountId: "account-1", requestId: "request-1", source: "user"} as RequestContext;
const snapshot = {positioningBrief: "冻结定位", projectBriefHard: "冻结立项", reviewScript: "冻结稿",
  userMaterialHardBrief: "", userMaterialRefBrief: "", knowledgeBrief: "", orientationHint: "竖屏",
  topic: {title: "冻结主题", angle: ""}};
const document = {schemaVersion: 1 as const, title: "标题", body: "正文", summary: "摘要", tags: [],
  imageUses: [], sourceRefs: [], ruleSnapshotRef: null};
function task(id: string, status: string, kind: "cover" | "image_card" = "cover") { return {id,
  taskType: kind === "cover" ? "cover.generate" : "graphic.card.generate", status, projectId: "project-1",
  contentOutputId: "output-1", inputData: {projectId: "project-1", contentOutputId: "output-1", outputId: "output-1",
    artifactId: "artifact-1", baseVersionId: "version-1", kind, topic: "冻结主题",
    ...(kind === "cover" ? {coverContextSnapshot: snapshot} : {cardContextSnapshot: snapshot}),
    scriptSnapshot: {artifactId: "artifact-1", versionId: "version-1", fullText: "冻结稿"}}}; }
function row(id: string, kind: "cover" | "image_card" = "cover") { return {id: `binding-${id}`, userId: "user-1", accountId: "account-1", projectId: "project-1",
  outputId: "output-1", kind, taskId: id, candidateId: id, assetId: "asset-1", assetFileId: "file-1",
  clientRequestId: "old-request", requestDigest: "old", createdAt: "2026-10-01T00:00:00.000Z"}; }
async function fixture(status: string, currentVersionId = "version-1", kind: "cover" | "image_card" = "cover") {
  // 原模型/素材为语义夹具；新增父锁使用真实隔离数据库，不删旧协议断言。
  let guardDb:Promise<Awaited<ReturnType<typeof createDb>>>|undefined;
  const guard=()=>guardDb??=(async()=>{
    const opened=await createDb();closeGuardFixtures.push(()=>opened.client.close());let seq=0;
  const parent=createProjectsService(createProjectRepository(opened.db),{now:()=>"2026-10-01T00:00:00.000Z",nextId:p=>p==="project"?"project-1":p==="output"?"output-1":`${p}-${++seq}`});
  await parent.createProject(ctx,{title:"真实测试父"});await parent.createOutput(ctx,"project-1",{title:"真实测试稿",contentType:"image"});
  await opened.db.insert(artifacts).values({id:"artifact-1",userId:ctx.userId,accountId:ctx.accountId,groupId:null,projectId:"project-1",contentOutputId:"output-1",currentVersionId:"version-1",stage:"writing",artifactType:"graphic_post",title:"原稿",createdAt:"2026-10-01T00:00:00.000Z",updatedAt:"2026-10-01T00:00:00.000Z"});
    return opened;
  })();
  const transaction=async<T>(work:(tx:WorkspaceWriteTx)=>Promise<T>)=>(await guard()).db.transaction(work);

  const oldTask = task("task-old", status, kind);
  const newTask = task("task-new", "queued", kind);
  const selectRows: unknown[][] = [];
  const db = {transaction,select: () => ({from: () => ({where: async () => selectRows.shift() ?? []})}),
    insert: () => ({values: () => ({onConflictDoNothing: async () => undefined})})};
  const getGraphicPost = vi.fn(async () => ({projectId: "project-1", outputId: "output-1", artifactId: "artifact-1",
    currentVersionId, current: document, targetPlatform: "xiaohongshu", versions: []}));
  const getVersion = vi.fn(async (_ctx: RequestContext, _output: string, _version: string) => ({versionId: "version-1", document}));
  const createVersion = vi.fn(async (_c: RequestContext, _outputId: string, input: {expectedCurrentVersionId: string}) => {
    if (input.expectedCurrentVersionId !== currentVersionId) throw Object.assign(new Error("version conflict"), {code: "VERSION_CONFLICT"});
    return {versionId: "version-2", document};
  });
  const assertAssetFileOwned = vi.fn(async () => undefined);
  const getAssetFileDownloadUrl = vi.fn(async () => ({url: "signed-url", fileName: "cover.png"}));
  const confirmTask = vi.fn(async () => undefined);
  const submitCover = vi.fn(async () => ({id: "task-new", status: "queued"}));
  const submitCard = vi.fn(async () => ({id: "task-new", status: "queued"}));
  const readTask = vi.fn(async (_c: RequestContext, id: string) => id === "task-old" ? oldTask : newTask);
  const freezeCoverContext = vi.fn(async () => { throw new Error("retry must not re-read live context"); });
  const ports = {db, graphicPosts: {getGraphicPost, getVersion, createVersion},
    projects: {getProject: vi.fn()}, assets: {getAsset: vi.fn(async () => ({status: "pending", currentFileId: "file-1"})),
      assertAssetFileOwned, getAssetFileDownloadUrl}, submitCover, submitCard,
    readTask,
    listResults: vi.fn(async () => [{resultType: "generated_asset", assetId: "asset-1",
      resultData: {assetId: "asset-1", assetType: "image"}}]), confirmTask,
    probeCover: vi.fn(async () => ({ready: true})), probeCard: vi.fn(async () => ({ready: true})), freezeCoverContext,
  } as unknown as GraphicPostMediaPorts;
  return {adapter: createGraphicPostMediaAdapter(ports), selectRows, ports,
    getGraphicPost, getVersion, createVersion, assertAssetFileOwned, getAssetFileDownloadUrl,
    confirmTask, submitCover, submitCard, readTask, freezeCoverContext};
}

describe("T-1029 图文封面候选边界", () => {
  it("失败重试复制原冻结输入，不读取实时资料或规则", async () => {
    const f = await fixture("failed");
    f.selectRows.push([row("task-old")], [], [row("task-new")]);
    const result = await f.adapter.retryFrozen!(ctx, {candidateId: "task-old", clientRequestId: "retry-1"});
    expect(result.taskId).toBe("task-new");
    expect(f.freezeCoverContext).not.toHaveBeenCalled();
    expect(f.submitCover).toHaveBeenCalledWith(ctx, expect.objectContaining({
      projectId: "project-1", inputData: expect.objectContaining({coverContextSnapshot: snapshot}),
    }));
  });

  it("封面采纳验账号素材文件，并在稿件版本变化时阻止确认", async () => {
    const f = await fixture("awaiting_confirmation", "version-2");
    f.selectRows.push([row("task-old")]);
    await expect(f.adapter.adopt(ctx, {candidateId: "task-old", kind: "cover",
      expected: {owner: "graphic_post", versionId: "version-1"},
      editedValue: [{assetId: "asset-1", assetFileId: "file-1", order: 0, role: "cover"}],
      clientRequestId: "adopt-1"})).rejects.toMatchObject({code: "VERSION_CONFLICT"});
    expect(f.assertAssetFileOwned).toHaveBeenCalledWith(ctx, "asset-1", "file-1", false);
    expect(f.getAssetFileDownloadUrl).toHaveBeenCalledWith(ctx, "asset-1", "file-1");
    expect(f.confirmTask).not.toHaveBeenCalled();
    expect(f.createVersion).not.toHaveBeenCalled();
  });

  it("同账号真实文件通过确认门，再以旧版 CAS 写入正式封面", async () => {
    const f = await fixture("awaiting_confirmation");
    f.selectRows.push([row("task-old")]);
    const result = await f.adapter.adopt(ctx, {candidateId: "task-old", kind: "cover",
      expected: {owner: "graphic_post", versionId: "version-1"},
      editedValue: [{assetId: "asset-1", assetFileId: "file-1", order: 0, role: "cover"}],
      clientRequestId: "adopt-2"});
    expect(result.versionId).toBe("version-2");
    expect(f.confirmTask).toHaveBeenCalledWith(ctx, "task-old");
    expect(f.createVersion).toHaveBeenCalledWith(ctx, "output-1", expect.objectContaining({
      expectedCurrentVersionId: "version-1",
      document: expect.objectContaining({imageUses: [{assetId: "asset-1", assetFileId: "file-1", order: 0, role: "cover"}]}),
    }));
  });

  it("缺少当前账号的候选绑定时拒绝读取和采纳", async () => {
    const f = await fixture("awaiting_confirmation");
    f.selectRows.push([]);
    await expect(f.adapter.read(ctx, "task-old")).rejects.toMatchObject({code: "MEDIA_CANDIDATE_NOT_FOUND"});
    expect(f.readTask).not.toHaveBeenCalled();
  });

  it("图卡候选来自独立 graphic.card.generate，采纳时按作品顺序追加 role=card", async () => {
    const f = await fixture("awaiting_confirmation", "version-1", "image_card");
    f.selectRows.push([row("task-old", "image_card")]);
    const result = await f.adapter.adopt(ctx, {candidateId: "task-old", kind: "image_card",
      expected: {owner: "graphic_post", versionId: "version-1"},
      editedValue: [{assetId: "asset-1", assetFileId: "file-1", order: 0, role: "card"}],
      clientRequestId: "adopt-card-1"});
    expect(result.versionId).toBe("version-2");
    expect(f.createVersion).toHaveBeenCalledWith(ctx, "output-1", expect.objectContaining({
      document: expect.objectContaining({imageUses: [{assetId: "asset-1", assetFileId: "file-1", order: 0, role: "card"}]}),
    }));
  });

  it("图卡失败重试保留 cardContextSnapshot 且走独立图卡任务", async () => {
    const f = await fixture("failed", "version-1", "image_card");
    f.selectRows.push([row("task-old", "image_card")], [], [row("task-new", "image_card")]);
    const result = await f.adapter.retryFrozen!(ctx, {candidateId: "task-old", clientRequestId: "retry-card-1"});
    expect(result.taskId).toBe("task-new");
    expect(f.submitCard).toHaveBeenCalledWith(ctx, expect.objectContaining({
      inputData: expect.objectContaining({kind: "image_card", cardContextSnapshot: snapshot}),
    }));
    expect(f.submitCover).not.toHaveBeenCalled();
    expect(f.freezeCoverContext).not.toHaveBeenCalled();
  });
});


describe("不同图文结果依次采用", () => {
  it.each(["cover", "image_card"] as const)("%s 合并到已采纳标签和图片的当前稿", async (kind) => {
    const f = await fixture("awaiting_confirmation", "version-2", kind);
    const current = {...document, tags: ["新标签"], imageUses: [{assetId: "prior-image", assetFileId: "prior-file", order: 0, role: "card" as const}]};
    f.getGraphicPost.mockResolvedValue({...await f.getGraphicPost(), current} as never);
    f.getVersion.mockImplementation(async (_ctx, _output, version) => ({versionId: version,
      document: version === "version-1" ? document : current}) as never);
    f.selectRows.push([row("task-old", kind)]);
    await f.adapter.adopt(ctx, {candidateId: "task-old", kind, expected: {owner: "graphic_post", versionId: "version-2"},
      editedValue: [{assetId: "asset-1", assetFileId: "file-1", order: 0, role: kind === "cover" ? "cover" : "card"}], clientRequestId: `merge-${kind}`});
    const saved = f.createVersion.mock.calls[0]?.[2] as unknown as {document: typeof current};
    expect(saved.document.tags).toEqual(["新标签"]);
    expect(saved.document.body).toBe(document.body);
    expect(saved.document.imageUses.map(item => item.assetId)).toEqual(kind === "cover" ? ["asset-1", "prior-image"] : ["prior-image", "asset-1"]);
    expect(f.confirmTask).toHaveBeenCalledOnce();
  });
  it("当前正文已改，即使携带当前版本也拒绝确认图片", async () => {
    const f = await fixture("awaiting_confirmation", "version-2");
    f.getGraphicPost.mockResolvedValue({...await f.getGraphicPost(), current: {...document, body: "新正文"}} as never);
    f.getVersion.mockImplementation(async (_ctx, _output, version) => ({versionId: version,
      document: version === "version-1" ? document : {...document, body: "新正文"}}) as never);
    f.selectRows.push([row("task-old")]);
    await expect(f.adapter.adopt(ctx, {candidateId: "task-old", kind: "cover", expected: {owner: "graphic_post", versionId: "version-2"},
      editedValue: [{assetId: "asset-1", assetFileId: "file-1", order: 0, role: "cover"}], clientRequestId: "changed-text"})).rejects.toMatchObject({code: "VERSION_CONFLICT"});
    expect(f.confirmTask).not.toHaveBeenCalled();
  });
});

it('原生图任务结果未知时向工作台如实返回待核对，不伪装成正常运行或可重试失败',async()=>{
 const f=await fixture('running','version-1','image_card');
 f.readTask.mockResolvedValue({...task('task-old','running','image_card'),runtimeStatus:'unknown_result',errorCode:'CODEX_RPC_REJECTED'} as never);
 f.selectRows.push([row('task-old','image_card')]);
 const value=await f.adapter.read(ctx,'task-old');
 expect(value).toMatchObject({status:'running',value:null,errorCode:'MEDIA_RESULT_UNKNOWN'});
 expect(f.submitCard).not.toHaveBeenCalled();expect(f.confirmTask).not.toHaveBeenCalled();
});
