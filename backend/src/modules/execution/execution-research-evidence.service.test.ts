import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, expect, it } from "vitest";
import { z } from "zod";
import { createDb, aiTasks, executionCalls, executionTasks, eq, sql, type Db } from "@creatoros/backend";
import { executionEvidence } from "../../schema/intelligence";
import { createPersistentTaskService } from "./persistent-task.service";
import { createExecutionCallLedgerService } from "./execution-call-ledger.service";
import { createExecutionAgenticToolPorts } from "./execution-agentic-tool-ports.service";
import { createExecutionResearchEvidenceService, verifyReadEvidence } from "./execution-research-evidence.service";

const ctx = {userId:"evidence-user",accountId:"evidence-account",requestId:"test",source:"user" as const};
const now = () => "2026-09-05T00:00:00.000Z";
const budget = {maxCalls:100,maxTokens:100000,deadlineMs:60000};
const tools = {"web.read":{version:"1",effect:"none" as const,parameters:z.object({url:z.string(),offset:z.number().int().nonnegative().default(0),snapshotId:z.string().optional(),evidenceRef:z.string().optional()})}};
let db:Db, close:()=>Promise<void>;
beforeAll(async()=>{const c=await createDb();db=c.db;close=()=>c.client.close();});
afterAll(async()=>close?.());
async function fixture(id:string){
 const tasks=createPersistentTaskService(db,{now});
 const task=await tasks.enqueue(ctx,{kind:"ai_task",ownerType:"ai_task",ownerId:id,idempotencyKey:id,payload:{modelInput:{kind:"agentic.run",tools:[{name:"web.read",version:"1"}]}}});
 await db.insert(aiTasks).values({id,userId:ctx.userId,accountId:ctx.accountId,taskType:"exec.agentic.research",status:"running",executionTaskId:task.id,idempotencyKey:id,requestedAt:now()});
 const claim=(await tasks.claimTask({taskId:task.id,workerId:"worker"}))!;
 const ref={executionTaskId:task.id,attempt:claim.lease.attempt,fenceToken:claim.lease.fenceToken};
 const deps={now,budget,tools};const ledger=createExecutionCallLedgerService(db,deps),ports=createExecutionAgenticToolPorts(db,deps),service=createExecutionResearchEvidenceService(db,deps);
 let sequence=0;
 async function read(input:Record<string,unknown>={url:"https://example.com/request"}){
  const key=`model-${++sequence}`;const m=await ledger.reserve(ref,{kind:"model",operationKey:key,inputDigest:"sha256:"+"a".repeat(64),reservedTokens:20});await ledger.start(ref,m.id);
  await ledger.settle(ref,m.id,{status:"settled",usage:{totalTokens:15},providerResult:{content:[{type:"tool-call",toolCallId:key,toolName:"web.read",input:JSON.stringify(input)}],finishReason:{unified:"tool-calls"},usage:{inputTokens:{total:10},outputTokens:{total:5}},warnings:[]}});
  const tool=await ports.reserve(ref,{modelCallId:m.id,toolCallId:key});await ports.start(ref,{callId:tool.callId});return {callId:tool.callId,modelSequence:m.sequence};
 }
 return {task,ref,tasks,ledger,service,read};
}
const observation={sourceUrl:"https://example.com/final",title:"真实网页",fullText:"正文内容".repeat(7000)};
const data=(out:Awaited<ReturnType<ReturnType<typeof createExecutionResearchEvidenceService>["settleRead"]>>)=>out.data as {evidenceRef:string;snapshotId:string;text:string;nextOffset:number|null};
it("同一调用并发结算只存一个不可变快照，续读完全复用持久正文",async()=>{
 const f=await fixture("evidence-once"),call=await f.read();
 const [a,b]=await Promise.all([f.service.settleRead(f.ref,{callId:call.callId,observation}),f.service.settleRead(f.ref,{callId:call.callId,observation})]);expect(a).toEqual(b);
 const first=data(a);expect(first.text).toBe(observation.fullText.slice(0,12000));expect(a.continuation?.nextOffset).toBe(12000);
 const rows=await db.select().from(executionEvidence).where(eq(executionEvidence.executionTaskId,f.task.id));expect(rows).toHaveLength(1);expect(rows[0]).toMatchObject({requestedUrl:"https://example.com/request",fullText:observation.fullText,originCallId:call.callId});
 await expect(f.service.settleRead(f.ref,{callId:call.callId,observation:{...observation,fullText:"改写"}})).rejects.toThrow();
 const next=await f.read({url:"https://example.com/request",offset:12000,snapshotId:first.snapshotId,evidenceRef:first.evidenceRef});
 const page=await f.service.readWindow(f.ref,{callId:next.callId});expect(data(page).text).toBe(observation.fullText.slice(12000,24000));
 const verified=await db.transaction(tx=>verifyReadEvidence(tx,f.task.id,[first.evidenceRef],next.modelSequence));expect(verified[0]?.id).toBe(first.evidenceRef);
});
it("跨任务、错hash、未读来源或同模型之后的证据不能充当知识来源",async()=>{
 const f=await fixture("evidence-owner"),other=await fixture("evidence-other"),first=await f.read();
 const out=await f.service.settleRead(f.ref,{callId:first.callId,observation}),d=data(out);
 await expect(db.transaction(tx=>verifyReadEvidence(tx,other.task.id,[d.evidenceRef],100))).rejects.toThrow();
 await expect(db.transaction(tx=>verifyReadEvidence(tx,f.task.id,[d.evidenceRef],first.modelSequence))).rejects.toThrow();
 const bad=await f.read({url:"https://example.com/request",offset:12000,snapshotId:"wrong",evidenceRef:d.evidenceRef});
 await expect(f.service.readWindow(f.ref,{callId:bad.callId})).rejects.toThrow();
 const foreign=await other.read({url:"https://example.com/request",offset:12000,snapshotId:d.snapshotId,evidenceRef:d.evidenceRef});await expect(other.service.readWindow(other.ref,{callId:foreign.callId})).rejects.toThrow();
});
it("空正文及登录不产生证据，页面超限明确失败而不是假装读完",async()=>{
 const f=await fixture("evidence-empty");
 for(const obs of [{...observation,fullText:"  "},{...observation,needLogin:true},{...observation,fullText:"中".repeat(700000)}]){
  const call=await f.read();const out=await f.service.settleRead(f.ref,{callId:call.callId,observation:obs});expect(out.status).not.toBe("ok");expect(out.evidence).toEqual([]);
 }
 expect(await db.select().from(executionEvidence).where(eq(executionEvidence.executionTaskId,f.task.id))).toHaveLength(0);
});
it("未知调用、Host领取、换fence不允许写入阅读证据",async()=>{
 const f=await fixture("evidence-fence"),call=await f.read();
 await db.update(executionCalls).set({toolExecutionClaimId:"host-owner"}).where(eq(executionCalls.id,call.callId));await expect(f.service.settleRead(f.ref,{callId:call.callId,observation})).rejects.toThrow();
 await db.update(executionCalls).set({toolExecutionClaimId:null,status:"unknown"}).where(eq(executionCalls.id,call.callId));await expect(f.service.settleRead(f.ref,{callId:call.callId,observation})).rejects.toThrow();
 await db.update(executionTasks).set({fenceToken:"new-fence"}).where(eq(executionTasks.id,f.task.id));await expect(f.service.settleRead(f.ref,{callId:call.callId,observation})).rejects.toThrow();
 expect(await db.select().from(executionEvidence).where(eq(executionEvidence.executionTaskId,f.task.id))).toHaveLength(0);
});
it("账本写失败原子回滚已插入的快照，允许按原调用恢复",async()=>{
 const f=await fixture("evidence-rollback"),call=await f.read();
 await db.execute(sql.raw(`CREATE FUNCTION fail_evidence_ledger() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.id = '${call.callId}' AND NEW.status = 'settled' THEN RAISE EXCEPTION 'injected settle failure'; END IF; RETURN NEW; END $$;`));
 await db.execute(sql.raw("CREATE TRIGGER fail_evidence_settle BEFORE UPDATE ON execution_calls FOR EACH ROW EXECUTE FUNCTION fail_evidence_ledger();"));
 try{await expect(f.service.settleRead(f.ref,{callId:call.callId,observation})).rejects.toThrow();expect(await db.select().from(executionEvidence).where(eq(executionEvidence.executionTaskId,f.task.id))).toHaveLength(0);}
 finally{await db.execute(sql.raw("DROP TRIGGER fail_evidence_settle ON execution_calls;"));await db.execute(sql.raw("DROP FUNCTION fail_evidence_ledger();"));}
 expect((await f.ledger.inspect(f.ref)).calls.at(-1)?.status).toBe("started");
 expect((await f.service.settleRead(f.ref,{callId:call.callId,observation})).evidence).toHaveLength(1);
});
it("任务8MB累计上限持久生效，服务重建不能重置预算",async()=>{
 const f=await fixture("evidence-total");
 for(let i=0;i<4;i++){
  const call=await f.read({url:`https://example.com/${i}`});const out=await f.service.settleRead(f.ref,{callId:call.callId,observation:{...observation,fullText:"x".repeat(2*1024*1024)}});expect(out.status).toBe("partial");
 }
 const recreated=createExecutionResearchEvidenceService(db,{now,budget,tools}),call=await f.read();
 const output=await recreated.settleRead(f.ref,{callId:call.callId,observation:{...observation,fullText:"多余"}});
 expect(output).toMatchObject({status:"error",evidence:[],continuation:null});expect(output.summary).toContain("8MB");
 expect(await db.select().from(executionEvidence).where(eq(executionEvidence.executionTaskId,f.task.id))).toHaveLength(4);
});
it("取消后已启动首读保留真实事实，新的续读不得执行",async()=>{
 const f=await fixture("evidence-cancel"),call=await f.read();
 await f.tasks.command(ctx,{taskIds:[f.task.id],command:"cancel",idempotencyKey:"cancel-evidence"});
 const out=await f.service.settleRead(f.ref,{callId:call.callId,observation});expect(out.evidence).toHaveLength(1);
 await expect(f.read({url:"https://example.com/request",offset:12000,snapshotId:data(out).snapshotId})).rejects.toThrow();
});
it("来源ID正确但窗口正文被伪改的账本不能证明阅读",async()=>{
 const f=await fixture("evidence-corrupt"),call=await f.read(),out=await f.service.settleRead(f.ref,{callId:call.callId,observation});
 const original=(await f.ledger.inspect(f.ref)).calls.find(row=>row.id===call.callId)!;
 const receipt=JSON.parse(original.resultText!);receipt.output.evidence[0].text="伪造正文";
 await db.update(executionCalls).set({resultText:JSON.stringify(receipt)}).where(eq(executionCalls.id,call.callId));
 await expect(db.transaction(tx=>verifyReadEvidence(tx,f.task.id,[data(out).evidenceRef],100))).rejects.toThrow("快照窗口");
});
it("归属映射变化后不可替其他账号写证据",async()=>{
 const f=await fixture("evidence-mapping"),call=await f.read();
 await db.update(aiTasks).set({accountId:"foreign-account"}).where(eq(aiTasks.id,f.task.ownerId));
 await expect(f.service.settleRead(f.ref,{callId:call.callId,observation})).rejects.toThrow("归属映射");
 expect(await db.select().from(executionEvidence).where(eq(executionEvidence.executionTaskId,f.task.id))).toHaveLength(0);
});
it("指定旧快照的offset0只回读原文，不能用新观察替换",async()=>{
 const f=await fixture("evidence-zero"),first=await f.read(),out=await f.service.settleRead(f.ref,{callId:first.callId,observation});
 const replay=await f.read({url:"https://example.com/request",offset:0,snapshotId:data(out).snapshotId,evidenceRef:data(out).evidenceRef});
 await expect(f.service.settleRead(f.ref,{callId:replay.callId,observation:{...observation,fullText:"另一篇正文"}})).rejects.toThrow();
 expect(await f.service.readWindow(f.ref,{callId:replay.callId})).toEqual(out);
});
it("已启动续读在取消后不能开始本地读取",async()=>{
 const f=await fixture("evidence-cancel-window"),first=await f.read(),out=await f.service.settleRead(f.ref,{callId:first.callId,observation});
 const continuation=await f.read({url:"https://example.com/request",offset:12000,snapshotId:data(out).snapshotId,evidenceRef:data(out).evidenceRef});
 await f.tasks.command(ctx,{taskIds:[f.task.id],command:"cancel",idempotencyKey:"cancel-window"});
 await expect(f.service.readWindow(f.ref,{callId:continuation.callId})).rejects.toThrow();
 expect((await f.ledger.inspect(f.ref)).calls.at(-1)?.status).toBe("started");
});
it("暂停恢复换attempt后只回放原回执，不增加快照或调用",async()=>{
 const f=await fixture("evidence-recovery"),first=await f.read(),out=await f.service.settleRead(f.ref,{callId:first.callId,observation});
 await f.tasks.command(ctx,{taskIds:[f.task.id],command:"pause",idempotencyKey:"pause-evidence"});
 await f.tasks.acknowledgeControl({taskId:f.task.id,workerId:"worker",attempt:f.ref.attempt});
 await f.tasks.command(ctx,{taskIds:[f.task.id],command:"resume",idempotencyKey:"resume-evidence"});
 const claim=(await f.tasks.claimTask({taskId:f.task.id,workerId:"replacement"}))!;
 const ref={executionTaskId:f.task.id,attempt:claim.lease.attempt,fenceToken:claim.lease.fenceToken};expect(ref.attempt).toBe(f.ref.attempt+1);
 const recreated=createExecutionResearchEvidenceService(db,{tools,now,budget});
 expect(await recreated.settleRead(ref,{callId:first.callId,observation})).toEqual(out);
 await expect(f.service.settleRead(f.ref,{callId:first.callId,observation})).rejects.toThrow("凭证");
 expect((await f.ledger.inspect(ref)).calls).toHaveLength(2);
 expect(await db.select().from(executionEvidence).where(eq(executionEvidence.executionTaskId,f.task.id))).toHaveLength(1);
});
it("0080迁移可重跑且保留既有证据",async()=>{
 const f=await fixture("evidence-migration"),first=await f.read(),out=await f.service.settleRead(f.ref,{callId:first.callId,observation});
 const migration=await readFile(new URL("../../../drizzle/0080_execution_evidence.sql",import.meta.url),"utf8");
 for(let n=0;n<2;n++)for(const statement of migration.split("--> statement-breakpoint"))if(statement.trim())await db.execute(sql.raw(statement));
 const [row]=await db.select().from(executionEvidence).where(eq(executionEvidence.id,data(out).evidenceRef));expect(row?.fullText).toBe(observation.fullText);
});
