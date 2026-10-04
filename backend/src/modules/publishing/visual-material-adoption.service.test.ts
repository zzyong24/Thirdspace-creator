import {afterAll,beforeAll,expect,it,vi} from "vitest";
import {createDb,type Db,publications,publicationRevisions} from "@creatoros/backend";
import type {RequestContext,PublicationVisualNote} from "@creatoros/contract";
import {createPublishingService} from "./publishing.service";
import {createVisualMaterialAdoptionService} from "./visual-material-adoption.service";
import {createPublishingTransport} from "./publishing.transport";
import {ENDPOINTS as publishingOperations} from "@creatoros/contract";
let db:Db,close:()=>Promise<void>,counter=0;
const ctx=(accountId="a"):RequestContext=>({userId:"visual-publishing-user",accountId,requestId:"visual-publishing",source:"user"});
const frozen=vi.fn(async(c:RequestContext,assetId:string,fileId:string,checksum:string)=>{if(c.accountId!=="a"||fileId!=="frozen-file"||checksum!=="frozen-checksum")throw new Error("冻结图片无权或变化");return {url:`https://example.invalid/${assetId}/${fileId}.png`,fileName:"image.png"};});
const service=()=>createPublishingService({db,now:()=>"2026-10-04T00:00:00.000Z",nextId:p=>`${p}-${++counter}`,resolveOutputOwner:async(c,id)=>c.accountId==="a"&&id==="output-a"?{projectId:"project-a",source:"user",status:"active",title:"稿件"}:null,getFrozenImageDownload:frozen});
const visualNote:PublicationVisualNote={schemaVersion:1,sourceCanvasId:"canvas",sourceGroupId:"group",sourceCanvasRevision:2,imageMode:"single_cover",aspectRatio:"3:4",orderedAssetIds:["asset-a"],pageReceipts:[{nodeId:"node",taskId:"task",resultId:"result",fileId:"frozen-file",checksum:"frozen-checksum"}]};
const rich={outputId:"output-a",platform:"xiaohongshu",title:"真实标题",description:"真实配文",platformTags:["教育"],coverAssetId:"asset-a",category:"保留分类",series:"保留系列",platformSettings:{visualNote,otherPlatformSetting:{keep:true}}};
beforeAll(async()=>{const opened=await createDb();db=opened.db;close=()=>opened.client.close();});afterAll(async()=>{await close();});
it("创建草稿完整字段幂等摘要与旧调用兼容，返回原首版",async()=>{
 const s=service(),pub=await s.adoptDraft(ctx(),{...rich,adoptionKey:"draft-rich-1"});
 const [rev]=await s.listRevisions(ctx(),pub.id,{limit:20,offset:0});
 expect(rev).toMatchObject({description:"真实配文",coverAssetId:"asset-a",category:"保留分类",platformSettings:rich.platformSettings});
 expect((await s.adoptDraft(ctx(),{...rich,adoptionKey:"draft-rich-1"})).id).toBe(pub.id);
 await expect(s.adoptDraft(ctx(),{...rich,description:"不同正文",adoptionKey:"draft-rich-1"})).rejects.toThrow("同一");
 await expect(s.adoptDraft(ctx(),{...rich,coverAssetId:"different",adoptionKey:"draft-rich-1"})).rejects.toThrow("同一");
 const legacy=await s.adoptDraft(ctx(),{outputId:"output-a",platform:"douyin",title:"旧标题",description:"",platformTags:[],adoptionKey:"legacy-draft"});
 expect((await s.createRevision(ctx(),legacy.id,{title:"旧更新",description:"旧链成功"})).title).toBe("旧更新");
});
it("不可变版本完整digest、并发CAS、同键恢复与跨账号/目标拦截",async()=>{
 const s=service(),pub=await s.adoptDraft(ctx(),{...rich,adoptionKey:"cas-base"});
 const input={...rich,publicationId:pub.id,expectedCurrentRevisionId:pub.currentRevisionId!,adoptionKey:"cas-candidate-1"};
 const settled=await Promise.allSettled([s.adoptVisualRevision(ctx(),input),s.adoptVisualRevision(ctx(),{...input,adoptionKey:"cas-candidate-2",title:"另一候选"})]);
 expect(settled.filter(r=>r.status==="fulfilled")).toHaveLength(1);
 expect(settled.filter(r=>r.status==="rejected")).toHaveLength(1);
 const winner=settled.find(r=>r.status==="fulfilled") as PromiseFulfilledResult<Awaited<ReturnType<typeof s.adoptVisualRevision>>>;
 const winnerInput=settled[0]!.status==="fulfilled"?input:{...input,adoptionKey:"cas-candidate-2",title:"另一候选"};
 expect((await s.adoptVisualRevision(ctx(),winnerInput)).revision.id).toBe(winner.value.revision.id);
 await expect(s.adoptVisualRevision(ctx(),{...winnerInput,platformSettings:{visualNote:{...visualNote,pageReceipts:[{...visualNote.pageReceipts[0]!,checksum:"changed"}]}}})).rejects.toThrow("同一");
 await expect(s.adoptVisualRevision(ctx("b"),winnerInput)).rejects.toThrow();
 await expect(s.adoptVisualRevision(ctx(),{...winnerInput,outputId:"foreign"})).rejects.toThrow();
 expect((await s.listRevisions(ctx(),pub.id,{limit:20,offset:0}))).toHaveLength(2);
});
it("导出指定不可变版真实冻结文件与配文，transport可达，缺失文件明确失败",async()=>{
 const s=service(),pub=await s.adoptDraft(ctx(),{...rich,adoptionKey:"export-rich"});
 const transport=createPublishingTransport(()=>s);
 const response=await transport.request(publishingOperations.exportPublicationVisualNote,{params:{publicationId:pub.id},query:undefined,body:{revisionId:pub.currentRevisionId!}},ctx());
 expect(response).toMatchObject({data:{caption:"真实配文",files:[{assetId:"asset-a",url:"https://example.invalid/asset-a/frozen-file.png",fileName:"01-image.png"}]}});
 await expect(s.exportVisualNote(ctx("b"),pub.id,pub.currentRevisionId!)).rejects.toThrow();
 frozen.mockRejectedValueOnce(new Error("缺失文件"));await expect(s.exportVisualNote(ctx(),pub.id,pub.currentRevisionId!)).rejects.toThrow("缺失文件");
});
it("采纳先核对当前目标，激活成功后CAS冲突保留候选并不宣布成功",async()=>{
 const publishing=service(),pub=await publishing.adoptDraft(ctx(),{...rich,adoptionKey:"adopt-target"});
 const confirm=vi.fn(async()=>{}),verify=vi.fn(async()=>{});
 const canvas={get:async()=>({revision:2,projectId:"project-a"}),resolveMaterialSelections:async()=>({canvasId:"canvas",projectId:"project-a",revision:2,group:{id:"group",libraryKind:"xhs" as const,caption:"真实配文",aspectRatio:"3:4",pageOrder:["node"]},pages:[{nodeId:"node",taskId:"task",resultId:"result",assetId:"asset-a"}]}),verifyMaterialSettlement:verify};
 const assertTarget=vi.fn(async()=>{});
 const adoption=createVisualMaterialAdoptionService({canvas,confirmGeneratedTask:confirm,assertFrozenImage:async()=>({fileId:"frozen-file",checksum:"frozen-checksum"}),assertOutputProject:assertTarget,publishing});
 const base={expectedRevision:2,groupId:"group",outputId:"output-a",publicationId:pub.id,expectedCurrentRevisionId:pub.currentRevisionId!,platform:"xiaohongshu",title:"真实标题",selections:[{nodeId:"node",taskId:"task",resultId:"result"}],attemptId:"adopt-attempt-0001"};
 await publishing.createRevision(ctx(),pub.id,{title:"并发更新",description:"保留",platformSettings:rich.platformSettings});
 await expect(adoption.adopt(ctx(),"canvas",base)).rejects.toThrow("版本");expect(confirm).toHaveBeenCalledTimes(1);expect(verify).toHaveBeenCalledTimes(1);
 expect((await publishing.getPublication(ctx(),pub.id)).currentRevisionId).not.toBe(pub.currentRevisionId);
 const result=await adoption.adopt(ctx(),"canvas",{...base,expectedCurrentRevisionId:(await publishing.getPublication(ctx(),pub.id)).currentRevisionId!});
 expect(result.revision.platformSettings).toMatchObject({otherPlatformSetting:{keep:true},visualNote});
});

it("完整公共服务链：画布三页→真实pending与结算→选择→原确认激活→不可变发布版→冻结导出",async()=>{
 const {mkdtemp,rm}=await import("node:fs/promises"),{tmpdir}=await import("node:os"),{join}=await import("node:path");
 const {createHash}=await import("node:crypto");
 const {aiTasks,aiTaskResults,executionTasks,executionCalls,canvasGenerationLinks,assets,assetFiles,eq,and}=await import("@creatoros/backend");
 const {createCreativeCanvasService}=await import("../creative-canvas/creative-canvas.service");
 const {createCreativeCanvasTransport}=await import("../creative-canvas/creative-canvas.transport");
 const {createLocalFsObjectStorage,createAssetRepository,createAssetsService}=await import("../assets");
 const {createExecutionAuthorityService}=await import("../execution/execution-authority.service");
 const {createPersistentTaskService}=await import("../execution/persistent-task.service");
 const {createExecutionAssetResultService}=await import("../execution/execution-asset-result.service");
 const {createExecutionCandidateService}=await import("../ai/execution-candidate.service");
 const {createGeneratedAssetAdoptionService}=await import("../ai/generated-asset-adoption.service");
 const dir=await mkdtemp(join(tmpdir(),"t1021-visual-public-")),stamp=()=>"2026-10-04T00:00:00.000Z";
 const storage=createLocalFsObjectStorage({rootPath:dir,publicBaseUrl:"/blob"},{nextKey:()=>`test-${++counter}`});
 const assetsService=createAssetsService(createAssetRepository(db,{now:stamp,nextId:p=>`${p}-${++counter}`}),async()=>storage,{now:stamp,nextId:p=>`${p}-${++counter}`});
 const assertImage=async(c:RequestContext,assetId:string,fileId?:string,checksum?:string)=>{
  const asset=await assetsService.getAsset(c,assetId),[file]=await db.select().from(assetFiles).where(and(eq(assetFiles.assetId,asset.id),eq(assetFiles.id,fileId??asset.currentFileId!)));
  if(asset.status!=="active"||asset.assetType!=="image"||!file||checksum&&file.checksum!==checksum)throw new Error("冻结素材无权或变化");
  const bytes=await storage.getObject(file.storageKey);if(createHash("sha256").update(bytes).digest("hex")!==file.checksum)throw new Error("不可读原图");
  return {fileId:file.id,checksum:file.checksum};
 };
 let loseMiddleResponse=true;
 const submit=vi.fn(async(c:RequestContext,input:{attemptId:string;inputData:Record<string,unknown>})=>{
  const id=`t1021-${input.attemptId}`;
  await db.insert(aiTasks).values({id,userId:c.userId,accountId:c.accountId!,taskType:"asset.generate",inputData:input.inputData,idempotencyKey:id,requestedAt:stamp()}).onConflictDoNothing();if(input.attemptId.includes("public-body-1")&&loseMiddleResponse){loseMiddleResponse=false;throw new Error("中间页响应丢失");}return {id};
 });
 const canvas=createCreativeCanvasService(db,{now:stamp,assertProject:async(c,id)=>{if(c.accountId!=="a"||id!=="project-a")throw new Error("无权项目");},assertMediaAsset:async(c,id,_kind,fileId)=>assertImage(c,id,fileId),assertReferenceAsset:async()=>{},getReference:async()=>null,getMediaFileDownloadUrl:assetsService.getAssetFileDownloadUrl,resolveCapability:async()=>({provider:"minimax",model:"image-01"}),submitTask:submit});
 const publishing=createPublishingService({db,now:stamp,nextId:p=>`public-${p}-${++counter}`,resolveOutputOwner:async(c,id)=>c.accountId==="a"&&id==="output-a"?{projectId:"project-a",source:"user",status:"active",title:"稿件"}:null,getFrozenImageDownload:async(c,assetId,fileId,checksum)=>{await assertImage(c,assetId,fileId,checksum);return assetsService.getAssetFileDownloadUrl(c,assetId,fileId);}});
 const generated=createGeneratedAssetAdoptionService(db,{link:async()=>({})},stamp);
 const adoption=createVisualMaterialAdoptionService({canvas,publishing,confirmGeneratedTask:generated.confirmTask,assertFrozenImage:assertImage,assertOutputProject:async(c,outputId,projectId)=>{if(c.accountId!=="a"||outputId!=="output-a"||projectId!=="project-a")throw new Error("目标归属错误");}});
 const transport=createCreativeCanvasTransport(canvas,adoption);
 try{
  const created=await canvas.create(ctx(),{title:"公开调用链",projectId:"project-a"});
  const ids=["public-cover","public-body-1","public-body-2"],attempts=Object.fromEntries(ids.map(id=>[id,`attempt-${id}-0001`]));
  const document={schemaVersion:1 as const,viewport:{x:0,y:0,zoom:1},nodes:ids.map(id=>({id,type:"image_generation" as const,position:{x:0,y:0},label:id,prompt:`真实主题 ${id}`,mode:"text_to_image" as const,aspectRatio:"3:4"})),edges:[],visualGroups:[{id:"public-group",name:"三页图文",libraryKind:"xhs" as const,aspectRatio:"3:4",caption:"真实三页配文",pageOrder:ids,templateSnapshot:{id:"sample",name:"知识图文",version:1,prompt:"示例",visualMode:"graphic" as const,requiredIdentity:false},generationAttempts:attempts}]};
  let saved=await canvas.save(ctx(),created.id,{expectedRevision:1,document});
  const selections:Array<{nodeId:string;taskId:string;resultId:string}>=[],executionIds:string[]=[];
  async function settlePage(node:{id:string;prompt:string;mode:string;aspectRatio?:string},link:{taskId:string|null}){
   const mapped=await createExecutionAuthorityService(db,{now:stamp}).bindAiTask(ctx(),link.taskId!);
   const modelInput={kind:"asset.generate",mediaKind:"image",capability:"image.generate",operationKey:"asset/original",prompt:node.prompt,mode:node.mode,aspectRatio:node.aspectRatio,provider:"minimax",model:"image-01",baseUrl:null};
   await db.update(executionTasks).set({payload:{aiTaskId:link.taskId,modelInput}}).where(eq(executionTasks.id,mapped.executionTaskId));
   const tasks=createPersistentTaskService(db,{now:stamp}),claim=(await tasks.claimTask({taskId:mapped.executionTaskId,workerId:"test-worker"}))!;
   let ref={executionTaskId:mapped.executionTaskId,attempt:claim.lease.attempt,fenceToken:claim.lease.fenceToken};
   if(node.id===ids[1]){
    const {createExecutionWorkerOutcomeService}=await import("../execution/execution-worker-outcome.service");
    await createExecutionWorkerOutcomeService(db,{now:stamp}).recordFailure(ref,{outcome:"failed",errorCode:"TEST_BEFORE_SUBMIT"});
    expect((await tasks.get(ctx(),mapped.executionTaskId)).status).toBe("failed");
    await tasks.command(ctx(),{taskIds:[mapped.executionTaskId],command:"retry",idempotencyKey:"t1021-failed-page-retry"});
    const next=(await tasks.claimTask({taskId:mapped.executionTaskId,workerId:"retry-worker"}))!;
    ref={executionTaskId:mapped.executionTaskId,attempt:next.lease.attempt,fenceToken:next.lease.fenceToken};
    expect((await db.select().from(executionTasks).where(eq(executionTasks.id,mapped.executionTaskId)))[0]!.payload).toEqual({aiTaskId:link.taskId,modelInput});
   }
   const generator=createExecutionAssetResultService({db,now:stamp,budget:{maxCalls:3,maxTokens:10000,deadlineMs:60000},objectStorageForCtx:async()=>storage});
   const call=await generator.reserve(ref,128);await generator.start(ref,call.id);
   // 模型字节为本地PNG测试夹具；本测试不进行供应商网络调用。
   const bytes=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/atcAAAAASUVORK5CYII=","base64");
   const receipt=await generator.save(ref,call.id,bytes),candidate=await createExecutionCandidateService(db,{now:stamp,projectCandidate:()=>{throw new Error("禁止旁路");}}).commitResult(ref,{outcome:"succeeded",callId:call.id,text:JSON.stringify(receipt)});
   expect((await db.select().from(assets).where(eq(assets.id,receipt.assetId)))[0]!.status).toBe("pending");
   executionIds.push(mapped.executionTaskId);
   return {nodeId:node.id,taskId:link.taskId!,resultId:candidate.resultId};
  }
  for(const node of saved.document.nodes){if(node.type!=="image_generation")continue;
   if(node.id===ids[1]){await expect(canvas.generate(ctx(),saved.id,node.id,{expectedRevision:saved.revision,attemptId:attempts[node.id]!})).rejects.toThrow("中间页响应丢失");continue;}
   const link=await canvas.generate(ctx(),saved.id,node.id,{expectedRevision:saved.revision,attemptId:attempts[node.id]!});
   selections.push(await settlePage(node,link));
  }
  const successfulCallIds=(await db.select().from(executionCalls)).map(call=>call.id);
  const bad={expectedRevision:saved.revision,groupId:"public-group",outputId:"output-a",platform:"xiaohongshu",title:"公共链路标题",selections:[{...selections[0]!,resultId:selections[1]!.resultId}],attemptId:"public-adopt-bad-0001"};
  await expect(adoption.adopt(ctx(),saved.id,bad)).rejects.toThrow();
  await expect(adoption.adopt(ctx("b"),saved.id,{...bad,selections})).rejects.toThrow();
  const edited={...saved.document,viewport:{x:200,y:100,zoom:0.5},visualGroups:[{...saved.document.visualGroups![0]!,caption:"编辑保存后的配文",pageOrder:[ids[0]!,ids[2]!,ids[1]!]}]};
  saved=await canvas.save(ctx(),saved.id,{expectedRevision:saved.revision,document:edited});
  expect((await canvas.get(ctx(),saved.id)).document.visualGroups![0]!.pageOrder).toEqual(edited.visualGroups[0]!.pageOrder);
  const pending=(await canvas.listTasks(ctx(),saved.id)).find(link=>link.nodeId===ids[1])!;
  expect(pending.taskId).toBeNull();
  const failedNode=saved.document.nodes.find(node=>node.id===ids[1])!;
  if(failedNode.type!=="image_generation")throw new Error("节点类型");
  const resumed=await canvas.generate(ctx(),saved.id,failedNode.id,{expectedRevision:saved.revision,attemptId:pending.attemptId});
  selections.push(await settlePage(failedNode,resumed));
  const callsAfter=await db.select().from(executionCalls);
  expect(callsAfter.filter(call=>successfulCallIds.includes(call.id))).toHaveLength(successfulCallIds.length);
  expect(callsAfter).toHaveLength(successfulCallIds.length+1);
  // 已生成后编辑下一版提示词，用户仍明确选择此前安全候选。
  saved=await canvas.save(ctx(),saved.id,{expectedRevision:saved.revision,document:{...saved.document,nodes:saved.document.nodes.map(node=>node.type==="image_generation"?{...node,prompt:"下一版编辑，仍选历史结果"}:node)}});
  const input={...bad,expectedRevision:saved.revision,selections,attemptId:"public-adopt-good-0001"};
  const envelope=await transport.request(publishingOperations.adoptCanvasMaterial,{params:{canvasId:saved.id},query:undefined,body:input},ctx()) as {data:{publication:{id:string;currentRevisionId:string};revision:{id:string}}};
  const pub=await publishing.getPublication(ctx(),envelope.data.publication.id),revision=await publishing.readRevision(ctx(),pub.id,pub.currentRevisionId!);
  expect(revision.description).toBe("编辑保存后的配文");expect(revision.platformSettings).toMatchObject({visualNote:{pageReceipts:[{nodeId:ids[0]},{nodeId:ids[2]},{nodeId:ids[1]}]}});
  expect((await publishing.exportVisualNote(ctx(),pub.id,revision.id)).files).toHaveLength(3);
  const replay=await adoption.adopt(ctx(),saved.id,input);expect(replay.revision.id).toBe(revision.id);
  await expect(adoption.adopt(ctx(),saved.id,{...input,title:"同键改内容"})).rejects.toThrow("同一");
  expect(submit).toHaveBeenCalledTimes(4);
  expect(submit.mock.calls.filter(call=>call[1].attemptId===attempts[ids[0]!])).toHaveLength(1);
  expect(submit.mock.calls.filter(call=>call[1].attemptId===attempts[ids[2]!])).toHaveLength(1);
  const [source]=await db.select().from(canvasGenerationLinks).where(eq(canvasGenerationLinks.canvasId,saved.id));
  await db.update(aiTasks).set({inputData:{kind:"image",prompt:"任意伪造"}}).where(eq(aiTasks.id,source!.taskId!));
  await expect(canvas.resolveMaterialSelections(ctx(),saved.id,{expectedRevision:saved.revision,groupId:"public-group",selections})).rejects.toThrow("输入");
 }finally{await rm(dir,{recursive:true,force:true});}
});

it("封面库替换保留既有正文标签其他设置及图文余页",async()=>{
 const s=service(),oldNote={...visualNote,imageMode:"carousel" as const,orderedAssetIds:["old-cover","old-body"],pageReceipts:[visualNote.pageReceipts[0]!,{nodeId:"old-body-node",fileId:"old-body-file",checksum:"body-digest"}]};
 const pub=await s.adoptDraft(ctx(),{...rich,adoptionKey:"cover-preserve-base",description:"既有正文不能擦掉",coverAssetId:"old-cover",platformSettings:{visualNote:oldNote,otherPlatformSetting:{keep:true}}});
 const canvas={get:async()=>({revision:4,projectId:"project-a"}),resolveMaterialSelections:async()=>({canvasId:"cover-canvas",projectId:"project-a",revision:4,group:{id:"cover-group",libraryKind:"cover" as const,caption:"",aspectRatio:"16:9",pageOrder:["new-cover"]},pages:[{nodeId:"new-cover",assetId:"new-cover-asset",fileId:"new-cover-file",checksum:"new-cover-digest"}]}),verifyMaterialSettlement:async()=>{}};
 const confirm=vi.fn(async()=>{}),adoption=createVisualMaterialAdoptionService({canvas,publishing:s,confirmGeneratedTask:confirm,assertFrozenImage:async()=>({fileId:"new-cover-file",checksum:"new-cover-digest"}),assertOutputProject:async()=>{}});
 const result=await adoption.adopt(ctx(),"cover-canvas",{expectedRevision:4,groupId:"cover-group",outputId:"output-a",publicationId:pub.id,expectedCurrentRevisionId:pub.currentRevisionId!,platform:"xiaohongshu",title:"新封面标题",selections:[{nodeId:"new-cover"}],attemptId:"cover-preserve-attempt-0001"});
 expect(result.revision).toMatchObject({description:"既有正文不能擦掉",coverAssetId:"new-cover-asset",platformTags:["教育"],category:"保留分类",series:"保留系列",platformSettings:{otherPlatformSetting:{keep:true},visualNote:{orderedAssetIds:["new-cover-asset","old-body"],pageReceipts:[{nodeId:"new-cover"},{nodeId:"old-body-node"}]},visualCover:{sourceCanvasId:"cover-canvas",aspectRatio:"16:9"}}});
 expect(confirm).not.toHaveBeenCalled();
});

it("新建rich草稿并发同键唯一，改页序不能重放为成功",async()=>{
 const s=service(),note={...visualNote,imageMode:"carousel" as const,orderedAssetIds:["asset-1","asset-2"],pageReceipts:[{nodeId:"n1",fileId:"f1",checksum:"c1"},{nodeId:"n2",fileId:"f2",checksum:"c2"}]},input={...rich,adoptionKey:"draft-concurrent-rich",coverAssetId:"asset-1",platformSettings:{visualNote:note}};
 const pair=await Promise.all([s.adoptDraft(ctx(),input),s.adoptDraft(ctx(),input)]);expect(pair[0]!.id).toBe(pair[1]!.id);
 await expect(s.adoptDraft(ctx(),{...input,platformSettings:{visualNote:{...note,orderedAssetIds:["asset-2","asset-1"],pageReceipts:[note.pageReceipts[1]!,note.pageReceipts[0]!]}}})).rejects.toThrow("同一");
 expect(await s.listRevisions(ctx(),pair[0]!.id,{limit:20,offset:0})).toHaveLength(1);
});
it("整套一页缺失时，同一导出操作仍可下载其余冻结页，页码不越界",async()=>{
 const calls=vi.fn(async(_c:RequestContext,assetId:string,fileId:string,checksum:string)=>{if(assetId==='asset-a')throw new Error('缺失第1页');return {url:`https://example.invalid/${assetId}/${fileId}`,fileName:'second.png'};});
 const s=createPublishingService({db,now:()=>"2026-10-04T00:00:00.000Z",nextId:p=>`${p}-${++counter}`,resolveOutputOwner:async(c,id)=>c.accountId==="a"&&id==="output-a"?{projectId:"project-a",source:"user",status:"active",title:"稿件"}:null,getFrozenImageDownload:calls});
 const note={...visualNote,imageMode:'carousel' as const,orderedAssetIds:['asset-a','asset-b'],pageReceipts:[visualNote.pageReceipts[0]!,{...visualNote.pageReceipts[0]!,nodeId:'node-two',fileId:'second-frozen',checksum:'second-checksum'}]};
 const pub=await s.adoptDraft(ctx(),{...rich,platformSettings:{visualNote:note},adoptionKey:'export-partial'});
 await expect(s.exportVisualNote(ctx(),pub.id,pub.currentRevisionId!)).rejects.toThrow('缺失第1页');calls.mockClear();
 const transport=createPublishingTransport(()=>s);const response=await transport.request(publishingOperations.exportPublicationVisualNote,{params:{publicationId:pub.id},query:undefined,body:{revisionId:pub.currentRevisionId!,pageIndex:1}},ctx());
 expect(response).toMatchObject({data:{files:[{assetId:'asset-b',url:'https://example.invalid/asset-b/second-frozen',fileName:'02-second.png'}]}});expect(calls).toHaveBeenCalledExactlyOnceWith(ctx(),'asset-b','second-frozen','second-checksum');
 await expect(s.exportVisualNote(ctx(),pub.id,pub.currentRevisionId!,2)).rejects.toThrow('页码不存在');await expect(s.exportVisualNote(ctx('b'),pub.id,pub.currentRevisionId!,1)).rejects.toThrow();
});
