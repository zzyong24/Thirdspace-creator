import {describe, expect, it, vi} from "vitest";
import type {RequestContext} from "@creatoros/contract";
import {createGraphicCardBusinessAdapters, createGraphicPostBusinessAdapters, createWechatArticleTextBusinessAdapters} from "./creative-post";

const ctx={userId:"user-1",accountId:"account-1",requestId:"request-1",source:"user"} as RequestContext;
const document={title:"文章标题",sections:[{sectionId:"section-1",heading:"段落一",body:"内容一"},
  {sectionId:"section-2",heading:"段落二",body:"内容二"}]};
const fullText="文章标题\n\n段落二\n\n内容二";
const context={positioningBrief:"",projectBriefHard:"",reviewScript:fullText,userMaterialHardBrief:"",
  userMaterialRefBrief:"",knowledgeBrief:"",orientationHint:"",topic:{title:"文章标题",angle:""}};

function fixture(){
  const articlesService={getArticle:vi.fn(async()=>({projectId:"project-1",outputId:"output-1",artifactId:"artifact-1",
    currentVersionId:"version-2",current:document,versions:[]})),
    getVersion:vi.fn(async()=>({versionId:"version-1",document}))};
  const graphicPostsService={getGraphicPost:vi.fn(),getVersion:vi.fn()};
  const adapter=createGraphicCardBusinessAdapters({articlesService,graphicPostsService} as never)["graphic.card.generate"];
  const task={projectId:"project-1",inputData:{projectId:"project-1",outputId:"output-1",contentOutputId:"output-1",
    contentType:"article",artifactId:"artifact-1",baseVersionId:"version-1",targetPlatform:"wechatOfficialAccount",
    kind:"image_card",targetSectionId:"section-2",cardContextSnapshot:context,
    scriptSnapshot:{artifactId:"artifact-1",versionId:"version-1",fullText}}};
  return {adapter,task,articlesService,graphicPostsService};
}

describe("公众号指定正文段落图卡执行",()=>{
  it("从旧版指定段落生成，即使文章已另存新版",async()=>{
    const f=fixture();
    const facets=await f.adapter.prepare(ctx,f.task as never);
    expect(JSON.parse(facets.graphicCardContext)).toMatchObject({targetSectionId:"section-2",context:{reviewScript:fullText}});
    expect(f.articlesService.getVersion).toHaveBeenCalledWith(ctx,"output-1","version-1");
    expect(f.graphicPostsService.getGraphicPost).not.toHaveBeenCalled();
  });
  it("拒绝不存在的段落和被改写的冻结正文",async()=>{
    const f=fixture();
    await expect(f.adapter.prepare(ctx,{...f.task,inputData:{...f.task.inputData,targetSectionId:"missing"}} as never))
      .rejects.toThrow("ARTICLE_CARD_GENERATION_BASE_MISMATCH");
    await expect(f.adapter.prepare(ctx,{...f.task,inputData:{...f.task.inputData,
      scriptSnapshot:{...f.task.inputData.scriptSnapshot,fullText:"伪造内容"}}} as never))
      .rejects.toThrow("ARTICLE_CARD_GENERATION_BASE_MISMATCH");
  });
});


function reorderJsonKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(reorderJsonKeys);
  if (value && typeof value === "object") return Object.fromEntries(
    Object.entries(value).reverse().map(([key, item]) => [key, reorderJsonKeys(item)]));
  return value;
}

describe("数据库 JSONB 读回后的不可变稿件校验", () => {
  for (const kind of ["graphic", "article"] as const) {
    const current = kind === "graphic"
      ? {schemaVersion: 1, title: "三个平台", body: "先交付结果", summary: "", tags: ["创作", "运营"],
          imageUses: [], sourceRefs: [], ruleSnapshotRef: null}
      : {schemaVersion: 1, title: "三个平台", summary: "摘要", sections: [], factItems: [], visualBriefs: [], imageUses: []};
    const inputData = {projectId: "project-1", outputId: "output-1", artifactId: "artifact-1", baseVersionId: "version-1",
      kind: "summary", targetPlatform: kind === "graphic" ? "xiaohongshu" : "wechatOfficialAccount",
      brief: "一个人做三个平台", current, sourceRefs: [], sourceMaterials: [], ruleSnapshotRef: null,
      ruleGuidance: "", ruleOverrides: {}};
    function adapterFor(document: unknown, versionId = "version-1") {
      const service = {getVersion: vi.fn(async () => ({versionId, document}))};
      if (kind === "graphic") return createGraphicPostBusinessAdapters({graphicPostsService: {...service,
        getGraphicPost: vi.fn(async () => ({projectId: "project-1", artifactId: "artifact-1", targetPlatform: "xiaohongshu"}))}} as never)["graphic.post-text"];
      return createWechatArticleTextBusinessAdapters({articlesService: {...service,
        getArticle: vi.fn(async () => ({projectId: "project-1", artifactId: "artifact-1"}))}} as never)["wechat.article-text"];
    }
    it(`${kind} 相同内容的字段顺序变化仍可生成`, async () => {
      const adapter = adapterFor(reorderJsonKeys(current));
      await expect(adapter.prepare(ctx, {projectId: "project-1", inputData} as never)).resolves.toBeDefined();
    });
    it(`${kind} 仍拒绝正文或版本被替换`, async () => {
      const message = kind === "graphic" ? "GRAPHIC_POST_GENERATION_BASE_MISMATCH" : "ARTICLE_TEXT_GENERATION_BASE_MISMATCH";
      await expect(adapterFor({...current, title: "被改写"}).prepare(ctx, {projectId: "project-1", inputData} as never)).rejects.toThrow(message);
      await expect(adapterFor(current, "version-other").prepare(ctx, {projectId: "project-1", inputData} as never)).rejects.toThrow(message);
      if (kind === "graphic") await expect(adapterFor({...current, tags: ["运营", "创作"]}).prepare(ctx,
        {projectId: "project-1", inputData} as never)).rejects.toThrow(message);
    });
  }
});
