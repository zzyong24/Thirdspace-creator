import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {beforeAll,afterAll,it,expect} from "vitest";
import {createDb,aiTasks,executionTasks,executionCalls,eq,type Db} from "@creatoros/backend";
import {assetGenerationInputSchema} from "@creatoros/contract/execution-worker";
import {canonicalJson} from "../ai/canonical-json";
import {createExecutionAuthorityService} from "./execution-authority.service";
import {createExecutionCallLedgerService} from "./execution-call-ledger.service";
import {createPersistentTaskService} from "./persistent-task.service";
import {createExecutionProviderJobService} from "./execution-provider-job.service";

let db:Db,connection:Awaited<ReturnType<typeof createDb>>,sequence=0;
beforeAll(async()=>{connection=await createDb();db=connection.db;});
afterAll(async()=>connection.client.close());
const input={kind:"asset.generate",mediaKind:"video",capability:"video.generate",operationKey:"asset/original",prompt:"画面",provider:"minimax",model:"MiniMax-H3",baseUrl:null};
const job={schemaVersion:1,provider:input.provider,model:input.model,baseUrl:null,jobId:"provider-original"};
const budget={maxCalls:3,maxTokens:10000,deadlineMs:60000};
async function fixture(){
 const id=`provider-job-${++sequence}`,ctx={userId:"provider-job-user",accountId:"provider-job-account",requestId:id,source:"user" as const};
 const now=()=>"2026-09-06T00:00:00.000Z";
 await db.insert(aiTasks).values({id,userId:ctx.userId,accountId:ctx.accountId,taskType:"asset.generate",idempotencyKey:id,inputData:{kind:"video",prompt:input.prompt},requestedAt:now()});
 const mapped=await createExecutionAuthorityService(db,{now}).bindAiTask(ctx,id);
 await db.update(executionTasks).set({payload:{aiTaskId:id,modelInput:input}}).where(eq(executionTasks.id,mapped.executionTaskId));
 const tasks=createPersistentTaskService(db,{now});
 const claim=(await tasks.claimTask({taskId:mapped.executionTaskId,workerId:"worker"}))!;
 const ref={executionTaskId:mapped.executionTaskId,attempt:claim.lease.attempt,fenceToken:claim.lease.fenceToken};
 const ledger=createExecutionCallLedgerService(db,{now,budget});
 const call=await ledger.reserve(ref,{operationKey:input.operationKey,kind:"model",reservedTokens:128,inputDigest:`sha256:${createHash("sha256").update(canonicalJson(input)).digest("hex")}`});
 const service=createExecutionProviderJobService(db,{now});
 return {id,ctx,now,tasks,ref,ledger,call,service};
}
it("新增字段保留空值兼容，迁移可重复执行",async()=>{
 const f=await fixture();
 const migration=readFileSync("drizzle/0087_execution_provider_job.sql","utf8");
 await connection.client.exec(migration);await connection.client.exec(migration);
 const [row]=await db.select().from(executionCalls).where(eq(executionCalls.id,f.call.id));
 expect(row!.providerJob).toBeNull();
});
it("已启动调用保存原任务号，重新建服务回读且不消耗新预算",async()=>{
 const f=await fixture();await f.ledger.start(f.ref,f.call.id);
 expect(await f.service.read(f.ref,{callId:f.call.id})).toBeNull();
 await f.service.record(f.ref,{callId:f.call.id,job});
 expect(await createExecutionProviderJobService(db,{now:f.now}).read(f.ref,{callId:f.call.id})).toEqual(job);
 await f.service.record(f.ref,{callId:f.call.id,job});
 const state=await f.ledger.inspect(f.ref);expect(state.calls).toHaveLength(1);expect(state.calls[0]).toMatchObject({status:"started",providerJob:job,reservedTokens:128,totalTokens:null});
});
it.each(["jobId","provider","model","baseUrl"])("已提交事实不能替换 %s",async field=>{
 const f=await fixture();await f.ledger.start(f.ref,f.call.id);await f.service.record(f.ref,{callId:f.call.id,job});
 await expect(f.service.record(f.ref,{callId:f.call.id,job:{...job,[field]:field==="baseUrl"?"https://changed.example":"changed"}})).rejects.toThrow();
 expect(await f.service.read(f.ref,{callId:f.call.id})).toEqual(job);
});
it("预留未启动的调用不能伪造供应商提交",async()=>{
 const f=await fixture();await expect(f.service.record(f.ref,{callId:f.call.id,job})).rejects.toThrow();
});
it("取消后只补记已提交事实，不准读取启动后续动作或改终态",async()=>{
 const f=await fixture();await f.ledger.start(f.ref,f.call.id);
 await f.tasks.command(f.ctx,{taskIds:[f.ref.executionTaskId],command:"cancel",idempotencyKey:"cancel"});
 await f.tasks.acknowledgeControl({taskId:f.ref.executionTaskId,workerId:"worker",attempt:f.ref.attempt});
 await f.service.record(f.ref,{callId:f.call.id,job});
 await expect(f.service.read(f.ref,{callId:f.call.id})).rejects.toThrow();
 expect((await f.tasks.get(f.ctx,f.ref.executionTaskId)).status).toBe("cancelled");
});
it("新租约回读同一个 job，旧凭证不能记录或读取",async()=>{
 const f=await fixture();await f.ledger.start(f.ref,f.call.id);await f.service.record(f.ref,{callId:f.call.id,job});
 await f.tasks.command(f.ctx,{taskIds:[f.ref.executionTaskId],command:"pause",idempotencyKey:"pause-"+f.ref.executionTaskId});
 await f.tasks.acknowledgeControl({taskId:f.ref.executionTaskId,workerId:"worker",attempt:f.ref.attempt});
 await f.tasks.command(f.ctx,{taskIds:[f.ref.executionTaskId],command:"resume",idempotencyKey:"resume-"+f.ref.executionTaskId});
 const claim=(await f.tasks.claimTask({taskId:f.ref.executionTaskId,workerId:"new-worker"}))!;
 const ref={...f.ref,attempt:claim.lease.attempt,fenceToken:claim.lease.fenceToken};
 expect(await f.service.read(ref,{callId:f.call.id})).toEqual(job);
 await expect(f.service.record(f.ref,{callId:f.call.id,job})).rejects.toThrow();
 await expect(f.service.read(f.ref,{callId:f.call.id})).rejects.toThrow();
});
it.each(["account","mapping","digest","kind","input"])("读取和记录均拒绝损坏关联 %s",async variant=>{
 const f=await fixture();await f.ledger.start(f.ref,f.call.id);
 if(variant==="account" || variant==="mapping")await db.update(aiTasks).set(variant==="account"?{accountId:"foreign"}:{executionTaskId:null}).where(eq(aiTasks.id,f.id));
 else if(variant==="input")await db.update(aiTasks).set({inputData:{kind:"video",prompt:"另一意图"}}).where(eq(aiTasks.id,f.id));
 else await db.update(executionCalls).set(variant==="kind"?{kind:"tool"}:{inputDigest:`sha256:${"f".repeat(64)}`}).where(eq(executionCalls.id,f.call.id));
 await expect(f.service.record(f.ref,{callId:f.call.id,job})).rejects.toThrow();
 await expect(f.service.read(f.ref,{callId:f.call.id})).rejects.toThrow();
});
it("unknown 补记 job 仍保持未知，既有预算与状态不变",async()=>{
 const f=await fixture();await f.ledger.start(f.ref,f.call.id);await f.ledger.settle(f.ref,f.call.id,{status:"unknown"});
 await f.service.record(f.ref,{callId:f.call.id,job});
 const state=await f.ledger.inspect(f.ref);expect(state.calls[0]).toMatchObject({status:"unknown",providerJob:job,totalTokens:null,reservedTokens:128});expect(state.spentTokens).toBeNull();
 await expect(f.ledger.start(f.ref,f.call.id)).rejects.toThrow();
});
it("已有供应商任务号不能改成提交被拒绝并获得重新付费资格",async()=>{
 const f=await fixture();await f.ledger.start(f.ref,f.call.id);await f.service.record(f.ref,{callId:f.call.id,job});
 await expect(f.ledger.settle(f.ref,f.call.id,{status:"rejected"})).rejects.toThrow();
 expect((await f.ledger.inspect(f.ref)).calls[0]).toMatchObject({status:"started",providerJob:job});
});
it("并发首次提交不同任务号只能确认一个，不能互相覆盖",async()=>{
 const f=await fixture();await f.ledger.start(f.ref,f.call.id);
 const results=await Promise.allSettled([job,{...job,jobId:"other-job"}].map(job=>f.service.record(f.ref,{callId:f.call.id,job})));
 const successful=results.filter(result=>result.status==="fulfilled");
 expect(successful).toHaveLength(1);expect(results.filter(result=>result.status==="rejected")).toHaveLength(1);
 expect(await f.service.read(f.ref,{callId:f.call.id})).toEqual(successful[0]!.value);
});
it("事务回滚不残留提交事实，之后可以原号补记",async()=>{
 const f=await fixture();await f.ledger.start(f.ref,f.call.id);
 await expect(db.transaction(async tx=>{
  await createExecutionProviderJobService(tx as unknown as Db,{now:f.now}).record(f.ref,{callId:f.call.id,job});
  throw new Error("rollback");
 })).rejects.toThrow("rollback");
 expect(await f.service.read(f.ref,{callId:f.call.id})).toBeNull();
 await f.service.record(f.ref,{callId:f.call.id,job});expect(await f.service.read(f.ref,{callId:f.call.id})).toEqual(job);
});
it.each([{jobId:""},{jobId:"x".repeat(513)},{token:"secret"},{baseUrl:"https://user:secret@example.com"},{baseUrl:"https://example.com?key=secret"},{serviceId:null}])("供应商事实拒绝非法或敏感字段 %j",async patch=>{
 const f=await fixture();await f.ledger.start(f.ref,f.call.id);
 await expect(f.service.record(f.ref,{callId:f.call.id,job:{...job,...patch}})).rejects.toThrow();
 expect(await f.service.read(f.ref,{callId:f.call.id})).toBeNull();
});
it.each([{mediaKind:"image"},{mediaKind:"image",capability:"image.generate",durationSec:6},{mediaKind:"image",capability:"image.generate",resolution:"2K"},{token:"secret"}])("冻结输入拒绝错误组合或凭据 %j",patch=>{
 expect(assetGenerationInputSchema.safeParse({...input,...patch}).success).toBe(false);
});
it("换租约后不能冒充原提交者补写此前未知的任务号",async()=>{
 const f=await fixture();await f.ledger.start(f.ref,f.call.id);
 await f.tasks.command(f.ctx,{taskIds:[f.ref.executionTaskId],command:"pause",idempotencyKey:"pause-"+f.ref.executionTaskId});
 await f.tasks.acknowledgeControl({taskId:f.ref.executionTaskId,workerId:"worker",attempt:f.ref.attempt});
 await f.tasks.command(f.ctx,{taskIds:[f.ref.executionTaskId],command:"resume",idempotencyKey:"resume-"+f.ref.executionTaskId});
 const claim=(await f.tasks.claimTask({taskId:f.ref.executionTaskId,workerId:"new-worker"}))!;
 const ref={...f.ref,attempt:claim.lease.attempt,fenceToken:claim.lease.fenceToken};
 await expect(f.service.record(ref,{callId:f.call.id,job})).rejects.toThrow("当前启动权");
 expect(await f.service.read(ref,{callId:f.call.id})).toBeNull();
});
