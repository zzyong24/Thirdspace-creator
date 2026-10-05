import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDb, projects, contentOutputs, productions, type Db } from "@creatoros/backend";
import { ENDPOINTS, type RequestContext } from "@creatoros/contract";
import { createProductionService } from "./production.service";
import { createProductionTransport } from "./production.transport";
import {mkdtemp,rm} from "node:fs/promises";
import {join} from "node:path";
import {tmpdir} from "node:os";
import { itemDigest } from "./production-editor-plan";

const now="2026-10-01T10:00:00.000Z";
const ctx:RequestContext={userId:"user",accountId:"account-a",source:"user",requestId:"http-request"};
const plan=()=>({extra:{preserve:true},renderProps:{meta:{title:"视频A"},talkingHead:{file:"master",durationSec:20},
  scenes:[{id:"scene",title:"正文",label:"正文",startSec:0,endSec:20,cards:[]}],captions:[{start:0,end:4,cn:"原文"}],broll:[]}});
let db:Db, close:(()=>Promise<void>)|undefined, seq=0;
const service=()=>createProductionService({db,now:()=>now,nextId:p=>`${p}-${++seq}`,assertEditorAsset:async(_ctx,input)=>{if(input.assetId!=="master")throw new Error("非当前项目素材");}});
beforeEach(async()=>{
  const opened=await createDb();db=opened.db;close=()=>opened.client.close();seq=0;
  for(const [id,accountId] of [["project-a","account-a"],["project-b","account-b"]]) {
    await db.insert(projects).values({id:id!,userId:"user",accountId:accountId!,title:"真实项目",creationMode:"guided",status:"active",currentStage:"production",startedAt:now,createdAt:now,updatedAt:now});
  }
  for(const [id,projectId,contentType] of [["image","project-a","image"],["article","project-a","article"],["video-a","project-a","video"],["video-b","project-a","video"],["other-account","project-b","video"]]) {
    await db.insert(contentOutputs).values({id:id!,projectId:projectId!,contentType:contentType!,title:id!,status:"drafting",createdAt:now,updatedAt:now});
  }
});
afterEach(async()=>{await close?.();close=undefined;});
const save=(requestId:string,expectedRevision=0)=>({expectedRevision,requestId,plan:plan(),source:"manual" as const});

describe("T-1037 公共制作工程与持久版本",()=>{
  it("纯读不创建工程，保存→公共读回→重新装配，未知字段与另一作品保持独立",async()=>{
    const s=service();expect((await s.getEditor(ctx,"video-a")).state).toBe("empty");
    expect(await s.readProduction(ctx,"video-a")).toBeNull();
    const result=await s.saveEditor(ctx,"video-a",save("request-save-0001"));expect(result.revision).toBe(1);
    const transport=createProductionTransport(service);
    const read=await transport.request(ENDPOINTS.getProductionEditor,{params:{outputId:"video-a"},query:undefined,body:undefined},ctx) as {data:unknown};
    expect(ENDPOINTS.getProductionEditor.response.parse(read.data)).toMatchObject({revision:1,state:"editable",plan:{extra:{preserve:true}}});
    expect((await service().getEditor(ctx,"video-b")).state).toBe("empty");
    expect((await service().getEditor(ctx,"video-a")).plan).toEqual(result.plan);
  });
  it("同请求重试返回原回执，即使最新稿已变化；异 payload 拒绝",async()=>{
    const s=service(), original=await s.saveEditor(ctx,"video-a",save("request-save-0001"));
    await s.saveEditor(ctx,"video-a",{...save("request-save-0002",1),plan:{...original.plan,extra:"第二版"}});
    expect(await s.saveEditor(ctx,"video-a",save("request-save-0001"))).toEqual(original);
    await expect(s.saveEditor(ctx,"video-a",{...save("request-save-0001"),plan:{...plan(),extra:"不同输入"}})).rejects.toThrow();
    expect((await s.getEditor(ctx,"video-a")).revision).toBe(2);
  });
  it("并发同一前值只成功一次，历史分页与恢复追加新版本",async()=>{
    const s=service(),first=await s.saveEditor(ctx,"video-a",save("request-save-0001"));
    const results=await Promise.allSettled([s.saveEditor(ctx,"video-a",{...save("request-save-0002",1),plan:first.plan}),s.saveEditor(ctx,"video-a",{...save("request-save-0003",1),plan:first.plan})]);
    expect(results.filter(r=>r.status==="fulfilled")).toHaveLength(1);
    const history=await s.listEditorVersions(ctx,"video-a",{limit:1,offset:0});expect(history.total).toBe(2);expect(history.items).toHaveLength(1);
    const restored=await s.restoreEditor(ctx,"video-a",{expectedRevision:2,sourceRevision:1,requestId:"request-restore-01"});
    expect(restored.revision).toBe(3);expect((await s.getEditorVersion(ctx,"video-a",1)).plan.renderProps).toEqual((await s.getEditorVersion(ctx,"video-a",3)).plan.renderProps);
  });
  it("旧确认/排除仍可用并保存原件；转换后旧素材批删和旧确认均零写入",async()=>{
    const s=service();await s.getProduction(ctx,"video-a");
    await s.confirmEditingPlan(ctx,"video-a",{expectedRevision:0,plan:{...plan(),renderProps:{...plan().renderProps,broll:[{file:"same",at:5,durationSec:2,label:"素材"}]}}});
    const old=await s.getEditor(ctx,"video-a");expect(old.state).toBe("legacy");
    await s.removeEditingPlanBroll(ctx,"video-a",{expectedRevision:1,assetId:"same"});
    const removed=await s.getEditor(ctx,"video-a");expect(removed.plan!.excludedAssetIds).toEqual(["same"]);
    expect((await s.getEditorVersion(ctx,"video-a",1)).plan.renderProps).toMatchObject({broll:[{file:"same"}]});
    await s.saveEditor(ctx,"video-a",{expectedRevision:2,requestId:"request-convert-01",plan:removed.plan!,source:"manual"});
    await expect(s.removeEditingPlanBroll(ctx,"video-a",{expectedRevision:3,assetId:"same"})).rejects.toThrow("选中");
    await expect(s.confirmEditingPlan(ctx,"video-a",{expectedRevision:3,plan:plan()})).rejects.toThrow();
    expect((await s.getEditor(ctx,"video-a")).revision).toBe(3);
  });
  it("旧 PUT 非法状态失败零写入，旧删除丢失回执可恢复同一版本",async()=>{
    const s=service();await s.getProduction(ctx,"video-a");
    const t=createProductionTransport(service);
    const before=await s.getProduction(ctx,"video-a");
    await expect(t.request(ENDPOINTS.putOutputProduction,{params:{outputId:"video-a"},query:undefined,
      body:{status:"ready",recordingConfig:{videoEditingPlan:{...plan(),revision:0}}}},ctx)).rejects.toThrow();
    expect((await s.getProduction(ctx,"video-a")).recordingConfig).toEqual(before.recordingConfig);
    expect((await s.listEditorVersions(ctx,"video-a",{})).total).toBe(0);
  });
  it("旧删除丢失回执可恢复同一版本",async()=>{
    const s=service();await s.getProduction(ctx,"video-a");
    await s.confirmEditingPlan(ctx,"video-a",{expectedRevision:0,plan:{...plan(),renderProps:{...plan().renderProps,broll:[{file:"same",at:5,durationSec:2,label:"素材"}]}}});
    const body={expectedRevision:1,assetId:"same"};
    const original=await s.removeEditingPlanBroll(ctx,"video-a",body);
    const retry=await s.removeEditingPlanBroll(ctx,"video-a",body);
    expect(retry.recordingConfig).toEqual(original.recordingConfig);
    expect((await s.getEditor(ctx,"video-a")).revision).toBe(2);
    expect((await s.listEditorVersions(ctx,"video-a",{})).total).toBe(2);
  });
  it("旧PUT成功后转换新版，原请求仍可恢复且不覆盖新版",async()=>{
    const s=service();await s.getProduction(ctx,"video-a");
    const body={status:"recording" as const,recordingConfig:{device:"原设备",videoEditingPlan:{...plan(),revision:0}}};
    await s.updateProduction(ctx,"video-a",body);
    const old=await s.getEditor(ctx,"video-a");
    await s.saveEditor(ctx,"video-a",{expectedRevision:1,requestId:"request-convert-02",plan:old.plan!,source:"manual"});
    await s.updateProduction(ctx,"video-a",body);
    expect(await s.getEditor(ctx,"video-a")).toMatchObject({revision:2,state:"editable"});
    expect((await s.listEditorVersions(ctx,"video-a",{})).total).toBe(2);
  });
  it("真实磁盘数据库关闭重开，正常迁移重复启动后版本与回执仍可读",async()=>{
    const root=await mkdtemp(join(tmpdir(),"creatoros-editor-persistence-"));
    await close!();close=undefined;
    try {
      let opened=await createDb({dataDir:root});db=opened.db;close=()=>opened.client.close();
      await db.insert(projects).values({id:"project-a",userId:"user",accountId:"account-a",title:"重启项目",creationMode:"guided",status:"active",currentStage:"production",startedAt:now,createdAt:now,updatedAt:now});
      await db.insert(contentOutputs).values({id:"video-a",projectId:"project-a",contentType:"video",title:"视频",status:"drafting",createdAt:now,updatedAt:now});
      const saved=await service().saveEditor(ctx,"video-a",save("request-restart-01"));
      await close();close=undefined;
      opened=await createDb({dataDir:root});db=opened.db;close=()=>opened.client.close();
      expect((await service().getEditor(ctx,"video-a")).plan).toEqual(saved.plan);
      expect(await service().getEditorReceipt(ctx,"video-a","request-restart-01")).toEqual(saved);
      expect((await service().listEditorVersions(ctx,"video-a",{})).total).toBe(1);
    } finally {await close?.();close=undefined;await rm(root,{recursive:true,force:true});}
  // 两次真实磁盘createDb均执行正常迁移；仅该IO用例留30秒，不改变生产deadline或断言。
  },30000);
  it("新素材归属失败、整批前值失败均不留下半成品或历史",async()=>{
    const s=service(), bad=plan();bad.renderProps.talkingHead.file="other-account-asset";
    await expect(s.saveEditor(ctx,"video-a",{...save("request-badasset-1"),plan:bad})).rejects.toThrow();
    expect(await s.readProduction(ctx,"video-a")).toBeNull();
    const initial=await s.saveEditor(ctx,"video-a",save("request-save-0001"));
    const cap=(initial.plan.renderProps as {captions:Array<{id:string}>}).captions[0]!;
    await expect(s.applyEditor(ctx,"video-a",{expectedRevision:1,requestId:"request-badbatch-1",edits:[{type:"updateCaption",itemId:cap.id,expectedItemDigest:itemDigest(cap),patch:{cn:"不可半写"}},{type:"removeItem",itemId:"missing",expectedItemDigest:"sha256:"+"0".repeat(64)}]})).rejects.toThrow();
    expect((await s.getEditor(ctx,"video-a")).revision).toBe(1);expect((await s.listEditorVersions(ctx,"video-a",{})).total).toBe(1);
  });
  it("冻结 A 后保存 B；提交回执丢失重试同任务，另一请求另一个任务",async()=>{
    const tasks=new Map<string,{id:string}>();let loseReply=true;
    const create=vi.fn(async(_ctx:RequestContext,input:{attemptId:string;spec:unknown})=>{
      const result=tasks.get(input.attemptId)??{id:`task-${tasks.size+1}`};tasks.set(input.attemptId,result);
      if(loseReply){loseReply=false;throw new Error("模拟创建后回执丢失");}return result;
    });
    const s=createProductionService({db,now:()=>now,nextId:p=>`${p}-${++seq}`,assertEditorAsset:async()=>{},createEditorRender:create});
    const a=await s.saveEditor(ctx,"video-a",save("request-save-0001"));
    await expect(s.renderEditor(ctx,"video-a",{revision:1,requestId:"request-render-01"})).rejects.toThrow();
    expect((await s.listEditorRenders(ctx,"video-a",{})).items[0]).toMatchObject({revision:1,taskId:null,assetId:null});
    await s.saveEditor(ctx,"video-a",{...save("request-save-0002",1),plan:{...a.plan,renderProps:{...(a.plan.renderProps as object),meta:{title:"第二版"}}}});
    const retried=await s.renderEditor(ctx,"video-a",{revision:1,requestId:"request-render-01"});expect(retried.taskId).toBe("task-1");
    expect(retried.spec.params.props).toMatchObject({meta:{title:"视频A"}});
    const another=await s.renderEditor(ctx,"video-a",{revision:1,requestId:"request-render-02"});expect(another.taskId).toBe("task-2");
    expect(tasks.size).toBe(2);expect((await s.getEditor(ctx,"video-a")).revision).toBe(2);
    await expect(s.renderEditor(ctx,"video-a",{revision:2,requestId:"request-render-01"})).rejects.toThrow();
  });
  it("双账号、非视频读写拒绝，重试也重新鉴权",async()=>{
    const s=service();await s.saveEditor(ctx,"video-a",save("request-save-0001"));
    await expect(s.getEditor({...ctx,accountId:"account-b"},"video-a")).rejects.toThrow();
    await expect(s.saveEditor({...ctx,accountId:"account-b"},"video-a",save("request-save-0001"))).rejects.toThrow();
    await expect(s.getEditor(ctx,"image")).rejects.toThrow();await expect(s.saveEditor(ctx,"article",save("request-save-0001"))).rejects.toThrow();
    await expect(s.getEditorVersion(ctx,"other-account",1)).rejects.toThrow();
  });
  it("局部应用与回执共享版本，通用 put 不能覆盖新版工程",async()=>{
    const s=service(), initial=await s.saveEditor(ctx,"video-a",save("request-save-0001"));
    const cap=(initial.plan.renderProps as {captions:Array<{id:string}>}).captions[0]!;
    const applied=await s.applyEditor(ctx,"video-a",{expectedRevision:1,requestId:"request-apply-0001",edits:[{type:"updateCaption",itemId:cap.id,expectedItemDigest:itemDigest(cap),patch:{cn:"用户修改"}}]});
    expect(applied.revision).toBe(2);expect(await s.getEditorReceipt(ctx,"video-a","request-apply-0001")).toEqual(applied);
    await expect(s.updateProduction(ctx,"video-a",{recordingConfig:{videoEditingPlan:plan()}})).rejects.toThrow();
    expect((await s.getEditor(ctx,"video-a")).revision).toBe(2);
  });
});


describe("T-1038 同源预览公共接口",()=>{
  it("未保存预览使用真实模板与权威MIME，没有版本或任务副作用",async()=>{
    const resolve=vi.fn(async(_ctx:RequestContext,input:{assetId:string})=>({url:"https://media.example/"+input.assetId+"?signed=short",mimeType:"video/mp4"}));
    const createRender=vi.fn();
    const s=createProductionService({db,now:()=>now,nextId:p=>`${p}-${++seq}`,assertEditorAsset:async()=>{},resolveEditorMedia:resolve,createEditorRender:createRender});
    const t=createProductionTransport(()=>s);
    const result=await t.request(ENDPOINTS.previewProductionEditor,{params:{outputId:"video-a"},query:undefined,body:{expectedRevision:0,requestId:"request-preview-01",plan:plan()}},ctx) as {data:{html:string;durationSec:number;warnings:string[]}};
    expect(result.data.html).toContain('src="https://media.example/master?signed=short"');
    expect(result.data.html).toContain("window.__timelines");expect(result.data.durationSec).toBe(20);
    expect(await s.readProduction(ctx,"video-a")).toBeNull();expect((await s.listEditorVersions(ctx,"video-a",{})).total).toBe(0);expect(createRender).not.toHaveBeenCalled();
    expect(resolve).toHaveBeenCalledWith(ctx,{projectId:"project-a",assetId:"master"});
  });
  it("过期版本、错账号、非视频、坏素材URL均拒绝，保留已保存工程",async()=>{
    const s=createProductionService({db,now:()=>now,nextId:p=>`${p}-${++seq}`,assertEditorAsset:async()=>{},resolveEditorMedia:async()=>({url:"javascript:alert(1)",mimeType:"video/mp4"})});
    const body={expectedRevision:0,requestId:"request-preview-02",plan:plan()};
    await expect(s.previewEditor(ctx,"other-account",body)).rejects.toThrow();
    await expect(s.previewEditor(ctx,"image",body)).rejects.toThrow();
    await expect(s.previewEditor(ctx,"video-a",body)).rejects.toThrow();
    const saved=await s.saveEditor(ctx,"video-a",save("request-save-0088"));
    await expect(s.previewEditor(ctx,"video-a",body)).rejects.toThrow("版本");
    expect((await s.getEditor(ctx,"video-a")).plan).toEqual(saved.plan);
  });
});

describe("T-850 v2 空工程与来源目录边界",()=>{
 const empty=()=>({editorVersion:2,mainTrack:{sources:[],clips:[]},overlayDraft:{meta:{title:"粗剪"},scenes:[],captions:[],broll:[],delivery:{width:1920,height:1080,fps:30}},sourceTranscripts:[]});
 it("公共保存、读取、回执、历史恢复支持空粗剪稿且不能被旧方案覆盖",async()=>{
  const s=service();const body={expectedRevision:0,requestId:"request-v2-empty-01",plan:empty(),source:"manual" as const};
  const saved=await s.saveEditor(ctx,"video-a",body);
  expect(await s.getEditor(ctx,"video-a")).toMatchObject({state:"editable",revision:1,plan:{editorVersion:2,mainTrack:{clips:[]}}});
  expect(await s.saveEditor(ctx,"video-a",body)).toEqual(saved);
  const restored=await s.restoreEditor(ctx,"video-a",{expectedRevision:1,sourceRevision:1,requestId:"request-v2-restore-01"});expect(restored.revision).toBe(2);
  await expect(s.saveEditor(ctx,"video-a",{...save("request-v2-old-overwrite",2)})).rejects.toThrow();
  await expect(s.updateProduction(ctx,"video-a",{recordingConfig:{videoEditingPlan:plan()}})).rejects.toThrow();
  expect((await s.getEditor(ctx,"video-a")).revision).toBe(2);
 });
 it("普通保存不能伪造来源、探针、转写回执或旧快照，失败不建历史",async()=>{
  const s=service(),base=empty();
  const source={sourceId:"s",assetId:"master",assetFileId:"f",fileDigest:"a".repeat(64),probeDigest:"b".repeat(64),timebase:{num:1,den:30},durationTicks:300,hasAudio:true};
  await expect(s.saveEditor(ctx,"video-a",{expectedRevision:0,requestId:"request-v2-fake-source",source:"manual",plan:{...base,mainTrack:{sources:[source],clips:[]}}})).rejects.toThrow();
  expect(await s.readProduction(ctx,"video-a")).toBeNull();
  await s.saveEditor(ctx,"video-a",{expectedRevision:0,requestId:"request-v2-good-empty",source:"manual",plan:base});
  await expect(s.saveEditor(ctx,"video-a",{expectedRevision:1,requestId:"request-v2-fake-snapshot",source:"manual",plan:{...base,legacySnapshot:{pretend:true}}})).rejects.toThrow();
  expect((await s.listEditorVersions(ctx,"video-a",{})).total).toBe(1);
 });
});

it("T-850 公共预览和冻结渲染读取同一已保存主轨，不取素材当前文件",async()=>{
 const source={sourceId:"source",assetId:"master",assetFileId:"frozen",fileDigest:"a".repeat(64),probeDigest:"b".repeat(64),timebase:{num:1,den:3},durationTicks:30,hasAudio:true};
 const draft={editorVersion:2,mainTrack:{sources:[source],clips:[{clipId:"one",sourceId:"source",sourceInTicks:1,sourceOutTicks:4},{clipId:"again",sourceId:"source",sourceInTicks:5,sourceOutTicks:8}]},overlayDraft:{meta:{title:"两段原片"},scenes:[],captions:[],broll:[],delivery:{width:1920,height:1080,fps:30}},sourceTranscripts:[]};
 // 此为已注册源快照的集成 fixture，不冒充真实探针/ASR 验收。
 await db.insert(productions).values({id:"production-fixture",userId:"user",contentOutputId:"video-a",recordingConfig:{videoEditingPlan:{...draft,revision:0}},updatedAt:now});
 const reads:unknown[]=[],checks:unknown[]=[],tasks:unknown[]=[];
 const owner=createProductionService({db,now:()=>now,nextId:p=>`${p}-${++seq}`,assertEditorAsset:async(_c,input)=>{checks.push(input);},resolveEditorMedia:async(_c,input)=>{reads.push(input);return{url:"/real-owned-file",mimeType:"video/mp4"};},createEditorRender:async(_c,input)=>{tasks.push(input);return{id:"original-render"};}});
 const saved=await owner.saveEditor(ctx,"video-a",{expectedRevision:0,requestId:"request-v2-two-clips",plan:draft,source:"manual"});
 const preview=await owner.previewEditor(ctx,"video-a",{expectedRevision:1,requestId:"request-v2-preview",plan:saved.plan});
 expect(preview.durationSec).toBe(2);expect(preview.html).toContain('data-media-start="0.333333"');expect(reads).toHaveLength(2);expect(reads).toEqual(expect.arrayContaining([expect.objectContaining({assetId:"master",assetFileId:"frozen",fileDigest:source.fileDigest})]));
 const render=await owner.renderEditor(ctx,"video-a",{revision:1,requestId:"request-v2-render"});expect(render.taskId).toBe("original-render");
 expect(render.spec.inputs).toHaveLength(2);expect(render.spec.inputs.every(i=>i.assetFileId==="frozen"&&i.fileDigest===source.fileDigest)).toBe(true);expect(render.spec.params.props).toMatchObject({talkingHead:{durationSec:preview.durationSec,clips:[{sourceInSec:1/3},{sourceInSec:5/3}]}});
 expect(await owner.renderEditor(ctx,"video-a",{revision:1,requestId:"request-v2-render"})).toEqual(render);expect(tasks).toHaveLength(1);
 expect(checks).toEqual(expect.arrayContaining([expect.objectContaining({assetFileId:"frozen"})]));
 await expect(owner.previewEditor({...ctx,accountId:"account-b"},"video-a",{expectedRevision:1,requestId:"request-v2-preview",plan:saved.plan})).rejects.toThrow();
},20000);
it("T-850 v2新增图层在保存与应用时核验归属，拒绝后原版本保留",async()=>{
 const owner=service(),empty={editorVersion:2,mainTrack:{sources:[],clips:[]},overlayDraft:{meta:{title:"空工程"},scenes:[],captions:[],broll:[],delivery:{width:1920,height:1080,fps:30}},sourceTranscripts:[]};
 await owner.saveEditor(ctx,"video-a",{expectedRevision:0,requestId:"request-v2-overlay-base",plan:empty});
 const broll={id:"foreign",at:0,file:"foreign-asset",durationSec:1,label:"其他账号",big:false,anchor:{kind:"timeline" as const,startUs:0,endUs:1000000}};
 await expect(owner.saveEditor(ctx,"video-a",{expectedRevision:1,requestId:"request-v2-overlay-save",plan:{...empty,overlayDraft:{...empty.overlayDraft,broll:[broll]}}})).rejects.toThrow("素材");
 await expect(owner.applyEditor(ctx,"video-a",{expectedRevision:1,requestId:"request-v2-overlay-apply",edits:[{type:"addBroll",broll}]})).rejects.toThrow("素材");
 expect((await owner.getEditor(ctx,"video-a")).revision).toBe(1);expect((await owner.listEditorVersions(ctx,"video-a",{})).total).toBe(1);
});
it("T-850 原片预约恢复原任务，采用真实任务回执原子写来源和主轨，不信客户端时长",async()=>{
 let creates=0,lose=true;const tasks=new Map<string,import("@creatoros/contract").ExecutionTaskResource>();
 const probe={fileDigest:"a".repeat(64),probeDigest:"b".repeat(64),timebase:{num:1,den:30},durationTicks:60,hasAudio:true};
 const owner=createProductionService({db,now:()=>now,nextId:p=>`${p}-${++seq}`,sourcePorts:{assertTaskSettled:async()=>{},
  readMediaFile:async(_ctx,input)=>{if(input.assetId!=="master"||input.assetFileId!=="frozen")throw Error("越权媒体");return{fileDigest:probe.fileDigest,mimeType:"video/mp4"};},
  createTask:async(_ctx,input)=>{if(!tasks.size){creates++;tasks.set("original-probe",{id:"original-probe",userId:"user",projectId:"project-a",taskType:"exec.media.probe",execType:"media.probe",status:"awaiting_confirmation",spec:input.spec,manifest:{taskType:"media.probe",artifacts:[],summary:"已完成",meta:{probe}},adoptedAssetIds:[],requestedAt:now,startedAt:now,completedAt:now,errorMessage:null});}if(lose){lose=false;throw Error("探针创建回复丢失");}return{id:"original-probe"};},readTask:async(_c,id)=>tasks.get(id)!,
 }});
 const input={assetId:"master",assetFileId:"frozen",requestId:"request-source-probe"};
 await expect(owner.prepareEditorSource(ctx,"video-a",input)).rejects.toThrow("回复丢失");expect((await owner.getEditorSource(ctx,"video-a",input.requestId)).status).toBe("reserved");
 const ready=await owner.prepareEditorSource(ctx,"video-a",input);expect(ready).toMatchObject({taskId:"original-probe",status:"succeeded",probe});expect(creates).toBe(1);expect((await owner.getEditor(ctx,"video-a")).state).toBe("empty");
 await expect(owner.prepareEditorSource(ctx,"video-a",{...input,assetFileId:"other"})).rejects.toThrow();
 const adopted=await owner.adoptEditorSource(ctx,"video-a",{sourceRequestId:input.requestId,expectedRevision:0,requestId:"request-source-adopt"});expect(adopted.plan).toMatchObject({editorVersion:2,mainTrack:{sources:[{assetFileId:"frozen",durationTicks:60}],clips:[{sourceInTicks:0,sourceOutTicks:60}]}});
 expect(await owner.adoptEditorSource(ctx,"video-a",{sourceRequestId:input.requestId,expectedRevision:0,requestId:"request-source-adopt"})).toEqual(adopted);
 await expect(owner.adoptEditorSource(ctx,"video-a",{sourceRequestId:input.requestId,expectedRevision:0,requestId:"request-source-adopt",addWholeClip:false})).rejects.toThrow();
 await expect(owner.getEditorSource({...ctx,accountId:"account-b"},"video-a",input.requestId)).rejects.toThrow();
},20000);
it("T-850 公共原任务重试→真实ffprobe→采用，丢回复不复制任务且文件字节冻结",async()=>{
 const {execFile}=await import("node:child_process"),{promisify}=await import("node:util"),{readFile,copyFile,stat}=await import("node:fs/promises"),{createHash}=await import("node:crypto");
 const {createAiService}=await import("../ai/ai.service"),{createExecutionService}=await import("../execution/execution.service"),{runExecutionTask,abortExecutionTask}=await import("../execution/run-execution-task"),{createExecutorRegistry}=await import("../execution/executor-registry"),{createMediaProbeExecutor}=await import("../execution/media-probe");
 const root=await mkdtemp(join(tmpdir(),"creatoros-public-probe-retry-")),file=join(root,"original.mp4");
 try{
  await promisify(execFile)("/opt/homebrew/bin/ffmpeg",["-v","error","-f","lavfi","-i","testsrc2=size=320x180:rate=30","-t","1","-c:v","libx264","-pix_fmt","yuv420p",file]);
  const fileDigest=createHash("sha256").update(await readFile(file)).digest("hex");
  // 未使用的领域采纳口明确抛错，不返回虚构领域实体；本测试真正调用原任务 owner。
  const unavailable=new Proxy({}, {get:()=>()=>{throw Error("该领域端口不属于探针旅程");}});
  type Deps=Parameters<typeof createAiService>[0];
  const ai=createAiService({db,now:()=>now,nextId:p=>`${p}-${++seq}`,artifacts:unavailable as Deps["artifacts"],knowledge:unavailable as Deps["knowledge"],candidate:unavailable as Deps["candidate"],learnings:unavailable as Deps["learnings"],publishing:unavailable as Deps["publishing"],materialLinks:unavailable as Deps["materialLinks"],positioning:unavailable as Deps["positioning"],calibration:unavailable as Deps["calibration"]});
  const registry=createExecutorRegistry();registry.register(createMediaProbeExecutor());
  const execution=createExecutionService({ai,assets:{createGeneratedAsset:async()=>{throw Error("探针不创建素材");}},hasExecutor:type=>registry.has(type),workspacesRoot:root,abortRun:abortExecutionTask,resolveOutputProjectId:async(_c,id)=>id==="video-a"?"project-a":null});
  let transient=true;const run=async(task:import("@creatoros/contract").ExecutionTaskResource)=>runExecutionTask(ctx,{id:task.id,inputData:{spec:task.spec},deterministicGeneration:task.deterministicGeneration},{ai,registry,workspacesRoot:root,assets:{materializeAsset:async(_c,id,path,exact)=>{if(id!=="master"||exact?.assetFileId!=="frozen"||exact?.fileDigest!==fileDigest)throw Error("冻结原片不一致");if(transient){transient=false;throw Error("fixture临时读取故障");}await copyFile(file,path);return{size:(await stat(path)).size,mimeType:"video/mp4"};}}});
  let lost=true;const owner=createProductionService({db,now:()=>now,nextId:p=>`${p}-${++seq}`,sourcePorts:{assertTaskSettled:(c,id,generation,digest,tx)=>ai.probeControl.assertSettled(c,id,generation,digest,tx),readMediaFile:async(_c,input)=>{if(input.assetId!=="master"||input.assetFileId!=="frozen")throw Error("原片身份不一致");return{fileDigest:createHash("sha256").update(await readFile(file)).digest("hex"),mimeType:"video/mp4"};},createTask:async(c,input)=>{const task=await execution.create(c,input);await run(task);return{id:task.id};},readTask:(c,id)=>execution.get(c,id),retryTask:async(c,input)=>{await ai.probeControl.retry(c,input);const task=await execution.get(c,input.taskId);if(task.status==="queued")await run(task);if(lost){lost=false;throw Error("恢复回复丢失");}}}});
  const transport=createProductionTransport(()=>owner),params={outputId:"video-a"};
  const prepared=await transport.request(ENDPOINTS.prepareProductionEditorSource,{params,query:undefined,body:{assetId:"master",assetFileId:"frozen",requestId:"public-source-retry"}},ctx) as {data:import("@creatoros/contract").ProductionSourceRequest};expect(prepared.data.status).toBe("failed");
  const original=await ai.getTask(ctx,prepared.data.taskId!),body={sourceRequestId:"public-source-retry",requestId:"public-retry-command"};
  await expect(transport.request(ENDPOINTS.retryProductionEditorSource,{params,query:undefined,body},ctx)).rejects.toThrow("回复丢失");
  const recovered=await transport.request(ENDPOINTS.retryProductionEditorSource,{params,query:undefined,body},ctx) as {data:import("@creatoros/contract").ProductionSourceRequest};expect(recovered.data).toMatchObject({taskId:original.id,status:"succeeded",probe:{fileDigest,durationTicks:15360,hasAudio:false}});
  const current=await ai.getTask(ctx,original.id);expect(current.inputData).toEqual(original.inputData);expect(current.attemptId).toBe(original.attemptId);expect(current.deterministicGeneration).toBe(1);expect((await ai.listTasks(ctx,{limit:100,offset:0})).total).toBe(1);
  const adopted=await transport.request(ENDPOINTS.adoptProductionEditorSource,{params,query:undefined,body:{sourceRequestId:body.sourceRequestId,requestId:"public-probe-adopt",expectedRevision:0,addWholeClip:true}},ctx) as {data:import("@creatoros/contract").ProductionEditorVersion};expect(adopted.data.plan).toMatchObject({editorVersion:2,mainTrack:{sources:[{fileDigest,assetFileId:"frozen"}],clips:[{sourceInTicks:0,sourceOutTicks:15360}]}});
 }finally{await rm(root,{recursive:true,force:true});}
},20000);

describe('T1042 完整开源剪辑工作台沿原owner保存',()=>{
 const native=()=>({editorVersion:3,referenceEditor:{editor:'opencut-classic',revision:'cf5e79e919144200294fb9fed22a222592a0aeea',nativeDocument:{metadata:{name:'开源剪辑'},scenes:[{tracks:[{elements:[{type:'media',mediaId:'media-master',trimStart:1,trimEnd:2}]}]}]},mediaRefs:[{mediaId:'media-master',assetId:'master',assetFileId:'exact-file'}]}});
 it('完整原生JSON沿CAS保存读回、幂等、另一作品和账号隔离',async()=>{
  const owner=service(),body={expectedRevision:0,requestId:'request-native-001',plan:native()};
  const first=await owner.saveEditor(ctx,'video-a',body);
  expect((await service().getEditor(ctx,'video-a'))).toMatchObject({state:'editable',revision:1,plan:{referenceEditor:native().referenceEditor}});
  expect(await owner.saveEditor(ctx,'video-a',body)).toEqual(first);
  expect((await owner.getEditor(ctx,'video-b')).state).toBe('empty');
  await expect(owner.saveEditor(ctx,'other-account',body)).rejects.toThrow();
  await expect(owner.saveEditor(ctx,'video-a',{...body,requestId:'request-native-002'})).rejects.toThrow();
 });
 it('切换明确保留旧历史；旧入口不能覆盖；恢复可返回旧可用渲染路径',async()=>{
  const owner=service();await owner.saveEditor(ctx,'video-a',save('request-old-00001'));
  await expect(owner.saveEditor(ctx,'video-a',{expectedRevision:1,requestId:'request-native-003',plan:native()})).rejects.toThrow();
  await owner.saveEditor(ctx,'video-a',{expectedRevision:1,requestId:'request-native-003',plan:native(),replaceEditor:true});
  await expect(owner.confirmEditingPlan(ctx,'video-a',{expectedRevision:2,plan:plan()})).rejects.toThrow();
  await expect(owner.saveEditor(ctx,'video-a',{...save('request-overwrite-001',2)})).rejects.toThrow();
  const restored=await owner.restoreEditor(ctx,'video-a',{expectedRevision:2,requestId:'request-native-restore',sourceRevision:1});
  expect(restored.plan.editorVersion).toBe(1);
  expect((await owner.getEditorVersion(ctx,'video-a',2)).plan.referenceEditor).toEqual(native().referenceEditor);
 });
 it('替换同mediaId为别的确切文件需要重核归属，拒绝伪造native媒体',async()=>{
  const assertions=vi.fn(async(_ctx:unknown,input:{assetFileId?:string})=>{if(input.assetFileId==='foreign')throw Error('越权文件');});
  const owner=createProductionService({db,now:()=>now,nextId:p=>`${p}-${++seq}`,assertEditorAsset:assertions});
  await owner.saveEditor(ctx,'video-a',{expectedRevision:0,requestId:'request-native-004',plan:native()});
  const changed=native();changed.referenceEditor.mediaRefs[0]!.assetFileId='foreign';
  await expect(owner.saveEditor(ctx,'video-a',{expectedRevision:1,requestId:'request-native-005',plan:changed})).rejects.toThrow('越权文件');
  const bad=native();bad.referenceEditor.mediaRefs=[];
  await expect(owner.saveEditor(ctx,'video-a',{expectedRevision:1,requestId:'request-native-006',plan:bad})).rejects.toThrow();
  expect((await owner.getEditor(ctx,'video-a')).revision).toBe(1);
 });
});

it.each(['group','project'] as const)('归档%s精确公共保存回执只读返回；active replay仍修复hook，异body/foreign/实际迁组拒绝',async(archivedKind)=>{
 const {eq,productionEditVersions}=await import('@creatoros/backend');const {accountGroups}=await import('../../schema/account-groups');
 await db.insert(accountGroups).values([{id:'editor-group',userId:'user',name:'原组',createdAt:now,updatedAt:now},{id:'editor-target',userId:'user',name:'目标',createdAt:now,updatedAt:now}]);await db.update(projects).set({groupId:'editor-group'}).where(eq(projects.id,'project-a'));for(const id of ['video-a','video-b','image','article'])await db.update(contentOutputs).set({groupId:'editor-group'}).where(eq(contentOutputs.id,id));
 const scope:RequestContext={userId:'user',groupId:'editor-group',accountId:null,source:'user',requestId:'editor-history'};
 const events:Array<{revision:number;replay:boolean}>=[],production=createProductionService({db,now:()=>now,nextId:p=>`${p}-${++seq}`,assertEditorAsset:async()=>{},onVersionSaved:async(_ctx,event)=>{events.push({revision:event.version.revision,replay:event.replay});}}),transport=createProductionTransport(()=>production),args={params:{outputId:'video-a'},query:undefined,body:save('archived-editor-receipt')};
 const saved=await transport.request(ENDPOINTS.saveProductionEditor,args,scope);expect(await transport.request(ENDPOINTS.saveProductionEditor,args,scope)).toEqual(saved);expect(events).toEqual([{revision:1,replay:false},{revision:1,replay:true}]);
 if(archivedKind==='group')await db.update(accountGroups).set({status:'archived'}).where(eq(accountGroups.id,'editor-group'));else await db.update(projects).set({status:'archived'}).where(eq(projects.id,'project-a'));
 const versionsBefore=await db.select().from(productionEditVersions),rowsBefore=await db.select().from(productions);expect(await transport.request(ENDPOINTS.saveProductionEditor,args,scope)).toEqual(saved);
 await expect(transport.request(ENDPOINTS.saveProductionEditor,{...args,body:{...args.body,plan:{...plan(),extra:'changed'}}},scope)).rejects.toThrow();await expect(transport.request(ENDPOINTS.saveProductionEditor,{...args,body:{...args.body,expectedRevision:1}},scope)).rejects.toThrow();await expect(transport.request(ENDPOINTS.saveProductionEditor,{...args,body:save('archived-new-request',1)},scope)).rejects.toThrow();await expect(transport.request(ENDPOINTS.saveProductionEditor,args,{...scope,groupId:'editor-target'})).rejects.toThrow();expect(events).toHaveLength(2);expect(await db.select().from(productionEditVersions)).toEqual(versionsBefore);expect(await db.select().from(productions)).toEqual(rowsBefore);
 await db.update(accountGroups).set({status:'active'}).where(eq(accountGroups.id,'editor-group'));await db.update(projects).set({status:'active'}).where(eq(projects.id,'project-a'));const {createGroupMigrationService}=await import('../platform-account/group-migration.service');const migration=createGroupMigrationService({db,now:()=>now,nextId:p=>`${p}-${++seq}`}),selection={fromGroupId:'editor-group',toGroupId:'editor-target',projectIds:['project-a'],knowledgeIds:[],conversationIds:[]},preview=await migration.preview(scope,selection);await migration.apply(scope,{...selection,digest:preview.digest,idempotencyKey:'editor-actual-move'});await expect(transport.request(ENDPOINTS.saveProductionEditor,args,scope)).rejects.toThrow();expect(events).toHaveLength(2);
},30000);
