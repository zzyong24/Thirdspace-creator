import {expect,it} from "vitest";
import {createDb,type Db} from "@creatoros/backend";
import type {RequestContext} from "@creatoros/contract";
import {createProjectRepository,createProjectsService} from "../projects";
import {createArtifactsService} from "../artifacts";
import {createOutputScriptsService} from "./output-scripts.service";

const ctx=(accountId="a"):RequestContext=>({userId:"source-user",accountId,requestId:"source-test",source:"user"});
it("互转来源只读具体视频稿及不可变历史，不混同项目首稿，跨账号与跨作品版本拒绝",async()=>{
 const opened=await createDb();let seq=0;
 const deps={now:()=>"2026-10-02T00:00:00.000Z",nextId:(prefix:string)=>`${prefix}-${++seq}`};
 const projectsFor=(db:Db)=>createProjectsService(createProjectRepository(db),deps);
 const projects=projectsFor(opened.db);
 const artifacts=createArtifactsService({db:opened.db,...deps,
  assertProjectOwned:(c,id)=>projects.getProject(c,id),
  resolveOutputProjectId:async(c,id)=>(await projects.getOutput(c,id)).projectId});
 const service=createOutputScriptsService({projects,artifacts,
  submitScriptDraft:async()=>{throw Error("来源读取不提交模型");},readTask:async()=>{throw Error("来源读取不借任务候选");}});
 try{
  const project=await projects.createProject(ctx(),{title:"同项目双视频"});
  const first=await projects.createOutput(ctx(),project.id,{title:"第一份",contentType:"video"});
  const second=await projects.createOutput(ctx(),project.id,{title:"第二份",contentType:"video"});
  const image=await projects.createOutput(ctx(),project.id,{title:"图文",contentType:"image"});
  const create=(outputId:string,text:string)=>artifacts.createArtifact(ctx(),{projectId:project.id,
   contentOutputId:outputId,artifactType:"output_script",stage:"draft",title:"已保存稿",initialContentText:text,
   initialContentData:{sections:[{sectionId:"s1",body:text}]}});
  const firstScript=await create(first.id,"第一份正文");
  expect(await service.getSavedScript(ctx(),second.id)).toBeNull();
  const secondScript=await create(second.id,"第二份正文 😀");
  const oldVersion=secondScript.currentVersionId!;
  const fresh=await artifacts.createVersion(ctx(),secondScript.id,{expectedCurrentVersionId:oldVersion,contentText:"第二份新版",contentData:{sections:[]}});
  expect(await service.getSavedScript(ctx(),second.id)).toMatchObject({outputId:second.id,projectId:project.id,
   artifactId:secondScript.id,versionId:fresh.id,currentVersionId:fresh.id,contentText:"第二份新版"});
  expect(await service.getSavedScript(ctx(),second.id,oldVersion)).toMatchObject({versionId:oldVersion,
   currentVersionId:fresh.id,contentText:"第二份正文 😀",contentData:{sections:[{sectionId:"s1",body:"第二份正文 😀"}]}});
  await expect(service.getSavedScript(ctx("other"),second.id,oldVersion)).rejects.toThrow();
  await expect(service.getSavedScript(ctx(),second.id,firstScript.currentVersionId!)).rejects.toMatchObject({code:"SOURCE_VERSION_UNAVAILABLE"});
  await expect(service.getSavedScript(ctx(),image.id)).rejects.toMatchObject({code:"UNSUPPORTED_OUTPUT_TYPE"});
  await create(second.id,"重复绑定稿");
  await expect(service.getSavedScript(ctx(),second.id)).rejects.toMatchObject({code:"SOURCE_ANCHOR_CONFLICT"});
 }finally{await opened.client.close();}
},20_000);
