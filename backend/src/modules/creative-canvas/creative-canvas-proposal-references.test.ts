import {afterAll, beforeAll, expect, it} from "vitest";
import {createDb, type Db} from "@creatoros/backend";
import type {RequestContext, CanvasDocument} from "@creatoros/contract";
import {createCreativeCanvasService} from "./creative-canvas.service";

let db:Db, close:()=>Promise<void>;
const ctx:RequestContext={userId:"proposal-reference-owner",accountId:"proposal-reference-account",requestId:"t1403-canvas",source:"user"};
const text=(id:string,label:string)=>({id,type:"text" as const,label,text:label,position:{x:0,y:0}});
const document:CanvasDocument={schemaVersion:1,viewport:{x:0,y:0,zoom:1},nodes:[text("reading","卷尺读数"),text("safety","不切割")],edges:[{id:"safety-edge",source:"reading",target:"safety"}]};
const service=()=>createCreativeCanvasService(db,{
 now:()=>"2026-10-25T07:00:00.000Z",
 assertProject:async()=>{throw new Error("unexpected project");},
 assertMediaAsset:async()=>{throw new Error("unexpected media");},
 assertReferenceAsset:async()=>{throw new Error("unexpected reference");},
 getMediaFileDownloadUrl:async()=>{throw new Error("unexpected download");},
 getReference:async()=>null,
 readTask:async()=>null,readTaskResults:async()=>[],
 submitTask:async()=>{throw new Error("unexpected model request");},
});
beforeAll(async()=>{const opened=await createDb();db=opened.db;close=()=>opened.client.close();});
afterAll(async()=>{await close();});

it("真实候选中新节点的node.id和tempId均可安全解析，应用与重放保留原画布",async()=>{
 const s=service(),created=await s.create(ctx,{title:"验收-提案节点别名"});
 const saved=await s.save(ctx,created.id,{expectedRevision:created.revision,document});
 const proposal=await s.propose(ctx,saved.id,saved.revision,[
  {type:"addNode",operationId:"add",tempId:"tmp-mnemonic-node",node:text("canvas-ai-mnemonic","先厘米，后毫米")},
  {type:"connect",operationId:"connect-node-id",source:"reading",target:"canvas-ai-mnemonic"},
  {type:"connect",operationId:"connect-temp-id",source:"tmp-mnemonic-node",target:"safety"},
 ]);
 expect((await s.get(ctx,saved.id)).document).toEqual(document);
 const applied=await s.applyProposal(ctx,saved.id,proposal.id,saved.revision);
 const added=applied.document.nodes.find(node=>node.label==="先厘米，后毫米")!;
 expect(added.id).not.toBe("canvas-ai-mnemonic");
 expect(applied.document.nodes).toHaveLength(3);
 expect(applied.document.edges).toEqual(expect.arrayContaining([
  {id:"safety-edge",source:"reading",target:"safety"},
  expect.objectContaining({source:"reading",target:added.id}),
  expect.objectContaining({source:added.id,target:"safety"}),
 ]));
 expect(await s.applyProposal(ctx,saved.id,proposal.id,saved.revision)).toEqual(applied);
});

it("别名不得遮蔽已有节点或另一新增节点，失败整单保留原文档",async()=>{
 const s=service(),created=await s.create(ctx,{title:"验收-拒绝引用歧义"});
 const saved=await s.save(ctx,created.id,{expectedRevision:created.revision,document});
 for(const operations of [
  [{type:"addNode",operationId:"existing-id",tempId:"new",node:text("reading","不许替换原节点")},{type:"connect",operationId:"connect",source:"reading",target:"safety"}],
  [{type:"addNode",operationId:"duplicate-1",tempId:"tmp-one",node:text("same-alias","一")},{type:"addNode",operationId:"duplicate-2",tempId:"tmp-two",node:text("same-alias","二")},{type:"connect",operationId:"ambiguous",source:"reading",target:"same-alias"}],
 ]){
  const proposal=await s.propose(ctx,saved.id,saved.revision,operations);
  await expect(s.applyProposal(ctx,saved.id,proposal.id,saved.revision)).rejects.toThrow("候选节点引用");
  expect((await s.get(ctx,saved.id)).document).toEqual(document);
  expect((await s.listProposals(ctx,saved.id)).find(p=>p.id===proposal.id)).toMatchObject({status:"pending",appliedRevision:null});
 }
});

it("未引用的重复占位node.id保留旧合法tempId路径，连线ID不经节点别名替换",async()=>{
 const s=service(),created=await s.create(ctx,{title:"验收-旧占位兼容"});
 const saved=await s.save(ctx,created.id,{expectedRevision:created.revision,document});
 const proposal=await s.propose(ctx,saved.id,saved.revision,[
  {type:"addNode",operationId:"first",tempId:"tmp-first",node:text("placeholder","一")},
  {type:"addNode",operationId:"second",tempId:"tmp-second",node:text("placeholder","二")},
  {type:"addNode",operationId:"edge-alias",tempId:"tmp-third",node:text("safety-edge","三")},
  {type:"connect",operationId:"by-temp",source:"tmp-first",target:"tmp-second"},
  {type:"disconnect",operationId:"disconnect",edgeId:"safety-edge"},
 ]);
 const applied=await s.applyProposal(ctx,saved.id,proposal.id,saved.revision);
 expect(applied.document.nodes).toHaveLength(5);expect(new Set(applied.document.nodes.map(node=>node.id)).size).toBe(5);
 expect(applied.document.edges).toHaveLength(1);
 const byLabel=(label:string)=>applied.document.nodes.find(node=>node.label===label)!.id;
 expect(applied.document.edges[0]).toMatchObject({source:byLabel("一"),target:byLabel("二")});
});

it("无法解析的连线目标和跨画布引用继续拒绝，不能保存半成品",async()=>{
 const s=service(),created=await s.create(ctx,{title:"验收-拒绝失效节点"});
 const saved=await s.save(ctx,created.id,{expectedRevision:created.revision,document});
 const other=await s.create(ctx,{title:"另一画布"});
 await s.save(ctx,other.id,{expectedRevision:other.revision,document:{...document,nodes:[text("other-canvas-node","其他画布")],edges:[]}});
 const proposal=await s.propose(ctx,saved.id,saved.revision,[
  {type:"addNode",operationId:"add",tempId:"valid-new",node:text("new-id","新节点")},
  {type:"connect",operationId:"foreign",source:"reading",target:"other-canvas-node"},
 ]);
 await expect(s.applyProposal(ctx,saved.id,proposal.id,saved.revision)).rejects.toThrow("失效节点");
 expect((await s.get(ctx,saved.id)).document).toEqual(document);
});
