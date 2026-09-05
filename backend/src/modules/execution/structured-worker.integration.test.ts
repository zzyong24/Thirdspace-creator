import { createAiService } from "../ai/ai.service";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { afterAll,beforeAll,describe,expect,it,vi } from "vitest";
import { createDb,aiTasks,aiTaskResults,executionCalls,executionTasks,eq,type Db } from "@creatoros/backend";
import { createExecutionAuthorityService } from "./execution-authority.service";
import { createModelWorkerDispatcher } from "./model-worker-dispatcher";
import { createPersistentTaskService } from "./persistent-task.service";
const ctx={userId:"structured-worker",accountId:"structured-worker",requestId:"test",source:"user" as const};
const budget={maxCalls:4,maxTokens:100000,deadlineMs:60000};
const modelInput={kind:"model.structured" as const,operationKey:"structured",capability:"script",maxOutputTokens:128,skillId:"structured-fixture",facets:{input:"正文"},skillSnapshot:{
  snapshotVersion:1 as const,userId:ctx.userId,accountId:ctx.accountId,resolvedAt:new Date().toISOString(),platformPolicyVersion:"1",platformPolicy:"按用户真实输入生成。",
  skills:[{skillId:"structured-fixture",baseVersion:"1",overlayRevision:null,overlayVersion:null,effective:{methodSystem:"输出JSON",template:"{{input}}",tools:[],requiredFacets:["input"],contextRequirements:[],outputSchema:{type:"object",properties:{value:{type:"string"}},required:["value"],additionalProperties:false},completionPolicy:null,completionPolicyAdapter:null}}],
}};
describe("独立Worker冻结Skill结构化执行",()=>{
  let db:Db;let close:()=>Promise<void>;
  beforeAll(async()=>{const c=await createDb();db=c.db;close=()=>c.client.close();execFileSync(process.execPath,[resolve("../ai-worker/scripts/build.mjs")],{stdio:"pipe"});},30000);
  afterAll(async()=>close?.());
  async function prepare(id:string,input:import("zod").z.infer<typeof import("@creatoros/contract/execution-worker").structuredGenerationInputSchema>=modelInput,executionBudget=budget){await db.insert(aiTasks).values({id,userId:ctx.userId,accountId:ctx.accountId,taskType:"script.draft",idempotencyKey:id,requestedAt:new Date().toISOString()});return createExecutionAuthorityService(db).bindAiTask(ctx,id,{requestFingerprint:"sha256:"+"0".repeat(64),modelInput:input,budget:executionBudget});}
  function host(port:number,store:Db=db,failProjection=false){return createModelWorkerDispatcher(store,{entryPath:resolve("../ai-worker/dist/execution-worker.cjs"),workerId:"structured-host",budget,
    async resolveModelCredential(){return {apiFormat:"openai_chat",baseUrl:`http://127.0.0.1:${port}/v1`,model:"test",token:"fixture",structuredOutputs:true};},
    projectCandidate(_ctx,input){if(failProjection)throw new Error("COMMIT_INTERRUPTED");return {resultType:"artifact_version",artifactId:"fixture",resultData:JSON.parse(input.text)};},
  });}
  it("真实子进程协议400降级后提交一次业务候选，逐次保留调用证据",async()=>{
    const mapped=await prepare("structured-success");let requests=0;
    const server=createServer((req,res)=>{req.resume();requests++;
      if(requests===1){res.writeHead(400,{"content-type":"application/json"});res.end('{"error":{"message":"response_format unsupported","type":"invalid_request_error"}}');return;}
      res.writeHead(200,{"content-type":"application/json"});res.end(JSON.stringify({id:"test",object:"chat.completion",created:1,model:"test",choices:[{index:0,message:{role:"assistant",content:'{"value":"结构化正文"}'},finish_reason:"stop"}],usage:{prompt_tokens:2,completion_tokens:3,total_tokens:5}}));
    });
    await new Promise<void>(r=>server.listen(0,"127.0.0.1",r));let worker=host((server.address() as {port:number}).port,db,true);
    try{
      expect(await worker.drainOnce()).toBe(1);
      expect((await createPersistentTaskService(db).get(ctx,mapped.executionTaskId)).status).toBe("running");
      expect(requests).toBe(2);
      await worker.stop();
      await db.update(executionTasks).set({leaseExpiresAt:new Date(Date.now()-1000).toISOString()}).where(eq(executionTasks.id,mapped.executionTaskId));
      worker=host((server.address() as {port:number}).port);
      expect(await worker.drainOnce()).toBe(1);
      expect((await createPersistentTaskService(db).get(ctx,mapped.executionTaskId)).status).toBe("succeeded");
      expect(requests).toBe(2);
      const candidates=await db.select().from(aiTaskResults).where(eq(aiTaskResults.aiTaskId,"structured-success"));expect(candidates).toHaveLength(1);expect(candidates[0]?.resultData).toMatchObject({value:"结构化正文",executionGeneration:{finishReason:"stop"}});
      const calls=await db.select().from(executionCalls).where(eq(executionCalls.executionTaskId,mapped.executionTaskId));expect(calls).toHaveLength(2);expect(calls.find(c=>c.status==="rejected")?.rejectionCode).toBe("STRUCTURED_PROTOCOL_UNSUPPORTED");expect(calls.find(c=>c.status==="settled")?.totalTokens).toBe(5);
    }finally{await worker.stop();server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}
  },15000);
  it("完成策略不足保留partial与校验原因，公共采纳入口拒绝物化",async()=>{
    // 使用允许创作partial的正式分镜Skill；script.draft专用双节点管线另有贯通测试。
    const input={...modelInput,skillId:"script.storyboard.segment",skillSnapshot:{...modelInput.skillSnapshot,skills:[{...modelInput.skillSnapshot.skills[0]!,skillId:"script.storyboard.segment",effective:{...modelInput.skillSnapshot.skills[0]!.effective,
      outputSchema:{type:"object",properties:{shots:{type:"array",items:{type:"object",properties:{role:{type:"string"}},required:["role"]}}},required:["shots"]},
      completionPolicy:{schemaVersion:1 as const,minSegments:3,maxSegments:null,requiredSequence:[],repairAttempts:0},completionPolicyAdapter:{id:"script.draft.shots",version:"1"},
    }}]}};
    const mapped=await prepare("partial",input);let requests=0;
    const server=createServer((req,res)=>{req.resume();requests++;res.writeHead(200,{"content-type":"application/json"});res.end(JSON.stringify({id:"test",object:"chat.completion",created:1,model:"test",choices:[{index:0,message:{role:"assistant",content:'{"shots":[{"role":"hook","口播":"真实但不足三段的正文"}]}'},finish_reason:"stop"}],usage:{prompt_tokens:2,completion_tokens:3,total_tokens:5}}));});
    await new Promise<void>(r=>server.listen(0,"127.0.0.1",r));const worker=host((server.address() as {port:number}).port);
    try{
      await worker.drainOnce();
      expect((await createPersistentTaskService(db).get(ctx,mapped.executionTaskId)).runtimeStatus).toBe("partial");expect(requests).toBe(1);
      const candidates=await db.select().from(aiTaskResults).where(eq(aiTaskResults.aiTaskId,"partial"));expect(candidates).toHaveLength(1);expect(candidates[0]?.resultData).toMatchObject({executionValidation:{status:"partial",errors:[{code:"MIN_SEGMENTS"}]}});
      const unexpectedWrite=vi.fn(async()=>{throw new Error("PARTIAL_MUST_NOT_WRITE");});
      const ai=createAiService({db,now:()=>new Date().toISOString(),nextId:prefix=>prefix+"fixture",artifacts:{createVersion:unexpectedWrite},knowledge:{createKnowledge:unexpectedWrite},candidate:{createFromAIResult:unexpectedWrite,enrichCard:unexpectedWrite},learnings:{createLearning:unexpectedWrite},publishing:{createPublicationFromDraft:unexpectedWrite},materialLinks:{link:unexpectedWrite},positioning:{upsertProfile:unexpectedWrite,createStatementVersion:unexpectedWrite},calibration:{createDraftPrediction:unexpectedWrite}});
      await expect(ai.confirmTask(ctx,"partial")).rejects.toThrow("该部分脚本缺少完整、可核验的执行结果，不能采纳");expect(unexpectedWrite).not.toHaveBeenCalled();
    }finally{await worker.stop();server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}
  },15000);
  it("独立Worker总调用预算为一时阻止文本回退请求",async()=>{
    const mapped=await prepare("bounded",modelInput,{...budget,maxCalls:1});let requests=0;
    const server=createServer((req,res)=>{req.resume();requests++;res.writeHead(200,{"content-type":"application/json"});res.end(JSON.stringify({id:"test",object:"chat.completion",created:1,model:"test",choices:[{index:0,message:{role:"assistant",content:"not-json"},finish_reason:"stop"}],usage:{prompt_tokens:2,completion_tokens:3,total_tokens:5}}));});
    await new Promise<void>(r=>server.listen(0,"127.0.0.1",r));const worker=host((server.address() as {port:number}).port);
    try{await worker.drainOnce();expect(requests).toBe(1);expect((await createPersistentTaskService(db).get(ctx,mapped.executionTaskId)).status).toBe("failed");expect(await db.select().from(aiTaskResults).where(eq(aiTaskResults.aiTaskId,"bounded"))).toHaveLength(0);}
    finally{await worker.stop();server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}
  },15000);
  it("取消在途结构化请求，持久未知提交且无回退和候选",async()=>{
    const mapped=await prepare("cancel-structured");let requests=0;let closed=false;
    const server=createServer((req,res)=>{req.resume();requests++;res.on("close",()=>{closed=true;});});
    await new Promise<void>(r=>server.listen(0,"127.0.0.1",r));const worker=host((server.address() as {port:number}).port);
    try{const draining=worker.drainOnce();await vi.waitFor(()=>expect(requests).toBe(1));const unused=async()=>{throw new Error("UNEXPECTED_DOMAIN_WRITE");};
      const ai=createAiService({db,now:()=>new Date().toISOString(),nextId:p=>p+"unused",artifacts:{createVersion:unused},knowledge:{createKnowledge:unused},candidate:{createFromAIResult:unused,enrichCard:unused},learnings:{createLearning:unused},publishing:{createPublicationFromDraft:unused},materialLinks:{link:unused},positioning:{upsertProfile:unused,createStatementVersion:unused},calibration:{createDraftPrediction:unused}});
      await ai.cancelTask(ctx,"cancel-structured");await draining;
      expect((await ai.getTask(ctx,"cancel-structured")).status).toBe("cancelled");expect(closed).toBe(true);expect(requests).toBe(1);expect((await createPersistentTaskService(db).get(ctx,mapped.executionTaskId)).status).toBe("cancelled");
      const calls=await db.select().from(executionCalls).where(eq(executionCalls.executionTaskId,mapped.executionTaskId));expect(calls).toHaveLength(1);expect(calls[0]?.status).toBe("unknown");expect(await db.select().from(aiTaskResults).where(eq(aiTaskResults.aiTaskId,"cancel-structured"))).toHaveLength(0);
    }finally{await worker.stop();server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}
  },15000);
  it("不同账号的冻结Skill不能绑定业务任务",async()=>{
    await expect(prepare("wrong-owner",{...modelInput,skillSnapshot:{...modelInput.skillSnapshot,accountId:"another"}})).rejects.toThrow("owner mismatch");
  });
});
