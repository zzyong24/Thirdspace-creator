import {expect,it} from "vitest";
import {createDb,type Db,contentOutputs,creativeResults} from "@creatoros/backend";
import {createClient,ENDPOINTS} from "@creatoros/contract";
import {createCreativeResultsTransport} from "./creative-results.transport";
import type {RequestContext} from "@creatoros/contract";
import {createProjectsService,createProjectRepository} from "../projects";
import {createArtifactsService} from "../artifacts";
import {createArticlesService} from "../articles";
import {createGraphicPostsService,createGraphicPostCreativeResultAdapter} from "../graphic-posts";
import {createOutputScriptsService} from "../output-scripts";
import {createConversionSourceService} from "./conversion-source.service";
import {createCreativeResultsService} from "./creative-results.service";
import {createOutputConversionsService} from "./output-conversions.service";
const ctx=(accountId="a"):RequestContext=>({userId:"conversion-journey",accountId,requestId:"request",source:"user"});
it("正式文章转图文由原 owner 创建目标及三原文字任务；改源稿/丢回复重入无新增目标或任务",async()=>{
 const opened=await createDb();let seq=0,freezes=0,submissions=0;
 const clock={now:()=>"2026-10-02T00:00:00Z",nextId:(prefix:string)=>`${prefix}-${++seq}`};
 const projectsFor=(db:Db)=>createProjectsService(createProjectRepository(db),clock),projects=projectsFor(opened.db);
 const artifactsFor=(db:Db)=>createArtifactsService({db,...clock,assertProjectOwned:(c,id)=>projectsFor(db).getProject(c,id),resolveOutputProjectId:async(c,id)=>(await projectsFor(db).getOutput(c,id)).projectId});
 let source:ReturnType<typeof createConversionSourceService>;
 const tasks=new Map<string,{id:string;status:string;inputData:Record<string,unknown>;attemptId:string}>();
 const articles=createArticlesService(opened.db,{...clock,projects:projectsFor,artifacts:artifactsFor,assertAssetFile:async()=>{},resolveDocumentSource:async()=>null,resolveSelectedBrand:async()=>null,submitGeneration:async()=>{throw Error("未调用文章生成");},readGeneration:async()=>{throw Error("未调用文章任务");}});
 const graphicPosts=createGraphicPostsService(opened.db,{...clock,projects:projectsFor,artifacts:artifactsFor,assertAssetFile:async()=>{},assertOutputVersionSource:(c,ref,p)=>source.assertReference(c,ref,p),resolveConversionSource:(c,input)=>source.restore(c,input.request,input.sourceAnchor),
  findGenerationByAttempt:async(_c,id)=>[...tasks.values()].find(t=>t.attemptId===id)??null,
  submitTextGeneration:async(_c,input)=>{submissions++;const id=`task-${++seq}`;const task={id,status:"queued",inputData:input.inputData,attemptId:input.attemptId};tasks.set(id,task);return task;},
  readTextGeneration:async(_c,id)=>{const task=tasks.get(id);if(!task)throw Error("未找到原任务");return {...task,taskType:"graphic.post-text",results:[]};}});
 const outputScripts=createOutputScriptsService({projects,artifacts:artifactsFor(opened.db),submitScriptDraft:async()=>{throw Error("未调用视频生成");},readTask:async()=>{throw Error("未调用视频任务");}});
 source=createConversionSourceService({projects,articles,graphicPosts,outputScripts});
 const ledger=createCreativeResultsService(opened.db,{projects,adapters:{graphic_post:createGraphicPostCreativeResultAdapter({service:graphicPosts,probeTextGeneration:async()=>({ready:true})})},nextId:()=>`result-${++seq}`,now:clock.now});
 const service=createOutputConversionsService(opened.db,{projects,articles,graphicPosts,source:{freeze:async(c,input)=>{freezes++;return source.freeze(c,input);}},results:ledger,assertReuseImageFile:async()=>{},now:clock.now,nextId:()=>`bundle-${++seq}`});
 try{
  const project=await projects.createProject(ctx(),{title:"互转来源"});
  const original=await articles.createOutput(ctx(),project.id,{title:"源文章",clientRequestId:"journey-source-create"});
  const initial=await articles.getArticle(ctx(),original.id);
  const saved=await articles.createVersion(ctx(),original.id,{expectedCurrentVersionId:initial.currentVersionId,clientRequestId:"journey-source-save",document:{...initial.current,title:"真实来源标题",sections:[{sectionId:"original-section",order:0,heading:"原段落",body:"真实正文",sourceRefs:[]}]}});
  const request={sourceOutputId:original.id,sourceVersionId:saved.versionId,targetType:"image" as const,mode:"whole" as const,clientRequestId:"journey-conversion-request",reuseImages:[]};
  const publicClient=createClient(ENDPOINTS,createCreativeResultsTransport(()=>ledger,()=>service),ctx());
  const one=await publicClient.convertOutput({params:undefined,query:undefined,body:request});expect(one.items.map(i=>i.targetField)).toEqual(["title","body","cardBriefs"]);expect(one.status).toBe("queued");expect(submissions).toBe(3);
  expect((await graphicPosts.getGraphicPost(ctx(),one.targetOutputId)).current.body).toBe("");
  await articles.createVersion(ctx(),original.id,{expectedCurrentVersionId:saved.versionId,clientRequestId:"journey-source-edit-later",document:{...saved.document,summary:"后来的修改"}});
  expect(await service.convert(ctx(),request)).toEqual(one);expect(await publicClient.getOutputConversion({params:{clientRequestId:request.clientRequestId},query:undefined,body:undefined})).toEqual(one);expect(freezes).toBe(1);expect(submissions).toBe(3);
  expect(await opened.db.select().from(contentOutputs)).toHaveLength(2);expect(await opened.db.select().from(creativeResults)).toHaveLength(3);
  await expect(service.convert(ctx(),{...request,reuseImages:[{assetId:"new",assetFileId:"new-file"}]})).rejects.toMatchObject({code:"IDEMPOTENCY_CONFLICT"});
  await expect(service.get(ctx("b"),request.clientRequestId)).rejects.toThrow();
  const latest=await articles.getArticle(ctx(),original.id);
  const reuseRequest={...request,sourceVersionId:latest.currentVersionId,clientRequestId:"journey-reuse-images",reuseImages:[{assetId:"image-two",assetFileId:"file-two"},{assetId:"image-one",assetFileId:"file-one"}]};
  const withImages=await service.convert(ctx(),reuseRequest);
  expect((await graphicPosts.getGraphicPost(ctx(),withImages.targetOutputId)).current.imageUses).toEqual(reuseRequest.reuseImages.map((image,order)=>({...image,order,role:"card"})));
  expect(await service.convert(ctx(),reuseRequest)).toEqual(withImages);expect(submissions).toBe(6);

 }finally{await opened.client.close();}
},20000);
