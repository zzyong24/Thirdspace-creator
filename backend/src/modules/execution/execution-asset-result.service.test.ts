import {createExecutionRoute} from '@creatoros/contract/execution-worker';
import {createExecutionCodexCallService} from './execution-codex-call.service';
import {createHash} from 'node:crypto';
import {createExecutionWorkerOutcomeService} from "./execution-worker-outcome.service";
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
import {createExecutionAuthorityService} from "./execution-authority.service";
import {createExecutionCallLedgerService} from "./execution-call-ledger.service";
import {createPersistentTaskService} from "./persistent-task.service";
import {createExecutionProviderJobService} from "./execution-provider-job.service";
import {createExecutionAssetResultService} from "./execution-asset-result.service";
import {createLocalFsObjectStorage} from "../assets/localfs-object-storage";
let db:Db,connection:Awaited<ReturnType<typeof createDb>>,root:string,sequence=0;
beforeAll(async()=>{connection=await createDb();db=connection.db;root=await mkdtemp(join(tmpdir(),"t915-asset-result-"));});
afterAll(async()=>{await connection.client.close();await rm(root,{recursive:true,force:true});});
const budget={maxCalls:3,maxTokens:10000,deadlineMs:60000};
const bytes=new Uint8Array([1,2,3]);
async function fixture(mediaKind:"image"|"video"="video",codex=false){
 const id=`asset-result-${++sequence}`,ctx={userId:id,accountId:id,requestId:id,source:"user" as const};
 const now=()=>"2026-09-06T00:00:00.000Z";
 const input={kind:"asset.generate",mediaKind,capability:`${mediaKind}.generate`,operationKey:"asset/original",prompt:"画面",provider:"minimax",model:"MiniMax-H3",baseUrl:null};
 await db.insert(aiTasks).values({id,userId:id,accountId:id,taskType:"asset.generate",idempotencyKey:id,inputData:{kind:mediaKind,prompt:input.prompt},requestedAt:now()});
 const mapped=await createExecutionAuthorityService(db,{now}).bindAiTask(ctx,id);
 await db.update(executionTasks).set({payload:{aiTaskId:id,...(codex?{executionRoute:createExecutionRoute('codex')}:{}),modelInput:codex?{kind:'asset.generate',engine:'codex',protocolKind:'codex-app-server',runtimeVersion:'0.159.3',mediaKind:'image',capability:'image.generate',operationKey:input.operationKey,prompt:input.prompt,mode:'text_to_image'}:input}}).where(eq(executionTasks.id,mapped.executionTaskId));
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
it.each(["image","video"] as const)("%s 原调用只创建一个 pending 素材，费用未知不记零",async kind=>{
 const f=await fixture(kind);await f.service.start(f.ref,f.call.id);
 const receipt=await f.service.save(f.ref,f.call.id,bytes);
 expect(await createExecutionAssetResultService(f.deps).recover(f.ref,f.call.id)).toEqual({status:"committed",receipt});
 expect(await f.service.save(f.ref,f.call.id,bytes)).toEqual(receipt);
 expect(await db.select().from(assets).where(eq(assets.accountId,f.id))).toMatchObject([{id:receipt.assetId,status:"pending",assetType:kind}]);
 const state=await f.ledger.inspect(f.ref);expect(state.calls).toHaveLength(1);expect(state.calls[0]).toMatchObject({status:"settled",totalTokens:null,reservedTokens:128,resultRef:null});expect(JSON.parse(state.calls[0]!.resultText!)).toEqual(receipt);expect(state.spentTokens).toBeNull();
 expect((await f.tasks.get(f.ctx,f.ref.executionTaskId)).status).toBe("running");
});
it.each([false,true])("素材已提交但账本结算失败，取消=%s 后只补原账本",async cancelled=>{
 const f=await fixture();await f.service.start(f.ref,f.call.id);
 await db.execute(sql.raw("CREATE OR REPLACE FUNCTION fail_asset_settle() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.status = 'settled' THEN RAISE EXCEPTION 'settlement lost'; END IF; RETURN NEW; END; $$;"));
 await db.execute(sql.raw("CREATE TRIGGER fail_asset_settle BEFORE UPDATE ON execution_calls FOR EACH ROW EXECUTE FUNCTION fail_asset_settle();"));
 try{await expect(f.service.save(f.ref,f.call.id,bytes)).rejects.toThrow();}finally{await db.execute(sql.raw("DROP TRIGGER fail_asset_settle ON execution_calls;"));}
 expect(await db.select().from(assets).where(eq(assets.accountId,f.id))).toHaveLength(1);
 if(cancelled)await f.stop();
 f.storage.putObject=vi.fn(async()=>{throw new Error("不重写");});
 expect(await createExecutionAssetResultService(f.deps).recover(f.ref,f.call.id)).toMatchObject({status:"committed"});
 expect(f.storage.putObject).not.toHaveBeenCalled();expect((await f.ledger.inspect(f.ref)).calls[0]!.status).toBe("settled");
 expect((await f.tasks.get(f.ctx,f.ref.executionTaskId)).status).toBe(cancelled?"cancelled":"running");
});
it("取消后只回读已提交结果，不改终态",async()=>{
 const f=await fixture();await f.service.start(f.ref,f.call.id);const receipt=await f.service.save(f.ref,f.call.id,bytes);await f.stop();
 expect(await f.service.recover(f.ref,f.call.id)).toEqual({status:"committed",receipt});
 expect((await f.tasks.get(f.ctx,f.ref.executionTaskId)).status).toBe("cancelled");
});
it("准备后字节写入中断，取消不允许恢复创建素材",async()=>{
 const f=await fixture();await f.service.start(f.ref,f.call.id);const put=f.storage.putObject.bind(f.storage);
 f.storage.putObject=async value=>{await put(value);throw new Error("断开");};await expect(f.service.save(f.ref,f.call.id,bytes)).rejects.toThrow("断开");await f.stop();
 await expect(f.service.recover(f.ref,f.call.id)).rejects.toThrow();expect(await db.select().from(assets).where(eq(assets.accountId,f.id))).toHaveLength(0);
});
it("新 attempt 有原 job 才能保存续查字节，旧 fence 拒绝",async()=>{
 const f=await fixture();await f.service.start(f.ref,f.call.id);
 await createExecutionProviderJobService(db,{now:f.now}).record(f.ref,{callId:f.call.id,job:{schemaVersion:1,provider:f.input.provider,model:f.input.model,baseUrl:null,jobId:"original"}});
 const next=await f.resume();await expect(f.service.save(f.ref,f.call.id,bytes)).rejects.toThrow();
 const receipt=await f.service.save(next,f.call.id,bytes);expect(await f.service.recover(next,f.call.id)).toEqual({status:"committed",receipt});
 await expect(f.service.start(next,f.call.id)).rejects.toThrow();expect((await f.ledger.inspect(next)).calls).toHaveLength(1);
});
it("无 job 的旧启动不能借新 attempt 提交新字节",async()=>{
 const f=await fixture();await f.service.start(f.ref,f.call.id);const next=await f.resume();
 expect(await f.service.recover(next,f.call.id)).toEqual({status:"missing"});await expect(f.service.save(next,f.call.id,bytes)).rejects.toThrow();
});
it("未启动不能提交，损坏业务映射不能开始或保存",async()=>{
 const f=await fixture();await expect(f.service.save(f.ref,f.call.id,bytes)).rejects.toThrow();
 await db.update(aiTasks).set({accountId:"foreign"}).where(eq(aiTasks.id,f.id));await expect(f.service.start(f.ref,f.call.id)).rejects.toThrow();await expect(f.service.reserve(f.ref,128)).rejects.toThrow();
});
it("不同字节不可覆盖原结果",async()=>{
 const f=await fixture();await f.service.start(f.ref,f.call.id);const receipt=await f.service.save(f.ref,f.call.id,bytes);
 await expect(f.service.save(f.ref,f.call.id,new Uint8Array([9]))).rejects.toThrow();expect(await f.service.recover(f.ref,f.call.id)).toEqual({status:"committed",receipt});
});

it("无供应商任务号也能在新执行恢复已保存原字节，不能重写对象",async()=>{
 const f=await fixture("image");await f.service.start(f.ref,f.call.id);const put=f.storage.putObject.bind(f.storage);
 f.storage.putObject=async value=>{await put(value);throw new Error("已写断开");};await expect(f.service.save(f.ref,f.call.id,bytes)).rejects.toThrow("已写断开");
 const next=await f.resume();f.storage.putObject=vi.fn(async()=>{throw new Error("不能重写");});
 expect(await f.service.recover(next,f.call.id)).toMatchObject({status:"committed"});expect(f.storage.putObject).not.toHaveBeenCalled();expect((await f.ledger.inspect(next)).calls).toHaveLength(1);
});
it("有准备记录但没有字节时明确返回不足，不能结算伪结果",async()=>{
 const f=await fixture();await f.service.start(f.ref,f.call.id);f.storage.putObject=async()=>{throw new Error("未写");};
 await expect(f.service.save(f.ref,f.call.id,bytes)).rejects.toThrow("未写");expect(await f.service.recover(f.ref,f.call.id)).toEqual({status:"bytes_missing"});expect((await f.ledger.inspect(f.ref)).calls[0]!.status).toBe("started");
});
it("未知调用已有真实字节时可恢复结算，预算仍未知",async()=>{
 const f=await fixture();await f.service.start(f.ref,f.call.id);await f.ledger.settle(f.ref,f.call.id,{status:"unknown"});
 await f.service.save(f.ref,f.call.id,bytes);expect(await f.ledger.inspect(f.ref)).toMatchObject({unknownUsage:true,spentTokens:null,reservedTokens:128});
});

it("原素材通过同一候选事务完成，重投不恢复已删除素材",async()=>{
 const f=await fixture();await f.service.start(f.ref,f.call.id);const receipt=await f.service.save(f.ref,f.call.id,bytes);
 const projectCandidate=vi.fn(()=>{throw new Error("素材不能绕过专用验证");});
 const candidate=createExecutionCandidateService(db,{now:f.now,projectCandidate});
 const input={outcome:"succeeded",callId:f.call.id,text:JSON.stringify(receipt)};
 const result=await candidate.commitResult(f.ref,input);
 expect(projectCandidate).not.toHaveBeenCalled();
 expect(await db.select().from(aiTaskResults).where(eq(aiTaskResults.id,result.resultId))).toMatchObject([{assetId:receipt.assetId,resultType:"generated_asset",resultData:{assetId:receipt.assetId,assetType:"video",prompt:f.input.prompt}}]);
 expect((await f.tasks.get(f.ctx,f.ref.executionTaskId)).status).toBe("succeeded");
 expect((await db.select().from(aiTasks).where(eq(aiTasks.id,f.id)))[0]!.status).toBe("awaiting_confirmation");
 await db.update(assets).set({status:"deleted"}).where(eq(assets.id,receipt.assetId));
 expect(await candidate.commitResult(f.ref,input)).toEqual(result);
 expect((await db.select().from(assets).where(eq(assets.id,receipt.assetId)))[0]!.status).toBe("deleted");
});
it.each(["deleted","foreign","file","checksum"])("首次候选拒绝已变化素材 %s，不部分改变任务",async variant=>{
 const f=await fixture();await f.service.start(f.ref,f.call.id);const receipt=await f.service.save(f.ref,f.call.id,bytes);
 if(variant==="checksum")await db.update(assetFiles).set({checksum:"changed"}).where(eq(assetFiles.id,receipt.fileId));
 else await db.update(assets).set(variant==="deleted"?{status:"deleted"}:variant==="foreign"?{accountId:"other"}:{currentFileId:"other"}).where(eq(assets.id,receipt.assetId));
 const candidate=createExecutionCandidateService(db,{now:f.now,projectCandidate:()=>({resultType:"generated_asset",assetId:receipt.assetId,resultData:{}})});
 await expect(candidate.commitResult(f.ref,{outcome:"succeeded",callId:f.call.id,text:JSON.stringify(receipt)})).rejects.toThrow();
 expect(await db.select().from(aiTaskResults).where(eq(aiTaskResults.aiTaskId,f.id))).toHaveLength(0);
 expect((await f.tasks.get(f.ctx,f.ref.executionTaskId)).status).toBe("running");
});

it("素材验证后候选写入失败，任务状态全回滚且可原键补交",async()=>{
 const f=await fixture();await f.service.start(f.ref,f.call.id);const receipt=await f.service.save(f.ref,f.call.id,bytes);
 const candidate=createExecutionCandidateService(db,{now:f.now,projectCandidate:()=>{throw new Error("不可旁路");}}),input={outcome:"succeeded",callId:f.call.id,text:JSON.stringify(receipt)};
 await db.execute(sql.raw("CREATE FUNCTION fail_asset_candidate() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'candidate failure'; END; $$;"));
 await db.execute(sql.raw("CREATE TRIGGER fail_asset_candidate BEFORE INSERT ON ai_task_results FOR EACH ROW EXECUTE FUNCTION fail_asset_candidate();"));
 try{await expect(candidate.commitResult(f.ref,input)).rejects.toThrow();}finally{await db.execute(sql.raw("DROP TRIGGER fail_asset_candidate ON ai_task_results;"));}
 expect((await f.tasks.get(f.ctx,f.ref.executionTaskId)).status).toBe("running");expect((await f.ledger.inspect(f.ref)).calls[0]!.resultRef).toBeNull();
 expect(await db.select().from(aiTaskResults).where(eq(aiTaskResults.aiTaskId,f.id))).toHaveLength(0);
 const result=await candidate.commitResult(f.ref,input);expect(await candidate.commitResult(f.ref,input)).toEqual(result);
});
it("取消后保存回执仍可补账，但不能再创建候选",async()=>{
 const f=await fixture();await f.service.start(f.ref,f.call.id);const receipt=await f.service.save(f.ref,f.call.id,bytes);await f.stop();
 const candidate=createExecutionCandidateService(db,{now:f.now,projectCandidate:()=>{throw new Error("不可旁路");}});
 await expect(candidate.commitResult(f.ref,{outcome:"succeeded",callId:f.call.id,text:JSON.stringify(receipt)})).rejects.toThrow();
 expect((await f.tasks.get(f.ctx,f.ref.executionTaskId)).status).toBe("cancelled");expect(await db.select().from(aiTaskResults).where(eq(aiTaskResults.aiTaskId,f.id))).toHaveLength(0);
});
it("同内容其他调用的素材回执不能代替原产物",async()=>{
 const f=await fixture(),other=await fixture();await f.service.start(f.ref,f.call.id);await other.service.start(other.ref,other.call.id);
 const receipt=await other.service.save(other.ref,other.call.id,bytes);await f.ledger.settle(f.ref,f.call.id,{status:"settled",usage:{},resultText:JSON.stringify(receipt)});
 const candidate=createExecutionCandidateService(db,{now:f.now,projectCandidate:()=>({resultType:"generated_asset",assetId:receipt.assetId,resultData:{}})});
 await expect(candidate.commitResult(f.ref,{outcome:"succeeded",callId:f.call.id,text:JSON.stringify(receipt)})).rejects.toThrow("持久提交事实");
});

it("等待素材验证后截止时间已到，不得用旧时间提交成功",async()=>{
 const f=await fixture();await f.service.start(f.ref,f.call.id);const receipt=await f.service.save(f.ref,f.call.id,bytes);let reads=0;
 const candidate=createExecutionCandidateService(db,{now:()=>++reads===1?f.now():"2026-09-06T00:02:00.000Z",projectCandidate:()=>{throw new Error("不可旁路");}});
 await expect(candidate.commitResult(f.ref,{outcome:"succeeded",callId:f.call.id,text:JSON.stringify(receipt)})).rejects.toThrow();
 expect(await db.select().from(aiTaskResults).where(eq(aiTaskResults.aiTaskId,f.id))).toHaveLength(0);expect((await f.tasks.get(f.ctx,f.ref.executionTaskId)).status).toBe("running");
});

async function expireAsset(f:Awaited<ReturnType<typeof fixture>>){
 await db.update(executionTasks).set({leaseExpiresAt:"2026-09-05T23:59:59.000Z"}).where(eq(executionTasks.id,f.ref.executionTaskId));
 return f.tasks.recoverExpiredLeases();
}
it("租约过期后自动接管原视频任务号，不重置调用预算",async()=>{
 const f=await fixture();await f.service.start(f.ref,f.call.id);
 await createExecutionProviderJobService(db,{now:f.now}).record(f.ref,{callId:f.call.id,job:{schemaVersion:1,provider:f.input.provider,model:f.input.model,baseUrl:null,jobId:"expired-original"}});
 const before=await f.ledger.inspect(f.ref);expect((await expireAsset(f)).requeued).toBe(1);
 const next=(await f.tasks.claimTask({taskId:f.ref.executionTaskId,workerId:"replacement"}))!;
 const ref={...f.ref,attempt:next.lease.attempt,fenceToken:next.lease.fenceToken};
 expect(await f.service.reserve(ref,128)).toMatchObject({id:f.call.id,status:"started"});
 expect(await f.ledger.inspect(ref)).toMatchObject({reservedTokens:before.reservedTokens});
 expect(await createExecutionProviderJobService(db,{now:f.now}).read(ref,{callId:f.call.id})).toMatchObject({jobId:"expired-original"});
 await expect(f.service.start(ref,f.call.id)).rejects.toThrow();
});
it("租约过期后自动恢复本地原字节，供应商无需任务号",async()=>{
 const f=await fixture("image");await f.service.start(f.ref,f.call.id);const put=f.storage.putObject.bind(f.storage);
 f.storage.putObject=async input=>{await put(input);throw new Error("写后中断");};
 await expect(f.service.save(f.ref,f.call.id,bytes)).rejects.toThrow();
 expect((await expireAsset(f)).requeued).toBe(1);
 const next=(await f.tasks.claimTask({taskId:f.ref.executionTaskId,workerId:"replacement"}))!;
 f.storage.putObject=vi.fn(async()=>{throw new Error("不得重新生成或写入");});
 expect(await f.service.recover({...f.ref,attempt:next.lease.attempt,fenceToken:next.lease.fenceToken},f.call.id)).toMatchObject({status:"committed"});
 expect(f.storage.putObject).not.toHaveBeenCalled();
});
it.each(["missing","foreign-job","attempts","deadline","cancel","pause"])("过期素材恢复尊重 %s 边界",async variant=>{
 const f=await fixture();await f.service.start(f.ref,f.call.id);
 if(variant!=="missing")await createExecutionProviderJobService(db,{now:f.now}).record(f.ref,{callId:f.call.id,job:{schemaVersion:1,provider:f.input.provider,model:f.input.model,baseUrl:null,jobId:"boundary-original"}});
 if(variant==="foreign-job")await db.update(executionCalls).set({providerJob:{schemaVersion:1,provider:"other",model:f.input.model,baseUrl:null,jobId:"wrong"}}).where(eq(executionCalls.id,f.call.id));
 if(variant==="attempts")await db.update(executionTasks).set({maxAttempts:f.ref.attempt}).where(eq(executionTasks.id,f.ref.executionTaskId));
 if(variant==="deadline")await db.update(executionTasks).set({deadlineAt:f.now()}).where(eq(executionTasks.id,f.ref.executionTaskId));
 if(variant==="cancel" || variant==="pause")await f.tasks.command(f.ctx,{taskIds:[f.ref.executionTaskId],command:variant,idempotencyKey:variant});
 await expireAsset(f);
 expect((await db.select().from(executionTasks).where(eq(executionTasks.id,f.ref.executionTaskId)))[0]!.status).toBe(variant==="cancel"?"cancelled":variant==="pause"?"paused":"unknown_result");
 expect(await f.tasks.claimTask({taskId:f.ref.executionTaskId,workerId:"unexpected"})).toBeNull();
});

it("原 job 的 unknown 调用可接管，但再次中断仍耗原尝试次数",async()=>{
 const f=await fixture();await f.service.start(f.ref,f.call.id);
 await createExecutionProviderJobService(db,{now:f.now}).record(f.ref,{callId:f.call.id,job:{schemaVersion:1,provider:f.input.provider,model:f.input.model,baseUrl:null,jobId:"unknown-original"}});
 await f.ledger.settle(f.ref,f.call.id,{status:"unknown"});
 await db.update(executionTasks).set({maxAttempts:2}).where(eq(executionTasks.id,f.ref.executionTaskId));
 expect((await expireAsset(f)).requeued).toBe(1);
 const next=(await f.tasks.claimTask({taskId:f.ref.executionTaskId,workerId:"replacement"}))!;
 expect(next.lease.attempt).toBe(2);
 expect((await expireAsset(f)).unknownResult).toBe(1);
 expect(await f.tasks.claimTask({taskId:f.ref.executionTaskId,workerId:"third"})).toBeNull();
 expect((await db.select().from(executionCalls).where(eq(executionCalls.id,f.call.id)))[0]).toMatchObject({status:"unknown",startedAttempt:1,reservedTokens:128});
 expect((await f.tasks.recoverExpiredLeases()).requeued).toBe(0);
});
it("只有准备记录而没有字节时接管只回读，不产生素材或第二次自动接管",async()=>{
 const f=await fixture("image");await f.service.start(f.ref,f.call.id);
 f.storage.putObject=vi.fn(async()=>{throw new Error("写前中断");});await expect(f.service.save(f.ref,f.call.id,bytes)).rejects.toThrow();
 expect((await expireAsset(f)).requeued).toBe(1);
 const next=(await f.tasks.claimTask({taskId:f.ref.executionTaskId,workerId:"replacement"}))!;
 vi.mocked(f.storage.putObject).mockClear();
 expect(await f.service.recover({...f.ref,attempt:next.lease.attempt,fenceToken:next.lease.fenceToken},f.call.id)).toEqual({status:"bytes_missing"});
 expect(f.storage.putObject).not.toHaveBeenCalled();expect(await db.select().from(assets).where(eq(assets.accountId,f.id))).toHaveLength(0);
 await db.update(executionTasks).set({status:"unknown_result"}).where(eq(executionTasks.id,f.ref.executionTaskId));
 expect((await f.tasks.recoverExpiredLeases()).requeued).toBe(0);
});
it("素材已结算但未提交候选也不能绕过最大接管次数",async()=>{
 const f=await fixture("image");await f.service.start(f.ref,f.call.id);await f.service.save(f.ref,f.call.id,bytes);
 await db.update(executionTasks).set({maxAttempts:f.ref.attempt}).where(eq(executionTasks.id,f.ref.executionTaskId));
 expect((await expireAsset(f)).failed).toBe(1);
 expect(await f.tasks.claimTask({taskId:f.ref.executionTaskId,workerId:"over-budget"})).toBeNull();
 expect(await db.select().from(assets).where(eq(assets.accountId,f.id))).toHaveLength(1);
 expect((await db.select().from(executionCalls).where(eq(executionCalls.id,f.call.id)))[0]!.status).toBe("settled");
});

function adoptionAi(f:Awaited<ReturnType<typeof fixture>>,fail=false){
 const unused=vi.fn(async():Promise<never>=>{throw new Error("未使用端口");});
 const link=async(c:RequestContext,input:Parameters<ReturnType<typeof createMaterialLinksService>["create"]>[1],tx:unknown=db)=>{
  const txDb=tx as Db,deps={now:f.now,nextId:(p:string)=>`${p}-${++sequence}`};
  const projectService=createProjectsService(createProjectRepository(txDb),deps),assetService=createAssetsService(createAssetRepository(txDb,deps),async()=>f.storage,deps);
  const row=await createMaterialLinksService({db:txDb,...deps,assertProjectOwned:async(context,id)=>{await projectService.listOutputIdsByProject(context,id);},assertAssetOwned:async(context,id)=>{const asset=await assetService.getAsset(context,id);if(asset.status!=="active")throw new Error("素材不可用");return asset;}}).create(c,input);
  if(fail)throw new Error("链接写后失败");return row;
 };
 return createAiService({generatedAssets:createGeneratedAssetAdoptionService(db,{link},f.now),db,now:f.now,nextId:p=>`${p}-${++sequence}`,artifacts:{createVersion:unused},knowledge:{createKnowledge:unused},candidate:{createFromAIResult:unused,enrichCard:unused},learnings:{createLearning:unused},publishing:{createPublicationFromDraft:unused},materialLinks:{link},positioning:{upsertProfile:unused,createStatementVersion:unused},calibration:{createDraftPrediction:unused}});
}
async function candidateForAdoption(withProject=true){
 const f=await fixture("image");
 if(withProject){await db.insert(projects).values({id:f.id,userId:f.id,accountId:f.id,title:"真实项目",creationMode:"manual",status:"active",currentStage:"brief",startedAt:f.now(),createdAt:f.now(),updatedAt:f.now()});await db.update(aiTasks).set({projectId:f.id}).where(eq(aiTasks.id,f.id));}
 await f.service.start(f.ref,f.call.id);const receipt=await f.service.save(f.ref,f.call.id,bytes);
 const result=await createExecutionCandidateService(db,{now:f.now,projectCandidate:()=>{throw new Error("素材不可旁路");}}).commitResult(f.ref,{outcome:"succeeded",callId:f.call.id,text:JSON.stringify(receipt)});
 return {...f,receipt,result};
}
it("公共素材采纳在项目链接写后失败时完整回滚",async()=>{
 const f=await candidateForAdoption();await expect(adoptionAi(f,true).confirmTask(f.ctx,f.id)).rejects.toThrow("链接写后失败");
 expect((await db.select().from(assets).where(eq(assets.id,f.receipt.assetId)))[0]!.status).toBe("pending");
 expect(await db.select().from(materialLinks).where(eq(materialLinks.projectId,f.id))).toHaveLength(0);
 expect((await db.select().from(aiTasks).where(eq(aiTasks.id,f.id)))[0]!.status).toBe("awaiting_confirmation");
});

it("公共素材采纳并发及回执丢失后重试只建一个链接",async()=>{
 const f=await candidateForAdoption(),ai=adoptionAi(f);
 const replies=await Promise.all([ai.confirmTask(f.ctx,f.id),ai.confirmTask(f.ctx,f.id)]);
 expect(replies.map(reply=>reply.status)).toEqual(["succeeded","succeeded"]);
 expect(await db.select().from(materialLinks).where(eq(materialLinks.projectId,f.id))).toMatchObject([{entityId:f.receipt.assetId,role:"broll",stage:"production",priority:"normal"}]);
 expect(await db.select().from(materialLinks).where(eq(materialLinks.projectId,f.id))).toHaveLength(1);
 await db.delete(materialLinks).where(eq(materialLinks.projectId,f.id));await db.update(assets).set({status:"deleted"}).where(eq(assets.id,f.receipt.assetId));
 expect((await ai.confirmTask(f.ctx,f.id)).status).toBe("succeeded");
 expect(await db.select().from(materialLinks).where(eq(materialLinks.projectId,f.id))).toHaveLength(0);
 expect((await db.select().from(assets).where(eq(assets.id,f.receipt.assetId)))[0]!.status).toBe("deleted");
});
it("无项目的公共采纳只激活原素材",async()=>{
 const f=await candidateForAdoption(false);expect((await adoptionAi(f).confirmTask(f.ctx,f.id)).status).toBe("succeeded");
 expect((await db.select().from(assets).where(eq(assets.id,f.receipt.assetId)))[0]!.status).toBe("active");
 expect(await db.select().from(materialLinks).where(eq(materialLinks.entityId,f.receipt.assetId))).toHaveLength(0);
});
it.each(["account","project","file","checksum","receipt","candidate","cancelled"])("公共素材采纳拒绝 %s 变化且不激活、不建链",async variant=>{
 const f=await candidateForAdoption();
 if(variant==="project")await db.update(projects).set({accountId:"foreign"}).where(eq(projects.id,f.id));
 if(variant==="file")await db.update(assets).set({currentFileId:"foreign"}).where(eq(assets.id,f.receipt.assetId));
 if(variant==="checksum")await db.update(assetFiles).set({checksum:"changed"}).where(eq(assetFiles.id,f.receipt.fileId));
 if(variant==="receipt")await db.update(executionCalls).set({resultText:JSON.stringify({...f.receipt,assetId:"foreign"})}).where(eq(executionCalls.id,f.call.id));
 if(variant==="candidate")await db.update(aiTaskResults).set({assetId:"foreign"}).where(eq(aiTaskResults.id,f.result.resultId));
 if(variant==="cancelled")await db.update(aiTasks).set({status:"cancelled"}).where(eq(aiTasks.id,f.id));
 await expect(adoptionAi(f).confirmTask(variant==="account"?{...f.ctx,accountId:"foreign"}:f.ctx,f.id)).rejects.toThrow();
 expect((await db.select().from(assets).where(eq(assets.id,f.receipt.assetId)))[0]!.status).toBe("pending");
 expect(await db.select().from(materialLinks).where(eq(materialLinks.projectId,f.id))).toHaveLength(0);
});
it("公共取消素材候选删除 pending，重复取消不恢复素材",async()=>{
 const f=await candidateForAdoption(),ai=adoptionAi(f);
 expect((await ai.cancelTask(f.ctx,f.id)).status).toBe("cancelled");
 expect((await ai.cancelTask(f.ctx,f.id)).status).toBe("cancelled");
 expect((await db.select().from(assets).where(eq(assets.id,f.receipt.assetId)))[0]!.status).toBe("deleted");
 expect(await db.select().from(materialLinks).where(eq(materialLinks.projectId,f.id))).toHaveLength(0);
 await expect(ai.confirmTask(f.ctx,f.id)).rejects.toThrow();
});
it("公共采纳与取消同时请求，只能有一个结果生效",async()=>{
 const f=await candidateForAdoption(),ai=adoptionAi(f);
 const replies=await Promise.allSettled([ai.confirmTask(f.ctx,f.id),ai.cancelTask(f.ctx,f.id)]);
 expect(replies.filter(reply=>reply.status==="fulfilled")).toHaveLength(1);
 const task=(await db.select().from(aiTasks).where(eq(aiTasks.id,f.id)))[0]!,asset=(await db.select().from(assets).where(eq(assets.id,f.receipt.assetId)))[0]!;
 expect(["succeeded","cancelled"]).toContain(task.status);
 expect(asset.status).toBe(task.status==="succeeded"?"active":"deleted");
 expect(await db.select().from(materialLinks).where(eq(materialLinks.projectId,f.id))).toHaveLength(task.status==="succeeded"?1:0);
});
it("公共取消在状态写入失败时回滚素材删除",async()=>{
 const f=await candidateForAdoption(),ai=adoptionAi(f);
 await db.execute(sql.raw("CREATE FUNCTION fail_asset_cancel() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.status = 'cancelled' THEN RAISE EXCEPTION 'cancel status failure'; END IF; RETURN NEW; END; $$;"));
 await db.execute(sql.raw("CREATE TRIGGER fail_asset_cancel BEFORE UPDATE ON ai_tasks FOR EACH ROW EXECUTE FUNCTION fail_asset_cancel();"));
 try{await expect(ai.cancelTask(f.ctx,f.id)).rejects.toThrow();}finally{await db.execute(sql.raw("DROP TRIGGER fail_asset_cancel ON ai_tasks;"));}
 expect((await db.select().from(assets).where(eq(assets.id,f.receipt.assetId)))[0]!.status).toBe("pending");
 expect((await db.select().from(aiTasks).where(eq(aiTasks.id,f.id)))[0]!.status).toBe("awaiting_confirmation");
 expect((await ai.cancelTask(f.ctx,f.id)).status).toBe("cancelled");
});

it.each(["ready","missing-job","wrong-job","attempts","deadline","cancel","pause","unclassified"])("自动原视频对账尊重 %s 边界",async variant=>{
 const f=await fixture();await f.service.start(f.ref,f.call.id);
 if(variant!=="missing-job")await createExecutionProviderJobService(db,{now:f.now}).record(f.ref,{callId:f.call.id,job:{schemaVersion:1,provider:f.input.provider,model:f.input.model,baseUrl:null,jobId:"recover-original"}});
 await f.ledger.settle(f.ref,f.call.id,{status:"unknown"});
 if(variant==="wrong-job")await db.update(executionCalls).set({providerJob:{schemaVersion:1,provider:"wrong",model:f.input.model,baseUrl:null,jobId:"recover-original"}}).where(eq(executionCalls.id,f.call.id));
 if(variant==="attempts")await db.update(executionTasks).set({maxAttempts:f.ref.attempt}).where(eq(executionTasks.id,f.ref.executionTaskId));
 if(variant==="deadline")await db.update(executionTasks).set({deadlineAt:"2026-09-06T00:00:10.000Z"}).where(eq(executionTasks.id,f.ref.executionTaskId));
 if(variant==="cancel" || variant==="pause")await f.tasks.command(f.ctx,{taskIds:[f.ref.executionTaskId],command:variant,idempotencyKey:variant});
 const work=createExecutionWorkerOutcomeService(db,{now:f.now,random:()=>0}).recordFailure(f.ref,{outcome:"unknown_result",errorCode:variant==="unclassified"?"ASSET_RESULT_UNKNOWN":"ASSET_RECONCILE_RETRYABLE",retryAfterMs:40000});
 if(variant==="cancel" || variant==="pause"){await expect(work).rejects.toThrow();return;}
 expect(await work).toEqual({status:variant==="ready"?"retry_wait":"unknown_result",retryAt:variant==="ready"?"2026-09-06T00:00:40.000Z":null});
 expect(await f.tasks.claimTask({taskId:f.ref.executionTaskId,workerId:"early"})).toBeNull();
 expect((await db.select().from(executionCalls).where(eq(executionCalls.id,f.call.id)))[0]).toMatchObject({status:"unknown",startedAttempt:f.ref.attempt,reservedTokens:128});
});

it.each(['image/png','image/jpeg','image/webp'] as const)('Codex原图片%s按真实字节格式保存；新租约只读原回合而不重发',async mime=>{
 const f=await fixture('image',true);await f.service.start(f.ref,f.call.id);
 const original=mime==='image/png'?new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,0]):mime==='image/jpeg'?new Uint8Array([255,216,255,0,0,0,0,0,0,0,0,0]):new Uint8Array(Buffer.from('RIFF0000WEBP'));
 const binder=createExecutionCodexCallService(db,{now:f.now});
 await binder.invoke(f.ref,'bindCodexCall',{callId:f.call.id,threadId:'original-thread',turnId:'original-turn',nativeResult:{itemId:'original-image',checksum:'sha256:'+createHash('sha256').update(original).digest('hex'),model:'observed-model',usage:null}});
 const next=await f.resume();await expect(f.service.start(next,f.call.id)).rejects.toThrow();
 await expect(f.service.save(next,f.call.id,new Uint8Array([9]))).rejects.toThrow('原回合事实');
 const receipt=await f.service.save(next,f.call.id,original);
 expect((await db.select().from(assetFiles).where(eq(assetFiles.id,receipt.fileId)))[0]?.mimeType).toBe(mime);
 expect(await f.service.recover(next,f.call.id)).toEqual({status:'committed',receipt});
 const state=await f.ledger.inspect(next);expect(state.calls).toHaveLength(1);expect(state.calls[0]).toMatchObject({startedAttempt:1,status:'settled',totalTokens:null});
});
it('Codex无原native字节绑定不能保存伪图或借Pi供应商回执',async()=>{
 const f=await fixture('image',true);await f.service.start(f.ref,f.call.id);
 await expect(f.service.save(f.ref,f.call.id,bytes)).rejects.toThrow('原回合事实');
 expect(await db.select().from(assets).where(eq(assets.userId,f.id))).toHaveLength(0);
});
