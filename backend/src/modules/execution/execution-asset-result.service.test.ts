import {createExecutionCandidateService} from "../ai/execution-candidate.service";
import {beforeAll,afterAll,it,expect,vi} from "vitest";
import {mkdtemp,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {createDb,aiTasks,executionTasks,executionCalls,assets,assetFiles,aiTaskResults,eq,sql,type Db} from "@creatoros/backend";
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
async function fixture(mediaKind:"image"|"video"="video"){
 const id=`asset-result-${++sequence}`,ctx={userId:id,accountId:id,requestId:id,source:"user" as const};
 const now=()=>"2026-09-06T00:00:00.000Z";
 const input={kind:"asset.generate",mediaKind,capability:`${mediaKind}.generate`,operationKey:"asset/original",prompt:"画面",provider:"minimax",model:"MiniMax-H3",baseUrl:null};
 await db.insert(aiTasks).values({id,userId:id,accountId:id,taskType:"asset.generate",idempotencyKey:id,inputData:{kind:mediaKind,prompt:input.prompt},requestedAt:now()});
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
