import {successEnvelope} from "@creatoros/contract";
import {accountGroups} from '../../schema/account-groups';
import {creativeCanvases} from '../../schema/creative-canvas';
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
const service=(extra:Partial<Parameters<typeof createCreativeCanvasService>[1]>={})=>createCreativeCanvasService(db,{
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
 ...extra,
});
beforeAll(async()=>{const opened=await createDb();db=opened.db;close=()=>opened.client.close();});
afterAll(async()=>{await close();});

it('生成候选纯读取完整输入；同事务预约和绑定失败全部回滚且不唤醒',async()=>{
 const s=service(),c=ctx('account-a'),created=await s.create(c,{title:'生成候选'});
 const saved=await s.save(c,created.id,{expectedRevision:1,document:doc([imageNode('proposal-image','image_to_image')])});
 const before=await s.listTasks(c,created.id);
 const snapshot=await s.prepareGenerateProposal(c,created.id,{baseRevision:saved.revision,nodeId:'proposal-image'});
 expect(snapshot).toMatchObject({inputRevision:saved.revision,inputData:{prompt:'山间日出',referenceFileId:'file-1',referenceChecksum:checksum}});
 expect(await s.listTasks(c,created.id)).toEqual(before);
 submit.mockClear();
 await expect(db.transaction(async tx=>{
  await s.reserveGenerationInTransaction(c,created.id,'proposal-image',{expectedRevision:saved.revision,attemptId:'canvas-proposal-fixture',snapshot},tx as unknown as Db);
  throw Error('原采用回执失败');
 })).rejects.toThrow('原采用回执失败');
 expect(await s.listTasks(c,created.id)).toEqual(before);expect(submit).not.toHaveBeenCalled();
});

it("AI创建先准备完整候选，采用同一事务保存初文档和精确文件；回滚不留下空画布",async()=>{
 const s=service(),c=ctx("account-a");
 const input={title:"AI完整画布",projectId:"project-a",document:doc([{id:"photo",type:"image" as const,label:"参考图片",position:{x:10,y:20},assetId:"image-1"}])};
 const before=(await s.list(c)).length;
 const prepared=await s.prepareCreateProposal(c,input);
 expect((await s.list(c)).length).toBe(before);
 expect(prepared.document.nodes[0]).toMatchObject({fileId:"file-1",checksum});
 await expect(db.transaction(async tx=>{
  await s.createWithDocumentInTransaction(c,prepared,tx as unknown as Db);
  throw Error("injected receipt failure");
 })).rejects.toThrow("injected receipt failure");
 expect((await s.list(c)).length).toBe(before);
 const created=await db.transaction(tx=>s.createWithDocumentInTransaction(c,prepared,tx as unknown as Db));
 expect(created).toMatchObject({revision:1,title:input.title,projectId:input.projectId,document:prepared.document});
 expect(await s.get(c,created.id)).toEqual(created);
 await expect(s.prepareCreateProposal(ctx("account-b"),input)).rejects.toThrow();
 const photo=prepared.document.nodes[0]!;
 if(photo.type!=="image")throw Error("验收夹具不是图片节点");
 await expect(db.transaction(tx=>s.createWithDocumentInTransaction(c,{...prepared,document:doc([{...photo,checksum:"0".repeat(64)}])},tx as unknown as Db))).rejects.toThrow("校验已变化");
});

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

const visualGroup=(pageOrder:string[],requiredIdentity=false)=>({id:"group",name:"图文",libraryKind:"xhs" as const,aspectRatio:"3:4",caption:"配文",pageOrder,templateSnapshot:{id:"template",name:"样式",version:1,prompt:"提示词",visualMode:requiredIdentity?"real_person" as const:"graphic" as const,requiredIdentity},generationAttempts:{}});
it("页组保真、引用/顺序校验、删除页组修剪与编导保留",async()=>{
 const s=service(),created=await s.create(ctx("account-a"),{title:"页组"});
 const document={...doc([imageNode("page-1"),imageNode("page-2")]),visualGroups:[visualGroup(["page-1","page-2"])]};
 const saved=await s.save(ctx("account-a"),created.id,{expectedRevision:1,document});
 const proposal=await s.propose(ctx("account-a"),created.id,saved.revision,[{type:"deleteNode",operationId:"delete-page",nodeId:"page-1"}]);
 const applied=await s.applyProposal(ctx("account-a"),created.id,proposal.id,saved.revision);
 expect(applied.document.visualGroups![0]!.pageOrder).toEqual(["page-2"]);
 await expect(s.save(ctx("account-a"),created.id,{expectedRevision:applied.revision,document:{...applied.document,visualGroups:[visualGroup(["page-2","page-2"])]}})).rejects.toThrow();
 await expect(s.save(ctx("account-a"),created.id,{expectedRevision:applied.revision,document:{...applied.document,visualGroups:[visualGroup(["missing"])]}})).rejects.toThrow();
});
it("真人身份不能通过纯提示词或编导清空降级，比例来自适配器",async()=>{
 const s=service(),created=await s.create(ctx("account-a"),{title:"真人"});
 await expect(s.save(ctx("account-a"),created.id,{expectedRevision:1,document:{...doc([{...imageNode("real"),visualMode:"real_person"}]),visualGroups:[visualGroup(["real"],true)]}})).rejects.toThrow("身份");
 const caps=await s.capabilities(ctx("account-a"));
 expect(caps.modes.find(m=>m.mode==="text_to_image")!.aspectRatios).toContain("21:9");
});

it("未知提交恢复冻结原输入；编辑后继续原预约，阻断新attempt，成功页不重进提交",async()=>{
 submit.mockClear();const s=service(),created=await s.create(ctx("account-a"),{title:"恢复守卫"});
 let saved=await s.save(ctx("account-a"),created.id,{expectedRevision:1,document:doc([imageNode("restore-node")])});
 submit.mockRejectedValueOnce(new Error("未知响应"));
 await expect(s.generate(ctx("account-a"),saved.id,"restore-node",{expectedRevision:saved.revision,attemptId:"unknown-restore-attempt-1"})).rejects.toThrow("未知响应");
 saved=await s.save(ctx("account-a"),saved.id,{expectedRevision:saved.revision,document:doc([{...imageNode("restore-node"),prompt:"明确修改输入"}])});
 expect(submit).toHaveBeenCalledTimes(1);
 await expect(s.generate(ctx("account-a"),saved.id,"restore-node",{expectedRevision:saved.revision,attemptId:"new-creation-attempt-1"})).rejects.toThrow("原提交结果尚未明确");
 const resumed=await s.generate(ctx("account-a"),saved.id,"restore-node",{expectedRevision:saved.revision,attemptId:"unknown-restore-attempt-1"});
 expect(submit).toHaveBeenCalledTimes(2);expect(submit.mock.calls[1]![1]).toMatchObject({attemptId:'unknown-restore-attempt-1',inputData:{prompt:'山间日出'}});
 expect((await s.get(ctx('account-a'),saved.id)).document.nodes[0]).toMatchObject({prompt:'明确修改输入'});
 expect(await s.generate(ctx('account-a'),saved.id,'restore-node',{expectedRevision:saved.revision,attemptId:'unknown-restore-attempt-1'})).toMatchObject({taskId:resumed.taskId});expect(submit).toHaveBeenCalledTimes(2);
 saved=await s.save(ctx("account-a"),saved.id,{expectedRevision:saved.revision,document:doc([imageNode("restore-node"),imageNode("unrelated-node")])});
 const fresh=await s.generate(ctx("account-a"),saved.id,"unrelated-node",{expectedRevision:saved.revision,attemptId:"new-creation-attempt-1"});
 expect(await s.generate(ctx("account-a"),saved.id,"unrelated-node",{expectedRevision:saved.revision,attemptId:"new-creation-attempt-1"})).toMatchObject({taskId:fresh.taskId});
 expect(submit).toHaveBeenCalledTimes(3);
});

it("可信真人模板不能通过篡改客户端视觉字段降级文生图",async()=>{
 const {createVisualTemplateService}=await import("../assets/visual-template.service");
 const templates=createVisualTemplateService(db,{assertImageReference:async()=>({fileId:"file-1",checksum})});const real=(await templates.list(ctx("account-a"),{scope:"builtin",page:1,pageSize:100})).data.find(t=>t.requiredIdentity)!;
 const s=service({resolveTemplateRequirement:templates.resolveRequirement});const created=await s.create(ctx("account-a"),{title:"真人可信来源"});
 await expect(s.save(ctx("account-a"),created.id,{expectedRevision:1,document:doc([{...imageNode("spoof"),templateId:real.id,templateVersion:real.revision,visualMode:"graphic"}])})).rejects.toThrow("身份");
});
it("任务已落库但响应丢失后编辑节点，恢复原attempt补link且不再提交模型",async()=>{
 const {eq}=await import("drizzle-orm");const attemptId="persisted-lost-response-0001",taskId="persisted-lost-task";
 const losingSubmit=vi.fn(async(c:RequestContext,input:Record<string,unknown>)=>{await db.insert(aiTasks).values({id:taskId,userId:c.userId,accountId:c.accountId!,taskType:"asset.generate",idempotencyKey:attemptId,inputData:input.inputData,requestedAt:"2026-10-04T00:00:00.000Z"});throw new Error("回执丢失");});
 const findTaskByAttempt=async()=>{const [task]=await db.select().from(aiTasks).where(eq(aiTasks.idempotencyKey,attemptId));return task??null;};const s=service({submitTask:losingSubmit,findTaskByAttempt});const created=await s.create(ctx("account-a"),{title:"丢失响应"});let saved=await s.save(ctx("account-a"),created.id,{expectedRevision:1,document:doc([imageNode("lost")])});
 await expect(s.generate(ctx("account-a"),saved.id,"lost",{expectedRevision:saved.revision,attemptId})).rejects.toThrow("回执丢失");saved=await s.save(ctx("account-a"),saved.id,{expectedRevision:saved.revision,document:doc([{...imageNode("lost"),prompt:"后来编辑的另一版"}])});
 expect(await s.generate(ctx("account-a"),saved.id,"lost",{expectedRevision:saved.revision,attemptId})).toMatchObject({taskId});expect(losingSubmit).toHaveBeenCalledTimes(1);expect(await s.listTasks(ctx("account-a"),saved.id)).toMatchObject([{taskId}]);
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
it("公开transport使用正式响应schema，合法保存与列表真实可读",async()=>{const t=createCreativeCanvasTransport(service()),created=successEnvelope(ENDPOINTS.createCanvas.response).parse(await t.request(ENDPOINTS.createCanvas,{body:{title:'公开画布'}} as never,ctx('account-a')));const value=(created as {data:unknown}).data as {id:string;revision:number};expect(successEnvelope(ENDPOINTS.getCanvas.response).parse(await t.request(ENDPOINTS.getCanvas,{params:{canvasId:value.id}} as never,ctx('account-a')))).toMatchObject({data:{title:'公开画布',revision:1}});await expect(t.request({id:'unknown'} as Endpoint,{} as never,ctx('account-a'))).rejects.toThrow();});

it('T1062 空组画布公开transport共享，原生成冻结不随平台过滤重签，归档阻新保存',async()=>{const stamp='2026-10-05T00:00:00.000Z';await db.insert(accountGroups).values([{id:'canvas-empty-a',userId:'canvas-user',name:'空组A',status:'active',version:1,createdAt:stamp,updatedAt:stamp},{id:'canvas-empty-b',userId:'canvas-user',name:'空组B',status:'active',version:1,createdAt:stamp,updatedAt:stamp}]);const g:RequestContext={userId:'canvas-user',groupId:'canvas-empty-a',accountId:null,groupVersion:1,requestId:'canvas-group',source:'user'},submitTask=vi.fn(async(c:RequestContext,input:{attemptId:string;inputData:unknown})=>{const id='task-group-'+input.attemptId;submitted.set(id,input.inputData);await db.insert(aiTasks).values({id,userId:c.userId,accountId:c.accountId??null,groupId:c.groupId,groupVersion:c.groupVersion??null,membershipVersion:c.membershipVersion??null,taskType:'asset.generate',idempotencyKey:input.attemptId,attemptId:input.attemptId,inputData:input.inputData as Record<string,unknown>,projectId:null,requestedAt:stamp});return{id};}),s=service({submitTask}),transport=createCreativeCanvasTransport(s);
 const created=ENDPOINTS.createCanvas.response.parse((successEnvelope(ENDPOINTS.createCanvas.response).parse(await transport.request(ENDPOINTS.createCanvas,{params:undefined,query:undefined,body:{title:'空组真实画布'}},g))).data);expect(created.accountId).toBeNull();expect((await db.select().from(creativeCanvases)).find(r=>r.id===created.id)).toMatchObject({groupId:g.groupId,accountId:null});
 const saved=await s.save(g,created.id,{expectedRevision:1,document:doc([imageNode('group-gen')])});const a=await s.generate(g,created.id,'group-gen',{expectedRevision:saved.revision,attemptId:'canvas-group-attempt-0001'});expect((await s.generate({...g,accountId:'page-filter'},created.id,'group-gen',{expectedRevision:saved.revision,attemptId:a.attemptId})).taskId).toBe(a.taskId);expect(submitTask).toHaveBeenCalledTimes(1);expect(submitTask.mock.calls[0]![0]).toMatchObject({accountId:null,groupId:g.groupId});
 await expect(s.get({...g,groupId:'canvas-empty-b'},created.id)).rejects.toThrow();await db.update(accountGroups).set({status:'archived'}).where((await import('drizzle-orm')).eq(accountGroups.id,g.groupId!));expect((await s.get(g,created.id)).id).toBe(created.id);await expect(s.save(g,created.id,{expectedRevision:saved.revision,document:saved.document})).rejects.toThrow();
},30000);


import {Pool} from 'pg';
import {randomUUID} from 'node:crypto';
import {createRuntimeDb} from '../../db';
import {createProjectsService,createProjectRepository} from '../projects';
import {createAccountGroupService} from '../platform-account/account-group.service';
import {createAiService} from '../ai/ai.service';
import {createAssetBusinessExecutionService} from '../ai-runtime/asset-business-execution.service';
import {executionTasks,executionCalls} from '@creatoros/backend';
const canvasLockPg=process.env.CREATOROS_TEST_POSTGRES_URL;
it.skipIf(!canvasLockPg)('T1062真实PG Canvas公共generate同组双父Lock观察，原预约/任务/执行唯一且重放零写',async()=>{
 const url=new URL(canvasLockPg!);if(url.hostname!=='127.0.0.1'||url.port!=='55422')throw Error('只允许55422随机PG库');
 const name=`t1062_canvas_lock_${randomUUID().replaceAll('-','')}`,admin=new Pool({connectionString:canvasLockPg});await admin.query(`CREATE DATABASE ${name}`);url.pathname=`/${name}`;
 const runtimes:Array<Awaited<ReturnType<typeof createRuntimeDb>>>=[];let held=false,blocker:import('pg').PoolClient|undefined,pending:Promise<unknown>[]=[];
 async function open(role:string){const scoped=new URL(url);scoped.searchParams.set('application_name',`${name}_${role}`);const runtime=await createRuntimeDb({connectionString:scoped.toString()});runtime.pool.options.max=1;runtimes.push(runtime);return runtime;}
 try{
  const setup=await open('setup'),left=await open('left'),right=await open('right');let n=0;const deps={now:()=>new Date().toISOString(),nextId:(prefix:string)=>`${prefix}-${++n}`},user:RequestContext={userId:name,requestId:'canvas-pg-lock',source:'user'};
  const group=await createAccountGroupService({db:setup.db,...deps}).create(user,{name:'真实空组',idempotencyKey:'canvas-lock-group'}),scope={...user,accountId:null,groupId:group.id,groupVersion:group.version};
  const unavailable=async():Promise<never>=>{throw Error('无参考媒体/供应商/采用的锁序测试不得调用该端口');};
  const projects=(database:Db)=>createProjectsService(createProjectRepository(database),deps);
  const ai=(database:Db)=>createAiService({db:database,...deps,artifacts:{createVersion:unavailable},knowledge:{createKnowledge:unavailable},candidate:{createFromAIResult:unavailable,enrichCard:unavailable},learnings:{createLearning:unavailable},publishing:{createPublicationFromDraft:unavailable},materialLinks:{link:unavailable},positioning:{upsertProfile:unavailable,createStatementVersion:unavailable},calibration:{createDraftPrediction:unavailable}});
  const canvas=(database:Db)=>createCreativeCanvasService(database,{now:deps.now,assertProject:async(c,id,tx=database,lock)=>{await projects(tx).getProject(c,id,lock);},assertMediaAsset:unavailable,assertReferenceAsset:unavailable,getMediaFileDownloadUrl:unavailable,getReference:unavailable,resolveCapability:async()=>({provider:'minimax',model:'image-01'}),readTask:async(c,id,tx=database)=>{await ai(tx).getTask(c,id);return await tx.query.aiTasks.findFirst({where:(row,{eq})=>eq(row.id,id)})??null;},readTaskResults:(c,id,tx=database)=>ai(tx).listResults(c,id),findTaskByAttempt:(c,attempt)=>ai(database).findTaskByAttempt(c,'asset.generate',attempt),submitTask:(c,input)=>ai(database).createTask(c,{taskType:'asset.generate',attemptId:input.attemptId,inputData:input.inputData})});
  const callers=[canvas(left.db),canvas(right.db)],targets:Array<{id:string;projectId:string;expectedRevision:number;attemptId:string}>=[];
  for(let i=0;i<2;i++){const parent=await projects(setup.db).createProject(scope,{title:`画布真实父${i}`,brief:'无模型公共调用'}),created=await callers[i]!.create(scope,{projectId:parent.id,title:`画布${i}`}),saved=await callers[i]!.save(scope,created.id,{expectedRevision:created.revision,document:doc([imageNode('public-generation')])});targets.push({id:saved.id,projectId:parent.id,expectedRevision:saved.revision,attemptId:`canvas-pg-public-attempt-${i}`});}
  expect(targets[0]!.projectId).not.toBe(targets[1]!.projectId);
  blocker=await setup.pool.connect();await blocker.query('BEGIN');held=true;await blocker.query('SELECT id FROM account_groups WHERE id=$1 FOR SHARE',[group.id]);
  const results=Promise.allSettled(callers.map((caller,i)=>caller.generate(scope,targets[i]!.id,'public-generation',{expectedRevision:targets[i]!.expectedRevision,attemptId:targets[i]!.attemptId})));pending=[results];
  let observed=false;const deadline=Date.now()+6000;
  try{while(Date.now()<deadline){const rows=await admin.query('SELECT application_name,wait_event_type,wait_event,query FROM pg_stat_activity WHERE datname=$1 AND application_name=ANY($2::text[]) AND wait_event_type=\'Lock\'',[name,[`${name}_left`,`${name}_right`]]);if(rows.rows.length===2){observed=true;console.info('T1062 Canvas真实锁观察',rows.rows);break;}await new Promise(resolve=>setTimeout(resolve,10));}}
  finally{held=false;await blocker.query('ROLLBACK');blocker.release();blocker=undefined;}
  expect(observed).toBe(true);const settled=await results;console.info('T1062 Canvas公共锁结果',settled);for(const result of settled)expect(result.status).toBe('fulfilled');
  const links=await setup.db.select().from(canvasGenerationLinks),tasks=await setup.db.select().from(aiTasks);expect(links).toHaveLength(2);expect(tasks).toHaveLength(2);expect(new Set(tasks.map(t=>t.projectId)).size).toBe(2);for(const task of tasks)expect(task).toMatchObject({userId:name,groupId:group.id,accountId:null,groupVersion:group.version,membershipVersion:null});
  for(let i=0;i<2;i++){const target=targets[i]!,link=links.find(row=>row.canvasId===target.id);if(!link?.taskId)throw Error('原预约未绑任务');await createAssetBusinessExecutionService(setup.db,{now:deps.now,budget:{maxCalls:4,maxTokens:10000,deadlineMs:600000},resolveSpec:async()=>({kind:'image',provider:'minimax',model:'image-01',baseUrl:null,token:'explicit-fixture-no-provider'}),assertProject:async(c,id,tx=setup.db,lock)=>{await projects(tx).getProject(c,id,lock);},assertCanvasInput:(c,input,tx)=>canvas(tx).assertFrozenGenerationInput(c,input,tx)}).prepare(scope,link.taskId);}
  expect(await setup.db.select().from(executionTasks)).toHaveLength(2);const before={links:await setup.db.select().from(canvasGenerationLinks),tasks:await setup.db.select().from(aiTasks),executions:await setup.db.select().from(executionTasks)};
  await Promise.all(callers.map((caller,i)=>caller.generate({...scope,accountId:'仅平台筛选'},targets[i]!.id,'public-generation',{expectedRevision:targets[i]!.expectedRevision,attemptId:targets[i]!.attemptId})));
  expect(await setup.db.select().from(canvasGenerationLinks)).toEqual(before.links);expect(await setup.db.select().from(aiTasks)).toEqual(before.tasks);expect(await setup.db.select().from(executionTasks)).toEqual(before.executions);expect(await setup.db.select().from(executionCalls)).toHaveLength(0);
 }finally{if(held&&blocker)await blocker.query('ROLLBACK');await Promise.allSettled(pending);blocker?.release();const closed=await Promise.allSettled(runtimes.map(runtime=>runtime.pool.end()));try{await admin.query(`DROP DATABASE ${name} WITH (FORCE)`);}finally{await admin.end();}for(const result of closed)if(result.status==='rejected')throw result.reason;}
},30000);

it('同节点任务运行或提交未知时拒绝新attempt，原attempt仍可回读，终态允许再次生成',async()=>{
 const states=new Map<string,string>();const s=service({readTask:async(c,id)=>({id,userId:c.userId,attemptId:id.slice(5),taskType:'asset.generate',projectId:null,inputData:submitted.get(id),status:states.get(id)??'running'})});const c=ctx('account-a'),created=await s.create(c,{title:'防重复'}),saved=await s.save(c,created.id,{expectedRevision:1,document:doc([imageNode('node')])});submit.mockClear();
 const first=await s.generate(c,created.id,'node',{expectedRevision:saved.revision,attemptId:'first-active-attempt'});await expect(s.generate(c,created.id,'node',{expectedRevision:saved.revision,attemptId:'duplicate-new-attempt'})).rejects.toThrow('仍在生成');expect((await s.listTasks(c,created.id))).toHaveLength(1);expect(await s.generate(c,created.id,'node',{expectedRevision:saved.revision,attemptId:'first-active-attempt'})).toMatchObject({taskId:first.taskId});expect(submit).toHaveBeenCalledOnce();
 states.set(first.taskId!,'awaiting_confirmation');await expect(s.generate(c,created.id,'node',{expectedRevision:saved.revision,attemptId:'explicit-regenerate-attempt'})).resolves.toBeTruthy();expect(submit).toHaveBeenCalledTimes(2);
});

it('T1141 旧页节点缺省的新候选与手工生成都继承明确组画幅，保持文档和exact参考',async()=>{
 const c=ctx('account-a'),s=service(),created=await s.create(c,{title:'旧页组比例'});
 const node={...imageNode('ratio-implicit','image_to_image'),referenceFileId:'file-1'};
 const saved=await s.save(c,created.id,{expectedRevision:1,document:{...doc([node]),visualGroups:[{...visualGroup([node.id]),generationAttempts:{[node.id]:'ratio-implicit-attempt'}}]}});
 const candidate=await s.prepareGenerateProposal(c,created.id,{baseRevision:saved.revision,nodeId:node.id});
 expect(candidate.inputData).toMatchObject({aspectRatio:'3:4',referenceAssetId:'image-1',referenceFileId:'file-1',referenceChecksum:checksum});
 expect(await s.get(c,created.id)).toMatchObject({revision:saved.revision,document:saved.document});expect(await s.listTasks(c,created.id)).toEqual([]);
 submit.mockClear();await s.generate(c,created.id,node.id,{expectedRevision:saved.revision,attemptId:'ratio-implicit-attempt'});
 expect(submit).toHaveBeenCalledOnce();expect(submit.mock.calls[0]![1].inputData).toMatchObject({aspectRatio:'3:4',referenceFileId:'file-1'});
 expect((await s.get(c,created.id)).document).toEqual(saved.document);
 await expect(s.prepareGenerateProposal(ctx('account-b'),created.id,{baseRevision:saved.revision,nodeId:node.id})).rejects.toThrow('画布不存在');
});

it('T1141 继承画幅必须经过同一模型能力校验，不支持时不产生预约或任务',async()=>{
 // 显式能力夹具：OpenAI图片参数检查不支持21:9，不调用外部模型。
 const c=ctx('account-a'),s=service({resolveCapability:async()=>({provider:'openai',model:'gpt-image-1'})}),created=await s.create(c,{title:'组画幅能力'});
 const saved=await s.save(c,created.id,{expectedRevision:1,document:{...doc([imageNode('ratio-unsupported')]),visualGroups:[{...visualGroup(['ratio-unsupported']),aspectRatio:'21:9',generationAttempts:{'ratio-unsupported':'ratio-unsupported-attempt'}}]}});
 submit.mockClear();
 await expect(s.prepareGenerateProposal(c,created.id,{baseRevision:saved.revision,nodeId:'ratio-unsupported'})).rejects.toThrow('不支持该画幅');
 await expect(s.generate(c,created.id,'ratio-unsupported',{expectedRevision:saved.revision,attemptId:'ratio-unsupported-attempt'})).rejects.toThrow('不支持该画幅');
 expect(submit).not.toHaveBeenCalled();expect(await s.listTasks(c,created.id)).toEqual([]);expect((await s.get(c,created.id)).document).toEqual(saved.document);
});

it('T1141 有组显式画幅和独立节点缺省保留原语义，已知缺模型不阻断保存',async()=>{
 const c=ctx('account-a'),s=service(),created=await s.create(c,{title:'比例输入族'});
 const saved=await s.save(c,created.id,{expectedRevision:1,document:{...doc([{...imageNode('explicit-ratio'),aspectRatio:'3:4'},imageNode('standalone-default'),videoNode('video-first-frame')]),visualGroups:[visualGroup(['explicit-ratio'])]}});
 expect((await s.prepareGenerateProposal(c,created.id,{baseRevision:saved.revision,nodeId:'explicit-ratio'})).inputData.aspectRatio).toBe('3:4');
 expect((await s.prepareGenerateProposal(c,created.id,{baseRevision:saved.revision,nodeId:'standalone-default'})).inputData).not.toHaveProperty('aspectRatio');
 expect((await s.prepareGenerateProposal(c,created.id,{baseRevision:saved.revision,nodeId:'video-first-frame'})).inputData).not.toHaveProperty('aspectRatio');
 const unavailable=service({resolveCapability:undefined});const preserved=await unavailable.save(c,created.id,{expectedRevision:saved.revision,document:saved.document});expect(preserved.document).toEqual(saved.document);
 await expect(unavailable.prepareGenerateProposal(c,created.id,{baseRevision:preserved.revision,nodeId:'explicit-ratio'})).rejects.toThrow('生成模型尚未配置');
});

it('T1141 已存在省略比例的旧预约仍严格回放原输入，未采用旧候选必须重准备',async()=>{
 const {eq}=await import('drizzle-orm');const c=ctx('account-a'),s=service(),created=await s.create(c,{title:'旧比例回放'});
 const saved=await s.save(c,created.id,{expectedRevision:1,document:{...doc([imageNode('legacy-ratio')]),visualGroups:[{...visualGroup(['legacy-ratio']),generationAttempts:{'legacy-ratio':'legacy-ratio-attempt'}}]}});
 const candidate=await s.prepareGenerateProposal(c,created.id,{baseRevision:saved.revision,nodeId:'legacy-ratio'});
 // 明示历史fixture：重建已省略比例的旧冻结形状，摘要采用原规范，测试不连接用户库。
 const {aspectRatio:_ratio,...legacy}=candidate.inputData;
 const digest=createHash('sha256').update(JSON.stringify([saved.revision,'legacy-ratio',{...legacy,canvasOwner:{...legacy.canvasOwner,inputDigest:''}}])).digest('hex');
 legacy.canvasOwner={...legacy.canvasOwner,inputDigest:digest};const oldSnapshot={inputRevision:saved.revision,inputDigest:digest,inputData:legacy};
 // 新请求无旧预约时不得悄悄改变候选的省略比例。
 await expect(db.transaction(tx=>s.reserveGenerationInTransaction(c,created.id,'legacy-ratio',{expectedRevision:saved.revision,attemptId:'legacy-ratio-attempt',snapshot:oldSnapshot},tx as unknown as Db))).rejects.toThrow('重新准备生成候选');
 const stamp='2026-09-28T00:00:00.000Z';
 await db.insert(canvasGenerationLinks).values({id:'legacy-ratio-link',userId:c.userId,accountId:c.accountId!,canvasId:created.id,nodeId:'legacy-ratio',attemptId:'legacy-ratio-attempt',inputRevision:saved.revision,inputDigest:digest,inputJson:legacy,taskId:null,referenceFileId:null,referenceChecksum:null,createdAt:stamp,updatedAt:stamp});
 const before=await db.query.canvasGenerationLinks.findFirst({where:(row,{eq})=>eq(row.id,'legacy-ratio-link')});
 const replay=await db.transaction(tx=>s.reserveGenerationInTransaction(c,created.id,'legacy-ratio',{expectedRevision:saved.revision,attemptId:'legacy-ratio-attempt',snapshot:oldSnapshot},tx as unknown as Db));
 expect(replay.inputData).toEqual(legacy);expect(replay.inputData).not.toHaveProperty('aspectRatio');expect(await db.query.canvasGenerationLinks.findFirst({where:(row,{eq})=>eq(row.id,'legacy-ratio-link')})).toEqual(before);
 await expect(db.transaction(tx=>s.reserveGenerationInTransaction(ctx('account-b'),created.id,'legacy-ratio',{expectedRevision:saved.revision,attemptId:'legacy-ratio-attempt',snapshot:oldSnapshot},tx as unknown as Db))).rejects.toThrow();
 const changed=await s.save(c,created.id,{expectedRevision:saved.revision,document:{...saved.document,nodes:[{...imageNode('legacy-ratio'),prompt:'明确修改后的新描述'}]}});
 await expect(db.transaction(tx=>s.reserveGenerationInTransaction(c,created.id,'legacy-ratio',{expectedRevision:changed.revision,attemptId:'legacy-ratio-attempt',snapshot:oldSnapshot},tx as unknown as Db))).rejects.toThrow('重新准备生成候选');
 expect((await db.select().from(canvasGenerationLinks).where(eq(canvasGenerationLinks.id,'legacy-ratio-link')))[0]).toEqual(before);
});
