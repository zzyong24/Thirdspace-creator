import { createServer } from "node:http";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, type Db } from "@creatoros/backend";
import { createExecutionWorkerCallPorts } from "./execution-worker-call-ports.service";
import { createExecutionCallLedgerService } from "./execution-call-ledger.service";
import { createExecutionLeaseService } from "./execution-lease.service";
import { createPersistentTaskService } from "./persistent-task.service";
import { createWorkerSupervisor } from "./worker-supervisor";
const ctx = {userId:"worker-ledger",accountId:"worker-ledger",requestId:"test",source:"user" as const};
const modelInput = {kind:"model.generate",prompt:"写正文",capability:"script",maxOutputTokens:128,operationKey:"generate"};
const deps = {budget:{maxCalls:3,maxTokens:10000,deadlineMs:60000}};
describe("真实 Worker 与后端持久调用端口", () => {
  let db:Db; let close:()=>Promise<void>;
  beforeAll(async()=>{
    const connection=await createDb(); db=connection.db;close=()=>connection.client.close();
    execFileSync(process.execPath,[resolve("../ai-worker/scripts/build.mjs")],{stdio:"pipe"});
  },30000);
  afterAll(async()=>close?.());
  async function fixture(id:string){
    const tasks=createPersistentTaskService(db);
    const task=await tasks.enqueue(ctx,{kind:"ai_task",ownerType:"ai_task",ownerId:id,idempotencyKey:id,payload:{modelInput}});
    const claim=await tasks.claimTask({taskId:task.id,workerId:"worker"});if(!claim)throw new Error("missing claim");
    const ref={executionTaskId:task.id,attempt:claim.lease.attempt,fenceToken:claim.lease.fenceToken};
    return {ref,tasks,ports:createExecutionWorkerCallPorts(db,deps),ledger:createExecutionCallLedgerService(db,deps)};
  }
  it("真实供应商调用前已持久启动；重启进程不会重放已结算调用",async()=>{
    const f=await fixture("real-child");
    let requests=0;let startedBeforeRequest=false;const committedTexts:string[]=[];let failCommit=true;
    const server=createServer(async(req,res)=>{
      requests++;req.resume();
      const state=await f.ledger.inspect(f.ref);startedBeforeRequest=state.calls[0]?.status==="started";
      res.writeHead(200,{"content-type":"text/event-stream"});
      res.end('data: {"id":"c1","object":"chat.completion.chunk","created":1,"model":"test","choices":[{"index":0,"delta":{"content":"正文"},"finish_reason":null}]}\n\ndata: {"id":"c1","object":"chat.completion.chunk","created":1,"model":"test","choices":[{"index":0,"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":2,"completion_tokens":3,"total_tokens":5}}\n\ndata: [DONE]\n\n');
    });
    await new Promise<void>(r=>server.listen(0,"127.0.0.1",r));
    const address=server.address() as {port:number};
    const leases=createExecutionLeaseService(db);
    const supervisor=createWorkerSupervisor({entryPath:resolve("../ai-worker/dist/execution-worker.cjs"),ports:{
      async validate(ref,mode){await leases.withLease(ref,mode,async()=>{});},
      async invoke(ref,port,data){
        if(port==="readTaskContext")return f.ports.readTaskContext(ref);
        if(port==="reserveCall")return f.ports.reserveCall(ref,data);
        if(port==="startCall")return f.ports.startCall(ref,data);
        if(port==="settleCall")return f.ports.settleCall(ref,data);
        if(port==="resolveModelCredential")return {apiFormat:"openai_chat",baseUrl:`http://127.0.0.1:${address.port}/v1`,model:"test",token:"fixture"};
        // 这里只验证调用端口；业务候选提交仍属于后续生产接线验收。
        if(port==="commitResult") {
          if(failCommit){failCommit=false;throw new Error("SIMULATED_COMMIT_FAILURE");}
          committedTexts.push((data as {text:string}).text);return {};
        }
        throw new Error("UNEXPECTED_PORT");
      },
    }});
    try{
      expect(await supervisor.run(f.ref,Date.now()+30000)).toBe("unknown_result");
      expect(startedBeforeRequest).toBe(true);expect(requests).toBe(1);
      expect((await f.ledger.inspect(f.ref)).spentTokens).toBe(5);
      await supervisor.stop();
      await f.tasks.command(ctx,{taskIds:[f.ref.executionTaskId],command:"pause",idempotencyKey:"pause-after-crash"});
      await f.tasks.acknowledgeControl({taskId:f.ref.executionTaskId,workerId:"worker",attempt:f.ref.attempt});
      await f.tasks.command(ctx,{taskIds:[f.ref.executionTaskId],command:"resume",idempotencyKey:"resume-after-crash"});
      const claim=await f.tasks.claimTask({taskId:f.ref.executionTaskId,workerId:"worker-restarted"});
      if(!claim)throw new Error("missing resumed claim");
      f.ref={...f.ref,attempt:claim.lease.attempt,fenceToken:claim.lease.fenceToken};
      expect(await supervisor.run(f.ref,Date.now()+30000)).toBe("completed");
      expect(committedTexts).toEqual(["正文"]);
      expect(requests).toBe(1);expect((await f.ledger.inspect(f.ref)).calls).toHaveLength(1);
    }finally{await supervisor.stop();server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}
  },15000);
  it("Worker 自报操作键或额度不符时拒绝预留",async()=>{
    const f=await fixture("tampered");
    await expect(f.ports.reserveCall(f.ref,{operationKey:"other",maxOutputTokens:128})).rejects.toMatchObject({name:"ConflictError"});
    await expect(f.ports.reserveCall(f.ref,{operationKey:"generate",maxOutputTokens:1})).rejects.toMatchObject({name:"ConflictError"});
    expect((await f.ledger.inspect(f.ref)).calls).toHaveLength(0);
  });
});
