import {expect,it} from "vitest";
import {createDb} from "@creatoros/backend";
import type {RequestContext} from "@creatoros/contract";
import {createProjectRepository,createProjectsService} from "../projects";
import {createArtifactsService} from "../artifacts";
import {createOutputScriptsService,type OutputScriptPorts} from "./output-scripts.service";

for(const edited of [false,true]) it(`视频候选经真实稿件服务采纳：${edited?"编辑稿":"原稿"}、回执、并发和隔离`,async()=>{
  const opened=await createDb();let sequence=0;
  const ctx:RequestContext={userId:"u-script",accountId:"a-script",requestId:"r-script",source:"user"};
  const deps={now:()=>"2026-10-01T01:00:00.000Z",nextId:(prefix:string)=>`${prefix}-${++sequence}`};
  const projects=createProjectsService(createProjectRepository(opened.db),deps);
  const artifacts=createArtifactsService({db:opened.db,...deps,
    assertProjectOwned:(c,id)=>projects.getProject(c,id),resolveOutputProjectId:(c,id)=>projects.getProjectIdByOutput(c,id)});
  try {
    const project=await projects.createProject(ctx,{title:"视频采纳集成"});
    const output=await projects.createOutput(ctx,project.id,{title:"视频作品",contentType:"video"});
    const artifact=await artifacts.createArtifact(ctx,{projectId:project.id,contentOutputId:output.id,
      artifactType:"output_script",stage:"script",title:"视频稿",initialContentText:"旧稿"});
    const task={id:"script-task",taskType:"script.draft",status:"awaiting_confirmation",projectId:project.id,
      inputData:{projectId:project.id,outputId:output.id,artifactId:artifact.id,baseVersionId:artifact.currentVersionId},
      results:[{resultType:"artifact_version",artifactId:artifact.id,resultData:{body:"真实候选稿",contentData:{sections:[]}}}]};
    const service=createOutputScriptsService({projects,artifacts,readTask:async()=>task,
      submitScriptDraft:async()=>{throw new Error("not used");}} as OutputScriptPorts);
    const input={candidateId:task.id,expectedCurrentVersionId:artifact.currentVersionId!,
      editedValue:edited?"用户编辑后的候选稿":"真实候选稿",clientRequestId:"adopt-script-once"};
    const saved=await service.adopt(ctx,input);
    expect((await artifacts.listVersions(ctx,artifact.id)).find(version=>version.id===saved.versionId)).toMatchObject({id:saved.versionId,
      contentText:input.editedValue,createdByType:"ai",aiTaskId:task.id,adoptionSourceDigest:expect.stringMatching(/^sha256:[a-f0-9]{64}$/)});
    expect(await service.adopt(ctx,input)).toEqual(saved);
    expect(await artifacts.listVersions(ctx,artifact.id)).toHaveLength(2);
    const receipt=(await artifacts.listVersions(ctx,artifact.id)).find(version=>version.id===saved.versionId)!;
    await expect(artifacts.getVersionByAdoptionReceipt(ctx,artifact.id,receipt.adoptionKey!,receipt.adoptionSourceDigest!))
      .rejects.toThrow("来源");
    await expect(artifacts.getVersionByAdoptionReceipt(ctx,artifact.id,receipt.adoptionKey!,receipt.adoptionSourceDigest!,"other-task"))
      .rejects.toThrow("来源");
    await expect(service.adopt(ctx,{...input,editedValue:"偷换内容"})).rejects.toThrow("来源");
    await expect(service.adopt({...ctx,accountId:"other-account"},input)).rejects.toThrow();
    await artifacts.createVersion(ctx,artifact.id,{expectedCurrentVersionId:saved.versionId,contentText:"新手稿"});
    await expect(service.adopt(ctx,{...input,clientRequestId:"another-save"})).rejects.toMatchObject({code:"VERSION_CONFLICT"});
    expect(await service.adopt(ctx,input)).toEqual(saved);
    const current=await artifacts.getArtifact(ctx,artifact.id);
    expect((await artifacts.listVersions(ctx,artifact.id)).find(version=>version.id===current.currentVersionId)!.contentText).toBe("新手稿");
  } finally {await opened.client.close();}
});

for(const mode of ["edited-adopt","manual-save"] as const)it(`编辑分镜表真实保存→制作正文reader→口播导出：${mode}`,async()=>{
 const {createReviewSubjectContext}=await import('../../application/context/review-subject');
 const {extractVoiceoverText}=await import('../production/material-export');
 const opened=await createDb();let sequence=0;
 const ctx:RequestContext={userId:"u-table",accountId:"a-table",requestId:"r-table",source:"user"};
 const deps={now:()=>"2026-10-01T02:00:00.000Z",nextId:(prefix:string)=>prefix+"-"+(++sequence)};
 const projects=createProjectsService(createProjectRepository(opened.db),deps);
 const artifacts=createArtifactsService({db:opened.db,...deps,assertProjectOwned:(c,id)=>projects.getProject(c,id),resolveOutputProjectId:(c,id)=>projects.getProjectIdByOutput(c,id)});
 const text="# 分镜脚本\n\n| # | 口播 | 画面 | 字幕 |\n| --- | --- | --- | --- |\n| 1 | 先定作品。 | 作品清单 | 先定作品 |\n| 2 | 再备正文和图片。 | 图文稿 | 准备素材 |";
 try{
  const project=await projects.createProject(ctx,{title:"结构往返"});const output=await projects.createOutput(ctx,project.id,{title:"视频",contentType:"video"});
  const artifact=await artifacts.createArtifact(ctx,{projectId:project.id,contentOutputId:output.id,artifactType:"output_script",stage:"script",title:"稿",initialContentText:"旧正文"});
  const task={id:"table-task",taskType:"script.draft",status:"awaiting_confirmation",projectId:project.id,inputData:{projectId:project.id,outputId:output.id,artifactId:artifact.id,baseVersionId:artifact.currentVersionId},results:[{resultType:"artifact_version",artifactId:artifact.id,resultData:{body:"未经编辑的候选",contentData:{sections:[{id:"s",heading:"旧",body:"旧"}]}}}]};
  let versionId:string;
  if(mode==="edited-adopt"){
   const service=createOutputScriptsService({projects,artifacts,readTask:async()=>task,submitScriptDraft:async()=>{throw Error("not used");}} as OutputScriptPorts);
   const input={candidateId:task.id,expectedCurrentVersionId:artifact.currentVersionId!,editedValue:text,clientRequestId:"table-once"};
   const adopted=await service.adopt(ctx,input);versionId=adopted.versionId;expect(await service.adopt(ctx,input)).toEqual(adopted);expect(await artifacts.listVersions(ctx,artifact.id)).toHaveLength(2);
  }else versionId=(await artifacts.createVersion(ctx,artifact.id,{expectedCurrentVersionId:artifact.currentVersionId!,contentText:text})).id;
  const saved=(await artifacts.listVersions(ctx,artifact.id)).find(v=>v.id===versionId)!;
  expect(saved.contentText).toBe(text);
  expect(saved.contentData).toMatchObject({transcript:"先定作品。\n再备正文和图片。",sections:[{id:"script-saved-0",body:"口播：先定作品。\n画面：作品清单\n字幕：先定作品"},{id:"script-saved-1",body:"口播：再备正文和图片。\n画面：图文稿\n字幕：准备素材"}]});
  const reader=createReviewSubjectContext({projectsService:projects,artifactsService:artifacts,selectReadableProjectScriptArtifact:rows=>rows.find(r=>r.id===artifact.id),readProjectRadarDraftSeed:async()=>"旧seed",publishingService:{listPublications:async()=>[]},analyticsService:{getPublicationAnalytics:async()=>({rows:[],total:0})},candidateService:{listCommentsForPublication:async()=>[]}} as Parameters<typeof createReviewSubjectContext>[0]);
  expect(await reader.getScript(ctx,project.id)).toBe("先定作品。\n再备正文和图片。");
  expect(extractVoiceoverText(await reader.getScript(ctx,project.id))).toBe("先定作品。\n再备正文和图片。");
  await expect(artifacts.createVersion({...ctx,accountId:"other"},artifact.id,{contentText:text})).rejects.toThrow();
  await expect(artifacts.createVersion(ctx,artifact.id,{expectedCurrentVersionId:artifact.currentVersionId!,contentText:text})).rejects.toThrow();
  const originalSections=(saved.contentData as {sections:Array<{id:string;body:string}>}).sections;
  const patched=await artifacts.applyScriptPatch(ctx,artifact.id,{expectedVersionId:versionId,sectionId:originalSections[0]!.id,expectedOriginalText:originalSections[0]!.body,replacementText:"口播：先核对作品。\n每个平台都用自己的稿。\n画面：新作品清单\n字幕：新作品"});
  expect(await reader.getScript(ctx,project.id)).toBe("先核对作品。\n每个平台都用自己的稿。\n再备正文和图片。");
  expect(extractVoiceoverText(await reader.getScript(ctx,project.id))).toBe("先核对作品。\n每个平台都用自己的稿。\n再备正文和图片。");
  const patchSections=(patched.contentData as {sections:Array<{id:string;body:string}>}).sections;
  const plain=await artifacts.applyScriptPatch(ctx,artifact.id,{expectedVersionId:patched.id,sectionId:patchSections[0]!.id,expectedOriginalText:patchSections[0]!.body,replacementText:"用户明确输入的新正文。"});
  expect(await reader.getScript(ctx,project.id)).toBe("用户明确输入的新正文。\n再备正文和图片。");
  const plainSections=(plain.contentData as {sections:Array<{id:string;body:string}>}).sections;
  const visualOnly=await artifacts.applyScriptPatch(ctx,artifact.id,{expectedVersionId:plain.id,sectionId:plainSections[0]!.id,expectedOriginalText:plainSections[0]!.body,replacementText:"画面：展示作品\n字幕：作品"});
  expect(await reader.getScript(ctx,project.id)).toBe("\n再备正文和图片。");
  expect(extractVoiceoverText(await reader.getScript(ctx,project.id))).toBe("再备正文和图片。");
  await expect(artifacts.applyScriptPatch({...ctx,accountId:"other"},artifact.id,{expectedVersionId:visualOnly.id,sectionId:originalSections[0]!.id,expectedOriginalText:"画面：展示作品\n字幕：作品",replacementText:"不应保存"})).rejects.toThrow();
  await artifacts.restoreVersion(ctx,artifact.id,versionId,visualOnly.id);
  expect(await reader.getScript(ctx,project.id)).toBe("先定作品。\n再备正文和图片。");
  const ambiguousText=text.replace("先定作品。", "说明两行设置：<br>画面：蓝色<br>字幕：要点");
  const ambiguous=await artifacts.createVersion(ctx,artifact.id,{expectedCurrentVersionId:versionId,contentText:ambiguousText});
  const ambiguousSections=(ambiguous.contentData as {sections:Array<{id:string;body:string}>}).sections;
  const unrelatedPatch=await artifacts.applyScriptPatch(ctx,artifact.id,{expectedVersionId:ambiguous.id,sectionId:ambiguousSections[1]!.id,expectedOriginalText:ambiguousSections[1]!.body,replacementText:"再核对图片。"});
  expect(await reader.getScript(ctx,project.id)).toBe("说明两行设置：\n画面：蓝色\n字幕：要点\n再核对图片。");
  expect(extractVoiceoverText(await reader.getScript(ctx,project.id))).toBe("说明两行设置：\n画面：蓝色\n字幕：要点\n再核对图片。");
  await artifacts.restoreVersion(ctx,artifact.id,versionId,unrelatedPatch.id);
  const explicit=await artifacts.createVersion(ctx,artifact.id,{expectedCurrentVersionId:versionId,contentText:text,contentData:{}});expect(explicit.contentData).toEqual({});
  expect(await reader.getScript(ctx,project.id)).toBe(text);
  const other=await artifacts.createArtifact(ctx,{projectId:project.id,artifactType:"research_material",stage:"script",title:"其他类型"});
  expect((await artifacts.createVersion(ctx,other.id,{contentText:text})).contentData).toEqual({});
 }finally{await opened.client.close();}
});
