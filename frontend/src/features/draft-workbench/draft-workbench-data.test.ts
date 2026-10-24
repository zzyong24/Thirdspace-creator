import { describe, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/contract-client.server", () => ({ client: {} }));
import { readAmmo, buildDraftWorkbenchStream, type DraftWorkbenchClient } from "./draft-workbench-data";

it('发布读取失败保留正文，并明确返回局部错误，不能伪装成没有发布作品',async()=>{
  const project={id:'p',title:'项目',brief:'',currentStage:'script' as const};
  const c={listArtifacts:vi.fn().mockResolvedValue([]),listOutputs:vi.fn().mockRejectedValue(Error('offline')),listMaterialLinks:vi.fn().mockResolvedValue([]),getProjectPreparation:vi.fn().mockResolvedValue(null)} as unknown as DraftWorkbenchClient;
  const {vm,deferred}=await buildDraftWorkbenchStream('p',c,project);
  expect(vm.project.id).toBe('p');
  expect((await deferred.publication).publicationReadError).toContain('暂时无法读取');
});

it('版本、预测和审核故障分别保留局部错误，不冒充空结果；404审核仍为未审',async()=>{
  const project={id:'p',title:'项目',brief:'',currentStage:'script' as const};
  const c={listArtifacts:vi.fn().mockResolvedValue([]),listOutputs:vi.fn().mockResolvedValue([{id:'v',contentType:'video'}]),listPublications:vi.fn().mockResolvedValue([{id:'pub',currentRevisionId:'rev'}]),listPublicationRevisions:vi.fn().mockRejectedValue(Error('offline')),listPredictions:vi.fn().mockRejectedValue(Error('offline')),getLatestScriptReview:vi.fn().mockRejectedValue(Error('offline')),listMaterialLinks:vi.fn().mockResolvedValue([]),getProjectPreparation:vi.fn().mockResolvedValue(null)} as unknown as DraftWorkbenchClient;
  const first=await buildDraftWorkbenchStream('p',c,project);
  expect((await first.deferred.publication).publicationReadError).toContain('暂时无法读取');
  expect((await first.deferred.review).scriptReviewReadError).toContain('暂时无法读取');
  vi.mocked(c.listPublicationRevisions).mockResolvedValue([]);
  vi.mocked(c.getLatestScriptReview!).mockRejectedValue(Object.assign(Error('未审'),{status:404}));
  const second=await buildDraftWorkbenchStream('p',c,project);
  expect((await second.deferred.publication).predictionReadError).toContain('暂时无法读取');
  expect((await second.deferred.review).scriptReviewReadError).toBeNull();
});

it('素材与发布读取未结束时脚本核心已返回，补齐后保留全部资料',async()=>{
  let finish!:(rows:unknown[])=>void;
  const slow=new Promise<unknown[]>(resolve=>{finish=resolve;});
  const project={id:'p',title:'项目',brief:'原资料',currentStage:'script' as const,source:'manual'};
  const c={getProject:vi.fn().mockResolvedValue(project),listArtifacts:vi.fn().mockResolvedValue([]),getArtifact:vi.fn(),listArtifactVersions:vi.fn(),getProjectPreparation:vi.fn().mockResolvedValue(null),listOutputs:vi.fn().mockResolvedValue([{id:'v',contentType:'video'}]),listPublications:vi.fn().mockReturnValue(slow),listMaterialLinks:vi.fn().mockReturnValue(slow),getKnowledge:vi.fn().mockResolvedValue({id:'k',title:'后到的资料'}),getAsset:vi.fn(),getLatestScriptReview:vi.fn().mockResolvedValue(null)} as unknown as DraftWorkbenchClient;
  const streaming=await buildDraftWorkbenchStream('p',c,project);
  expect(streaming.vm.project.title).toBe('项目');expect(streaming.vm.script.sections).toEqual([]);
  expect(c.getProject).not.toHaveBeenCalled();expect(c.listOutputs).toHaveBeenCalledOnce();
  let materialReady=false;void streaming.deferred.materials.then(()=>{materialReady=true;});await Promise.resolve();expect(materialReady).toBe(false);
  finish([{id:'link',entityType:'knowledge',entityId:'k'}]);
  expect((await streaming.deferred.materials).ammo[0]?.title).toBe('后到的资料');
});
describe("稿面完整资料引用", () => {
  it("超过100条分页保留第101条和原先12条之外的知识", async () => {
    const listMaterialLinks = vi.fn().mockImplementation((input) =>
      Promise.resolve(
        input.query.page === 1
          ? Array.from({ length: 100 }, (_, n) => ({
              id: `link-${n}`,
              entityId: `knowledge-${n}`,
              entityType: "knowledge",
            }))
          : [
              {
                id: "link-100",
                entityId: "knowledge-100",
                entityType: "knowledge",
              },
            ],
      ),
    );
    const c = {
      listMaterialLinks,
      getKnowledge: vi.fn().mockImplementation((input) =>
        Promise.resolve({
          id: input.params.knowledgeId,
          title: input.params.knowledgeId,
        }),
      ),
    } as unknown as DraftWorkbenchClient;
    const result = await readAmmo(c, "project-1");
    expect(result).toHaveLength(101);
    expect(result[100]?.id).toBe("knowledge-100");
    expect(listMaterialLinks).toHaveBeenCalledTimes(2);
  });
  it("实体局部读失败保留成功资料并给出可重试错误，不伪装空库", async () => {
    const warn = vi.fn();
    const c = {
      listMaterialLinks: vi.fn().mockResolvedValue([
        { id: "link-a", entityId: "a", entityType: "knowledge" },
        { id: "link-b", entityId: "b", entityType: "knowledge" },
      ]),
      getKnowledge: vi
        .fn()
        .mockImplementation((input) =>
          input.params.knowledgeId === "a"
            ? Promise.resolve({ id: "a", title: "已读资料" })
            : Promise.reject(Error("network unavailable")),
        ),
    } as unknown as DraftWorkbenchClient;
    expect(await readAmmo(c, "project-1", warn)).toHaveLength(1);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("1份项目资料暂时无法读取"),
    );
    await expect(
      readAmmo(
        {
          listMaterialLinks: vi.fn().mockRejectedValue(Error("offline")),
        } as unknown as DraftWorkbenchClient,
        "project-1",
        warn,
      ),
    ).rejects.toThrow("项目资料读取失败");
  });
});
