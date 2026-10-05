import {createHash} from "node:crypto";
import {expect,it} from "vitest";
import {createDb,type Db} from "@creatoros/backend";
import type {RequestContext} from "@creatoros/contract";
import {createProjectsService,createProjectRepository} from "../projects";
import {createArtifactsService} from "../artifacts";
import {createArticlesService} from "../articles";
import {createGraphicPostsService} from "../graphic-posts";
import {createOutputScriptsService} from "../output-scripts";
import {createConversionSourceService} from "./conversion-source.service";

const ctx=(accountId="a"):RequestContext=>({userId:"conversion-source",accountId,requestId:"read",source:"user"});
const hash=(text:string)=>createHash("sha256").update(text).digest("hex");
async function fixture(){
 const opened=await createDb();let seq=0;
 const deps={now:()=>"2026-10-02T00:00:00.000Z",nextId:(prefix:string)=>`${prefix}-${++seq}`};
 const projectsFor=(db:Db)=>createProjectsService(createProjectRepository(db),deps);
 const projects=projectsFor(opened.db);
 const artifactsFor=(db:Db)=>createArtifactsService({db,...deps,assertProjectOwned:(c,id)=>projectsFor(db).getProject(c,id),
  resolveOutputProjectId:async(c,id)=>(await projectsFor(db).getOutput(c,id)).projectId});
 const artifacts=artifactsFor(opened.db);
 let source:ReturnType<typeof createConversionSourceService>;
 const assertOutputVersionSource=(c:RequestContext,ref:Parameters<typeof source.assertReference>[1],projectId:string)=>source.assertReference(c,ref,projectId);
 const articles=createArticlesService(opened.db,{...deps,projects:projectsFor,artifacts:artifactsFor,assertAssetFile:async()=>{},assertOutputVersionSource,
  resolveDocumentSource:async()=>null,resolveSelectedBrand:async()=>null,
  submitGeneration:async()=>{throw Error("不提交模型");},readGeneration:async()=>{throw Error("不借任务候选");}});
 const graphicPosts=createGraphicPostsService(opened.db,{...deps,projects:projectsFor,artifacts:artifactsFor,assertAssetFile:async()=>{},assertOutputVersionSource,
  assertRuleSnapshotRef:async(c,id)=>{if(c.accountId!=="a" || !["rule-old","rule-new"].includes(id))throw Error("规则不属于账号");}});
 const outputScripts=createOutputScriptsService({projects,artifacts,submitScriptDraft:async()=>{throw Error("不提交模型");},readTask:async()=>{throw Error("不借任务候选");}});
 source=createConversionSourceService({projects,articles,graphicPosts,outputScripts});
 const project=await projects.createProject(ctx(),{title:"具体稿面互转"});
 const article=await articles.createOutput(ctx(),project.id,{title:"文章",clientRequestId:"source-article"});
 const articleInitial=await articles.getArticle(ctx(),article.id);
 const articleVersion=await articles.createVersion(ctx(),article.id,{expectedCurrentVersionId:articleInitial.currentVersionId,
  clientRequestId:"source-article-version",document:{...articleInitial.current,title:"文章标题",summary:"未选的摘要",
   sections:[{sectionId:"s-a",order:0,heading:"一",body:"选定的段落",sourceRefs:[]},
    {sectionId:"s-b",order:1,heading:"二",body:"未选正文不得入模",sourceRefs:[]}],
   factItems:[{id:"fact-a",text:"数量尚待确认",reviewState:"needs_confirmation",sourceRefs:[]}]}});
 const image=await graphicPosts.createOutput(ctx(),project.id,{title:"图文",clientRequestId:"source-image"});
 const imageInitial=await graphicPosts.getGraphicPost(ctx(),image.id);
 const imageVersion=await graphicPosts.createVersion(ctx(),image.id,{expectedCurrentVersionId:imageInitial.currentVersionId,
  clientRequestId:"source-image-version",document:{...imageInitial.current,title:"图文标题",body:"甲😀乙尾部",summary:"未选摘要",
   cardBriefs:[{cardId:"card-a",title:"整稿图卡",body:"图卡正文",sourceRefs:[]}],ruleSnapshotRef:{versionId:"rule-old"}}});
 const video=await projects.createOutput(ctx(),project.id,{title:"视频",contentType:"video"});
 const script=await artifacts.createArtifact(ctx(),{projectId:project.id,contentOutputId:video.id,artifactType:"output_script",
  stage:"script",title:"保存脚本",initialContentText:"第一镜\n第二镜",initialContentData:{sections:[
   {id:"script-saved-0",heading:"第一镜",body:"第一镜口播"},{id:"script-saved-1",heading:"第二镜",body:"第二镜未选"}]}});
 const req=<T extends "article"|"image"|"video">(id:string,versionId:string,targetType:T)=>({sourceOutputId:id,sourceVersionId:versionId,
  targetType,clientRequestId:"conversion-source-request",reuseImages:[],mode:"whole" as const});
 return {opened,projects,artifacts,articles,graphicPosts,outputScripts,source,project,article,articleVersion,image,imageVersion,video,script,req};
}

it("正式图文与文章保存核验真实历史作品引用；坏摘要和跨项目不能落稿",async()=>{
 const f=await fixture();try{
  const ref=(await f.source.freeze(ctx(),f.req(f.article.id,f.articleVersion.versionId,"image"))).sourceAnchor;
  const saved=await f.graphicPosts.createVersion(ctx(),f.image.id,{expectedCurrentVersionId:f.imageVersion.versionId,
   clientRequestId:"save-output-provenance",document:{...f.imageVersion.document,sourceRefs:[ref],
    cardBriefs:[{cardId:"card-a",title:"有真实来源",body:"图卡",sourceRefs:[ref]}]}});
  expect((await f.graphicPosts.getVersion(ctx(),f.image.id,saved.versionId)).document.sourceRefs).toEqual([ref]);
  const videoRef=(await f.source.freeze(ctx(),f.req(f.video.id,f.script.currentVersionId!,"article"))).sourceAnchor;
  const articleSaved=await f.articles.createVersion(ctx(),f.article.id,{expectedCurrentVersionId:f.articleVersion.versionId,
   clientRequestId:"article-output-provenance",document:{...f.articleVersion.document,titleSourceRefs:[videoRef]}});
  expect((await f.articles.getVersion(ctx(),f.article.id,articleSaved.versionId)).document.titleSourceRefs).toEqual([videoRef]);
  await expect(f.graphicPosts.createVersion(ctx(),f.image.id,{expectedCurrentVersionId:saved.versionId,
   clientRequestId:"tampered-output-provenance",document:{...saved.document,sourceRefs:[{...ref,selectionDigest:"b".repeat(64)}]}})).rejects.toThrow();
  const other=await f.projects.createProject(ctx(),{title:"另一主题"});
  await expect(f.source.assertReference(ctx(),ref,other.id)).rejects.toMatchObject({code:"SOURCE_ANCHOR_CONFLICT"});
  await expect(f.source.assertReference(ctx("b"),ref,f.project.id)).rejects.toThrow();
 }finally{await f.opened.client.close();}
},20_000);

it("六个互转方向的来源均来自具体保存 owner；只冻结来源，不产生作品或模型任务",async()=>{
 const f=await fixture();try{
  for(const [outputId,versionId,type] of [[f.article.id,f.articleVersion.versionId,"article"],
   [f.image.id,f.imageVersion.versionId,"image"],[f.video.id,f.script.currentVersionId!,"video"]] as const){
   for(const target of ["article","image","video"] as const){
    if(type===target)continue;
    const frozen=await f.source.freeze(ctx(),f.req(outputId,versionId,target));
    expect(frozen.sourceAnchor).toMatchObject({kind:"output_version",sourceOutputId:outputId,versionId,sourceType:type});
    expect(frozen.projectId).toBe(f.project.id);
    expect(frozen.sourceAnchor.selectionDigest).toMatch(/^[a-f0-9]{64}$/);
    await expect(f.source.freeze(ctx("b"),f.req(outputId,versionId,target))).rejects.toThrow();
   }
   await expect(f.source.freeze(ctx(),f.req(outputId,versionId,type))).rejects.toMatchObject({code:"UNSUPPORTED_CONVERSION"});
  }
  expect((await f.projects.listOutputIdsByProject(ctx(),f.project.id)).length).toBe(3);
 }finally{await f.opened.client.close();}
},20_000);

it("互不相邻范围不夹带正文；规范化选区身份稳定，返回快照不能修改保存稿",async()=>{
 const f=await fixture();try{
  const request={...f.req(f.image.id,f.imageVersion.versionId,"article"),mode:"selected" as const,
   sourceSectionIds:[],sourceFields:[],targetFields:["sections" as const],textRanges:[
    {field:"body" as const,start:4,end:6,textDigest:hash("甲😀乙尾部")},
    {field:"body" as const,start:0,end:1,textDigest:hash("甲😀乙尾部")}]};
  const snapshot=await f.source.freeze(ctx(),request);
  expect(snapshot.content).toEqual({fields:{body:["甲","尾部"]},sections:[]});
  expect((await f.source.freeze(ctx(),{...request,textRanges:[...request.textRanges].reverse()})).sourceAnchor.selectionDigest)
   .toBe(snapshot.sourceAnchor.selectionDigest);
  snapshot.content.fields.body="试图修改保存稿";
  expect((await f.graphicPosts.getGraphicPost(ctx(),f.image.id)).current.body).toBe("甲😀乙尾部");
  const selectedTitle={...request,sourceFields:["title" as const],textRanges:[]};
  expect((await f.source.freeze(ctx(),selectedTitle)).content).toEqual({fields:{title:"图文标题"},sections:[]});
  await expect(f.source.freeze(ctx(),{...selectedTitle,sourceFields:["script"]})).rejects.toMatchObject({code:"SOURCE_SELECTION_INVALID"});
  const blank=await f.graphicPosts.createVersion(ctx(),f.image.id,{expectedCurrentVersionId:f.imageVersion.versionId,
   clientRequestId:"source-blank-cards",document:{...f.imageVersion.document,body:"",cardBriefs:[{cardId:"blank",title:"",body:"",sourceRefs:[]}]}});
  await expect(f.source.freeze(ctx(),f.req(f.image.id,blank.versionId,"article"))).rejects.toMatchObject({code:"SOURCE_TEXT_REQUIRED"});
 }finally{await f.opened.client.close();}
},20_000);

it("正式结构脚本的正文可独立保存，不依赖重复的 contentText 才能 whole 转换",async()=>{
 const f=await fixture();try{
  const saved=await f.artifacts.createVersion(ctx(),f.script.id,{expectedCurrentVersionId:f.script.currentVersionId!,
   contentText:"",contentData:{sections:[{id:"formal-section",heading:"镜头",body:"真实保存的口播"}]}});
  expect((await f.source.freeze(ctx(),f.req(f.video.id,saved.id,"article"))).content.sections).toEqual([
   {sectionId:"formal-section",heading:"镜头",body:"真实保存的口播",sourceRefs:[]}]);
 }finally{await f.opened.client.close();}
},20_000);

it("重试通过 owner 恢复冻结历史选区，原稿后改不换来源；伪造锚点/请求和跨账号拒绝",async()=>{
 const f=await fixture();try{
  const request={...f.req(f.image.id,f.imageVersion.versionId,"video"),mode:"selected" as const,sourceSectionIds:[],
   sourceFields:[],textRanges:[{field:"body" as const,start:1,end:3,textDigest:hash("甲😀乙尾部")}],targetFields:["script" as const]};
  const frozen=await f.source.freeze(ctx(),request);
  await f.graphicPosts.createVersion(ctx(),f.image.id,{expectedCurrentVersionId:f.imageVersion.versionId,
   clientRequestId:"source-change-after-freeze",document:{...f.imageVersion.document,body:"之后改成另一稿",ruleSnapshotRef:{versionId:"rule-new"}}});
  await expect(f.source.freeze(ctx(),request)).rejects.toMatchObject({code:"SOURCE_VERSION_CONFLICT"});
  expect(await f.source.restore(ctx(),request,frozen.sourceAnchor)).toEqual(frozen);
  expect((await f.source.restore(ctx(),request,frozen.sourceAnchor)).constraints.ruleSnapshotRef).toEqual({versionId:"rule-old"});
  await expect(f.source.restore(ctx("b"),request,frozen.sourceAnchor)).rejects.toThrow();
  await expect(f.source.restore(ctx(),request,{...frozen.sourceAnchor,artifactId:"another-artifact"})).rejects.toMatchObject({code:"SOURCE_ANCHOR_CONFLICT"});
  await expect(f.source.restore(ctx(),{...request,textRanges:[{...request.textRanges[0]!,start:0,end:1}]},frozen.sourceAnchor))
   .rejects.toMatchObject({code:"SOURCE_ANCHOR_CONFLICT"});
  await expect(f.source.restore(ctx(),request,{...frozen.sourceAnchor,selectionDigest:"b".repeat(64)}))
   .rejects.toMatchObject({code:"SOURCE_ANCHOR_CONFLICT"});
  await expect(f.source.restore(ctx(),{...request,sourceVersionId:"missing-history"},
   {...frozen.sourceAnchor,versionId:"missing-history"})).rejects.toThrow();
  for(const [outputId,versionId] of [[f.article.id,f.articleVersion.versionId],[f.video.id,f.script.currentVersionId!]]){
   const whole=f.req(outputId!,versionId!,"image"),snapshot=await f.source.freeze(ctx(),whole);
   if(outputId===f.article.id)await f.articles.createVersion(ctx(),outputId,{expectedCurrentVersionId:versionId!,
    clientRequestId:"article-post-freeze-change",document:{...f.articleVersion.document,title:"后来标题"}});
   else await f.artifacts.createVersion(ctx(),f.script.id,{expectedCurrentVersionId:versionId!,contentText:"后来脚本",contentData:{}});
   expect(await f.source.restore(ctx(),whole,snapshot.sourceAnchor)).toEqual(snapshot);
   await expect(f.source.restore(ctx("b"),whole,snapshot.sourceAnchor)).rejects.toThrow();
  }
 }finally{await f.opened.client.close();}
},20_000);

it("局部来源只含真实选段/字段，顺序按保存稿；纯文本范围核验全文摘要和代理对",async()=>{
 const f=await fixture();try{
  const base=f.req(f.article.id,f.articleVersion.versionId,"image");
  const selected={...base,mode:"selected" as const,sourceSectionIds:["s-a"],sourceFields:[],textRanges:[],targetFields:["body" as const]};
  const frozen=await f.source.freeze(ctx(),selected);
  expect(frozen.content).toEqual({fields:{},sections:[{sectionId:"s-a",heading:"一",body:"选定的段落",sourceRefs:[]}]});
  expect(JSON.stringify(frozen.content)).not.toContain("未选");
  expect(frozen.constraints.factItems).toHaveLength(1);
  const reverseSections=await f.source.freeze(ctx(),{...selected,sourceSectionIds:["s-b","s-a"]});
  expect(reverseSections.content.sections.map(s=>s.sectionId)).toEqual(["s-a","s-b"]);
  expect((await f.source.freeze(ctx(),{...selected,sourceSectionIds:["s-a","s-b"]})).sourceAnchor.selectionDigest)
   .toBe(reverseSections.sourceAnchor.selectionDigest);
  await expect(f.source.freeze(ctx(),{...selected,sourceSectionIds:["missing"]})).rejects.toMatchObject({code:"SOURCE_SELECTION_INVALID"});
  await expect(f.source.freeze(ctx(),{...selected,sourceFields:["body"]})).rejects.toMatchObject({code:"SOURCE_SELECTION_INVALID"});
  const imageReq={...f.req(f.image.id,f.imageVersion.versionId,"video"),mode:"selected" as const,sourceSectionIds:[],sourceFields:[],
   targetFields:["script" as const],textRanges:[{field:"body" as const,start:1,end:3,textDigest:hash("甲😀乙尾部")}]};
  expect((await f.source.freeze(ctx(),imageReq)).content).toEqual({fields:{body:"😀"},sections:[]});
  for(const range of [{start:2,end:3},{start:1,end:2},{start:1,end:99},{start:1,end:3,textDigest:hash("伪正文")}]){
   await expect(f.source.freeze(ctx(),{...imageReq,textRanges:[{...imageReq.textRanges[0]!,...range}]})).rejects.toMatchObject({code:"SOURCE_SELECTION_INVALID"});
  }
  const videoSelected={...f.req(f.video.id,f.script.currentVersionId!,"article"),mode:"selected" as const,
   sourceSectionIds:["script-saved-1"],sourceFields:[],textRanges:[],targetFields:["sections" as const]};
  expect((await f.source.freeze(ctx(),videoSelected)).content.sections).toEqual([
   {sectionId:"script-saved-1",heading:"第二镜",body:"第二镜未选",sourceRefs:[]}]);
  await expect(f.source.freeze(ctx(),{...videoSelected,sourceFields:["body"]})).rejects.toMatchObject({code:"SOURCE_SELECTION_INVALID"});
 }finally{await f.opened.client.close();}
},20_000);

it("源稿版本过期拒绝；无脚本的成片或空稿不冒充正文；旧纯文本仍可精确选区",async()=>{
 const f=await fixture();try{
  await f.graphicPosts.createVersion(ctx(),f.image.id,{expectedCurrentVersionId:f.imageVersion.versionId,
   clientRequestId:"source-manual-change",document:{...f.imageVersion.document,body:"手工改稿"}});
  await expect(f.source.freeze(ctx(),f.req(f.image.id,f.imageVersion.versionId,"article"))).rejects.toMatchObject({code:"SOURCE_VERSION_CONFLICT"});
  const empty=await f.projects.createOutput(ctx(),f.project.id,{title:"仅成片",contentType:"video"});
  await expect(f.source.freeze(ctx(),f.req(empty.id,"missing-version","article"))).rejects.toMatchObject({code:"SOURCE_TEXT_REQUIRED"});
  const plain=await f.artifacts.createVersion(ctx(),f.script.id,{expectedCurrentVersionId:f.script.currentVersionId!,contentText:"旧纯文本😀",contentData:{}});
  const req={...f.req(f.video.id,plain.id,"image"),mode:"selected" as const,sourceSectionIds:[],sourceFields:[],
   textRanges:[{field:"script" as const,start:0,end:4,textDigest:hash("旧纯文本😀")}],targetFields:["body" as const]};
  expect((await f.source.freeze(ctx(),req)).content.fields).toEqual({script:"旧纯文本"});
  await expect(f.source.freeze(ctx(),{...req,sourceSectionIds:["script-saved-0"],textRanges:[]})).rejects.toMatchObject({code:"SOURCE_SELECTION_INVALID"});
  const blank=await f.artifacts.createVersion(ctx(),f.script.id,{expectedCurrentVersionId:plain.id,contentText:"",contentData:{}});
  await expect(f.source.freeze(ctx(),f.req(f.video.id,blank.id,"image"))).rejects.toMatchObject({code:"SOURCE_TEXT_REQUIRED"});
 }finally{await f.opened.client.close();}
},20_000);

it("图文来源已落入视频后继续转换，保存的来源约束与段落引用不能丢失",async()=>{
 const f=await fixture();try{
  const anchor=(await f.source.freeze(ctx(),f.req(f.image.id,f.imageVersion.versionId,"video"))).sourceAnchor;
  const script=await f.artifacts.createVersion(ctx(),f.script.id,{contentText:"视频正文",contentData:{sourceRefs:[anchor],sections:[
   {id:"s1",heading:"一",body:"选中正文",sourceRefs:[anchor]},
   {id:"s2",heading:"二",body:"未选正文",sourceRefs:[{kind:"project",id:f.project.id,versionId:f.project.updatedAt}]}]}});
  const request={...f.req(f.video.id,script.id,"article"),mode:"selected" as const,sourceSectionIds:["s1"],sourceFields:[],textRanges:[],targetFields:["sections" as const]};
  const frozen=await f.source.freeze(ctx(),request);
  expect(frozen.content.sections[0]?.sourceRefs).toEqual([anchor]);
  expect(frozen.constraints.sourceRefs).toEqual([{location:"document",refs:[anchor]},{location:"section:s1",refs:[anchor]}]);
 }finally{await f.opened.client.close();}
},20_000);
