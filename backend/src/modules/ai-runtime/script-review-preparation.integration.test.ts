import {afterAll,beforeAll,it,expect,vi} from "vitest";
import {createDb,aiTasks,executionTasks,eq,type Db} from "@creatoros/backend";
import {createStructuredBusinessExecutionService} from "./structured-business-execution.service";
import {prepareScriptReviewContext} from "./script-review-context";
const ctx={userId:"review-owner",accountId:"review-account",requestId:"test",source:"user" as const};
const snapshot={snapshotVersion:1,userId:ctx.userId,accountId:ctx.accountId,resolvedAt:"2026-09-05T00:00:00.000Z",platformPolicyVersion:"1",platformPolicy:"规则",skills:[{skillId:"script.review",baseVersion:"1",overlayRevision:null,overlayVersion:null,effective:{methodSystem:"审核",template:"{{script}}",tools:[],requiredFacets:["script"],contextRequirements:[],outputSchema:{type:"object"},completionPolicy:null,completionPolicyAdapter:null}}]};
let db:Db,close:()=>Promise<void>;
beforeAll(async()=>{const f=await createDb();db=f.db;close=()=>f.client.close();});afterAll(async()=>close?.());
const add=async(id:string)=>{await db.insert(aiTasks).values({id,userId:ctx.userId,accountId:ctx.accountId,taskType:"script.review",projectId:"project",idempotencyKey:id,requestFingerprint:`sha256:${"a".repeat(64)}`,requestedAt:new Date().toISOString(),inputData:{artifactId:"script",artifactVersion:2},runtimeData:{skillSnapshot:snapshot}});};
const setup=()=>{
 const source={getLatestScript:vi.fn().mockResolvedValue({artifactId:"script",version:2,text:"原始文稿"})};
 const rules={listActiveLintRules:vi.fn().mockResolvedValue([])};
 const service=createStructuredBusinessExecutionService(db,{budget:{maxCalls:6,maxTokens:10000,deadlineMs:60000},maxOutputTokens:500,adapters:{"script.review":{skillId:"script.review",capability:"default",prepare:(c,task)=>prepareScriptReviewContext(c,task,{scriptSource:source,lintRules:rules}),project(){throw new Error("审核不能创建候选");}}}});
 return {source,rules,service};
};
it("重建后复用已冻结审核稿件、规则和Skill，不调用源服务或更换版本",async()=>{
 await add("frozen-review");const f=setup();const mapped=await f.service.prepare(ctx,"frozen-review");
 const [before]=await db.select().from(executionTasks).where(eq(executionTasks.id,mapped.executionTaskId));
 expect(JSON.parse((before!.payload as any).modelInput.facets.__reviewSnapshot)).toMatchObject({artifactVersion:2,script:"原始文稿"});
 const fresh=setup();fresh.source.getLatestScript.mockRejectedValue(new Error("后续稿件源不可用"));
 expect(await fresh.service.prepare(ctx,"frozen-review")).toEqual(mapped);expect(fresh.source.getLatestScript).not.toHaveBeenCalled();expect(fresh.rules.listActiveLintRules).not.toHaveBeenCalled();
 expect((await db.select().from(executionTasks).where(eq(executionTasks.id,mapped.executionTaskId)))[0]).toEqual(before);
 await expect(fresh.service.prepare({...ctx,accountId:"other"},"frozen-review")).rejects.toThrow();
});
it("重启扫描给未转交的审核任务冻结版本，过期输入诚实失败不创建执行",async()=>{
 await add("recover-review");await add("stale-review");await db.update(aiTasks).set({inputData:{artifactId:"script",artifactVersion:1}}).where(eq(aiTasks.id,"stale-review"));
 const f=setup();const fail=vi.fn(async(_c:unknown,id:string)=>{await db.update(aiTasks).set({status:"failed"}).where(eq(aiTasks.id,id));});await f.service.recoverQueued(fail);
 expect(fail).toHaveBeenCalledOnce();expect(fail.mock.calls[0]?.[1]).toBe("stale-review");
 const [ok]=await db.select().from(aiTasks).where(eq(aiTasks.id,"recover-review"));expect(ok?.executionTaskId).toBeTruthy();
 const [bad]=await db.select().from(aiTasks).where(eq(aiTasks.id,"stale-review"));expect(bad).toMatchObject({executionTaskId:null,status:"failed"});
});
