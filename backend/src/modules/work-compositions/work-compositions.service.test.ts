import {createProjectsService,createProjectRepository} from "../projects";
import {workMemberCreateInput} from "@creatoros/contract";
import {beforeEach,afterEach,expect,it} from "vitest";
import {createDb,projects,workCompositions,workCompositionVersions,workCompositionRequests,momentsAnchors,momentsRequests,artifacts,and,eq,OwnershipError,type Db} from "@creatoros/backend";
import {createArtifactsService} from "../artifacts";
import {createWorkCompositionsService} from "./work-compositions.service";
const ctx={userId:"work-user",accountId:"work-account",source:"user" as const,requestId:"request"};
let db:Db,close:()=>Promise<void>,seq=0;const now=()=>"2026-10-02T06:00:00.000Z",nextId=(p:string)=>`${p}-${++seq}`;
const basis=(topic="共享主题")=>({schemaVersion:1 as const,topic,claims:[],factItems:[],sourceRefs:[],ruleRefs:[]});
type Ports=Parameters<typeof createWorkCompositionsService>[0]["ports"];
const owner=(overrides:Partial<Ports>={})=>createWorkCompositionsService({db,now,nextId,ports:{artifacts:tx=>createArtifactsService({db:tx,now,nextId}),assertProjectOwned:async(c,id,tx,forUpdate)=>{await createProjectsService(createProjectRepository(tx),{now,nextId}).getProject(c,id,forUpdate);},readMember:async()=>{throw new OwnershipError("未绑定成员");},createMember:async()=>{throw Error("未授权新建成员");},findCreatedMember:async()=>null,assertSource:async()=>{throw Error("未授权依据");},assertRule:async()=>{throw Error("未授权规则");},...overrides}});
beforeEach(async()=>{const opened=await createDb();db=opened.db;close=()=>opened.client.close();seq=0;await db.insert(projects).values({id:"work-project",userId:ctx.userId,accountId:ctx.accountId,title:"组合项目",creationMode:"guided",status:"active",currentStage:"planning",startedAt:now(),createdAt:now(),updatedAt:now()});});afterEach(async()=>close());
it("四种表达16个组合全部保存读回，选择与成员身份分离，无视频必选",async()=>{
 let current=await owner().create(ctx,{projectId:"work-project",title:"可组合作品",clientRequestId:"work-create-request"});expect(current.current.selection).toEqual([]);const kinds=["video","article","image","moments"] as const;
 for(let mask=0;mask<16;mask++){const selection=kinds.filter((_,i)=>mask&(1<<i));current=await owner().saveSelection(ctx,current.compositionId,{expectedRevision:current.currentRevision,clientRequestId:`work-selection-${mask}`,selection});expect((await owner().get(ctx,current.compositionId)).current.selection).toEqual(selection);expect(current.current.members).toEqual([]);}
 expect(await owner().history(ctx,current.compositionId)).toHaveLength(17);
});
it("共享依据为真实不可变Artifact，同请求恢复不回写后来的手工改稿",async()=>{
 const initial=await owner().create(ctx,{projectId:"work-project",title:"作品",clientRequestId:"work-basis-create"});const first={expectedRevision:0,clientRequestId:"work-basis-first",document:basis()};const saved=await owner().saveBasis(ctx,initial.compositionId,first);
 await owner().saveBasis(ctx,initial.compositionId,{expectedRevision:saved.currentRevision,clientRequestId:"work-basis-second",document:basis("新的手工依据")});await owner().saveBasis(ctx,initial.compositionId,first);
 expect((await owner().get(ctx,initial.compositionId)).basis.topic).toBe("新的手工依据");expect((await owner().basisVersion(ctx,initial.compositionId,saved.current.basisVersionId)).document.topic).toBe("共享主题");expect(await owner().request(ctx,first.clientRequestId)).toMatchObject({operation:"basis.save",status:"committed",resultRevision:1});
});
it("创建并发同请求只建一组，异输入/过期revision/跨账号零写入",async()=>{
 const body={projectId:"work-project",title:"作品",clientRequestId:"work-concurrent-create"};const result=await Promise.all([owner().create(ctx,body),owner().create(ctx,body)]);expect(result[0].compositionId).toBe(result[1].compositionId);
 await expect(owner().create(ctx,{...body,title:"不同"})).rejects.toThrow();await owner().saveSelection(ctx,result[0].compositionId,{expectedRevision:0,clientRequestId:"work-select-article",selection:["article"]});
 await expect(owner().saveSelection(ctx,result[0].compositionId,{expectedRevision:0,clientRequestId:"work-select-stale",selection:["video"]})).rejects.toThrow();await expect(owner().get({...ctx,accountId:"other"},result[0].compositionId)).rejects.toThrow();expect((await owner().get(ctx,result[0].compositionId)).current.selection).toEqual(["article"]);expect(await owner().list(ctx,"work-project")).toHaveLength(1);
});

function memberOwner(create:Ports["createMember"]){const projectOwner=createProjectsService(createProjectRepository(db),{now,nextId});return owner({createMember:create,findCreatedMember:async(c,p,_input,key,transaction)=>{const output=await createProjectsService(createProjectRepository(transaction??db),{now,nextId}).getOutputByCreationRequest(c,key);if(!output)return null;if(output.projectId!==p||output.contentType!=="video")throw new OwnershipError("创建目标归属不一致");return{kind:"video",outputId:output.id};},readMember:async(c,projectId,member,transaction)=>{if(member.kind!=="video")throw new OwnershipError("本fixture只有视频");const output=await createProjectsService(createProjectRepository(transaction??db),{now,nextId}).getOutput(c,member.outputId);if(output.projectId!==projectId||output.contentType!=="video")throw new OwnershipError("成员归属不一致");return{kind:"not_saved",outputId:output.id};}});}
function actualVideoCreator(){const projectOwner=createProjectsService(createProjectRepository(db),{now,nextId});return async(c:typeof ctx,projectId:string,raw:unknown,key:string)=>{const input=workMemberCreateInput.parse(raw);if(input.kind!=="video")throw Error("明确视频fixture");const output=await projectOwner.createOutput(c,projectId,{clientRequestId:key,title:input.title,contentType:"video",targetPlatform:input.targetPlatform??undefined,contentRole:input.contentRole??undefined});return{kind:"video" as const,outputId:output.id};};}
it("原owner创建丢回复后恢复同目标，等待期间更改选择不被迟到绑定覆盖",async()=>{
 const actualCreate=actualVideoCreator();let lose=true;const service=memberOwner(async(c,p,input,key)=>{const target=await actualCreate(c as typeof ctx,p,input,key);if(lose){lose=false;throw Error("创建回复丢失");}return target;});
 const initial=await service.create(ctx,{projectId:"work-project",title:"作品",clientRequestId:"member-create-composition"}),body={expectedRevision:0,clientRequestId:"member-create-video",memberInput:{kind:"video",title:"真实新视频",targetPlatform:null,contentRole:null}};
 await expect(service.createMember(ctx,initial.compositionId,body)).rejects.toThrow("回复丢失");const pending=await service.get(ctx,initial.compositionId);expect(pending.current.pendingMembers).toHaveLength(1);
 await service.saveSelection(ctx,initial.compositionId,{expectedRevision:pending.currentRevision,clientRequestId:"member-change-selection",selection:["moments"]});await service.createMember(ctx,initial.compositionId,body);
 const current=await service.get(ctx,initial.compositionId);expect(current.current.selection).toEqual(["moments"]);expect(current.current.members).toHaveLength(1);expect(current.memberCurrent[0]).toMatchObject({availability:"available",currentVersion:{kind:"not_saved"}});expect((await createProjectsService(createProjectRepository(db),{now,nextId}).listOutputIdsByProject(ctx,"work-project")).length).toBe(1);expect((await service.memberReservation(ctx,initial.compositionId,body.clientRequestId)).status).toBe("bound");
});
it("并发绑定手工目标后迟到创建只标冲突，保留两个真实owner作品",async()=>{
 const actualCreate=actualVideoCreator();let release!:()=>void,started!:()=>void;const gate=new Promise<void>(r=>release=r),ready=new Promise<void>(r=>started=r);const service=memberOwner(async(c,p,input,key)=>{const target=await actualCreate(c as typeof ctx,p,input,key);started();await gate;return target;});
 const initial=await service.create(ctx,{projectId:"work-project",title:"作品",clientRequestId:"member-conflict-composition"}),body={expectedRevision:0,clientRequestId:"member-conflict-create",memberInput:{kind:"video",title:"迟到视频",targetPlatform:null,contentRole:null}};
 const pending=service.createMember(ctx,initial.compositionId,body);await ready;const manual=await actualCreate(ctx,"work-project",{kind:"video",title:"用户明确选择",targetPlatform:null,contentRole:null},"member-manual-owner-create");const current=await service.get(ctx,initial.compositionId);await service.bindMember(ctx,initial.compositionId,{expectedRevision:current.currentRevision,clientRequestId:"member-manual-bind",member:manual});release();await pending;
 expect((await service.get(ctx,initial.compositionId)).current.members[0]?.member).toEqual(manual);expect((await service.memberReservation(ctx,initial.compositionId,body.clientRequestId)).status).toBe("conflict");expect((await createProjectsService(createProjectRepository(db),{now,nextId}).listOutputIdsByProject(ctx,"work-project")).length).toBe(2);
});

it("真实创建成功丢回复后取消，只读恢复原目标，取消不删作品也不再创建",async()=>{
 const actualCreate=actualVideoCreator();let creates=0;const service=memberOwner(async(c,p,input,key)=>{creates++;await actualCreate(c as typeof ctx,p,input,key);throw Error("创建回复丢失");});const initial=await service.create(ctx,{projectId:"work-project",title:"作品",clientRequestId:"cancel-create-composition"}),body={expectedRevision:0,clientRequestId:"cancel-unknown-member",memberInput:{kind:"video",title:"已创建原视频",targetPlatform:null,contentRole:null}};
 await expect(service.createMember(ctx,initial.compositionId,body)).rejects.toThrow("回复丢失");const current=await service.get(ctx,initial.compositionId);await service.cancelMemberReservation(ctx,initial.compositionId,{expectedRevision:current.currentRevision,clientRequestId:"cancel-member-request",reservationRequestId:body.clientRequestId});await service.createMember(ctx,initial.compositionId,body);
 const receipt=await service.memberReservation(ctx,initial.compositionId,body.clientRequestId);expect(receipt.status).toBe("cancelled");expect(receipt.target).toMatchObject({kind:"video"});expect(creates).toBe(1);expect((await service.get(ctx,initial.compositionId)).current.members).toEqual([]);expect((await createProjectsService(createProjectRepository(db),{now,nextId}).listOutputIdsByProject(ctx,"work-project"))).toHaveLength(1);
});
it("手工A→B→A改绑终止待建预约，旧创建不以身份回到A为由覆盖",async()=>{
 const actualCreate=actualVideoCreator();let release!:()=>void,started!:()=>void;const gate=new Promise<void>(r=>release=r),ready=new Promise<void>(r=>started=r),service=memberOwner(async(c,p,input,key)=>{const target=await actualCreate(c as typeof ctx,p,input,key);started();await gate;return target;});
 const initial=await service.create(ctx,{projectId:"work-project",title:"作品",clientRequestId:"aba-composition-create"});const a=await actualCreate(ctx,"work-project",{kind:"video",title:"A",targetPlatform:null,contentRole:null},"aba-original-a"),b=await actualCreate(ctx,"work-project",{kind:"video",title:"B",targetPlatform:null,contentRole:null},"aba-original-b");await service.bindMember(ctx,initial.compositionId,{expectedRevision:0,clientRequestId:"aba-bind-first-a",member:a});
 const body={expectedRevision:1,clientRequestId:"aba-pending-create",memberInput:{kind:"video",title:"迟到目标",targetPlatform:null,contentRole:null}},pending=service.createMember(ctx,initial.compositionId,body);await ready;
 const current=await service.get(ctx,initial.compositionId);const changed=await service.bindMember(ctx,initial.compositionId,{expectedRevision:current.currentRevision,clientRequestId:"aba-bind-b",member:b});await service.bindMember(ctx,initial.compositionId,{expectedRevision:changed.currentRevision,clientRequestId:"aba-bind-final-a",member:a});release();await pending;
 expect((await service.get(ctx,initial.compositionId)).current.members[0]?.member).toEqual(a);expect((await service.memberReservation(ctx,initial.compositionId,body.clientRequestId)).status).toBe("conflict");
});

it("删除项目清理组合和朋友圈回执/版本，其他账号的组合完整保留",async()=>{
 const work=await owner().create(ctx,{projectId:"work-project",title:"待删除组合",clientRequestId:"cascade-work-create"});
 await owner().saveSelection(ctx,work.compositionId,{expectedRevision:0,clientRequestId:"cascade-selection-save",selection:["moments"]});
 const {createMomentsService}=await import("../moments");const service=createMomentsService({db,now,nextId,ports:{artifacts:tx=>createArtifactsService({db:tx,now,nextId}),assertProjectOwned:async(c,id,tx,forUpdate)=>{await createProjectsService(createProjectRepository(tx),{now,nextId}).getProject(c,id,forUpdate);},assertFile:async()=>{},assertSource:async()=>{}}});
 const moments=await service.create(ctx,{projectId:"work-project",clientRequestId:"cascade-moments-create",document:{schemaVersion:1,text:"保留真实稿件直到删除",imageUses:[],sourceRefs:[]}});
 const other={...ctx,accountId:"cascade-other-account"};await db.insert(projects).values({id:"other-work-project",userId:other.userId,accountId:other.accountId,title:"其他账号项目",creationMode:"guided",status:"active",currentStage:"planning",startedAt:now(),createdAt:now(),updatedAt:now()});
 const retained=await owner().create(other,{projectId:"other-work-project",title:"保留组合",clientRequestId:"cascade-other-create"});
 const projectOwner=createProjectsService(createProjectRepository(db),{now,nextId});await expect(projectOwner.deleteProject(other,"work-project")).rejects.toThrow();expect(await owner().get(ctx,work.compositionId)).toBeTruthy();
 await projectOwner.deleteProject(ctx,"work-project");
 expect(await db.select().from(workCompositions).where(eq(workCompositions.id,work.compositionId))).toEqual([]);
 expect(await db.select().from(workCompositionVersions).where(eq(workCompositionVersions.compositionId,work.compositionId))).toEqual([]);
 expect(await db.select().from(workCompositionRequests).where(eq(workCompositionRequests.compositionId,work.compositionId))).toEqual([]);
 expect(await db.select().from(momentsAnchors).where(eq(momentsAnchors.id,moments.momentsId))).toEqual([]);
 expect(await db.select().from(momentsRequests).where(eq(momentsRequests.targetId,moments.momentsId))).toEqual([]);
 expect(await db.select().from(artifacts).where(eq(artifacts.projectId,"work-project"))).toEqual([]);
 expect((await owner().get(other,retained.compositionId)).current.title).toBe("保留组合");
});

it("公开组合transport保存与历史回执按真实owner版本读回",async()=>{
 const {ENDPOINTS}=await import("@creatoros/contract"),{createWorkCompositionsTransport}=await import("./work-compositions.transport");const transport=createWorkCompositionsTransport(()=>owner());
 const createBody={projectId:"work-project",title:"公开组合",clientRequestId:"transport-work-create"};
 const created=await transport.request(ENDPOINTS.createWorkComposition,{params:undefined,query:undefined,body:createBody},ctx) as {data:{composition:{compositionId:string;currentRevision:number}}};expect(ENDPOINTS.createWorkComposition.response.safeParse(created.data).success).toBe(true);const id=created.data.composition.compositionId;
 const body={expectedRevision:0,clientRequestId:"transport-basis-save",document:basis("原共享依据")};
 const saved=await transport.request(ENDPOINTS.saveWorkCompositionBasis,{params:{compositionId:id},query:undefined,body},ctx) as {data:unknown};expect(ENDPOINTS.saveWorkCompositionBasis.response.safeParse(saved.data).success).toBe(true);
 await owner().saveBasis(ctx,id,{expectedRevision:1,clientRequestId:"transport-basis-manual",document:basis("新手工依据")});
 const restored=await transport.request(ENDPOINTS.saveWorkCompositionBasis,{params:{compositionId:id},query:undefined,body},ctx) as {data:{composition:{basis:{topic:string}};basis:{document:{topic:string}}}};expect(restored.data.composition.basis.topic).toBe("新手工依据");expect(restored.data.basis.document.topic).toBe("原共享依据");
 await expect(transport.request(ENDPOINTS.getWorkComposition,{params:{compositionId:id},query:undefined,body:undefined},undefined)).rejects.toThrow();
});

it("项目删除提交后迟到创建拒绝，两个新owner均不留下回执或身份",async()=>{
 await createProjectsService(createProjectRepository(db),{now,nextId}).deleteProject(ctx,"work-project");
 await expect(owner().create(ctx,{projectId:"work-project",title:"迟到组合",clientRequestId:"deleted-work-create"})).rejects.toThrow();
 expect(await db.select().from(workCompositions)).toEqual([]);expect(await db.select().from(workCompositionRequests)).toEqual([]);expect(await db.select().from(workCompositionVersions)).toEqual([]);
});

it("依据旧来源只在原触点保留，复制到新观点必须重验并失败零写入",async()=>{
 let live=true,checks=0;const service=owner({assertSource:async(c,p,ref,tx)=>{checks++;const project=await createProjectsService(createProjectRepository(tx),{now,nextId}).getProject(c,p);if(!live||ref.kind!=="project"||ref.id!==project.id||ref.versionId!==project.updatedAt)throw Error("新引用须审读");}}),initial=await service.create(ctx,{projectId:"work-project",title:"历史依据",clientRequestId:"history-basis-create"}),ref={kind:"project",id:"work-project",versionId:now()},document={...basis(),sourceRefs:[ref]};
 const saved=await service.saveBasis(ctx,initial.compositionId,{expectedRevision:0,clientRequestId:"history-basis-first",document});live=false;
 const edited=await service.saveBasis(ctx,initial.compositionId,{expectedRevision:saved.currentRevision,clientRequestId:"history-basis-edit",document:{...document,topic:"仅改共享主题"}});expect(edited.basis.sourceRefs).toEqual([ref]);expect(checks).toBe(1);
 await expect(service.saveBasis(ctx,initial.compositionId,{expectedRevision:edited.currentRevision,clientRequestId:"history-basis-new-claim",document:{...document,claims:[{id:"new-claim",text:"新观点",sourceRefs:[ref]}]}})).rejects.toThrow("新引用须审读");expect((await service.get(ctx,initial.compositionId)).currentRevision).toBe(edited.currentRevision);expect(await service.history(ctx,initial.compositionId)).toHaveLength(3);
});
