import {afterAll, beforeAll, expect, it} from "vitest";
import {z} from "zod";
import {mkdtemp, rm} from "node:fs/promises";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {createHash} from "node:crypto";
import {createDb, aiConversations, aiTasks, executionTasks, executionCalls, assets, assetFiles, eq, type Db} from "@creatoros/backend";
import type {RequestContext} from "@creatoros/contract";
import {createAccountGroupService} from "../platform-account/account-group.service";
import {createLocalFsObjectStorage} from "../assets/localfs-object-storage";
import {createAiRepository} from "./ai.repository";
import {createChatTurnSubmissionService, chatInputDigest} from "./chat-turn-submission.service";
import {createPersistentTaskService} from "../execution/persistent-task.service";
import {createExternalChatTurnService} from "./external-chat-turn.service";
import {createExternalTaskToolService} from "./external-task-tool.service";
import {buildChatTools, type ChatToolDeps} from "../ai-runtime/chat-tools";
import {prepareChatToolDefinitions} from "../ai-runtime/chat-tool-definitions";
import {createChatHostToolAdapter} from "../ai-runtime/chat-host-tool-adapter";
import {readCommittedGeneratedAssetFile, verifyGeneratedAssetCandidate, activateGeneratedAssetCandidate, discardGeneratedAssetCandidate} from "../assets/generated-asset-candidate.service";

let db:Db, close:()=>Promise<void>, sequence=0;
const now=()=>"2026-10-07T01:00:00.000Z", nextId=(prefix:string)=>`${prefix}-${++sequence}`;
const budget={maxCalls:8,maxTokens:10000,deadlineMs:120000}, roots:string[]=[];
beforeAll(async()=>{const opened=await createDb(); db=opened.db; close=()=>opened.client.close();});
afterAll(async()=>{await close(); for(const root of roots)await rm(root,{recursive:true,force:true});});

async function fixture(groupOnly=true){
 const base:RequestContext={userId:"t1070-neutral-user",requestId:nextId("request"),source:"user"};
 const group=await createAccountGroupService({db,now,nextId}).create(base,{name:"编导中性验收",idempotencyKey:nextId("group-key")});
 const ctx:RequestContext=groupOnly?{...base,accountId:null,groupId:group.id,groupVersion:group.version}:{...base,accountId:nextId("legacy-account")};
 const repo=createAiRepository(db,{userId:ctx.userId,accountId:ctx.accountId??null,groupId:ctx.groupId,now,nextId});
 const conversation=await repo.createConversation({title:"验收会话",projectId:null,scope:"global"});
 const source=await repo.createMessage(conversation.id,{role:"user",content:"移动项目素材",attachments:[],modelMetadata:{}});
 let proposals=0;
 // 仅为实际工具装配/账本测试提供确定性领域候选；不宣称真实剪辑或模型验收。
 const prototypes=buildChatTools(["video.edit.render"],{
  boundProjectId:"neutral-project", prepareVideoEdit:async input=>{proposals++;return {
   kind:"video.edit",projectId:"neutral-project",outputId:"neutral-video",expectedRevision:1,sourceRenderTaskId:null,
   instruction:input.instruction,summary:["移动指定素材"],decisions:{},renderProps:{},error:null,
  };},
 } as ChatToolDeps);
 const prepared=await prepareChatToolDefinitions(prototypes);
 const tools=await createChatHostToolAdapter(prototypes,async()=>prototypes,{"video.edit.render":"proposal"});
 const unsafe={name:"publish.package",version:"unsafe-v1",description:"不应暴露",parameters:{type:"object"},effect:"committed" as const};
 const submitted=await createChatTurnSubmissionService(db,{now,assemble:async()=>({capability:"copilot.assist",system:"中性策略",messages:[{role:"user",content:source.content}],maxSteps:4,maxOutputTokens:128,tools:[...prepared.definitions,unsafe]})}).submit(ctx,{conversationId:conversation.id,sourceMessageId:source.id,executionEngine:"codex"});
 const claim=(await createPersistentTaskService(db,{now}).claimTask({taskId:submitted.executionTaskId,workerId:"neutral-worker"}))!;
 const ref={executionTaskId:submitted.executionTaskId,attempt:claim.lease.attempt,fenceToken:claim.lease.fenceToken};
 const root=await mkdtemp(join(tmpdir(),"t1070-neutral-images-"));roots.push(root);
 const storage=createLocalFsObjectStorage({rootPath:root,publicBaseUrl:"/blob"},{nextKey:()=>nextId("object")});
 const chat=createExternalChatTurnService(db,{now,budget,objectStorageForCtx:async()=>storage}),externalTools=createExternalTaskToolService(db,{now});
 const signal=new AbortController().signal;
 return {ctx,group,repo,conversation,submitted,ref,chat,externalTools,tools,signal,proposals:()=>proposals};
}
async function start(f:Awaited<ReturnType<typeof fixture>>){
 const turn=await f.chat.reserve(f.ref,{});
 await f.chat.start(f.ref,{callId:turn.callId,sessionId:"neutral-session",protocolKind:"acp",protocolVersion:1});
 await f.chat.recordProviderTurn(f.ref,{callId:turn.callId,providerTurnId:"neutral-provider-turn"});
 return turn;
}
const receipt=(callId:string)=>({schemaVersion:1 as const,engine:"codex" as const,protocolKind:"acp" as const,protocolVersion:1,sessionId:"neutral-session",turnId:callId,providerTurnId:"neutral-provider-turn",stopReason:"end_turn" as const,text:"已准备剪辑候选",usage:null});
const editRequest=(callId:string)=>({turnCallId:callId,toolCallId:"neutral-edit-call",toolName:"video.edit.render",input:{instruction:"把选定素材移到两秒",moveBroll:[{assetId:"neutral-asset",at:2}]}});

it.each([true,false])("纯组=%s的外部公共链完成真实工具调用与幂等回复提交，卡片可读回",async groupOnly=>{
 const f=await fixture(groupOnly),turn=await start(f),listed=await f.externalTools.list(f.ref,{},f.tools);
 expect(listed.tools.map(tool=>tool.name)).toEqual(["video.edit.render"]);
 const request=editRequest(turn.callId),result=await f.externalTools.execute(f.ref,request,f.tools,f.signal);
 expect(result).toMatchObject({status:"settled",outcome:{status:"ok",sideEffect:"proposal",data:{kind:"video.edit",outputId:"neutral-video"}}});
 expect(await f.externalTools.execute(f.ref,request,f.tools,f.signal)).toEqual(result);expect(f.proposals()).toBe(1);
 await f.chat.settle(f.ref,{callId:turn.callId,status:"settled",receipt:receipt(turn.callId)});
 const committed=await f.chat.commit(f.ref,{callId:turn.callId});expect(await f.chat.commit(f.ref,{callId:turn.callId})).toEqual(committed);
 expect(committed).toMatchObject({outcome:"succeeded"});
 const messages=await f.repo.listMessages(f.conversation.id);expect(messages).toHaveLength(2);
 expect(messages[1]?.parts).toEqual(expect.arrayContaining([expect.objectContaining({type:"tool-video.edit.render",output:expect.objectContaining({kind:"video.edit",outputId:"neutral-video"})})]));
 const task=(await db.select().from(executionTasks).where(eq(executionTasks.id,f.ref.executionTaskId)))[0]!;
 expect(task).toMatchObject({status:"succeeded",groupId:groupOnly?f.group.id:null,accountId:groupOnly?null:f.ctx.accountId});
 expect(await db.select().from(executionCalls).where(eq(executionCalls.executionTaskId,task.id))).toHaveLength(2);
});

it("纯组图片候选保存/恢复/结算仍绑定exact文件，原图片不自动采纳",async()=>{
 const f=await fixture(),turn=await start(f),identity={callId:turn.callId,sessionId:"neutral-session",toolCallId:"neutral-image",imageIndex:0};
 const bytes=new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,0]);
 expect(await f.chat.recoverImage(f.ref,identity)).toEqual({status:"missing"});
 const saved=await f.chat.saveImage(f.ref,{...identity,mimeType:"image/png",bytes});
 expect(await f.chat.saveImage(f.ref,{...identity,mimeType:"image/png",bytes})).toEqual(saved);
 expect(await f.chat.recoverImage(f.ref,identity)).toEqual(saved);
 const asset=(await db.select().from(assets).where(eq(assets.id,saved.receipt.assetId)))[0]!;
 expect(asset).toMatchObject({groupId:f.group.id,accountId:null,status:"pending"});
 expect(await db.select().from(assetFiles).where(eq(assetFiles.assetId,asset.id))).toHaveLength(1);
 await expect(f.chat.settle(f.ref,{callId:turn.callId,status:"settled",receipt:{...receipt(turn.callId),images:[{...saved.receipt,checksum:"b".repeat(64)}]}})).rejects.toThrow();
 await f.chat.settle(f.ref,{callId:turn.callId,status:"settled",receipt:{...receipt(turn.callId),text:"",images:[saved.receipt]}});
 await f.chat.commit(f.ref,{callId:turn.callId});
 expect((await f.repo.listMessages(f.conversation.id))[1]?.parts).toEqual(expect.arrayContaining([expect.objectContaining({type:"tool-native.image"})]));
 expect((await db.select().from(assets).where(eq(assets.id,asset.id)))[0]?.status).toBe("pending");
});

async function imageFixture(){
 const f=await fixture(),turn=await start(f),identity={callId:turn.callId,sessionId:"neutral-session",toolCallId:"neutral-image",imageIndex:0};
 const saved=await f.chat.saveImage(f.ref,{...identity,mimeType:"image/png",bytes:new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,0])});
 const {toolCallId,imageIndex,...receipt}=saved.receipt;
 const callId=`chat-image-${createHash("sha256").update(JSON.stringify([turn.callId,toolCallId,imageIndex])).digest("hex")}`;
 return {...f,receipt,callId};
}
it("生成素材回执沿同一纯组原调用读取，跨组/跨用户/错call均拒绝",async()=>{
 const f=await imageFixture(),other=await fixture();
 expect(await readCommittedGeneratedAssetFile(db,f.ctx,f.callId,f.receipt)).toMatchObject({receipt:f.receipt,assetStatus:"pending"});
 await expect(readCommittedGeneratedAssetFile(db,other.ctx,f.callId,f.receipt)).rejects.toThrow();
 await expect(readCommittedGeneratedAssetFile(db,{...f.ctx,userId:"foreign-user"},f.callId,f.receipt)).rejects.toThrow();
 await expect(readCommittedGeneratedAssetFile(db,f.ctx,"wrong-call",f.receipt)).rejects.toThrow();
 await expect(readCommittedGeneratedAssetFile(db,f.ctx,f.callId,{...f.receipt,byteLength:f.receipt.byteLength+1})).rejects.toThrow();
});
it("精确历史文件可读但current变版不能采纳；激活后不能再次采纳或拒绝删除",async()=>{
 const f=await imageFixture();
 await db.update(assets).set({currentFileId:"changed-file"}).where(eq(assets.id,f.receipt.assetId));
 expect(await readCommittedGeneratedAssetFile(db,f.ctx,f.callId,f.receipt)).toMatchObject({receipt:f.receipt});
 await expect(verifyGeneratedAssetCandidate(db,f.ctx,f.callId,f.receipt)).rejects.toThrow("当前文件改变");
 await db.update(assets).set({currentFileId:f.receipt.fileId}).where(eq(assets.id,f.receipt.assetId));
 await activateGeneratedAssetCandidate(db,f.ctx,f.callId,f.receipt,now());
 expect(await readCommittedGeneratedAssetFile(db,f.ctx,f.callId,f.receipt)).toMatchObject({assetStatus:"active"});
 await expect(activateGeneratedAssetCandidate(db,f.ctx,f.callId,f.receipt,now())).rejects.toThrow();
 await expect(discardGeneratedAssetCandidate(db,f.ctx,f.callId,f.receipt,now())).rejects.toThrow("已采纳素材");
});
it("拒绝纯组pending候选仅标删除且幂等，错组不改状态；原文件事实不被重写",async()=>{
 const f=await imageFixture(),other=await fixture();
 await expect(discardGeneratedAssetCandidate(db,other.ctx,f.callId,f.receipt,now())).rejects.toThrow();
 expect((await db.select().from(assets).where(eq(assets.id,f.receipt.assetId)))[0]?.status).toBe("pending");
 await discardGeneratedAssetCandidate(db,f.ctx,f.callId,f.receipt,now());
 await discardGeneratedAssetCandidate(db,f.ctx,f.callId,f.receipt,now());
 expect((await db.select().from(assets).where(eq(assets.id,f.receipt.assetId)))[0]?.status).toBe("deleted");
 expect(await db.select().from(assetFiles).where(eq(assetFiles.id,f.receipt.fileId))).toHaveLength(1);
 await expect(readCommittedGeneratedAssetFile(db,f.ctx,f.callId,f.receipt)).rejects.toThrow("原素材不可");
});

it.each(["business","conversation"])("错误%s组不会借null账号通过外部读取",async target=>{
 const f=await fixture();
 if(target==="business")await db.update(aiTasks).set({groupId:"foreign-group"}).where(eq(aiTasks.id,f.submitted.taskId));
 else await db.update(aiConversations).set({groupId:"foreign-group"}).where(eq(aiConversations.id,f.conversation.id));
 await expect(f.chat.reserve(f.ref,{})).rejects.toThrow();
 await expect(f.externalTools.list(f.ref,{},f.tools)).rejects.toThrow();
});

it("冻结modelInput组被篡改，即使其摘要一致也不能冒用lease组",async()=>{
 const f=await fixture(),task=(await db.select().from(executionTasks).where(eq(executionTasks.id,f.ref.executionTaskId)))[0]!;
 const payload=task.payload as {modelInput:Record<string,unknown>},modelInput={...payload.modelInput,groupId:"foreign-group"};
 await db.update(executionTasks).set({payload:{...payload,modelInput}}).where(eq(executionTasks.id,task.id));
 const business=(await db.select().from(aiTasks).where(eq(aiTasks.id,f.submitted.taskId)))[0]!;
 await db.update(aiTasks).set({inputData:{...business.inputData as object,modelInputDigest:chatInputDigest(modelInput)}}).where(eq(aiTasks.id,business.id));
 await expect(f.chat.reserve(f.ref,{})).rejects.toThrow("来源无效");
 await expect(f.externalTools.list(f.ref,{},f.tools)).rejects.toThrow("身份无效");
});

it("纯组工具执行入口重查会话组、拒绝旧fence与伪造call，不允许发布",async()=>{
 const f=await fixture(),turn=await start(f),request=editRequest(turn.callId);
 await expect(f.externalTools.execute({...f.ref,fenceToken:"old"},request,f.tools,f.signal)).rejects.toThrow();
 await expect(f.externalTools.execute(f.ref,{...request,turnCallId:"invented"},f.tools,f.signal)).rejects.toThrow();
 const unsafe={version:"unsafe-v1",effect:"committed" as const,parameters:z.object({}),approve:async()=>({status:"not-applicable" as const}),execute:async()=>{throw Error("不能发布");}};
 await expect(f.externalTools.execute(f.ref,{...request,toolName:"publish.package",input:{}},{...f.tools,"publish.package":unsafe},f.signal)).rejects.toThrow();
 await db.update(aiConversations).set({groupId:"foreign-group"}).where(eq(aiConversations.id,f.conversation.id));
 await expect(f.externalTools.execute(f.ref,request,f.tools,f.signal)).rejects.toThrow();
 expect(f.proposals()).toBe(0);
});

it("纯组未知工具结果保留原调用，禁止新ID继续或结算成成功",async()=>{
 const f=await fixture(),turn=await start(f),request=editRequest(turn.callId);let calls=0;
 const tools={...f.tools,"video.edit.render":{...f.tools["video.edit.render"]!,execute:async()=>{calls++;throw Error("结果未知");}}};
 expect((await f.externalTools.execute(f.ref,request,tools,f.signal)).status).toBe("unknown");
 expect((await f.externalTools.execute(f.ref,request,tools,f.signal)).status).toBe("unknown");expect(calls).toBe(1);
 await expect(f.externalTools.execute(f.ref,{...request,toolCallId:"new"},tools,f.signal)).rejects.toThrow("尚未对账");
 await expect(f.chat.settle(f.ref,{callId:turn.callId,status:"settled",receipt:receipt(turn.callId)})).rejects.toThrow("子工具回执尚未确认");
});
