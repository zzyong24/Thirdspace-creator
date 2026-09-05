import {createHash,randomUUID} from "node:crypto";
import {afterAll,beforeAll,expect,it} from "vitest";
import {z} from "zod";
import {createDb,aiTasks,executionCalls,executionTasks,browserSessions,eq,type Db} from "@creatoros/backend";
import {createBrowserSessionsService} from "../browser-sessions";
import {createExecutionBrowserSessionService} from "./execution-browser-session.service";
import {createExecutionCallLedgerService} from "./execution-call-ledger.service";
import {createExecutionAgenticToolPorts} from "./execution-agentic-tool-ports.service";
import {createPersistentTaskService} from "./persistent-task.service";
const ctx={userId:"browser-user",accountId:"browser-account",requestId:"test",source:"user" as const};
const now=()=>"2026-09-05T00:00:00.000Z",budget={maxCalls:10,maxTokens:10000,deadlineMs:60000};
const key=createHash("sha256").update("browser-test-key").digest();
const tools={"web.read":{version:"1",effect:"none" as const,parameters:z.object({url:z.string()})}};
let db:Db,close:()=>Promise<void>;
beforeAll(async()=>{const c=await createDb();db=c.db;close=()=>c.client.close();});afterAll(async()=>close?.());
const state=(domain:string,value="secret")=>JSON.stringify({cookies:[{name:"session",value,domain:`.${domain}`,path:"/",httpOnly:true,secure:true,sameSite:"Lax",expires:-1}],origins:[{origin:`https://${domain}`,localStorage:[{name:"token",value}]}]});
async function fixture(id:string,url="https://www.example.com/article",owner=ctx){
 const tasks=createPersistentTaskService(db,{now});const task=await tasks.enqueue(owner,{kind:"ai_task",ownerType:"ai_task",ownerId:id,idempotencyKey:id,payload:{modelInput:{kind:"agentic.run",tools:[{name:"web.read",version:"1"}]}}});
 await db.insert(aiTasks).values({id,userId:owner.userId,accountId:owner.accountId,taskType:"exec.agentic.research",status:"running",executionTaskId:task.id,idempotencyKey:id,requestedAt:now()});
 const claim=(await tasks.claimTask({taskId:task.id,workerId:"worker"}))!,ref={executionTaskId:task.id,attempt:claim.lease.attempt,fenceToken:claim.lease.fenceToken};
 const ledger=createExecutionCallLedgerService(db,{now,budget}),ports=createExecutionAgenticToolPorts(db,{now,budget,tools});
 const m=await ledger.reserve(ref,{kind:"model",operationKey:"m",inputDigest:"sha256:"+"a".repeat(64),reservedTokens:20});await ledger.start(ref,m.id);await ledger.settle(ref,m.id,{status:"settled",usage:{totalTokens:15},providerResult:{content:[{type:"tool-call",toolCallId:"read",toolName:"web.read",input:JSON.stringify({url})}],finishReason:{unified:"tool-calls"},usage:{inputTokens:{total:10},outputTokens:{total:5}},warnings:[]}});
 const call=await ports.reserve(ref,{modelCallId:m.id,toolCallId:"read"});await ports.start(ref,{callId:call.callId});
 const sessions=createBrowserSessionsService({db,now,nextId:()=>randomUUID(),masterKey:key});
 const service=createExecutionBrowserSessionService(db,{now,budget,tools,sessions});
 return {task,ref,callId:call.callId,sessions,service,tasks};
}
it("从冻结URL取规范域，在同一租约事务读写加密登录态，旧版本不覆盖新登录",async()=>{
 const f=await fixture("session-real");await f.sessions.removeState(ctx,"example.com");
 expect(await f.service.read(f.ref,{callId:f.callId})).toMatchObject({stateJson:null,revision:null});
 const first=await f.service.save(f.ref,{callId:f.callId,revision:null,stateJson:state("example.com")});expect(first.saved).toBe(true);
 const read=await f.service.read(f.ref,{callId:f.callId});expect(read.stateJson).toBe(state("example.com"));
 await f.sessions.saveState(ctx,"example.com",state("example.com","human"));
 expect(await f.service.save(f.ref,{callId:f.callId,revision:read.revision,stateJson:state("example.com","old-worker")})).toMatchObject({saved:false});
 expect(await f.sessions.getState(ctx,"example.com")).toBe(state("example.com","human"));
});
it("拒绝跨域、公共后缀、非法结构和2MB超限，合法父域cookie仍可保存",async()=>{
 const f=await fixture("session-domains","https://news.example.co.uk/article");
 const valid=JSON.stringify({cookies:[{name:"sid",value:"v",domain:".example.co.uk",path:"/"}],origins:[{origin:"https://news.example.co.uk",localStorage:[]}]});
 expect((await f.service.save(f.ref,{callId:f.callId,revision:null,stateJson:valid})).saved).toBe(true);
 const current=await f.service.read(f.ref,{callId:f.callId});
 for(const invalid of [state("evil.com"),valid.replace(".example.co.uk",".co.uk"),'{"cookies":[{}],"origins":[]}',JSON.stringify({cookies:[],origins:[],extra:"forged"}),state("news.example.co.uk","中".repeat(700000))]){
  await expect(f.service.save(f.ref,{callId:f.callId,revision:current.revision,stateJson:invalid})).rejects.toThrow();
 }
 expect(await f.sessions.getState(ctx,"news.example.co.uk")).toBe(valid);
});
it("douyin历史alias保持原键CAS，不能绕过canonical用户新登录",async()=>{
 const f=await fixture("session-alias","https://v.douyin.com/abc");await f.sessions.removeState(ctx,"douyin.com");
 await f.sessions.saveState(ctx,"iesdouyin.com",state("iesdouyin.com"));
 const read=await f.service.read(f.ref,{callId:f.callId});expect(read.stateJson).toBe(state("iesdouyin.com"));
 expect((await f.service.save(f.ref,{callId:f.callId,revision:read.revision,stateJson:state("douyin.com")})).saved).toBe(true);
 expect(await f.sessions.getState(ctx,"douyin.com")).toBeNull();expect(await f.sessions.getState(ctx,"iesdouyin.com")).toBe(state("douyin.com"));
 const old=await f.service.read(f.ref,{callId:f.callId});await f.sessions.saveState(ctx,"douyin.com",state("douyin.com","human"));
 expect((await f.service.save(f.ref,{callId:f.callId,revision:old.revision,stateJson:state("douyin.com","worker")})).saved).toBe(false);
});
it("不允许自报domain或身份，跨用户不可读取他人登录态",async()=>{
 const f=await fixture("session-user","https://example.com",{...ctx,userId:"other-user"});
 expect(await f.service.read(f.ref,{callId:f.callId})).toMatchObject({stateJson:null});
 await expect(f.service.read(f.ref,{callId:f.callId,domain:"evil.com"})).rejects.toThrow();
 await db.update(aiTasks).set({userId:ctx.userId}).where(eq(aiTasks.id,f.task.ownerId));await expect(f.service.read(f.ref,{callId:f.callId})).rejects.toThrow();
});
it("取消、Host领取、结算或旧fence均阻止会话变更",async()=>{
 const f=await fixture("session-controls","https://control.example.com");
 await db.update(executionCalls).set({toolExecutionClaimId:"host"}).where(eq(executionCalls.id,f.callId));await expect(f.service.read(f.ref,{callId:f.callId})).rejects.toThrow();
 await db.update(executionCalls).set({toolExecutionClaimId:null,status:"settled"}).where(eq(executionCalls.id,f.callId));await expect(f.service.save(f.ref,{callId:f.callId,revision:null,stateJson:state("control.example.com")})).rejects.toThrow();
 await db.update(executionCalls).set({status:"started"}).where(eq(executionCalls.id,f.callId));await f.tasks.command(ctx,{taskIds:[f.task.id],command:"cancel",idempotencyKey:"stop-session"});await expect(f.service.read(f.ref,{callId:f.callId})).rejects.toThrow();
 await db.update(executionTasks).set({fenceToken:"changed"}).where(eq(executionTasks.id,f.task.id));await expect(f.service.read(f.ref,{callId:f.callId})).rejects.toThrow();
 expect((await db.select().from(browserSessions).where(eq(browserSessions.scopeKey,"control.example.com")))).toHaveLength(0);
});
it("private PSL父域不能用cookie跨租户注入，当前租户自己的cookie有效",async()=>{
 const f=await fixture("session-private","https://tenant.github.io/post");
 await expect(f.service.save(f.ref,{callId:f.callId,revision:null,stateJson:state("github.io")})).rejects.toThrow();
 expect((await f.service.save(f.ref,{callId:f.callId,revision:null,stateJson:state("tenant.github.io")})).saved).toBe(true);
});
it("版本化读拒绝注入旧入口保存的跨域状态；缺启动事实与旧attempt都不可读取",async()=>{
 const f=await fixture("session-existing","https://stored.example.com/post");
 await f.sessions.saveState(ctx,"stored.example.com",state("evil.com"));
 await expect(f.service.read(f.ref,{callId:f.callId})).rejects.toThrow("未授权");
 await f.sessions.saveState(ctx,"stored.example.com",state("stored.example.com"));
 for(const status of ["reserved","unknown","rejected"]){await db.update(executionCalls).set({status}).where(eq(executionCalls.id,f.callId));await expect(f.service.read(f.ref,{callId:f.callId})).rejects.toThrow("执行许可");}
 await db.update(executionCalls).set({status:"started",startedAttempt:0}).where(eq(executionCalls.id,f.callId));await expect(f.service.read(f.ref,{callId:f.callId})).rejects.toThrow("执行许可");
});
it("不可解密旧记录不会被Worker匿名会话覆盖",async()=>{
 const f=await fixture("session-unreadable","https://unreadable.example.com");
 await f.sessions.saveState(ctx,"unreadable.example.com",state("unreadable.example.com"));
 await db.update(browserSessions).set({stateEncrypted:"corrupt-ciphertext"}).where(eq(browserSessions.scopeKey,"unreadable.example.com"));
 const read=await f.service.read(f.ref,{callId:f.callId});expect(read).toMatchObject({domain:"unreadable.example.com",stateJson:null,revision:expect.any(String)});
 expect(await f.service.save(f.ref,{callId:f.callId,revision:read.revision,stateJson:JSON.stringify({cookies:[],origins:[]})})).toEqual({saved:false,revision:read.revision});
 const [row]=await db.select().from(browserSessions).where(eq(browserSessions.scopeKey,"unreadable.example.com"));expect(row?.stateEncrypted).toBe("corrupt-ciphertext");
});
