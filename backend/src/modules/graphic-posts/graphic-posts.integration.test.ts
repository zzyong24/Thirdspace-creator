import {describe, expect, it} from "vitest";
import {createDb, type Db} from "@creatoros/backend";
import {ENDPOINTS,type GraphicPostTextKind,type RequestContext} from "@creatoros/contract";
import {createGraphicPostsTransport} from "./graphic-posts.transport";
import {createProjectRepository, createProjectsService} from "../projects";
import {createArtifactsService} from "../artifacts";
import {createGraphicPostsService,type GraphicPostPeerPorts} from "./graphic-posts.service";

const now = "2026-10-01T01:00:00.000Z";
const ctx = (accountId = "a"): RequestContext => ({userId: "user", accountId, requestId: "req", source: "user"});
async function fixture(duplicateSources = false,extraPorts:Partial<GraphicPostPeerPorts>={}) {
  const opened = await createDb();
  const db = opened.db;
  let seq = 0;
  let currentTime = now;
  const deps = {now: () => currentTime, nextId: (prefix: string) => `${prefix}-${++seq}`};
  const projects = (store: Db) => createProjectsService(createProjectRepository(store), deps);
  const artifacts = (store: Db) => createArtifactsService({db: store, ...deps,
    assertProjectOwned: (c, id) => projects(store).getProject(c, id),
    resolveOutputProjectId: (c, id) => projects(store).getProjectIdByOutput(c, id),
  });
  type Task = {taskType: string; status: string; inputData: Record<string, unknown>;
    results: Array<{resultType: string; resultData: Record<string, unknown>}>};
  const tasks = new Map<string, Task>();
  const service = createGraphicPostsService(db, {now: deps.now, projects, artifacts, assertAssetFile: async () => {},
    submitTextGeneration: async (_c, input) => {
      const id = `task-${++seq}`;
      const kind = input.inputData.kind as GraphicPostTextKind;
      const refs = input.inputData.sourceRefs as Array<{kind: string; id: string; versionId: string}>;
      const ref = refs[0]!;
      const inputData = duplicateSources ? {...input.inputData, sourceRefs: [{versionId: ref.versionId, id: ref.id, kind: ref.kind}, ref]} : input.inputData;
      tasks.set(id, {taskType: "graphic.post-text", status: extraPorts.readProjectImageLibrary?"queued":"awaiting_confirmation", inputData,
        results: [{resultType: "graphic_post_text_candidate", resultData: {kind, value: kind === "tags" ? ["生成标签"] : kind === "cardBriefs" ? [{cardId:"card-one",title:"图卡标题",body:"图卡正文",sourceRefs:[]}] : `${kind} 候选`}}]});
      return {id, status: extraPorts.readProjectImageLibrary?"queued":"awaiting_confirmation"};
    },
    readTextGeneration: async (_c, id) => {const task = tasks.get(id); if (!task) throw new Error("missing task"); return task;},
    ...extraPorts,
  });
  const project = await projects(db).createProject(ctx(), {title: "图文项目", brief: "一个主题"});
  const output = await service.createOutput(ctx(), project.id, {title: "图文", targetPlatform: "xiaohongshu", clientRequestId: "output-request-001"});
  return {tasks,opened, service, output, project, projects, artifacts, db, advanceTime:(time:string)=>{currentTime=time;}};
}

describe("T-1031 图文候选字段采纳持久链", () => {
  it("同一基准四种字段依次采纳，来源不重复且同请求回放无新版本", async () => {
    const f = await fixture();
    try {
      const initial = await f.service.getGraphicPost(ctx(), f.output.id);
      const candidates = await Promise.all((["title", "summary", "body", "tags"] as const).map(kind =>
        f.service.generateTextCandidate(ctx(), f.output.id, {kind, clientRequestId: `generate-${kind}-001`})));
      let versionId = initial.currentVersionId;
      const requests = [];
      for (let index = 0; index < candidates.length; index++) {
        const kind = (["title", "summary", "body", "tags"] as const)[index]!;
        const input = {kind, expectedCurrentVersionId: versionId, editedValue: kind === "tags" ? ["人工标签"] : `人工${kind}`,
          clientRequestId: `adopt-${kind}-001`};
        const saved = await f.service.adoptTextCandidate(ctx(), candidates[index]!.candidateId, input);
        requests.push({candidateId: candidates[index]!.candidateId, input, saved});
        versionId = saved.versionId;
      }
      const current = await f.service.getGraphicPost(ctx(), f.output.id);
      expect(current.current).toMatchObject({title: "人工title", body: "人工body", summary: "人工summary", tags: ["人工标签"]});
      expect(current.current.sourceRefs).toHaveLength(1);
      expect(current.versions).toHaveLength(5);
      for (const request of requests) {
        expect((await f.service.adoptTextCandidate(ctx(), request.candidateId, request.input)).versionId).toBe(request.saved.versionId);
      }
      expect((await f.service.getGraphicPost(ctx(), f.output.id)).versions).toHaveLength(5);
      await expect(f.service.adoptTextCandidate(ctx(), requests[0]!.candidateId,
        {...requests[0]!.input, editedValue: "篡改请求"})).rejects.toThrow();
    } finally {await f.opened.client.close();}
  });

  it.each(["title", "summary", "body", "tags"] as const)("%s 字段变化、旧 expected 与跨账号请求都拒绝，当前稿保留", async (kind) => {
    const f = await fixture();
    try {
      const initial = await f.service.getGraphicPost(ctx(), f.output.id);
      const title = await f.service.generateTextCandidate(ctx(), f.output.id, {kind, clientRequestId: "generate-title-002"});
      const edited = await f.service.createVersion(ctx(), f.output.id, {expectedCurrentVersionId: initial.currentVersionId,
        document: {...initial.current, [kind]: kind === "tags" ? ["手工标签"] : "手工已改字段"}, clientRequestId: "manual-title-002"});
      const input = {kind, expectedCurrentVersionId: edited.versionId, editedValue: kind === "tags" ? ["生成标签"] : "候选字段", clientRequestId: "adopt-title-002"};
      await expect(f.service.adoptTextCandidate(ctx(), title.candidateId, input)).rejects.toThrow();
      await expect(f.service.adoptTextCandidate(ctx(), title.candidateId,
        {...input, expectedCurrentVersionId: initial.currentVersionId})).rejects.toThrow();
      await expect(f.service.adoptTextCandidate(ctx("b"), title.candidateId, input)).rejects.toThrow();
      expect((await f.service.getGraphicPost(ctx(), f.output.id)).current[kind]).toEqual(kind === "tags" ? ["手工标签"] : "手工已改字段");
      expect((await f.service.getGraphicPost(ctx(), f.output.id)).versions).toHaveLength(2);
    } finally {await f.opened.client.close();}
  });
  it("引用键序不同但真实 ID 与版本相同只保留一份来源", async () => {
    const f = await fixture(true);
    try {
      const initial = await f.service.getGraphicPost(ctx(), f.output.id);
      const title = await f.service.generateTextCandidate(ctx(), f.output.id, {kind: "title", clientRequestId: "generate-dedup-1031"});
      const saved = await f.service.adoptTextCandidate(ctx(), title.candidateId, {kind: "title", expectedCurrentVersionId: initial.currentVersionId,
        editedValue: "来源标题", clientRequestId: "adopt-dedup-1031"});
      expect(saved.document.sourceRefs).toHaveLength(1);
    } finally {await f.opened.client.close();}
  });
});

describe("T-1043 图卡文字正式版本",()=>{
 it("经公共保存/读回保留图卡ID、顺序和文字，历史及恢复不伪造图片",async()=>{
  const f=await fixture();const transport=createGraphicPostsTransport(()=>f.service);
  try{
   const initial=await f.service.getGraphicPost(ctx(),f.output.id);
   expect(initial.current).not.toHaveProperty("cardBriefs");
   const source={kind:"project" as const,id:f.project.id,versionId:f.project.updatedAt};
   const cardBriefs=[{cardId:"card-1",title:"第一页",body:"第一页正文",sourceRefs:[source]},
    {cardId:"card-2",title:"第二页",body:"第二页正文",sourceRefs:[source]}];
   const body={expectedCurrentVersionId:initial.currentVersionId,clientRequestId:"cards-save-request",
    document:{...initial.current,sourceRefs:[source],cardBriefs}};
   ENDPOINTS.createGraphicPostVersion.body!.parse(body);
   const response=await transport.request(ENDPOINTS.createGraphicPostVersion,{params:{outputId:f.output.id},query:undefined,body},ctx());
   const saved=ENDPOINTS.createGraphicPostVersion.response.parse((response as {data:unknown}).data);
   expect(saved.document.cardBriefs).toEqual(cardBriefs);
   const edited=await f.service.createVersion(ctx(),f.output.id,{expectedCurrentVersionId:saved.versionId,
    clientRequestId:"cards-reorder-request",document:{...saved.document,cardBriefs:[{...cardBriefs[1]!,body:"修改后的第二页"},cardBriefs[0]!]}});
   const read=await transport.request(ENDPOINTS.getGraphicPost,{params:{outputId:f.output.id},query:undefined,body:undefined},ctx());
   const current=ENDPOINTS.getGraphicPost.response.parse((read as {data:unknown}).data);
   expect(current.current.cardBriefs?.map(card=>card.cardId)).toEqual(["card-2","card-1"]);
   expect(current.current.imageUses).toEqual([]);
   expect((await f.service.getVersion(ctx(),f.output.id,saved.versionId)).document.cardBriefs).toEqual(cardBriefs);
   await f.artifacts(f.db).restoreVersion(ctx(),current.artifactId,saved.versionId,edited.versionId);
   expect((await f.service.getGraphicPost(ctx(),f.output.id)).current.cardBriefs).toEqual(cardBriefs);
  }finally{await f.opened.client.close();}
 });
 it("图卡新来源仍核验账号与项目，重复ID拒绝且不写正式版本",async()=>{
  const f=await fixture();
  try{
   const initial=await f.service.getGraphicPost(ctx(),f.output.id);
   const foreign=await f.projects(f.db).createProject(ctx("foreign"),{title:"其他账号的项目"});
   const card={cardId:"card-1",title:"图卡",body:"待写入",sourceRefs:[]};
   await expect(f.service.createVersion(ctx(),f.output.id,{expectedCurrentVersionId:initial.currentVersionId,
    clientRequestId:"cards-duplicate-reject",document:{...initial.current,cardBriefs:[card,card]}})).rejects.toThrow();
   await expect(f.service.createVersion(ctx(),f.output.id,{expectedCurrentVersionId:initial.currentVersionId,
    clientRequestId:"cards-foreign-reject",document:{...initial.current,cardBriefs:[{...card,sourceRefs:[
     {kind:"project",id:foreign.id,versionId:foreign.updatedAt}]}]}})).rejects.toThrow();
   expect((await f.service.getGraphicPost(ctx(),f.output.id)).currentVersionId).toBe(initial.currentVersionId);
  }finally{await f.opened.client.close();}
 });
});

it("T-1043 原卡历史来源可保留，复制到新卡重新验真；正文候选采纳保留图卡",async()=>{
 const f=await fixture();
 try{
  const initial=await f.service.getGraphicPost(ctx(),f.output.id);
  const source={kind:"project" as const,id:f.project.id,versionId:f.project.updatedAt};
  const card={cardId:"original-card",title:"原卡",body:"原卡正文",sourceRefs:[source]};
  const saved=await f.service.createVersion(ctx(),f.output.id,{expectedCurrentVersionId:initial.currentVersionId,
   clientRequestId:"cards-history-save",document:{...initial.current,sourceRefs:[source],cardBriefs:[card]}});
  f.advanceTime("2026-10-02T02:00:00.000Z");
  await f.projects(f.db).patchProject(ctx(),f.project.id,{title:"后来变更的项目"});
  const edited=await f.service.createVersion(ctx(),f.output.id,{expectedCurrentVersionId:saved.versionId,
   clientRequestId:"cards-history-edit",document:{...saved.document,cardBriefs:[{...card,body:"用户继续修改原卡"}]}});
  await expect(f.service.createVersion(ctx(),f.output.id,{expectedCurrentVersionId:edited.versionId,
   clientRequestId:"cards-history-copy-reject",document:{...edited.document,cardBriefs:[...edited.document.cardBriefs!,{...card,cardId:"new-card"}]}}))
   .rejects.toThrow(/来源项目版本/);
  const task=await f.service.generateTextCandidate(ctx(),f.output.id,{kind:"body",clientRequestId:"cards-body-generate"});
  const adopted=await f.service.adoptTextCandidate(ctx(),task.candidateId,{kind:"body",
   expectedCurrentVersionId:edited.versionId,editedValue:"用户采用的正文",clientRequestId:"cards-body-adopt"});
  expect(adopted.document.cardBriefs).toEqual(edited.document.cardBriefs);
  expect(adopted.document.body).toBe("用户采用的正文");
 }finally{await f.opened.client.close();}
});


it("图卡文字候选真实落库，采用只更新卡片且保留来源，不伪造图片",async()=>{
 const f=await fixture();try{
  const initial=await f.service.getGraphicPost(ctx(),f.output.id);
  const task=await f.service.generateTextCandidate(ctx(),f.output.id,{kind:"cardBriefs",clientRequestId:"card-text-generate"});
  const candidate=await f.service.getTextCandidate(ctx(),task.candidateId);
  expect(candidate.value).toMatchObject([{cardId:"card-one",title:"图卡标题",body:"图卡正文"}]);
  const input={kind:"cardBriefs" as const,expectedCurrentVersionId:initial.currentVersionId,editedValue:candidate.value!,clientRequestId:"card-text-adopt"};
  const saved=await f.service.adoptTextCandidate(ctx(),task.candidateId,input);
  expect(saved.document.cardBriefs?.[0]?.sourceRefs).toEqual(candidate.sourceRefs);
  expect(saved.document.imageUses).toEqual([]);expect(saved.document.body).toBe(initial.current.body);
  expect((await f.service.adoptTextCandidate(ctx(),task.candidateId,input)).versionId).toBe(saved.versionId);
  const before=(await f.service.getGraphicPost(ctx(),f.output.id)).versions.length;
  await expect(f.service.adoptTextCandidate(ctx(),task.candidateId,{...input,expectedCurrentVersionId:saved.versionId,editedValue:[{cardId:"same",title:"",body:"",sourceRefs:[]},{cardId:"same",title:"",body:"",sourceRefs:[]}],clientRequestId:"card-text-invalid"})).rejects.toThrow();
  expect((await f.service.getGraphicPost(ctx(),f.output.id)).versions).toHaveLength(before);
 }finally{await f.opened.client.close();}
});


it("图文转换提交冻结正文及完整意图；每项恢复原任务，不借今日背景",async()=>{
 const anchor={kind:"output_version" as const,sourceOutputId:"article",artifactId:"article-artifact",versionId:"v-source",sourceType:"article" as const,selectionDigest:"a".repeat(64),selection:{mode:"whole" as const}};
 const conversion={request:{sourceOutputId:"article",sourceVersionId:"v-source",targetType:"image" as const,mode:"whole" as const,targetPlatform:"xiaohongshu" as const,clientRequestId:"convert-to-image",reuseImages:[]},sourceAnchor:anchor};
 let f:Awaited<ReturnType<typeof fixture>>,resolutions=0;
 f=await fixture(false,{assertOutputVersionSource:async()=>{},
  findGenerationByAttempt:async()=>{const prior=[...f.tasks.entries()][0];return prior?{id:prior[0],status:prior[1].status,inputData:prior[1].inputData}:null;},
  resolveConversionSource:async()=>{resolutions++;return {projectId:f.project.id,sourceAnchor:anchor,content:{fields:{},sections:[{sectionId:"s",heading:"原段落",body:"真正冻结正文",sourceRefs:[]}]},constraints:{factItems:[],sourceRefs:[],ruleSnapshotRef:null}};},
 } as Partial<GraphicPostPeerPorts>);
 try{
  const input={kind:"cardBriefs" as const,clientRequestId:"stable-card-conversion",conversion};
  const first=await f.service.generateTextCandidate(ctx(),f.output.id,input);
  const candidate=await f.service.getTextCandidate(ctx(),first.candidateId);
  expect(candidate.sourceRefs).toEqual([anchor]);
  expect(JSON.stringify([...f.tasks.values()][0]?.inputData.sourceMaterials)).toContain("真正冻结正文");
  expect(JSON.stringify([...f.tasks.values()][0]?.inputData.sourceMaterials)).not.toContain("一个主题");
  expect(await f.service.generateTextCandidate(ctx(),f.output.id,input)).toEqual(first);expect(resolutions).toBe(1);
  await expect(f.service.generateTextCandidate(ctx(),f.output.id,{...input,conversion:{...conversion,request:{...conversion.request,reuseImages:[{assetId:"a",assetFileId:"f"}]}}})).rejects.toThrow();
 }finally{await f.opened.client.close();}
});
it("已绑定执行的图文结果重试沿原候选，恢复回执丢失后不复制任务",async()=>{
 let f:Awaited<ReturnType<typeof fixture>>;let submits=0,resumes=0;
 f=await fixture(false,{submitTextGeneration:async(_c,input)=>{f.tasks.set("bound-graphic-task",{taskType:"graphic.post-text",status:"queued",inputData:input.inputData,results:[]});return{id:"bound-graphic-task",status:"queued"};}});
 try{
  const original=await f.service.generateTextCandidate(ctx(),f.output.id,{kind:"title",clientRequestId:"bound-graphic-generate"});f.tasks.get(original.taskId)!.status="failed";
  const owner=createGraphicPostsService(f.db,{now:()=>now,projects:f.projects,artifacts:f.artifacts,assertAssetFile:async()=>{},
   readTextGeneration:async(_c,id)=>({...f.tasks.get(id)!,executionTaskId:"original-bound-execution"}),
   submitTextGeneration:async()=>{submits++;throw Error("禁止复制已绑定图文任务");},
   resumeGeneration:async(_c,input)=>{expect(input).toEqual({taskId:original.taskId,clientRequestId:"bound-graphic-retry"});resumes++;f.tasks.get(original.taskId)!.status="queued";if(resumes===1)throw Error("原恢复回复丢失");return {id:original.taskId};},
  });
  await expect(owner.retryFrozenTextCandidate(ctx(),original.taskId,"bound-graphic-retry")).rejects.toThrow("回复丢失");
  expect(await owner.retryFrozenTextCandidate(ctx(),original.taskId,"bound-graphic-retry")).toMatchObject({candidateId:original.taskId,taskId:original.taskId,status:"queued"});
  expect(submits).toBe(0);expect(f.tasks.size).toBe(1);await expect(owner.retryFrozenTextCandidate(ctx("b"),original.taskId,"bound-graphic-retry")).rejects.toThrow();
 }finally{await f.opened.client.close();}
},20000);


describe('T1042 快图原生设计沿原图文owner保存',()=>{
 it('原生图层持久化、确切媒体拒绝越权、CAS和未动历史文件兼容',async()=>{
  let unavailable=false; const f=await fixture(false,{assertAssetFile:async(_c,_a,file)=>{if(file==='foreign'||unavailable)throw Error('文件不可用');}});
  try{
   const initial=await f.service.getGraphicPost(ctx(),f.output.id);
   const design={target:{kind:'cover' as const},document:{editor:'kuaitu' as const,revision:'b3bdcfb0bd6d8f98e7483cf561ac03ba56c0d889',nativeDocument:{objects:[{type:'image',src:'creatoros-media://one',data:{creatorosMediaId:'one'}}]},mediaRefs:[{mediaId:'one',assetId:'owned',assetFileId:'file'}]}};
   const body={expectedCurrentVersionId:initial.currentVersionId,clientRequestId:'save-native-design-001',document:{...initial.current,designs:[design]}};
   const saved=await f.service.createVersion(ctx(),f.output.id,body);
   expect((await f.service.getGraphicPost(ctx(),f.output.id)).current.designs).toEqual([design]);
   expect(await f.service.createVersion(ctx(),f.output.id,body)).toEqual(saved);
   const bad=structuredClone(body.document);bad.designs[0]!.document.mediaRefs[0]!.assetFileId='foreign';
   await expect(f.service.createVersion(ctx(),f.output.id,{...body,expectedCurrentVersionId:saved.versionId,clientRequestId:'save-native-design-002',document:bad})).rejects.toThrow('文件不可用');
   unavailable=true;
   await f.service.createVersion(ctx(),f.output.id,{...body,expectedCurrentVersionId:saved.versionId,clientRequestId:'save-native-design-003',document:{...saved.document,body:'只改正文'}});
   expect((await f.service.getGraphicPost(ctx(),f.output.id)).current.body).toBe('只改正文');
  }finally{await f.opened.client.close();}
 });
});

it('T1052 图文 NoteRelay 版式与真实素材、卡片、来源保存及历史读回，旧 CAS 拒写',async()=>{
 const f=await fixture();try{const initial=await f.service.getGraphicPost(ctx(),f.output.id);
 const nativeLayout={schemaVersion:1 as const,editor:'noterelay' as const,editorVersion:'0.1.8' as const,themeId:'default',authorName:'署名',authorBio:'',variables:{},fontSize:18,splitHeading:2 as const,templateId:'notes' as const,imageWidths:{'0:0:creatoros-asset:asset:file':75},imageRadii:{}};
 const document={...initial.current,title:'衍生图文',body:'用户修改正文',nativeLayout,imageUses:[{assetId:'asset',assetFileId:'file',role:'card' as const,order:0,cardId:'c'}],cardBriefs:[{cardId:'c',title:'第一页',body:'卡片正文',sourceRefs:[]}]} ;const input={expectedCurrentVersionId:initial.currentVersionId,clientRequestId:'noterelay-save',document};
 const saved=await f.service.createVersion(ctx(),f.output.id,input);expect((await f.service.getGraphicPost(ctx(),f.output.id)).current).toEqual(document);expect((await f.service.getVersion(ctx(),f.output.id,saved.versionId)).document).toEqual(document);expect((await f.service.getVersion(ctx(),f.output.id,initial.currentVersionId)).document.nativeLayout).toBeUndefined();expect((await f.service.createVersion(ctx(),f.output.id,input)).versionId).toBe(saved.versionId);await expect(f.service.createVersion(ctx(),f.output.id,{...input,clientRequestId:'noterelay-stale'})).rejects.toThrow();
 }finally{await f.opened.client.close();}
});


describe("T-1055 图文主稿metadata与语义配图",()=>{
 it.each(["selected","expired","existing","byte_missing"] as const)("exact图卡pair采用：%s，metadata/旧图片不覆盖",async mode=>{
  const image={assetId:"real-image",assetFileId:"real-file",name:"实际图片",description:"真实描述"};let expired=false;
  const f=await fixture(false,{readProjectImageLibrary:async()=>({state:"ready",images:[image]}),assertAssetFile:async(_c:RequestContext,id:string,file:string)=>{if(id===image.assetId&&(expired||file!==image.assetFileId))throw Error("图不可用");},...(mode==="byte_missing"?{assertProjectImageFile:async()=>{throw new Error("冻结文件字节已不可读取");}}:{})} as never);
  try{
   const initial=await f.service.getGraphicPost(ctx(),f.output.id);
   const old={cardId:"card-one",title:"旧页",body:"旧文字",sourceRefs:[]};
   const manual=await f.service.createVersion(ctx(),f.output.id,{expectedCurrentVersionId:initial.currentVersionId,clientRequestId:"graphic-image-before",document:{...initial.current,title:"沿用标题",summary:"沿用简介",tags:["沿用标签"],cardBriefs:mode==="existing"?[old]:[],imageUses:mode==="existing"?[{cardId:"card-one",assetId:"old-image",assetFileId:"old-file",order:0,role:"card"}]:[]}});
   const generated=await f.service.generateTextCandidate(ctx(),f.output.id,{kind:"cardBriefs",clientRequestId:"graphic-images-generate"});
   const task=f.tasks.get(generated.taskId)!;task.status="awaiting_confirmation";expect(task.inputData.imageLibrary).toEqual([image]);
   task.results[0]!.resultData={kind:"cardBriefs",value:[{cardId:"card-one",title:"图卡标题",body:"图卡正文",sourceRefs:[],proposedImage:{assetId:image.assetId,assetFileId:image.assetFileId}}]};
   expired=mode==="expired";
   const candidate=await f.service.getTextCandidate(ctx(),generated.candidateId);
   const saved=await f.service.adoptTextCandidate(ctx(),generated.candidateId,{kind:"cardBriefs",editedValue:candidate.value!,expectedCurrentVersionId:manual.versionId,clientRequestId:"graphic-images-adopt"});
   expect(saved.document).toMatchObject({title:"沿用标题",summary:"沿用简介",tags:["沿用标签"]});
   expect(saved.document.cardBriefs?.[0]?.body).toBe("图卡正文");
   if(mode==="selected")expect(saved.document.imageUses[0]).toMatchObject({cardId:"card-one",assetId:image.assetId,assetFileId:image.assetFileId});
   if(mode==="expired"||mode==="byte_missing"){expect(saved.document.imageUses).toEqual([]);expect(saved.document.imageMatchWarnings?.length).toBeGreaterThan(0);}
   if(mode==="existing")expect(saved.document.imageUses[0]?.assetId).toBe("old-image");
  }finally{await f.opened.client.close();}
 });
 it("backend拒绝未冻结pair和用户篡改候选图，辅助context失败不反杀get",async()=>{
  const image={assetId:"real-image",assetFileId:"real-file",name:"图片",description:"实际描述"};
  const f=await fixture(false,{readProjectScriptContext:async()=>{throw Error("读失败");},readProjectImageLibrary:async()=>({state:"ready",images:[image]})} as never);
  try{
   expect(await f.service.getGraphicPost(ctx(),f.output.id)).toMatchObject({scriptContext:{state:"unavailable"}});
   const initial=await f.service.getGraphicPost(ctx(),f.output.id);
   const generated=await f.service.generateTextCandidate(ctx(),f.output.id,{kind:"cardBriefs",clientRequestId:"graphic-pair-validation"});
   const task=f.tasks.get(generated.taskId)!;task.status="awaiting_confirmation";
   const card={cardId:"card-one",title:"图卡",body:"正文",sourceRefs:[]};
   task.results[0]!.resultData={kind:"cardBriefs",value:[{...card,proposedImage:{assetId:image.assetId,assetFileId:"fake-file"}}]};
   await expect(f.service.getTextCandidate(ctx(),generated.candidateId)).rejects.toThrow();
   task.results[0]!.resultData={kind:"cardBriefs",value:[{...card,proposedImage:{assetId:image.assetId,assetFileId:image.assetFileId}}]};
   await f.service.getTextCandidate(ctx(),generated.candidateId);
   await expect(f.service.adoptTextCandidate(ctx(),generated.candidateId,{kind:"cardBriefs",editedValue:[{...card,proposedImage:{assetId:image.assetId,assetFileId:"fake-file"}}],expectedCurrentVersionId:initial.currentVersionId,clientRequestId:"graphic-forged-adoption"})).rejects.toThrow();
  }finally{await f.opened.client.close();}
 });
});
