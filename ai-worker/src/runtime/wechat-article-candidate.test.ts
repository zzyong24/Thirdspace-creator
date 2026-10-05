import { describe, expect, it } from "vitest";
import { buildWechatArticleFacets, buildWechatArticlePrompt, validateWechatArticleCandidate, type WechatArticleMethodInput } from "./wechat-article-candidate";
import { WECHAT_ARTICLE_METHOD } from "../prompt/templates/wechat-article-draft";
import { resolveStructuredBusinessSchema } from "../execution/structured-business-schema";
import { getOfficialSkillBase } from "../prompt/registry";

const source = {kind:"project" as const,id:"project-1",versionId:"sha256:brief-1"};
const asset = {kind:"asset" as const,id:"asset-1",versionId:"asset-file-1"};
function input(): WechatArticleMethodInput {
  return {
    projectId:"project-1", outputId:"output-1", artifactId:"artifact-1", baseVersionId:"version-1",
    brief:"解释跨平台作品的数据如何回读；缺少真实发布结果时写明边界。",
    current:{schemaVersion:1,title:"",summary:"",sections:[],factItems:[],visualBriefs:[],imageUses:[]},
    sourceRefs:[source,asset],sourceMaterials:[{ref:source,label:"项目 Brief",text:"用户希望查看各平台作品数据"}],
    brandProfileVersionId:null,brandProfile:null,
  };
}
function proposal() {
  return {
    proposedTitle:"把作品数据带回自己的系统", proposedTitleSourceRefs:[source],
    proposedSummary:"讲清账号绑定、数据回读和授权边界。", proposedSummarySourceRefs:[source],
    proposedFactItems:[{id:"fact-1",text:"平台完整指标权限待确认",sourceRefs:[],reviewState:"needs_confirmation" as const}],
    proposedSections:[{op:"insert" as const,sectionId:"section-1",afterSectionId:null,order:0,heading:"读者遇到的问题",body:"不同平台的数据分散，难以一起查看。",sourceRefs:[source]}],
    proposedVisualBriefs:[{sectionId:"section-1",brief:"展示作品与账号的关系示意"}],sourceRefs:[source],
  };
}
describe("wechat article method", () => {
  it("作品互转的严格历史选区来源进入结构候选，改选区摘要不能冒充原来源",()=>{
    const ref={kind:"output_version" as const,sourceOutputId:"video",artifactId:"script",versionId:"saved",
      sourceType:"video" as const,selectionDigest:"a".repeat(64),selection:{mode:"whole" as const}};
    const raw=input();raw.sourceRefs=[ref];raw.sourceMaterials=[{ref,label:"保存视频脚本",text:"真实选区正文"}];
    expect(buildWechatArticleFacets(raw).articleContext).toContain('"sourceOutputId":"video"');
    const candidate={...proposal(),proposedTitleSourceRefs:[ref],proposedSummarySourceRefs:[ref],sourceRefs:[ref],
      proposedSections:proposal().proposedSections.map(s=>({...s,sourceRefs:[ref]}))};
    expect(validateWechatArticleCandidate(candidate,raw).sourceRefs).toEqual([ref]);
    expect(()=>validateWechatArticleCandidate({...candidate,sourceRefs:[{...ref,selectionDigest:"b".repeat(64)}]},raw)).toThrow("ARTICLE_SOURCE_REF_UNBOUND");
  });
  it("通用方法与账号品牌隔离：未显式选品牌不注入个人身份或路径", () => {
    const plain=buildWechatArticlePrompt(input());
    expect(plain.prompt).not.toContain("月明");
    expect(plain.prompt).not.toContain("works/YYYY");
    expect(plain.prompt).not.toContain("宇航员");
    const branded=input();
    branded.brandProfileVersionId="brand-v2";
    branded.brandProfile={profileId:"brand-1",versionId:"brand-v2",guidance:"使用月明水清深账号的绿色品牌语气"};
    expect(buildWechatArticlePrompt(branded).prompt).toContain("月明水清深账号的绿色品牌语气");
    expect(buildWechatArticleFacets(branded).articleContext).toContain('"brandProfileVersionId":"brand-v2"');
    expect(()=>buildWechatArticleFacets({...branded,brandProfileVersionId:"other"})).toThrow("ARTICLE_BRAND_SNAPSHOT_MISMATCH");
    expect(WECHAT_ARTICLE_METHOD.sourceLicense).toBe("not-declared");
  });
  it("空稿只允许真实 insert，来源与视觉段落必须在冻结范围", () => {
    expect(validateWechatArticleCandidate(proposal(),input())).toEqual(proposal());
    expect(()=>validateWechatArticleCandidate({...proposal(),proposedSections:[{...proposal().proposedSections[0],op:"replace"}]},input())).toThrow("ARTICLE_REPLACE_TARGET_INVALID");
    expect(()=>validateWechatArticleCandidate({...proposal(),sourceRefs:[{...asset,versionId:"invented"}]},input())).toThrow("ARTICLE_SOURCE_REF_UNBOUND");
    expect(()=>validateWechatArticleCandidate({...proposal(),proposedVisualBriefs:[{sectionId:"unknown",brief:"图"}]},input())).toThrow("ARTICLE_VISUAL_BRIEF_TARGET_INVALID");
  });
  it("已有段落允许替换与插入，但不能覆写其它段落或猜插入锚点", () => {
    const editing=input();
    editing.current.sections=[{sectionId:"existing",order:0,heading:"旧标题",body:"旧正文",sourceRefs:[source]}];
    const replace={...proposal(),proposedSections:[{op:"replace" as const,sectionId:"existing",afterSectionId:null,order:0,heading:"新标题",body:"新正文",sourceRefs:[source]}],proposedVisualBriefs:[]};
    expect(validateWechatArticleCandidate(replace,editing).proposedSections[0]?.op).toBe("replace");
    expect(()=>validateWechatArticleCandidate({...replace,proposedSections:[{...replace.proposedSections[0],op:"insert"}]},editing)).toThrow("ARTICLE_INSERT_TARGET_INVALID");
    expect(()=>validateWechatArticleCandidate({...proposal(),proposedSections:[{...proposal().proposedSections[0],afterSectionId:"missing"}]},editing)).toThrow("ARTICLE_INSERT_TARGET_INVALID");
  });
  it("Worker 固定业务 schema 在模型结果落账前拒绝越界引用", () => {
    expect(getOfficialSkillBase("wechat.article-draft")?.baseVersion).toBe(WECHAT_ARTICLE_METHOD.version);
    const facets=buildWechatArticleFacets(input());
    const schema=resolveStructuredBusinessSchema({kind:"model.structured",operationKey:"article-1",capability:"copy.generate",maxOutputTokens:4096,skillId:"wechat.article-draft",facets,skillSnapshot:{skills:[]}} as never);
    expect(schema?.safeParse(proposal()).success).toBe(true);
    expect(schema?.safeParse({...proposal(),proposedSections:[{...proposal().proposedSections[0],sourceRefs:[{...source,id:"other-project"}]}]}).success).toBe(false);
  });
  it("已保存文章的标题和摘要来源版本进入冻结输入，格式仍严格校验", () => {
    const saved=input();
    saved.current.title="已保存标题";
    saved.current.titleSourceRefs=[source];
    saved.current.summary="已保存摘要";
    saved.current.summarySourceRefs=[asset];
    const context=JSON.parse(buildWechatArticleFacets(saved).articleContext!);
    expect(context.current.titleSourceRefs).toEqual([source]);
    expect(context.current.summarySourceRefs).toEqual([asset]);
    expect(()=>buildWechatArticleFacets({...saved,current:{...saved.current,titleSourceRefs:[{...source,unknown:"extra"}]}})).toThrow();
  });
});

it("文章转换完整请求及事实约束进入冻结方法 facet",()=>{
 const value=input();
 const sourceAnchor={kind:"output_version" as const,sourceOutputId:"image",artifactId:"graphic",versionId:"v",sourceType:"image" as const,selectionDigest:"a".repeat(64),selection:{mode:"whole" as const}};
 const conversion={request:{sourceOutputId:"image",sourceVersionId:"v",targetType:"article" as const,mode:"whole" as const,clientRequestId:"conversion-worker",reuseImages:[]},sourceAnchor};
 const facets=buildWechatArticleFacets({...value,sourceRefs:[sourceAnchor],sourceMaterials:[{ref:sourceAnchor,label:"选定内容",text:"选定正文"}],
  conversion,conversionConstraints:{factItems:[{text:"待确认"}],sourceRefs:[],ruleSnapshotRef:null}});
 const frozen=JSON.parse(facets.articleContext!);
 expect(frozen.conversion).toEqual(conversion);expect(frozen.conversionConstraints.factItems).toEqual([{text:"待确认"}]);
});

it("标题局部转换允许空正文候选，未授权字段必须为空",()=>{
 const value=input(),selected={mode:"selected" as const,sourceSectionIds:[],sourceFields:["body" as const],textRanges:[]};
 const anchor={kind:"output_version" as const,sourceOutputId:"image",artifactId:"graphic",versionId:"v",sourceType:"image" as const,selectionDigest:"a".repeat(64),selection:selected};
 const converted={...value,conversion:{sourceAnchor:anchor,request:{sourceOutputId:"image",sourceVersionId:"v",targetType:"article" as const,...selected,targetFields:["title" as const],clientRequestId:"title-only-request",reuseImages:[]}},
  conversionConstraints:{factItems:[],sourceRefs:[],ruleSnapshotRef:null},sourceRefs:[anchor],sourceMaterials:[{ref:anchor,label:"正文",text:"来源"}]};
 const p={...proposal(),proposedTitleSourceRefs:[],proposedSummary:"",proposedSummarySourceRefs:[],proposedFactItems:[],proposedSections:[],proposedVisualBriefs:[],sourceRefs:[]};
 expect(validateWechatArticleCandidate(p,converted).proposedSections).toEqual([]);
 expect(()=>validateWechatArticleCandidate({...p,proposedSummary:"未授权摘要"},converted)).toThrow("ARTICLE_CONVERSION_FIELD_UNAUTHORIZED");
 expect(()=>validateWechatArticleCandidate(p,value)).toThrow();
});


it("T-1055 原结构模型按冻结 exact 图片目录选图并透传既有元数据",()=>{
 const image={assetId:"real-image",assetFileId:"real-file",name:"原始素材名",description:"实际描述"};
 const raw={...input(),imageLibrary:[image],current:{...input().current,title:"沿用标题",summary:"沿用简介",tags:["沿用标签"]}};
 const value={...proposal(),proposedTitle:"沿用标题",proposedSummary:"沿用简介",proposedVisualBriefs:[{sectionId:"section-1",brief:"匹配依据",proposedAssetId:image.assetId,proposedAssetFileId:image.assetFileId}]};
 expect(JSON.parse(buildWechatArticleFacets(raw).articleContext!).imageLibrary).toEqual([image]);
 expect(validateWechatArticleCandidate(value,raw).proposedVisualBriefs).toEqual(value.proposedVisualBriefs);
 expect(()=>validateWechatArticleCandidate({...value,proposedVisualBriefs:[{...value.proposedVisualBriefs[0],proposedAssetFileId:"other"}]},raw)).toThrow("ARTICLE_IMAGE_PAIR_UNBOUND");
 expect(validateWechatArticleCandidate({...value,proposedTitle:"另起标题"},raw).proposedTitle).toBe("沿用标题");
 expect(validateWechatArticleCandidate({...value,proposedVisualBriefs:[{sectionId:"section-1",brief:"没有匹配"}]},{...raw,imageLibrary:[]})).toBeTruthy();
});

describe("T-1055 review 原成功输入兼容",()=>{
 it.each(["changed","empty"] as const)("模型元数据 %s 时透传冻结人工字段及原引用，合法正文继续形成候选",mode=>{
  const saved=input(),oldTitleRef={...source,versionId:"原标题出处版本"},oldSummaryRef={...asset,versionId:"原简介出处版本"};
  saved.current={...saved.current,title:"人工标题",summary:"人工简介",titleSourceRefs:[oldTitleRef],summarySourceRefs:[oldSummaryRef],tags:["人工标签"]};
  const value={...proposal(),proposedTitle:mode==="empty"?"":"模型另起标题",proposedSummary:mode==="empty"?"":"模型另写简介",proposedTitleSourceRefs:[{...source,id:"无关的模型元数据出处"}],proposedSummarySourceRefs:[{...asset,id:"无关的模型元数据出处"}]};
  const candidate=validateWechatArticleCandidate(value,saved);
  expect(candidate).toMatchObject({proposedTitle:"人工标题",proposedSummary:"人工简介",proposedTitleSourceRefs:[oldTitleRef],proposedSummarySourceRefs:[oldSummaryRef],proposedSections:value.proposedSections,proposedFactItems:value.proposedFactItems});
  const schema=resolveStructuredBusinessSchema({kind:"model.structured",operationKey:"metadata-safe-body",capability:"copy.generate",maxOutputTokens:4096,skillId:"wechat.article-draft",facets:buildWechatArticleFacets(saved),skillSnapshot:{skills:[]}} as never);
  expect(schema?.safeParse(value)).toMatchObject({success:true,data:{proposedTitle:"人工标题",proposedSummary:"人工简介"}});
  expect(()=>validateWechatArticleCandidate({...value,proposedSections:[{...value.proposedSections[0]!,sourceRefs:[{...source,id:"越界正文出处"}]}]},saved)).toThrow("ARTICLE_SOURCE_REF_UNBOUND");
 });
 it("旧无图片目录的 assetId-only 视觉建议仍合法，新的目录任务必须 exact pair，孤 file 仍拒绝",()=>{
  const legacy={...proposal(),proposedVisualBriefs:[{sectionId:"section-1",brief:"旧建议",proposedAssetId:"legacy-image"}]};
  expect(validateWechatArticleCandidate(legacy,input()).proposedVisualBriefs).toEqual(legacy.proposedVisualBriefs);
  const schema=resolveStructuredBusinessSchema({kind:"model.structured",operationKey:"legacy-visual-hint",capability:"copy.generate",maxOutputTokens:4096,skillId:"wechat.article-draft",facets:buildWechatArticleFacets(input()),skillSnapshot:{skills:[]}} as never);
  expect(schema?.safeParse(legacy).success).toBe(true);
  const image={assetId:"legacy-image",assetFileId:"real-file",name:"图",description:"真实描述"};
  expect(()=>validateWechatArticleCandidate(legacy,{...input(),imageLibrary:[image]})).toThrow();
  expect(()=>validateWechatArticleCandidate(legacy,{...input(),imageLibrary:[]})).toThrow();
  const exact={...legacy,proposedVisualBriefs:[{...legacy.proposedVisualBriefs[0]!,proposedAssetFileId:image.assetFileId}]};
  expect(validateWechatArticleCandidate(exact,{...input(),imageLibrary:[image]}).proposedVisualBriefs).toEqual(exact.proposedVisualBriefs);
  expect(()=>validateWechatArticleCandidate(exact,input())).toThrow("ARTICLE_IMAGE_PAIR_UNBOUND");
  expect(()=>validateWechatArticleCandidate({...legacy,proposedVisualBriefs:[{sectionId:"section-1",brief:"只有文件",proposedAssetFileId:"file"}]},input())).toThrow();
 });
});
