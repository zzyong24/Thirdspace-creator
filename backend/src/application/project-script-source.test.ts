import {createScriptDraftTargetService} from "../modules/artifacts/script-draft-target.service";
import { buildWechatArticleFacets } from "@creatoros/ai-worker/wechat-article-candidate";
import { buildGraphicPostFacets } from "@creatoros/ai-worker/graphic-post-text";
import { describe, expect, it } from "vitest";
import { createDb, type Db } from "@creatoros/backend";
import type { RequestContext } from "@creatoros/contract";
import { createProjectRepository, createProjectsService } from "../modules/projects";
import { createArtifactsService } from "../modules/artifacts";
import { createArticlesService } from "../modules/articles";
import { createGraphicPostsService } from "../modules/graphic-posts";
import { createPublishingService } from "../modules/publishing";
import { createAssetRepository, createAssetsService, createMockObjectStorage, createLocalFsObjectStorage } from "../modules/assets";
import {mkdtemp,rm} from "node:fs/promises";
import {join} from "node:path";
import { createProjectScriptSource } from "./project-script-source";
import { optionalProjectImageLibrary, optionalScriptContext } from "../modules/projects/project-script-source.port";

const ctx = (accountId = "a"): RequestContext => ({userId:"user",accountId,requestId:"req",source:"user"});
async function setup() {
  const opened = await createDb(); let seq=0;
  const deps={now:()=>"2026-10-03T12:00:00.000Z",nextId:(prefix:string)=>`${prefix}-${++seq}`};
  const projects=(db:Db)=>createProjectsService(createProjectRepository(db),deps);
  const artifacts=(db:Db)=>createArtifactsService({db,...deps,assertProjectOwned:(c,id)=>projects(db).getProject(c,id),resolveOutputProjectId:(c,id)=>projects(db).getProjectIdByOutput(c,id)});
  const source=createProjectScriptSource({projects:projects(opened.db),artifacts:artifacts(opened.db)});
  const project=await projects(opened.db).createProject(ctx(),{title:"主脚本项目",brief:"项目说明"});
  const create=(type:string,text:string)=>artifacts(opened.db).createArtifact(ctx(),{projectId:project.id,title:type,artifactType:type,stage:"script",initialContentText:text});
  return {opened,projects,artifacts,source,project,create,deps};
}

describe("T-1051 主稿来源与真实扩写服务", () => {
  it("明确预留输出脚本不遮主稿当前版本；旧引用不随修改重绑",async()=>{
    const f=await setup();try {
      await f.opened.db.transaction(tx=>createScriptDraftTargetService(f.deps).ensure(tx as unknown as Db,ctx(),f.project.id));const master=await f.create("master_script","主稿第一版");
      const first=await f.source.read(ctx(),f.project.id);
      expect(first).toMatchObject({text:"主稿第一版",ref:{kind:"project_script",id:master.id,versionId:master.currentVersionId}});
      const saved=await f.artifacts(f.opened.db).createVersion(ctx(),master.id,{expectedCurrentVersionId:master.currentVersionId!,contentText:"主稿新版"});
      expect(await f.source.read(ctx(),f.project.id)).toMatchObject({text:"主稿新版",ref:{versionId:saved.id}});
      await expect(f.source.assert(ctx(),first!.ref,f.project.id)).resolves.toBeUndefined();
      await expect(f.source.assert(ctx("b"),first!.ref,f.project.id)).rejects.toThrow();
      const other=await f.projects(f.opened.db).createProject(ctx(),{title:"其他项目"});
      await expect(f.source.assert(ctx(),first!.ref,other.id)).rejects.toThrow();
      await expect(f.source.assert(ctx(),{...first!.ref,versionId:"missing"},f.project.id)).rejects.toThrow();
    }finally{await f.opened.client.close();}
  });
  it("按原创建升序选择有内容的输出脚本，只有无稿时采用真实大纲",async()=>{
    const f=await setup();try {
      const outline=await f.create("content_outline","");
      await f.artifacts(f.opened.db).createVersion(ctx(),outline.id,{contentData:{sections:[{label:"大纲",body:"实际大纲内容"}]}});
      expect((await f.source.read(ctx(),f.project.id))?.text).toContain("实际大纲内容");
      await f.create("master_script","母稿");const output=await f.create("output_script","首份分镜");await f.create("output_script","后建分镜");
      expect((await f.source.read(ctx(),f.project.id))?.ref.id).toBe(output.id);
      const article=await f.create("wechat_article","不属于主稿");
      await expect(f.source.assert(ctx(),{kind:"project_script",id:article.id,versionId:article.currentVersionId!},f.project.id)).rejects.toThrow();
    }finally{await f.opened.client.close();}
  });
  it("文章和图文真实 service 冻结脚本、同键恢复旧输入并沿原采纳保持人工稿",async()=>{
    const f=await setup();try {
      const master=await f.create("master_script","只根据这份保存脚本扩写");
      const tasks=new Map<string,{id:string;status:string;inputData:Record<string,unknown>;results:Array<{resultType:string;resultData:Record<string,unknown>}>}>();
      let calls=0, sourceAvailable=true;
      const shared={...f.deps,projects:f.projects,artifacts:f.artifacts,assertAssetFile:async()=>{},
        readProjectScript:(c:RequestContext,id:string)=>f.source.read(c,id),assertProjectScriptSource:(c:RequestContext,ref:{kind:"project_script";id:string;versionId:string},id:string)=>{if(!sourceAvailable)throw new Error("主稿来源不可读");return f.source.assert(c,ref,id);},
        findGenerationByAttempt:async(_c:RequestContext,id:string)=>tasks.get(id)??null};
      const articles=createArticlesService(f.opened.db,{...shared,resolveDocumentSource:async()=>null,resolveSelectedBrand:async()=>null,
        submitGeneration:async(_c,input)=>{calls++;const id=input.attemptId;tasks.set(id,{id,status:"queued",inputData:input.inputData,results:[]});return{id,status:"queued"};},
        readGeneration:async(_c,id)=>({...tasks.get(id)!,taskType:"wechat.article-draft"})});
      const graphics=createGraphicPostsService(f.opened.db,{...shared,
        submitTextGeneration:async(_c,input)=>{calls++;const id=input.attemptId;tasks.set(id,{id,status:"queued",inputData:input.inputData,results:[]});return{id,status:"queued"};},
        readTextGeneration:async(_c,id)=>({...tasks.get(id)!,taskType:"graphic.post-text"})});
      const article=await articles.createOutput(ctx(),f.project.id,{title:"文章"});const graphic=await graphics.createOutput(ctx(),f.project.id,{title:"图文",clientRequestId:"create-graphic-source"});
      const a=await articles.generateCandidate(ctx(),article.id,"article-request-1");
      await graphics.generateTextCandidate(ctx(),graphic.id,{kind:"body",clientRequestId:"graphic-request-1"});
      for(const task of tasks.values())expect(task.inputData.sourceMaterials).toContainEqual(expect.objectContaining({text:"只根据这份保存脚本扩写",ref:{kind:"project_script",id:master.id,versionId:master.currentVersionId}}));
      expect(JSON.stringify(buildWechatArticleFacets(tasks.get("article-request-1")!.inputData))).toContain("只根据这份保存脚本扩写");
      expect(JSON.stringify(buildGraphicPostFacets(tasks.get("graphic-request-1")!.inputData))).toContain("只根据这份保存脚本扩写");
      await f.artifacts(f.opened.db).createVersion(ctx(),master.id,{contentText:"后来保存的脚本"});
      expect(await articles.generateCandidate(ctx(),article.id,"article-request-1")).toEqual(a);
      await graphics.generateTextCandidate(ctx(),graphic.id,{kind:"body",clientRequestId:"graphic-request-1"});expect(calls).toBe(2);
      await expect(graphics.generateTextCandidate(ctx(),graphic.id,{kind:"title",clientRequestId:"graphic-request-1"})).rejects.toThrow();
      await articles.generateCandidate(ctx(),article.id,"article-request-2");expect(tasks.get("article-request-2")!.inputData.sourceMaterials).toContainEqual(expect.objectContaining({text:"后来保存的脚本"}));
      const initial=await graphics.getGraphicPost(ctx(),graphic.id),ref=tasks.get("graphic-request-1")!.inputData.sourceRefs as never[];
      const saved=await graphics.createVersion(ctx(),graphic.id,{expectedCurrentVersionId:initial.currentVersionId,clientRequestId:"manual-with-source",document:{...initial.current,body:"采用之后手工修改",sourceRefs:ref}});
      expect(saved.document.body).toBe("采用之后手工修改");
      await expect(graphics.createVersion(ctx(),graphic.id,{expectedCurrentVersionId:initial.currentVersionId,clientRequestId:"stale-write",document:initial.current})).rejects.toThrow();
      expect((await graphics.getGraphicPost(ctx(),graphic.id)).current.body).toBe("采用之后手工修改");
      tasks.get("article-request-1")!.status="failed";sourceAvailable=false;
      await expect(articles.retryFrozenCandidate(ctx(),a.candidateId,"retry-unavailable-source")).rejects.toThrow();
      expect(calls).toBe(3);
    }finally{await f.opened.client.close();}
  });
});


it("T-1055 sourceContext沿脚本页首video/真实当前发布revision选择，辅助读取失败单独提示",async()=>{
 const f=await setup();try{
  const master=await f.create("master_script","保存主稿正文");
  const projects=f.projects(f.opened.db);
  const video=await projects.createOutput(ctx(),f.project.id,{title:"视频一",contentType:"video"});
  await projects.createOutput(ctx(),f.project.id,{title:"视频二",contentType:"video"});
  const pubs=[{id:"metadata-pub",contentOutputId:video.id,currentRevisionId:"old-empty"},{id:"filled-pub",contentOutputId:video.id,currentRevisionId:"filled-revision"}];
  const source=createProjectScriptSource({projects,artifacts:f.artifacts(f.opened.db),publishing:{
   listPublications:async(_ctx:RequestContext,id:string)=>id===video.id?pubs:[],
   getPublication:async()=>pubs[1]!,
   listRevisions:async(_ctx:RequestContext,id:string)=>id==="filled-pub"?[{id:"filled-revision",publicationId:id,title:"脚本页标题",description:"原简介",platformTags:["原标签"]}]:[{id:"old-empty",publicationId:id,title:"只有标题",description:"",platformTags:[]}],
  }} as never);
  const result=await (source as unknown as {readContext:(c:RequestContext,id:string)=>Promise<unknown>}).readContext(ctx(),f.project.id);
  expect(result).toMatchObject({state:"ready",scriptRef:{id:master.id},scriptText:"保存主稿正文",metadata:{title:"脚本页标题",summary:"原简介",tags:["原标签"]},metadataSource:{kind:"publication_revision",sourceOutputId:video.id,publicationId:"filled-pub",revisionId:"filled-revision"}});
  const unavailable=createProjectScriptSource({projects,artifacts:f.artifacts(f.opened.db),publishing:{listPublications:async()=>{throw new Error("读取失败");}}} as never);
  expect(await (unavailable as unknown as {readContext:(c:RequestContext,id:string)=>Promise<unknown>}).readContext(ctx(),f.project.id)).toMatchObject({state:"unavailable",scriptText:"保存主稿正文"});
  expect((await unavailable.read(ctx(),f.project.id))?.text).toBe("保存主稿正文");
 }finally{await f.opened.client.close();}
});

it("T-1055 辅助端口损坏时降级，不能让原稿读取或合法正文生成失败",async()=>{
 expect(await optionalScriptContext(ctx(),"project",{readProjectScriptContext:async()=>({state:"ready",metadata:{title:null}} as never)})).toMatchObject({state:"unavailable",metadata:{title:"",summary:"",tags:[]}});
 expect(await optionalProjectImageLibrary(ctx(),"project",{readProjectImageLibrary:async()=>({state:"ready",images:[{assetId:"actual",assetFileId:"file",name:"真实",description:42} as never]})})).toMatchObject({imageLibrary:[],imageLibraryMessage:"图片目录暂不可读取，正文仍可生成。"});
 expect(await optionalScriptContext(ctx(),"project",{})).toBeUndefined();
});

it("T-1055 元数据只读真实同项目发布版本，历史引用与跨号/跨项目核验不偷换",async()=>{
 const f=await setup();try{
  const projects=f.projects(f.opened.db),artifacts=f.artifacts(f.opened.db);
  const video=await projects.createOutput(ctx(),f.project.id,{title:"真实视频",contentType:"video"});
  const script=await artifacts.createArtifact(ctx(),{projectId:f.project.id,contentOutputId:video.id,title:"主稿",artifactType:"output_script",stage:"script",initialContentText:"真实脚本"});
  const publishing=createPublishingService({db:f.opened.db,...f.deps,resolveOutputOwner:(c,id)=>projects.getOutputOwnerSummary(c,id)});
  const pub=await publishing.createPublication(ctx(),video.id,{platform:"douyin",accountReference:"实际账号"});
  const old=await publishing.createRevision(ctx(),pub.id,{title:"保存标题",description:"真实简介",platformTags:["标签"]});
  const source=createProjectScriptSource({projects,artifacts,publishing});
  const first=await source.readContext(ctx(),f.project.id);
  expect(first).toMatchObject({scriptRef:{id:script.id},metadata:{title:"保存标题",summary:"真实简介",tags:["标签"]},metadataSource:{kind:"publication_revision",revisionId:old.id}});
  await publishing.createRevision(ctx(),pub.id,{title:"后来标题",description:"后来简介",platformTags:["后来标签"]});
  expect((await source.readContext(ctx(),f.project.id)).metadata.title).toBe("后来标题");
  await expect(source.assertMetadata(ctx(),first.metadataSource!,f.project.id)).resolves.toBeUndefined();
  await expect(source.assertMetadata(ctx("b"),first.metadataSource!,f.project.id)).rejects.toThrow();
  const other=await projects.createProject(ctx(),{title:"另一项目"});
  await expect(source.assertMetadata(ctx(),first.metadataSource!,other.id)).rejects.toThrow();
  await expect(source.assertMetadata(ctx(),{...first.metadataSource!,revisionId:"不存在"} as never,f.project.id)).rejects.toThrow();
 }finally{await f.opened.client.close();}
});

it("T-1055 图片目录从素材公开服务读取真实文件，隔离别号并跳过单张撤销图片",async()=>{
 const f=await setup();try{
  let key=0;
  const storage=createMockObjectStorage({nextKey:()=>`real-key-${++key}`});
  const assets=createAssetsService(createAssetRepository(f.opened.db,f.deps),async()=>storage,f.deps);
  const first=await assets.createGeneratedAsset(ctx(),{assetType:"image",name:"示意图",description:"原素材描述",mimeType:"image/png",bytes:new Uint8Array([1])});
  const revoked=await assets.createGeneratedAsset(ctx(),{assetType:"image",name:"已撤销图",mimeType:"image/png",bytes:new Uint8Array([2])});
  await assets.createGeneratedAsset(ctx("b"),{assetType:"image",name:"另一个账号的图",mimeType:"image/png",bytes:new Uint8Array([3])});
  await assets.mergeAiAnnotation(ctx(),first.id,{aiDescription:"真实素材注解"});
  const source=createProjectScriptSource({projects:f.projects(f.opened.db),artifacts:f.artifacts(f.opened.db),assets:{...assets,assertAssetFileOwned:async(c,id,file,active)=>{if(id===revoked.id)throw Error("该图暂不可读取");return assets.assertAssetFileOwned(c,id,file,active);}}});
  expect(await source.readImages(ctx(),f.project.id)).toMatchObject({state:"ready",images:[{assetId:first.id,assetFileId:first.currentFileId,name:"示意图",description:"原素材描述\n真实素材注解"}],message:"部分图片暂不可读取，已跳过；正文仍可生成。"});
  await expect(source.readImages(ctx("b"),f.project.id)).rejects.toThrow();
 }finally{await f.opened.client.close();}
});

it("T-1055 自动配图核验冻结的实际历史文件，磁盘缺失跳过且不改成新current文件",async()=>{
 const f=await setup(),root=await mkdtemp("/tmp/t1055-exact-image-");try{
  let key=0;
  const storage=createLocalFsObjectStorage({rootPath:root,publicBaseUrl:"/api/v1/blob"},{nextKey:()=>`image-${++key}`,now:()=>Date.parse(f.deps.now())});
  const assets=createAssetsService(createAssetRepository(f.opened.db,f.deps),async()=>storage,f.deps);
  const bytes=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=","base64");
  const asset=await assets.createGeneratedAsset(ctx(),{assetType:"image",name:"本地实际图",mimeType:"image/png",bytes});
  const source=createProjectScriptSource({projects:f.projects(f.opened.db),artifacts:f.artifacts(f.opened.db),assets});
  const frozen=(await source.readImages(ctx(),f.project.id)).images[0]!;
  const [oldFile]=await assets.listFilesByIds(ctx(),[frozen.assetFileId]);
  const next=await storage.createPresignedUpload({assetType:"image",mimeType:"image/png",fileSize:bytes.length,accountId:ctx().accountId});
  await storage.putObject({storageKey:next.storageKey,assetType:"image",mimeType:"image/png",bytes});
  const nextFile=await assets.addAssetFile(ctx(),asset.id,{storageKey:next.storageKey});
  expect(nextFile.id).not.toBe(frozen.assetFileId);
  await expect(source.assertImage(ctx(),frozen.assetId,frozen.assetFileId,f.project.id)).resolves.toBeUndefined();
  await rm(join(root,oldFile!.storageKey));
  await expect(source.assertImage(ctx(),frozen.assetId,frozen.assetFileId,f.project.id)).rejects.toThrow("此版本图片文件已不可用");
  // 当前版本可用不能掩盖旧 exact 文件缺失；目录只列真实 current，但采用仍核验旧 pair。
  expect((await source.readImages(ctx(),f.project.id)).images[0]?.assetFileId).toBe(nextFile.id);
  await rm(join(root,next.storageKey));
  expect(await source.readImages(ctx(),f.project.id)).toMatchObject({state:"empty",images:[],message:"部分图片暂不可读取，已跳过；正文仍可生成。"});
 }finally{await f.opened.client.close();await rm(root,{recursive:true,force:true});}
});

it("正式公开空稿停止master/outline回退，只有无确认稿时保留大纲",async()=>{
 const f=await setup();try{
  const outline=await f.create("content_outline","独立大纲");expect((await f.source.read(ctx(),f.project.id))?.ref.id).toBe(outline.id);
  await f.create("master_script","原母稿");const empty=await f.create("output_script","");
  expect(await f.source.read(ctx(),f.project.id)).toMatchObject({text:"",ref:{id:empty.id}});expect(await f.source.readContext(ctx(),f.project.id)).toMatchObject({state:"ready",scriptText:"",scriptRef:{id:empty.id}});
 }finally{await f.opened.client.close();}
});

it('只读审计：结构表current与旧历史work-source消费差异，旧冻结digest保持',async()=>{
 const f=await setup();try{
  const out=await f.create('output_script','');await f.artifacts(f.opened.db).replaceStructuredContent(ctx(),out.id,out.currentVersionId!,{scriptSections:[{sectionType:'body',content:'仅结构表有的真实正文',position:1}]});
  const current=await f.source.read(ctx(),f.project.id);expect(current?.text).toBe('仅结构表有的真实正文');
  const historical=await f.source.readVersion(ctx(),current!.ref,f.project.id);expect(historical.text).toBe('');
  const {createWorkSourceService}=await import('../modules/work-compositions/work-source.service');
  const work=createWorkSourceService(()=>({projects:f.projects(f.opened.db),readProjectScriptVersion:f.source.readVersion} as never));
  const frozen=await work.read(ctx(),f.project.id,current!.ref,f.opened.db);expect(frozen).toMatchObject({kind:'legacy',content:{text:''}});expect(await work.restoreSnapshot(ctx(),f.project.id,frozen,f.opened.db)).toEqual(frozen);
  const {mkdirSync,writeFileSync}=await import('node:fs'),{fileURLToPath}=await import('node:url');
  const dir=fileURLToPath(new URL('../../../docs/verification/t1331/runtime/regression/source-history-audit/',import.meta.url));mkdirSync(dir,{recursive:true});writeFileSync(dir+'OBSERVATION.json',JSON.stringify({meaning:'本项为真实consumer差异观察，不冒统一来源PASS；历史reader/产品未改',projectId:f.project.id,current,historical,frozen,oldSnapshotRestoredUnchanged:true},null,2)+'\n');
 }finally{await f.opened.client.close();}
});
