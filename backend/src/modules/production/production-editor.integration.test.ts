import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDb, projects, contentOutputs, type Db } from "@creatoros/backend";
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
  });
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
