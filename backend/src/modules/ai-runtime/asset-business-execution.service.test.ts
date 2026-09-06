import {beforeAll,afterAll,it,expect,vi} from "vitest";
import {createDb,aiTasks,aiTaskResults,executionTasks,eq,type Db} from "@creatoros/backend";
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
it.each(["checkpoint","retry","result"])("旧 %s 事实不能转新账本",async variant=>{
 const f=await fixture(variant==="checkpoint"?{runtimeData:{multimodalProviderCheckpoint:{broken:true}}}:variant==="retry"?{retryOfTaskId:"original"}:{});
 if(variant==="result")await db.insert(aiTaskResults).values({id:`result-${f.id}`,aiTaskId:f.id,resultType:"generated_asset",resultData:{assetId:"old"}});
 expect(await f.service.prepare(ctx,f.id)).toMatchObject({legacy:true});expect(f.resolveSpec).not.toHaveBeenCalled();
 expect((await db.select().from(aiTasks).where(eq(aiTasks.id,f.id)))[0]!.executionTaskId).toBeNull();
});
it("准备期间取消，不创建执行任务",async()=>{
 const f=await fixture();f.resolveSpec.mockImplementation(async()=>{await db.update(aiTasks).set({status:"cancelled"}).where(eq(aiTasks.id,f.id));return spec;});
 await expect(f.service.prepare(ctx,f.id)).rejects.toThrow();expect((await db.select().from(aiTasks).where(eq(aiTasks.id,f.id)))[0]!.executionTaskId).toBeNull();
});
it("准备期间出现旧提交事实，重新核验后留在旧对账路径",async()=>{
 const f=await fixture();f.resolveSpec.mockImplementation(async()=>{await db.update(aiTasks).set({runtimeData:{multimodalProviderCheckpoint:{state:"submitting"}}}).where(eq(aiTasks.id,f.id));return spec;});
 expect(await f.service.prepare(ctx,f.id)).toMatchObject({legacy:true});expect((await db.select().from(aiTasks).where(eq(aiTasks.id,f.id)))[0]!.executionTaskId).toBeNull();
});
it("恢复准备挂起时可停止，迟到配置不能转交任务",async()=>{
 await db.update(aiTasks).set({status:"cancelled"}).where(eq(aiTasks.status,"queued"));
 const f=await fixture();let release!:(value:typeof spec)=>void;
 f.resolveSpec.mockImplementation(()=>new Promise(resolve=>{release=resolve;}));
 const legacy=vi.fn(async()=>{}),failed=vi.fn(async()=>{});
 const work=f.service.recoverQueued(legacy,failed);
 await vi.waitFor(()=>expect(release).toBeTypeOf("function"));
 f.service.stop();await work;release(spec);
 await new Promise(resolve=>setTimeout(resolve,0));
 expect((await db.select().from(aiTasks).where(eq(aiTasks.id,f.id)))[0]!.executionTaskId).toBeNull();expect(legacy).not.toHaveBeenCalled();expect(failed).not.toHaveBeenCalled();
});
