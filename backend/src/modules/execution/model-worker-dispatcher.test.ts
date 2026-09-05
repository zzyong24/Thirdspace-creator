import { createServer } from "node:http";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { afterAll,beforeAll,describe,expect,it,vi } from "vitest";
import { createDb,aiTasks,aiTaskResults,executionTasks,eq,type Db } from "@creatoros/backend";
import { createExecutionAuthorityService } from "./execution-authority.service";
import { createPersistentTaskService } from "./persistent-task.service";
import { createModelWorkerDispatcher } from "./model-worker-dispatcher";
const ctx={userId:"dispatcher",accountId:"dispatcher",requestId:"test",source:"user" as const};
const budget={maxCalls:3,maxTokens:10000,deadlineMs:20000};
const modelInput={kind:"model.generate" as const,prompt:"正文",capability:"script",maxOutputTokens:128,operationKey:"generate"};
describe("真实模型调度宿主",()=>{
  let db:Db;let close:()=>Promise<void>;
  beforeAll(async()=>{const c=await createDb();db=c.db;close=()=>c.client.close();execFileSync(process.execPath,[resolve("../ai-worker/scripts/build.mjs")],{stdio:"pipe"});},30000);
  afterAll(async()=>close?.());
  async function prepare(id:string,prepared=true){
    await db.insert(aiTasks).values({id,userId:ctx.userId,accountId:ctx.accountId,taskType:"script.draft",idempotencyKey:id,requestedAt:new Date().toISOString()});
    return createExecutionAuthorityService(db).bindAiTask(ctx,id,prepared ? {requestFingerprint:"sha256:"+"0".repeat(64),modelInput,budget} : undefined);
  }
  function dispatcher(port:number,store:Db=db,modelConcurrency=2){return createModelWorkerDispatcher(store,{entryPath:resolve("../ai-worker/dist/execution-worker.cjs"),workerId:"host",budget,pollMs:100,modelConcurrency,
    async resolveModelCredential(context,capability){expect(context.userId).toBe(ctx.userId);expect(context.accountId).toBe(ctx.accountId);expect(capability).toBe("script");return {apiFormat:"openai_chat",baseUrl:`http://127.0.0.1:${port}/v1`,model:"test",token:"fixture"};},
    projectCandidate(_context,input){return {resultType:"artifact_version",artifactId:"fixture-artifact",resultData:{body:input.text}};},
  });}
  it("真实429自动等待后重试，最终只写一个候选",async()=>{
    const mapped=await prepare("retry-complete");let requests=0;
    const server=createServer((req,res)=>{req.resume();requests++;
      if(requests===1){res.writeHead(429,{"content-type":"application/json","retry-after":"1"});res.end('{"error":{"message":"busy","type":"rate_limit_error"}}');return;}
      res.writeHead(200,{"content-type":"text/event-stream"});res.end('data: {"id":"c1","object":"chat.completion.chunk","created":1,"model":"test","choices":[{"index":0,"delta":{"content":"恢复正文"},"finish_reason":null}]}\n\ndata: {"id":"c1","object":"chat.completion.chunk","created":1,"model":"test","choices":[{"index":0,"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":2,"completion_tokens":3,"total_tokens":5}}\n\ndata: [DONE]\n\n');
    });
    await new Promise<void>(r=>server.listen(0,"127.0.0.1",r));const host=dispatcher((server.address() as {port:number}).port);
    try{host.start();host.start();
      await vi.waitFor(async()=>expect((await createPersistentTaskService(db).get(ctx,mapped.executionTaskId)).status).toBe("succeeded"),{timeout:10000});
      expect(requests).toBe(2);expect(await db.select().from(aiTaskResults).where(eq(aiTaskResults.aiTaskId,"retry-complete"))).toHaveLength(1);
    }finally{await host.stop();server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}
  },15000);
  it("未准备输入的旧映射任务不会被宿主抢走",async()=>{
    const mapped=await prepare("unprepared",false);const host=dispatcher(1);
    try{expect(await host.drainOnce()).toBe(0);expect((await createPersistentTaskService(db).get(ctx,mapped.executionTaskId)).status).toBe("queued");}finally{await host.stop();}
  });
  it("控制命令断开真实在途请求并确认取消，不写候选",async()=>{
    const mapped=await prepare("cancel-active");let opened=false;let disconnected=false;
    const server=createServer((req,res)=>{req.resume();res.writeHead(200,{"content-type":"text/event-stream"});res.write(': waiting\n\n');opened=true;res.on("close",()=>{disconnected=true;});});
    await new Promise<void>(r=>server.listen(0,"127.0.0.1",r));const host=dispatcher((server.address() as {port:number}).port);
    try{
      const draining=host.drainOnce();await vi.waitFor(()=>expect(opened).toBe(true));
      await createPersistentTaskService(db).command(ctx,{taskIds:[mapped.executionTaskId],command:"cancel",idempotencyKey:"cancel"});
      await draining;expect(disconnected).toBe(true);expect((await createPersistentTaskService(db).get(ctx,mapped.executionTaskId)).status).toBe("cancelled");
      expect(await db.select().from(aiTaskResults).where(eq(aiTaskResults.aiTaskId,"cancel-active"))).toHaveLength(0);
    }finally{await host.stop();server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}
  },15000);
  it("两个独立进程并行且第三项排队，取消其中一个不打断另一个",async()=>{
    const first=await prepare("pool-first");const second=await prepare("pool-second");const third=await prepare("pool-third");
    const responses:import("node:http").ServerResponse[]=[];let live=0;let peak=0;
    const server=createServer((req,res)=>{req.resume();live++;peak=Math.max(peak,live);responses.push(res);res.on("close",()=>{live--;});res.writeHead(200,{"content-type":"text/event-stream"});res.write(': waiting\n\n');});
    await new Promise<void>(r=>server.listen(0,"127.0.0.1",r));const host=dispatcher((server.address() as {port:number}).port);
    const persistent=createPersistentTaskService(db);
    const finish=(res:import("node:http").ServerResponse)=>res.end('data: {"id":"pool","object":"chat.completion.chunk","created":1,"model":"test","choices":[{"index":0,"delta":{"content":"完成正文"},"finish_reason":null}]}\n\ndata: {"id":"pool","object":"chat.completion.chunk","created":1,"model":"test","choices":[{"index":0,"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":2,"completion_tokens":3,"total_tokens":5}}\n\ndata: [DONE]\n\n');
    try{
      const draining=host.drainOnce();expect(host.drainOnce()).toBe(draining);
      await vi.waitFor(()=>expect(responses).toHaveLength(2));
      expect((await persistent.get(ctx,third.executionTaskId)).status).toBe("queued");
      await persistent.command(ctx,{taskIds:[first.executionTaskId],command:"cancel",idempotencyKey:"pool-cancel-first"});
      await vi.waitFor(()=>expect(responses).toHaveLength(3));
      expect((await persistent.get(ctx,first.executionTaskId)).status).toBe("cancelled");
      expect((await persistent.get(ctx,second.executionTaskId)).status).toBe("running");
      for(const response of responses)if(!response.destroyed)finish(response);
      expect(await draining).toBe(3);expect(peak).toBe(2);
      expect((await persistent.get(ctx,second.executionTaskId)).status).toBe("succeeded");
      expect((await persistent.get(ctx,third.executionTaskId)).status).toBe("succeeded");
    }finally{await host.stop();server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}
  },15000);

  it("已有长请求执行时，新任务能使用空闲进程；停止同时断开所有在途请求",async()=>{
    const long=await prepare("pool-late-long");let opened=0;let closed=0;
    let release!:()=>void;let sawEmpty!:()=>void;let delayed=false;
    const held=new Promise<void>(r=>{release=r;});const empty=new Promise<void>(r=>{sawEmpty=r;});
    const reorderedDb=new Proxy(db,{get(target,property){
      if(property==="transaction")return async (...args:Parameters<Db["transaction"]>)=>{
        const result=await target.transaction(...args);
        if((result as {task?:{id?:string}}|null)?.task?.id===long.executionTaskId && !delayed){delayed=true;await held;}
        else if(result===null && delayed)sawEmpty();
        return result;
      };
      return Reflect.get(target,property,target);
    }});
    const server=createServer((req,res)=>{req.resume();opened++;res.on("close",()=>{closed++;});res.writeHead(200,{"content-type":"text/event-stream"});res.write(': waiting\n\n');});
    await new Promise<void>(r=>server.listen(0,"127.0.0.1",r));const host=dispatcher((server.address() as {port:number}).port,reorderedDb);
    try{
      const draining=host.drainOnce();await empty;release();await vi.waitFor(()=>expect(opened).toBe(1));
      await prepare("pool-late-short");
      await vi.waitFor(()=>expect(opened).toBe(2));
      await host.stop();await draining;await vi.waitFor(()=>expect(closed).toBe(2));
      for(const id of ["pool-late-long","pool-late-short"])expect(await db.select().from(aiTaskResults).where(eq(aiTaskResults.aiTaskId,id))).toHaveLength(0);
    }finally{release();await host.stop();server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}
  },15000);

  it("停止发生在截止时间读取期间，也不会再启动模型请求",async()=>{
    const mapped=await prepare("stop-before-start");
    const [task]=await db.select().from(executionTasks).where(eq(executionTasks.id,mapped.executionTaskId));
    let release!:()=>void;let observed!:()=>void;
    const held=new Promise<void>(r=>{release=r;});const entered=new Promise<void>(r=>{observed=r;});
    const blockingDb=new Proxy(db,{get(target,property){
      if(property==="transaction")return async (...args:Parameters<Db["transaction"]>)=>{
        const result=await target.transaction(...args);
        if(result===task?.deadlineAt){observed();await held;}return result;
      };
      return Reflect.get(target,property,target);
    }});
    let requests=0;const server=createServer((req,res)=>{requests++;req.resume();res.writeHead(401);res.end();});
    await new Promise<void>(r=>server.listen(0,"127.0.0.1",r));const host=dispatcher((server.address() as {port:number}).port,blockingDb);
    try{
      const running=host.drainOnce();await entered;const stopped=host.stop();release();await stopped;await running;
      expect(requests).toBe(0);
    }finally{release();await host.stop();server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}
  },15000);

});
