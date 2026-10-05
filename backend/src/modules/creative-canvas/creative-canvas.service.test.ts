import {afterAll,beforeAll,expect,it,vi} from "vitest";
import {createHash} from "node:crypto";
import {aiTaskResults,aiTasks,canvasGenerationLinks,createDb,type Db} from "@creatoros/backend";
import {ENDPOINTS,type Endpoint,type RequestContext,type CanvasDocument} from "@creatoros/contract";
import {createCreativeCanvasService} from "./creative-canvas.service";
import {createCreativeCanvasTransport} from "./creative-canvas.transport";

let db:Db,close:()=>Promise<void>;
const ctx=(accountId:string):RequestContext=>({userId:"canvas-user",accountId,requestId:`canvas-${accountId}`,source:"user"});
const bytes=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/atcAAAAASUVORK5CYII=","base64");
bytes.writeUInt32BE(512,16);bytes.writeUInt32BE(512,20);
const checksum=createHash("sha256").update(bytes).digest("hex");
const imageNode=(id:string,mode:"text_to_image"|"image_to_image"="text_to_image")=>({id,type:"image_generation" as const,position:{x:0,y:0},label:"镜头",prompt:"山间日出",mode,...(mode==="image_to_image"?{referenceAssetId:"image-1"}:{})});
const videoNode=(id:string)=>({id,type:"video_generation" as const,position:{x:0,y:0},label:"动态镜头",prompt:"日出时缓慢推镜",mode:"image_to_video" as const,referenceAssetId:"image-1",durationSec:6,resolution:"768P" as const});
const doc=(nodes:CanvasDocument["nodes"]):CanvasDocument=>({schemaVersion:1,viewport:{x:0,y:0,zoom:1},nodes,edges:[]});
const submitted=new Map<string,unknown>();
const submit=vi.fn(async(_context:RequestContext,input:{attemptId:string;inputData?:unknown})=>{submitted.set(`task-${input.attemptId}`,input.inputData);return {id:`task-${input.attemptId}`};});
const service=()=>createCreativeCanvasService(db,{
 now:()=>"2026-09-28T00:00:00.000Z",
 assertProject:async(c,id)=>{if(c.accountId!=="account-a"||id!=="project-a")throw new Error("project not owned");},
 assertMediaAsset:async(c,id,type,fileId)=>{if(c.accountId!=="account-a"||id!=="image-1"||type!=="image"||fileId&&fileId!=="file-1")throw new Error("asset not owned");return {fileId:"file-1",checksum};},
 assertReferenceAsset:async(c,id)=>{if(c.accountId!=="account-a"||id!=="image-1")throw new Error("reference not owned");},
 getMediaFileDownloadUrl:async(c,id,fileId)=>{if(c.accountId!=="account-a"||id!=="image-1"||fileId!=="file-1")throw new Error("file not owned");return {url:"https://example.invalid/file-1",fileName:"reference.png"};},
 getReference:async(c,id,fileId)=>c.accountId==="account-a"&&id==="image-1"&&(!fileId||fileId==="file-1")?{fileId:"file-1",checksum,mimeType:"image/png",bytes}:null,
 resolveCapability:async(_c,capability)=>({provider:"minimax",model:capability==="video.generate"?"MiniMax-H3":"image-01"}),
 readTask:async(c,taskId)=>{const task=await db.query.aiTasks.findFirst({where:(table,{eq})=>eq(table.id,taskId)});return task??{id:taskId,userId:c.userId,accountId:c.accountId??null,taskType:'asset.generate',attemptId:taskId.slice(5),projectId:null,inputData:submitted.get(taskId)??{},status:'queued'};},
 readTaskResults:async(_c,taskId)=>db.query.aiTaskResults.findMany({where:(table,{eq})=>eq(table.aiTaskId,taskId)}),
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
 await db.insert(aiTasks).values({id:first.taskId!,userId:"canvas-user",accountId:"account-a",taskType:"asset.generate",idempotencyKey:"canvas-attempt-0001",attemptId:first.attemptId,inputData:submitted.get(first.taskId!) as Record<string,unknown>,requestedAt:"2026-09-28T00:00:00.000Z"});
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

it("任务历史读取不写生成账本，结果只经原AI读取端口投影",async()=>{
 const s=service(),c=ctx('account-a'),created=await s.create(c,{title:'GET纯读'});
 const saved=await s.save(c,created.id,{expectedRevision:1,document:doc([imageNode('get-pure')])});
 const generated=await s.generate(c,created.id,'get-pure',{expectedRevision:saved.revision,attemptId:'pure-read-attempt'});
 await db.insert(aiTasks).values({id:generated.taskId!,userId:c.userId,accountId:c.accountId!,taskType:'asset.generate',idempotencyKey:'pure-read-attempt',attemptId:generated.attemptId,inputData:submitted.get(generated.taskId!) as Record<string,unknown>,requestedAt:'2026-09-28T00:00:00.000Z'});
 await db.insert(aiTaskResults).values({id:'pure-read-result',aiTaskId:generated.taskId!,resultType:'generated_asset',assetId:'pure-asset',resultData:{}});
 const before=await db.select().from(canvasGenerationLinks);
 expect(await s.listTasks(c,created.id)).toMatchObject([{resultAssetId:'pure-asset'}]);
 expect(await db.select().from(canvasGenerationLinks)).toEqual(before);
});
it("原attempt重放必须匹配完整公开revision，不能用旧回执吃掉新请求",async()=>{
 const s=service(),c=ctx('account-a'),created=await s.create(c,{title:'严格重放'});
 const saved=await s.save(c,created.id,{expectedRevision:1,document:doc([imageNode('repeat')])});
 await s.generate(c,created.id,'repeat',{expectedRevision:saved.revision,attemptId:'strict-replay-attempt'});
 await expect(s.generate(c,created.id,'repeat',{expectedRevision:saved.revision+1,attemptId:'strict-replay-attempt'})).rejects.toThrow('原提交');
});
it("素材验权在画布写事务内运行，原owner不会等待自己的根连接",async()=>{
 const c=ctx('account-a');let seen:Db|undefined;
 const s=createCreativeCanvasService(db,{assertProject:async()=>{},assertMediaAsset:async(_c,_id,_type,_file,tx)=>{seen=tx;return {fileId:'exact',checksum};},assertReferenceAsset:async()=>{},getMediaFileDownloadUrl:async()=>({url:'https://example.invalid',fileName:'x'}),getReference:async()=>null,submitTask:submit,readTask:async()=>null,readTaskResults:async()=>[]});
 const created=await s.create(c,{title:'同事务'});
 await s.save(c,created.id,{expectedRevision:1,document:doc([{id:'media',type:'image',label:'原文件',position:{x:0,y:0},assetId:'image'}])});
 expect(seen).toBeDefined();expect(seen).not.toBe(db);
});

it("公开transport严格解析body与路径，拒绝额外键先于业务写入",async()=>{const t=createCreativeCanvasTransport(service());const before=await service().list(ctx('account-a'));await expect(t.request(ENDPOINTS.createCanvas,{body:{title:'不应创建',unknown:true}} as never,ctx('account-a'))).rejects.toThrow();expect(await service().list(ctx('account-a'))).toEqual(before);await expect(t.request(ENDPOINTS.getCanvas,{params:{canvasId:before[0]!.id,unknown:true}} as never,ctx('account-a'))).rejects.toThrow();});
it("公开transport使用正式响应schema，合法保存与列表真实可读",async()=>{const t=createCreativeCanvasTransport(service()),created=await t.request(ENDPOINTS.createCanvas,{body:{title:'公开画布'}} as never,ctx('account-a'));const value=(created as {data:unknown}).data as {id:string;revision:number};expect(await t.request(ENDPOINTS.getCanvas,{params:{canvasId:value.id}} as never,ctx('account-a'))).toMatchObject({data:{title:'公开画布',revision:1}});await expect(t.request({id:'unknown'} as Endpoint,{} as never,ctx('account-a'))).rejects.toThrow();});
