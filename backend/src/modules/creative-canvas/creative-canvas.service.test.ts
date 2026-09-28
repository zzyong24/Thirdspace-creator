import {afterAll,beforeAll,expect,it,vi} from "vitest";
import {createHash} from "node:crypto";
import {aiTaskResults,aiTasks,createDb,type Db} from "@creatoros/backend";
import type {RequestContext,CanvasDocument} from "@creatoros/contract";
import {createCreativeCanvasService} from "./creative-canvas.service";

let db:Db,close:()=>Promise<void>;
const ctx=(accountId:string):RequestContext=>({userId:"canvas-user",accountId,requestId:`canvas-${accountId}`,source:"user"});
const bytes=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/atcAAAAASUVORK5CYII=","base64");
bytes.writeUInt32BE(512,16);bytes.writeUInt32BE(512,20);
const checksum=createHash("sha256").update(bytes).digest("hex");
const imageNode=(id:string,mode:"text_to_image"|"image_to_image"="text_to_image")=>({id,type:"image_generation" as const,position:{x:0,y:0},label:"镜头",prompt:"山间日出",mode,...(mode==="image_to_image"?{referenceAssetId:"image-1"}:{})});
const videoNode=(id:string)=>({id,type:"video_generation" as const,position:{x:0,y:0},label:"动态镜头",prompt:"日出时缓慢推镜",mode:"image_to_video" as const,referenceAssetId:"image-1",durationSec:6,resolution:"768P" as const});
const doc=(nodes:CanvasDocument["nodes"]):CanvasDocument=>({schemaVersion:1,viewport:{x:0,y:0,zoom:1},nodes,edges:[]});
const submit=vi.fn(async(_context:RequestContext,input:{attemptId:string})=>({id:`task-${input.attemptId}`}));
const service=()=>createCreativeCanvasService(db,{
 now:()=>"2026-09-28T00:00:00.000Z",
 assertProject:async(c,id)=>{if(c.accountId!=="account-a"||id!=="project-a")throw new Error("project not owned");},
 assertMediaAsset:async(c,id,type,fileId)=>{if(c.accountId!=="account-a"||id!=="image-1"||type!=="image"||fileId&&fileId!=="file-1")throw new Error("asset not owned");return {fileId:"file-1",checksum};},
 assertReferenceAsset:async(c,id)=>{if(c.accountId!=="account-a"||id!=="image-1")throw new Error("reference not owned");},
 getMediaFileDownloadUrl:async(c,id,fileId)=>{if(c.accountId!=="account-a"||id!=="image-1"||fileId!=="file-1")throw new Error("file not owned");return {url:"https://example.invalid/file-1",fileName:"reference.png"};},
 getReference:async(c,id,fileId)=>c.accountId==="account-a"&&id==="image-1"&&(!fileId||fileId==="file-1")?{fileId:"file-1",checksum,mimeType:"image/png",bytes}:null,
 resolveCapability:async(_c,capability)=>({provider:"minimax",model:capability==="video.generate"?"MiniMax-H3":"image-01"}),
 submitTask:submit,
});
beforeAll(async()=>{const opened=await createDb();db=opened.db;close=()=>opened.client.close();});
afterAll(async()=>{await close();});

it("账号独立画布、CAS 保存与媒体文件版本冻结",async()=>{
 const s=service(),created=await s.create(ctx("account-a"),{title:"分镜"});
 expect(await s.list(ctx("account-b"))).toEqual([]);
 await expect(s.get(ctx("account-b"),created.id)).rejects.toThrow();
 const saved=await s.save(ctx("account-a"),created.id,{expectedRevision:created.revision,document:doc([{id:"media-1",type:"image",label:"参考",position:{x:3,y:4},assetId:"image-1"}])});
 expect(saved.document.nodes[0]).toMatchObject({fileId:"file-1",checksum});
 expect(await s.previewNode(ctx("account-a"),created.id,"media-1")).toEqual({url:"https://example.invalid/file-1",fileName:"reference.png"});
 await expect(s.previewNode(ctx("account-b"),created.id,"media-1")).rejects.toThrow();
 await expect(s.save(ctx("account-a"),created.id,{expectedRevision:created.revision,document:saved.document})).rejects.toThrow("其他窗口");
 await expect(s.save(ctx("account-b"),created.id,{expectedRevision:saved.revision,document:saved.document})).rejects.toThrow();
});

it("同一次生成复用原 attempt，删节点后仍能在历史读取",async()=>{
 submit.mockClear();const s=service(),created=await s.create(ctx("account-a"),{title:"生成"});
 const saved=await s.save(ctx("account-a"),created.id,{expectedRevision:created.revision,document:doc([imageNode("gen-1")])});
 const first=await s.generate(ctx("account-a"),created.id,"gen-1",{expectedRevision:saved.revision,attemptId:"canvas-attempt-0001"});
 const second=await s.generate(ctx("account-a"),created.id,"gen-1",{expectedRevision:saved.revision,attemptId:"canvas-attempt-0001"});
 expect(second.taskId).toBe(first.taskId);expect(first.mediaKind).toBe("image");
 await db.insert(aiTasks).values({id:first.taskId!,userId:"canvas-user",accountId:"account-a",taskType:"asset.generate",idempotencyKey:"canvas-attempt-0001",inputData:{kind:"image",prompt:"山间日出"},requestedAt:"2026-09-28T00:00:00.000Z"});
 await db.insert(aiTaskResults).values({id:"canvas-result-1",aiTaskId:first.taskId!,resultType:"generated_asset",assetId:"generated-image-1",resultData:{}});
 const cleared=await s.save(ctx("account-a"),created.id,{expectedRevision:saved.revision,document:doc([])});
 expect(cleared.document.nodes).toHaveLength(0);
 expect(await s.listTasks(ctx("account-a"),created.id)).toMatchObject([{nodeId:"gen-1",taskId:first.taskId,resultAssetId:"generated-image-1"}]);
 await expect(s.listTasks(ctx("account-b"),created.id)).rejects.toThrow();
});

it("参考图生成冻结文件和 checksum；跨账号引用无法提交",async()=>{
 const s=service(),created=await s.create(ctx("account-a"),{title:"参考图"});
 const saved=await s.save(ctx("account-a"),created.id,{expectedRevision:created.revision,document:doc([imageNode("gen-ref","image_to_image")])});
 const result=await s.generate(ctx("account-a"),created.id,"gen-ref",{expectedRevision:saved.revision,attemptId:"canvas-attempt-0002"});
 expect(result).toMatchObject({referenceFileId:"file-1",referenceChecksum:checksum});
 await expect(s.generate(ctx("account-b"),created.id,"gen-ref",{expectedRevision:saved.revision,attemptId:"canvas-attempt-0003"})).rejects.toThrow();
});

it("首帧图生视频经同一画布任务入口，未知提交响应可用原 attempt 续接",async()=>{
 submit.mockClear();const s=service(),created=await s.create(ctx("account-a"),{title:"视频"});
 const saved=await s.save(ctx("account-a"),created.id,{expectedRevision:created.revision,document:doc([videoNode("video-1")])});
 submit.mockRejectedValueOnce(new Error("提交响应丢失"));
 await expect(s.generate(ctx("account-a"),created.id,"video-1",{expectedRevision:saved.revision,attemptId:"canvas-attempt-video-0001"})).rejects.toThrow("提交响应丢失");
 const [pending]=await s.listTasks(ctx("account-a"),created.id);
 expect(pending).toMatchObject({nodeId:"video-1",taskId:null,mediaKind:"video",referenceFileId:"file-1",referenceChecksum:checksum});
 const resumed=await s.generate(ctx("account-a"),created.id,"video-1",{expectedRevision:saved.revision,attemptId:pending!.attemptId});
 expect(resumed.taskId).toBe("task-canvas-attempt-video-0001");
 expect(submit.mock.calls.map(call=>call[1].attemptId)).toEqual(["canvas-attempt-video-0001","canvas-attempt-video-0001"]);
});

it("编导建议只保存候选；应用有版本门且重复应用返回原快照",async()=>{
 const s=service(),created=await s.create(ctx("account-a"),{title:"建议"});
 const suggestion=await s.propose(ctx("account-a"),created.id,created.revision,[{type:"addNode",operationId:"op-1",tempId:"new",node:{id:"placeholder",type:"text",label:"建议",text:"旁白",position:{x:10,y:20}}}]);
 expect((await s.get(ctx("account-a"),created.id)).document.nodes).toHaveLength(0);
 const applied=await s.applyProposal(ctx("account-a"),created.id,suggestion.id,created.revision);
 expect(applied.document.nodes).toMatchObject([{type:"text",text:"旁白"}]);
 const later=await s.save(ctx("account-a"),created.id,{expectedRevision:applied.revision,document:doc([])});
 expect(later.revision).toBe(applied.revision+1);
 expect(await s.applyProposal(ctx("account-a"),created.id,suggestion.id,created.revision)).toEqual(applied);
 await expect(s.applyProposal(ctx("account-b"),created.id,suggestion.id,created.revision)).rejects.toThrow();
});

it("候选含无权素材时整单不应用；旧 revision 不覆盖新画布",async()=>{
 const s=service(),created=await s.create(ctx("account-a"),{title:"原子应用"});
 const denied=await s.propose(ctx("account-a"),created.id,created.revision,[
  {type:"addNode",operationId:"good",tempId:"good",node:{id:"unused",type:"text",label:"可用",text:"正文",position:{x:0,y:0}}},
  {type:"addNode",operationId:"bad",tempId:"bad",node:{id:"unused-2",type:"image",label:"无权",position:{x:100,y:0},assetId:"other-account-asset"}},
 ]);
 await expect(s.applyProposal(ctx("account-a"),created.id,denied.id,created.revision)).rejects.toThrow("asset not owned");
 expect((await s.get(ctx("account-a"),created.id)).document.nodes).toHaveLength(0);
 const stale=await s.propose(ctx("account-a"),created.id,created.revision,[{type:"addNode",operationId:"stale",tempId:"stale",node:{id:"unused",type:"text",label:"旧建议",text:"",position:{x:0,y:0}}}]);
 const changed=await s.save(ctx("account-a"),created.id,{expectedRevision:created.revision,document:doc([{id:"actual",type:"text",label:"新内容",text:"",position:{x:0,y:0}}])});
 await expect(s.applyProposal(ctx("account-a"),created.id,stale.id,changed.revision)).rejects.toThrow("画布已更新");
 expect((await s.get(ctx("account-a"),created.id)).document.nodes).toMatchObject([{id:"actual"}]);
});
