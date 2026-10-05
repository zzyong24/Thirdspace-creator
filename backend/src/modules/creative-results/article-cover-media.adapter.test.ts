import {describe,expect,it,vi} from "vitest";
import type {RequestContext} from "@creatoros/contract";
import {createArticleCoverMediaAdapter,type ArticleCoverMediaPorts} from "./article-cover-media.adapter";

const ctx={userId:"user-1",accountId:"account-1",requestId:"request-1",source:"user"} as RequestContext;
const snapshot={positioningBrief:"",projectBriefHard:"",reviewScript:"文章内容",userMaterialHardBrief:"",
  userMaterialRefBrief:"",knowledgeBrief:"",orientationHint:"",topic:{title:"文章标题",angle:""}};
const document={schemaVersion:1 as const,title:"文章标题",summary:"摘要",
  sections:[{sectionId:"section-1",heading:"第一段",body:"第一段内容"},{sectionId:"section-2",heading:"第二段",body:"第二段内容"}],
  factItems:[],visualBriefs:[],imageUses:[],coverImageUse:null};
function fixture(currentVersionId="version-1",kind:"cover"|"image_card"="cover"){
  const rows:unknown[][]=[];
  const db={select:()=>({from:()=>({where:async()=>rows.shift()??[]})}),
    insert:()=>({values:()=>({onConflictDoNothing:async()=>undefined})})};
  const binding={id:"binding-1",userId:"user-1",accountId:"account-1",projectId:"project-1",outputId:"output-1",
    kind,taskId:"task-1",assetId:"asset-1",assetFileId:"file-1"};
  const task={id:"task-1",taskType:kind==="cover"?"cover.generate":"graphic.card.generate",status:"awaiting_confirmation",projectId:"project-1",
    contentOutputId:"output-1",inputData:{projectId:"project-1",contentOutputId:"output-1",outputId:"output-1",
      artifactId:"artifact-1",baseVersionId:"version-1",kind,
      ...(kind==="cover"?{coverContextSnapshot:snapshot}:{contentType:"article",targetSectionId:"section-2",cardContextSnapshot:snapshot})} as Record<string,unknown>};
  const article={projectId:"project-1",outputId:"output-1",artifactId:"artifact-1",currentVersionId,current:document,versions:[]};
  const createVersion=vi.fn(async(_ctx:RequestContext,_output:string,_input:unknown)=>({versionId:"version-2",document}));
  const confirmTask=vi.fn(async()=>undefined),assertAssetFileOwned=vi.fn(async()=>undefined);
  const ports={db,articles:{getArticle:vi.fn(async()=>article),getVersion:vi.fn(async()=>({versionId:"version-1",document})),createVersion},
    projects:{getProject:vi.fn()},assets:{getAsset:vi.fn(async()=>({status:"pending",currentFileId:"file-1"})),
      assertAssetFileOwned,getAssetFileDownloadUrl:vi.fn(async()=>({url:"signed",fileName:"cover.png"}))},
    readTask:vi.fn(async()=>task),listResults:vi.fn(async()=>[{resultType:"generated_asset",assetId:"asset-1",resultData:{assetId:"asset-1",assetType:"image"}}]),
    confirmTask,submitCover:vi.fn(async()=>({id:"task-1",status:"queued"})),submitCard:vi.fn(async()=>({id:"task-1",status:"queued"})),
    probeCover:vi.fn(async()=>({ready:true})),probeCard:vi.fn(async()=>({ready:true})),
    freezeCoverContext:vi.fn(async()=>snapshot),
  } as unknown as ArticleCoverMediaPorts;
  return {adapter:createArticleCoverMediaAdapter(ports),rows,binding,task,ports,createVersion,confirmTask,assertAssetFileOwned};
}
describe("T-1029 文章封面媒体采纳",()=>{
  it("封面候选的真实 Asset 经确认后写文章独立 coverImageUse",async()=>{
    const f=fixture();f.rows.push([f.binding]);
    const result=await f.adapter.adopt(ctx,{candidateId:"task-1",kind:"cover",expected:{owner:"wechat_article",versionId:"version-1"},
      editedValue:[{assetId:"asset-1",assetFileId:"file-1",order:0,role:"cover"}],clientRequestId:"adopt-article-cover"});
    expect(result.versionId).toBe("version-2");
    expect(f.assertAssetFileOwned).toHaveBeenCalledWith(ctx,"asset-1","file-1",false);
    expect(f.confirmTask).toHaveBeenCalledWith(ctx,"task-1");
    expect(f.createVersion).toHaveBeenCalledWith(ctx,"output-1",expect.objectContaining({
      expectedCurrentVersionId:"version-1",document:expect.objectContaining({coverImageUse:{assetId:"asset-1",assetFileId:"file-1",sourceKind:"generated",reviewState:"selected"}}),
    }));
  });
  it("文章版本变化时在 Asset 确认前拒绝采纳",async()=>{
    const f=fixture("version-2");f.rows.push([f.binding]);
    await expect(f.adapter.adopt(ctx,{candidateId:"task-1",kind:"cover",expected:{owner:"wechat_article",versionId:"version-1"},
      editedValue:[{assetId:"asset-1",assetFileId:"file-1",order:0,role:"cover"}],clientRequestId:"adopt-article-cover"}))
      .rejects.toMatchObject({code:"VERSION_CONFLICT"});
    expect(f.confirmTask).not.toHaveBeenCalled();
  });
  it("文章图卡运行能力以真实图卡模型探测",async()=>{
    const f=fixture("version-1","image_card");
    const result=await f.adapter.probe(ctx,{owner:"wechat_article",outputType:"article",platform:"wechatOfficialAccount",kind:"image_card"});
    expect(result).toMatchObject({state:"supported"});
    expect(f.ports.probeCard).toHaveBeenCalledWith(ctx);
  });
  it("图卡必须明确选中真实正文段落且冻结该段文字",async()=>{
    const f=fixture("version-1","image_card");
    await expect(f.adapter.enqueue(ctx,{outputId:"output-1",projectId:"project-1",targetPlatform:"wechatOfficialAccount",
      kind:"image_card",clientRequestId:"card-no-section"})).rejects.toMatchObject({code:"UNSUPPORTED_DELIVERABLE"});
    f.rows.push([], [f.binding]);
    f.ports.projects.getProject=vi.fn(async()=>({title:"项目标题"})) as never;
    await f.adapter.enqueue(ctx,{outputId:"output-1",projectId:"project-1",targetPlatform:"wechatOfficialAccount",
      kind:"image_card",targetSectionId:"section-2",clientRequestId:"card-section-2"});
    const frozen=vi.mocked(f.ports.submitCard).mock.calls[0]?.[1].inputData;
    expect(frozen).toMatchObject({contentType:"article",kind:"image_card",targetSectionId:"section-2",
      artifactId:"artifact-1",baseVersionId:"version-1",scriptSnapshot:{fullText:"文章标题\n\n第二段\n\n第二段内容"}});
    expect(frozen?.cardContextSnapshot).toEqual(snapshot);
  });
  it("图卡只写所选段落的真实图片并执行版本 CAS",async()=>{
    const f=fixture("version-1","image_card");f.rows.push([f.binding]);
    const result=await f.adapter.adopt(ctx,{candidateId:"task-1",kind:"image_card",expected:{owner:"wechat_article",versionId:"version-1"},
      editedValue:[{assetId:"asset-1",assetFileId:"file-1",order:0,role:"card"}],clientRequestId:"adopt-article-card"});
    expect(result.versionId).toBe("version-2");
    expect(f.createVersion).toHaveBeenCalledWith(ctx,"output-1",expect.objectContaining({expectedCurrentVersionId:"version-1",
      document:expect.objectContaining({imageUses:[{sectionId:"section-2",assetId:"asset-1",assetFileId:"file-1",
        sourceKind:"generated",reviewState:"selected"}]})}));
  });
  it("图卡跨版本、伪造段落和候选类型均拒绝采纳",async()=>{
    const stale=fixture("version-2","image_card");stale.rows.push([stale.binding]);
    await expect(stale.adapter.adopt(ctx,{candidateId:"task-1",kind:"image_card",expected:{owner:"wechat_article",versionId:"version-1"},
      editedValue:[{assetId:"asset-1",assetFileId:"file-1",order:0,role:"card"}],clientRequestId:"stale-card"}))
      .rejects.toMatchObject({code:"VERSION_CONFLICT"});
    expect(stale.confirmTask).not.toHaveBeenCalled();
    const wrongKind=fixture("version-1","image_card");wrongKind.rows.push([wrongKind.binding]);
    await expect(wrongKind.adapter.adopt(ctx,{candidateId:"task-1",kind:"cover",expected:{owner:"wechat_article",versionId:"version-1"},
      editedValue:[{assetId:"asset-1",assetFileId:"file-1",order:0,role:"card"}],clientRequestId:"wrong-kind"}))
      .rejects.toMatchObject({code:"MEDIA_BINDING_MISMATCH"});
    const missing=fixture("version-1","image_card");missing.task.inputData.targetSectionId="section-deleted";missing.rows.push([missing.binding]);
    await expect(missing.adapter.read(ctx,"task-1")).rejects.toMatchObject({code:"MEDIA_BINDING_MISMATCH"});
  });
  it("失败图卡重试只克隆原冻结内容和画面要求",async()=>{
    const f=fixture("version-2","image_card");f.task.status="failed";
    f.task.inputData.visualRequirements="蓝色插画";
    f.rows.push([f.binding],[],[f.binding]);
    const result=await f.adapter.retryFrozen?.(ctx,{candidateId:"task-1",clientRequestId:"retry-card"});
    expect(result).toMatchObject({candidateId:"task-1",status:"failed",appliedRules:"applied"});
    expect(f.ports.submitCard).toHaveBeenCalledWith(ctx,expect.objectContaining({
      inputData:expect.objectContaining({baseVersionId:"version-1",targetSectionId:"section-2",visualRequirements:"蓝色插画"})}));
    expect(f.ports.articles.getArticle).toHaveBeenCalledTimes(2);
    expect(f.ports.freezeCoverContext).not.toHaveBeenCalled();
  });
  it("别的账号无法读取文章图卡候选",async()=>{
    const f=fixture("version-1","image_card");
    await expect(f.adapter.read({...ctx,accountId:"account-2"},"task-1"))
      .rejects.toMatchObject({code:"MEDIA_CANDIDATE_NOT_FOUND"});
  });
});


describe("文章媒体单项依次采纳", () => {
  it.each(["cover", "image_card"] as const)("%s 保留已采用的其他段落图片", async (kind) => {
    const f = fixture("version-2", kind);
    const current = {...document, imageUses: [{sectionId: "section-1", assetId: "old-image", assetFileId: "old-file", sourceKind: "generated" as const, reviewState: "selected" as const}]};
    vi.mocked(f.ports.articles.getArticle).mockResolvedValue({...await f.ports.articles.getArticle(ctx,"output-1"), current} as never);
    vi.mocked(f.ports.articles.getVersion).mockImplementation(async (_ctx,_output,version) => ({versionId: version, document: version === "version-1" ? document : current}) as never);
    f.rows.push([f.binding]);
    await f.adapter.adopt(ctx,{candidateId:"task-1",kind,expected:{owner:"wechat_article",versionId:"version-2"},
      editedValue:[{assetId:"asset-1",assetFileId:"file-1",order:0,role:kind === "cover" ? "cover" : "card"}],clientRequestId:`merge-${kind}`});
    const saved=f.createVersion.mock.calls[0]?.[2] as unknown as {document:typeof current};
    expect(saved.document.imageUses[0]).toMatchObject({sectionId:"section-1",assetId:"old-image"});
    expect(saved.document.title).toBe(document.title);
    if(kind === "image_card") expect(saved.document.imageUses[1]).toMatchObject({sectionId:"section-2",assetId:"asset-1"});
    expect(f.confirmTask).toHaveBeenCalledOnce();
  });
  it("目标段落正文变化或删除时不确认图片",async()=>{
    for(const remove of [false,true]) {
      const f=fixture("version-2","image_card");
      const current={...document,sections:remove?document.sections.slice(0,1):document.sections.map(section=>section.sectionId==="section-2"?{...section,body:"被修改"}:section)};
      vi.mocked(f.ports.articles.getArticle).mockResolvedValue({...await f.ports.articles.getArticle(ctx,"output-1"),current} as never);
      vi.mocked(f.ports.articles.getVersion).mockImplementation(async(_ctx,_output,version)=>({versionId:version,document:version==="version-1"?document:current}) as never);
      f.rows.push([f.binding]);
      await expect(f.adapter.adopt(ctx,{candidateId:"task-1",kind:"image_card",expected:{owner:"wechat_article",versionId:"version-2"},
        editedValue:[{assetId:"asset-1",assetFileId:"file-1",order:0,role:"card"}],clientRequestId:"changed-section"})).rejects.toMatchObject({code:"VERSION_CONFLICT"});
      expect(f.confirmTask).not.toHaveBeenCalled();
    }
  });
});
