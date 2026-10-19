import {createExecutionWorkerOutcomeService} from "../execution/execution-worker-outcome.service";
import {accountGroups} from "../../schema/account-groups";
import {createPlatformAccountService,createAccountGroupService} from "../platform-account";
import {createProjectsService,createProjectRepository} from "../projects";
import {createAssetsService,createAssetRepository} from "../assets";
import type {RequestContext} from "@creatoros/contract";
import {createGeneratedAssetAdoptionService} from "../ai/generated-asset-adoption.service";
import {createAiService} from "../ai/ai.service";
import {createMaterialLinksService} from "../material-links";
import {createExecutionCandidateService} from "../ai/execution-candidate.service";
import {beforeAll,afterAll,it,expect,vi} from "vitest";
import {mkdtemp,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {createDb,projects,materialLinks,aiTasks,executionTasks,executionCalls,assets,assetFiles,aiTaskResults,eq,sql,type Db} from "@creatoros/backend";
import {createExecutionAuthorityService} from "../execution/execution-authority.service";
import {createExecutionCallLedgerService} from "../execution/execution-call-ledger.service";
import {createPersistentTaskService} from "../execution/persistent-task.service";
import {createExecutionProviderJobService} from "../execution/execution-provider-job.service";
import {createExecutionAssetResultService} from "../execution/execution-asset-result.service";
import {createLocalFsObjectStorage} from "../assets/localfs-object-storage";
let db:Db,connection:Awaited<ReturnType<typeof createDb>>,root:string,sequence=0;
beforeAll(async()=>{connection=await createDb();db=connection.db;root=await mkdtemp(join(tmpdir(),"t915-asset-result-"));});
afterAll(async()=>{await connection.client.close();await rm(root,{recursive:true,force:true});});
const budget={maxCalls:3,maxTokens:10000,deadlineMs:60000};
const bytes=new Uint8Array([1,2,3]);
async function fixture(mediaKind:"image"|"video"="video",scope:"legacy"|"group"|"group-account"="legacy"){
 const id=`asset-result-${++sequence}`,ctx:RequestContext={userId:id,accountId:scope==='legacy'?id:null,...(scope!=='legacy'?{groupId:`group-${id}`,groupVersion:1}:{}),requestId:id,source:"user"};
 const now=()=>"2026-09-06T00:00:00.000Z";
 if(ctx.groupId)await db.insert(accountGroups).values({id:ctx.groupId,userId:id,name:'中性证明组',status:'active',version:1,createdAt:now(),updatedAt:now()});
 if(scope==='group-account'){const deps={db,now,nextId:(p:string)=>`${p}-${++sequence}`};const account=await createPlatformAccountService(deps).createAccount(ctx,{platform:'xiaohongshu',accountHandle:'中性证明账号'});ctx.accountId=account.id;ctx.membershipVersion=(await createAccountGroupService(deps).forAccount(ctx,account.id)).version;}
 const input={kind:"asset.generate",mediaKind,capability:`${mediaKind}.generate`,operationKey:"asset/original",prompt:"画面",provider:"minimax",model:"MiniMax-H3",baseUrl:null};
 await db.insert(aiTasks).values({id,userId:id,accountId:ctx.accountId,groupId:ctx.groupId??null,groupVersion:ctx.groupVersion??null,membershipVersion:ctx.membershipVersion??null,taskType:"asset.generate",idempotencyKey:id,inputData:{kind:mediaKind,prompt:input.prompt},requestedAt:now()});
 const mapped=await createExecutionAuthorityService(db,{now}).bindAiTask(ctx,id);
 await db.update(executionTasks).set({payload:{aiTaskId:id,modelInput:input}}).where(eq(executionTasks.id,mapped.executionTaskId));
 const tasks=createPersistentTaskService(db,{now}),claim=(await tasks.claimTask({taskId:mapped.executionTaskId,workerId:"worker"}))!;
 const ref={executionTaskId:mapped.executionTaskId,attempt:claim.lease.attempt,fenceToken:claim.lease.fenceToken};
 const storage=createLocalFsObjectStorage({rootPath:join(root,id),publicBaseUrl:"/blob"},{nextKey:()=>"unused"});
 const deps={db,now,budget,objectStorageForCtx:async()=>storage};
 const service=createExecutionAssetResultService(deps),call=await service.reserve(ref,128);
 const ledger=createExecutionCallLedgerService(db,{now,budget});
 const stop=async()=>{await tasks.command(ctx,{taskIds:[ref.executionTaskId],command:"cancel",idempotencyKey:"cancel"});await tasks.acknowledgeControl({taskId:ref.executionTaskId,workerId:"worker",attempt:ref.attempt});};
 const resume=async()=>{await tasks.command(ctx,{taskIds:[ref.executionTaskId],command:"pause",idempotencyKey:"pause"});await tasks.acknowledgeControl({taskId:ref.executionTaskId,workerId:"worker",attempt:ref.attempt});await tasks.command(ctx,{taskIds:[ref.executionTaskId],command:"resume",idempotencyKey:"resume"});const next=(await tasks.claimTask({taskId:ref.executionTaskId,workerId:"new"}))!;return {...ref,attempt:next.lease.attempt,fenceToken:next.lease.fenceToken};};
 return {id,ctx,now,input,tasks,ref,storage,deps,service,call,ledger,stop,resume};
}

import {readCommittedGeneratedAssetFile} from '../assets/generated-asset-candidate.service';
function aiFor(tx:Db){return createAiService({db:tx,now:()=>"2026-09-06T00:00:00.000Z",nextId:p=>p+String(++sequence),artifacts:{createVersion:async()=>({}),adoptThesisCandidate:async()=>{}},knowledge:{createKnowledge:async()=>({id:"unused"})},candidate:{createFromAIResult:async()=>({id:"unused"}),enrichCard:async()=>({id:"unused"})},learnings:{createLearning:async()=>({id:"unused"})},publishing:{createPublicationFromDraft:async()=>({id:"unused"})},materialLinks:{link:async()=>({id:"unused"})},positioning:{upsertProfile:async()=>({id:"unused"}),createStatementVersion:async()=>({id:"unused"})},calibration:{createDraftPrediction:async()=>({id:"unused"})}});}
function reader(){return createExecutionCandidateService(db,{projectCandidate:()=>{throw Error("未使用结构投影");},committedAssets:{aiFor,assetsFor:tx=>({readCommittedGeneratedAssetFile:(ctx,callId,raw)=>readCommittedGeneratedAssetFile(tx,ctx,callId,raw)})}});}
async function saved(scope:'legacy'|'group'|'group-account'='legacy'){const f=await fixture('image',scope);await f.service.start(f.ref,f.call.id);const receipt=await f.service.save(f.ref,f.call.id,bytes);const r=await createExecutionCandidateService(db,{now:f.now,projectCandidate:()=>{throw Error("未使用结构投影");}}).commitResult(f.ref,{callId:f.call.id,outcome:'succeeded',text:JSON.stringify(receipt)});return {...f,receipt,resultId:r.resultId};}
it('原call→真实对象提交→原candidate链只读证明pending，完整账本零写',async()=>{const f=await saved(),before={tasks:await db.select().from(aiTasks),calls:await db.select().from(executionCalls),results:await db.select().from(aiTaskResults),assets:await db.select().from(assets),files:await db.select().from(assetFiles)};expect(await reader().getCommittedAssetResult(f.ctx,{taskId:f.id,resultId:f.resultId})).toMatchObject({status:'verified',proof:{receipt:f.receipt,taskStatus:'awaiting_confirmation',assetStatus:'pending'}});expect({tasks:await db.select().from(aiTasks),calls:await db.select().from(executionCalls),results:await db.select().from(aiTaskResults),assets:await db.select().from(assets),files:await db.select().from(assetFiles)}).toEqual(before);});
it('旧缺call证据诚实不可验证；错误task/result归属不可读取',async()=>{const f=await saved();await expect(aiFor(db).getAssetResultProof({...f.ctx,accountId:'foreign'},{taskId:f.id,resultId:f.resultId})).rejects.toThrow();expect(await reader().getCommittedAssetResult(f.ctx,{taskId:f.id,resultId:'another'})).toMatchObject({status:'unverifiable'});await db.update(aiTaskResults).set({executionCallId:null}).where(eq(aiTaskResults.id,f.resultId));expect(await reader().getCommittedAssetResult(f.ctx,{taskId:f.id,resultId:f.resultId})).toMatchObject({status:'unverifiable'});});
it('call子调用/未结算/wrongref/未来startedAttempt/完整提交文件改变均不可验证',async()=>{const f=await saved();const [original]=await db.select().from(executionCalls).where(eq(executionCalls.id,f.call.id));for(const change of [{parentCallId:f.call.id},{status:'started'},{resultRef:'wrong'},{operationKey:'wrong'},{inputDigest:'sha256:'+'0'.repeat(64)},{startedAttempt:null},{startedAttempt:99}]){await db.update(executionCalls).set(change).where(eq(executionCalls.id,f.call.id));expect(await reader().getCommittedAssetResult(f.ctx,{taskId:f.id,resultId:f.resultId})).toMatchObject({status:'unverifiable'});await db.update(executionCalls).set(original!).where(eq(executionCalls.id,f.call.id));}await db.update(assetFiles).set({storageKey:'wrong'}).where(eq(assetFiles.id,f.receipt.fileId));expect(await reader().getCommittedAssetResult(f.ctx,{taskId:f.id,resultId:f.resultId})).toMatchObject({status:'unverifiable'});});
it('新attempt恢复旧已保存bytes不误杀，旧lease仍不能提交迟到bytes',async()=>{const f=await fixture('image');await f.service.start(f.ref,f.call.id);const receipt=await f.service.save(f.ref,f.call.id,bytes);const next=await f.resume();expect(await f.service.recover(next,f.call.id)).toEqual({status:'committed',receipt});await expect(f.service.save(f.ref,f.call.id,bytes)).rejects.toThrow();const r=await createExecutionCandidateService(db,{now:f.now,projectCandidate:()=>{throw Error('unused');}}).commitResult(next,{callId:f.call.id,outcome:'succeeded',text:JSON.stringify(receipt)});expect(await reader().getCommittedAssetResult(f.ctx,{taskId:f.id,resultId:r.resultId})).toMatchObject({status:'verified',proof:{receipt}});});

it.each(['group','group-account'] as const)('纯组来源证明原链 scope=%s：精确pending文件可读，跨组/用户/账号/空串拒绝且零写',async scope=>{
 const f=await saved(scope),before={tasks:await db.select().from(aiTasks),executions:await db.select().from(executionTasks),calls:await db.select().from(executionCalls),results:await db.select().from(aiTaskResults),assets:await db.select().from(assets),files:await db.select().from(assetFiles)};
 expect(await reader().getCommittedAssetResult(f.ctx,{taskId:f.id,resultId:f.resultId})).toMatchObject({status:'verified',proof:{receipt:f.receipt,taskStatus:'awaiting_confirmation',assetStatus:'pending'}});
 for(const context of [{...f.ctx,groupId:'foreign'}, {...f.ctx,userId:'foreign'}, {...f.ctx,accountId:scope==='group'? 'foreign':null}, {...f.ctx,accountId:''}])expect(await reader().getCommittedAssetResult(context,{taskId:f.id,resultId:f.resultId})).toMatchObject({status:'unverifiable'});
 expect({tasks:await db.select().from(aiTasks),executions:await db.select().from(executionTasks),calls:await db.select().from(executionCalls),results:await db.select().from(aiTaskResults),assets:await db.select().from(assets),files:await db.select().from(assetFiles)}).toEqual(before);
});
