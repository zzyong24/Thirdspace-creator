import {beforeAll,afterAll,it,expect,vi} from "vitest";
import {createDb,aiTasks,aiTaskResults,executionTasks,executionCalls,eq,type Db} from "@creatoros/backend";
import {createAssetBusinessExecutionService} from "./asset-business-execution.service";
let db:Db,connection:Awaited<ReturnType<typeof createDb>>,seq=0;
beforeAll(async()=>{connection=await createDb();db=connection.db;});afterAll(async()=>connection.client.close());
const stamp="2026-09-06T00:00:00.000Z",ctx={userId:"asset-entry-user",accountId:"asset-entry-account",requestId:"test",source:"user" as const};
const spec={kind:"image",provider:"openai",model:"image-model",baseUrl:null,token:"private-token",settings:{quality:"high"}} as const;
async function fixture(patch:Partial<typeof aiTasks.$inferInsert>={}){
 const id=`asset-entry-${++seq}`;
 await db.insert(aiTasks).values({id,userId:ctx.userId,accountId:ctx.accountId,taskType:"asset.generate",status:"queued",requestedAt:stamp,idempotencyKey:id,requestFingerprint:`sha256:${"a".repeat(64)}`,inputData:{kind:"image",prompt:"真实画面"},...patch});
 const resolveSpec=vi.fn(async()=>spec),assertProject=vi.fn(async()=>{});
 const service=createAssetBusinessExecutionService(db,{now:()=>stamp,budget:{maxCalls:6,maxTokens:10000,deadlineMs:600000},resolveSpec,assertProject});return {id,service,resolveSpec,assertProject};
}
it("新素材准备冻结规格但不保存密钥，重放不重新解析模型",async()=>{
 const f=await fixture(),mapped=await f.service.prepare(ctx,f.id);expect(mapped).not.toHaveProperty("legacy");
 const row=(await db.select().from(executionTasks).where(eq(executionTasks.id,mapped.executionTaskId!)))[0]!;
 expect(row.payload).toMatchObject({modelInput:{kind:"asset.generate",mediaKind:"image",provider:"openai",model:"image-model",runtimeOptionsDigest:expect.stringMatching(/^sha256:/)}});
 expect(JSON.stringify(row)).not.toContain("private-token");expect(row.deadlineAt).toBe("2026-09-06T00:10:00.000Z");
 f.resolveSpec.mockRejectedValue(new Error("配置变化"));expect(await f.service.prepare(ctx,f.id)).toEqual(mapped);expect(f.resolveSpec).toHaveBeenCalledTimes(1);
});
it.each(["checkpoint","retry","result"])("旧 %s 事实只绑定原恢复，不授权新付费提交",async variant=>{
 const original=variant==="retry"?await fixture():null;
 const f=await fixture(variant==="checkpoint"?{runtimeData:{multimodalProviderCheckpoint:{broken:true}}}:original?{retryOfTaskId:original.id}:{});
 if(variant==="result")await db.insert(aiTaskResults).values({id:`result-${f.id}`,aiTaskId:f.id,resultType:"generated_asset",resultData:{assetId:"old"}});
 const before=(await db.select().from(aiTasks).where(eq(aiTasks.id,f.id)))[0]!;
 const results=await db.select().from(aiTaskResults).where(eq(aiTaskResults.aiTaskId,f.id));
 const mapped=await f.service.prepare(ctx,f.id);
 const after=(await db.select().from(aiTasks).where(eq(aiTasks.id,f.id)))[0]!;
 expect(after.executionTaskId).toBe(mapped.executionTaskId);
 expect(after.runtimeData).toEqual(before.runtimeData);expect(after.inputData).toEqual(before.inputData);
 expect(after.retryOfTaskId).toBe(before.retryOfTaskId);expect(after.requestFingerprint).toBe(before.requestFingerprint);
 expect(await db.select().from(aiTaskResults).where(eq(aiTaskResults.aiTaskId,f.id))).toEqual(results);
 const execution=(await db.select().from(executionTasks).where(eq(executionTasks.id,mapped.executionTaskId)))[0]!;
 expect(execution.payload).toMatchObject({assetLegacyRecovery:{schemaVersion:1,mode:"review",originalTaskId:original?.id??f.id,inputData:before.inputData,requestFingerprint:before.requestFingerprint,callId:null}});
 expect(await db.select().from(executionCalls).where(eq(executionCalls.executionTaskId,mapped.executionTaskId))).toEqual([]);
 // 读取配置是核验旧provider身份；真正禁止的是新付费call，原任务回读不重新解析。
 f.resolveSpec.mockRejectedValue(new Error("配置改变"));expect(await f.service.prepare(ctx,f.id)).toEqual(mapped);expect(f.resolveSpec).toHaveBeenCalledTimes(1);
});
it("准备期间取消，不创建执行任务",async()=>{
 const f=await fixture();f.resolveSpec.mockImplementation(async()=>{await db.update(aiTasks).set({status:"cancelled"}).where(eq(aiTasks.id,f.id));return spec;});
 await expect(f.service.prepare(ctx,f.id)).rejects.toThrow();expect((await db.select().from(aiTasks).where(eq(aiTasks.id,f.id)))[0]!.executionTaskId).toBeNull();
});
it("准备期间出现旧提交事实，先拒绝新提交再回读原恢复",async()=>{
 const f=await fixture();f.resolveSpec.mockImplementation(async()=>{await db.update(aiTasks).set({runtimeData:{multimodalProviderCheckpoint:{state:"submitting"}}}).where(eq(aiTasks.id,f.id));return spec;});
 await expect(f.service.prepare(ctx,f.id)).rejects.toThrow("素材准备期间出现旧提交事实");
 expect((await db.select().from(aiTasks).where(eq(aiTasks.id,f.id)))[0]!.executionTaskId).toBeNull();
 f.resolveSpec.mockResolvedValue(spec);const mapped=await f.service.prepare(ctx,f.id);
 expect((await db.select().from(aiTasks).where(eq(aiTasks.id,f.id)))[0]!.runtimeData).toEqual({multimodalProviderCheckpoint:{state:"submitting"}});
 expect((await db.select().from(executionTasks).where(eq(executionTasks.id,mapped.executionTaskId)))[0]!.payload).toMatchObject({assetLegacyRecovery:{mode:"review",originalTaskId:f.id,callId:null}});
 expect(await db.select().from(executionCalls).where(eq(executionCalls.executionTaskId,mapped.executionTaskId))).toEqual([]);
});
it("恢复准备挂起时可停止，迟到配置不能转交任务",async()=>{
 await db.update(aiTasks).set({status:"cancelled"}).where(eq(aiTasks.status,"queued"));
 const f=await fixture();let release!:(value:typeof spec)=>void;
 f.resolveSpec.mockImplementation(()=>new Promise(resolve=>{release=resolve;}));
 const failed=vi.fn(async()=>{}),shouldStop=vi.fn(()=>false);
 const work=f.service.recoverQueued(failed,shouldStop);
 await vi.waitFor(()=>expect(release).toBeTypeOf("function"));
 f.service.stop();await work;release(spec);
 await new Promise(resolve=>setTimeout(resolve,0));
 expect((await db.select().from(aiTasks).where(eq(aiTasks.id,f.id)))[0]!.executionTaskId).toBeNull();expect(await db.select().from(executionTasks).where(eq(executionTasks.ownerId,f.id))).toEqual([]);expect(failed).not.toHaveBeenCalled();
});
