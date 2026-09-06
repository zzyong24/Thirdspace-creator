import {createAssetBusinessExecutionService} from "../ai-runtime/asset-business-execution.service";
import {createAiService,createGeneratedAssetAdoptionService} from "../ai";
import {createModelWorkerDispatcher} from "./model-worker-dispatcher";
import {createServer} from "node:http";
import {execFileSync} from "node:child_process";
import {resolve,join} from "node:path";
import {mkdtemp,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {beforeAll,it,expect,vi} from "vitest";
import {createDb,aiTasks,aiTaskResults,executionTasks,assets,eq} from "@creatoros/backend";
import {createExecutionAuthorityService} from "./execution-authority.service";
import {createPersistentTaskService} from "./persistent-task.service";
import {createExecutionLeaseService} from "./execution-lease.service";
import {createExecutionCallLedgerService} from "./execution-call-ledger.service";
import {createExecutionAssetPorts} from "./execution-asset-ports.service";
import {createExecutionWorkerCallPorts} from "./execution-worker-call-ports.service";
import {createExecutionCandidateService} from "../ai/execution-candidate.service";
import {createLocalFsObjectStorage} from "../assets/localfs-object-storage";
import {createWorkerSupervisor} from "./worker-supervisor";
beforeAll(()=>execFileSync(process.execPath,[resolve("../ai-worker/scripts/build.mjs")],{stdio:"pipe"}),30000);
it.each<{loseAck:boolean;status:number;drift:boolean;video?:boolean;resume?:boolean}>([{loseAck:false,status:200,drift:false},{loseAck:true,status:200,drift:false},{loseAck:false,status:502,drift:false},{loseAck:false,status:200,drift:true},{loseAck:false,status:200,drift:false,video:true},{loseAck:false,status:200,drift:false,video:true,resume:true}])("真实生图适配器与恢复 %j",async({loseAck,status,drift,video=false,resume=false})=>{
 const opened=await createDb(),db=opened.db,dir=await mkdtemp(join(tmpdir(),"t915-asset-runtime-"));let requests=0;
 let posts=0;
 const server=createServer((req,res)=>{requests++;req.resume();if(req.method==="POST")posts++;
  if(video && req.url==="/media"){res.writeHead(200);res.end(Buffer.from([0,255,128,1]));return;}
  res.writeHead(status,{"content-type":"application/json"});
  res.end(JSON.stringify(video ? req.url?.includes("query/video_generation")?{status:"Success",file_id:"original-file"}:req.url?.includes("files/retrieve")?{file:{download_url:input.baseUrl+"/media"}}:{task_id:"original-job"} : {data:[{b64_json:Buffer.from([0,255,128,1]).toString("base64")}]}));});
 await new Promise<void>(r=>server.listen(0,"127.0.0.1",r));const address=server.address() as {port:number};
 const ctx={userId:"asset-owner",accountId:"asset-account",requestId:"test",source:"user" as const},id="asset-runtime",now=()=>new Date().toISOString();
 const input={kind:"asset.generate",mediaKind:video?"video":"image",capability:video?"video.generate":"image.generate",operationKey:"asset/original",prompt:"测试图",provider:video?"minimax":"openai",model:video?"video-01":"image",baseUrl:`http://127.0.0.1:${address.port}`};
 await db.insert(aiTasks).values({id,userId:ctx.userId,accountId:ctx.accountId,taskType:"asset.generate",idempotencyKey:id,inputData:{kind:input.mediaKind,prompt:input.prompt},requestedAt:now()});
 const mapped=await createExecutionAuthorityService(db).bindAiTask(ctx,id);await db.update(executionTasks).set({payload:{aiTaskId:id,modelInput:input}}).where(eq(executionTasks.id,mapped.executionTaskId));
 const tasks=createPersistentTaskService(db),claim=(await tasks.claimTask({taskId:mapped.executionTaskId,workerId:"worker"}))!,ref={executionTaskId:mapped.executionTaskId,attempt:claim.lease.attempt,fenceToken:claim.lease.fenceToken};
 const budget={maxCalls:3,maxTokens:100000,deadlineMs:60000},leases=createExecutionLeaseService(db),ledger=createExecutionCallLedgerService(db,{budget}),calls=createExecutionWorkerCallPorts(db,{budget});
 const storage=createLocalFsObjectStorage({rootPath:dir,publicBaseUrl:"/blob"},{nextKey:()=>"unused"});
 const ports=createExecutionAssetPorts({db,now,budget,objectStorageForCtx:async()=>storage,resolveCredential:async()=>({provider:input.provider,model:drift?"changed":input.model,baseUrl:input.baseUrl,kind:input.mediaKind,token:"local-test"})});
 if(resume){const r=await ports.invoke(ref,"reserveAssetCall",{}) as {callId:string};await ports.invoke(ref,"startAssetCall",{callId:r.callId});await ports.invoke(ref,"recordAssetProviderJob",{callId:r.callId,job:{schemaVersion:1,provider:input.provider,model:input.model,baseUrl:input.baseUrl,jobId:"original-job"}});}
 const candidates=createExecutionCandidateService(db,{projectCandidate:()=>{throw new Error("不可旁路");}});let first=true;
 const make=()=>createWorkerSupervisor({entryPath:resolve("../ai-worker/dist/execution-worker.cjs"),ports:{validate:async(ref,mode)=>{await leases.withLease(ref,mode,async()=>{});},invoke:async(ref,port,data)=>{
  if(port==="heartbeat")return {};
  if(port==="startAssetCall"){await expect(calls.startCall(ref,data)).rejects.toThrow("专用");await expect(calls.settleCall(ref,{...(data as {callId:string}),status:"unknown"})).rejects.toThrow("专用");}
  if(port==="readTaskContext")return calls.readTaskContext(ref);
  if(port==="commitResult"){if((data as {outcome:string}).outcome!=="succeeded")return {};return candidates.commitResult(ref,data);}
  const result=await ports.invoke(ref,port,data);
  if(port==="saveAssetResult" && loseAck && first){first=false;throw new Error("保存回复丢失");}return result;
 }}});
 let supervisor=make();try{
  expect((await supervisor.start())).toContain("asset.generate");
  expect(await supervisor.run(ref,Date.now()+30000)).toBe(drift?"waiting_user":status===502?"unknown_result":"completed");
  if(status===502){await supervisor.stop();supervisor=make();expect(await supervisor.run(ref,Date.now()+30000)).toBe("unknown_result");}
  expect(requests).toBe(video?(resume?3:4):drift?0:1);expect(posts).toBe(drift||resume?0:1);expect(await db.select().from(assets)).toHaveLength(drift||status===502?0:1);expect(await db.select().from(aiTaskResults)).toHaveLength(drift||status===502?0:1);expect((await ledger.inspect(ref)).calls).toHaveLength(1);
 }finally{await supervisor.stop();server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));await opened.client.close();await rm(dir,{recursive:true,force:true});}
},30000);

it("真实调度器对429有限重试，两次原调用只产一个素材候选",async()=>{
 const opened=await createDb(),db=opened.db,dir=await mkdtemp(join(tmpdir(),"t915-asset-retry-"));let requests=0;
 const server=createServer((req,res)=>{req.resume();requests++;res.writeHead(requests===1?429:200,{"content-type":"application/json"});res.end(JSON.stringify(requests===1?{error:{message:"busy"}}:{data:[{b64_json:Buffer.from([0,255,1]).toString("base64")}]}));});
 await new Promise<void>(r=>server.listen(0,"127.0.0.1",r));const baseUrl=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
 const ctx={userId:"retry-owner",accountId:"retry-account",requestId:"test",source:"user" as const},id="asset-retry",budget={maxCalls:3,maxTokens:100000,deadlineMs:20000};
 const input={kind:"asset.generate",mediaKind:"image",capability:"image.generate",operationKey:"original",prompt:"测试重试",provider:"openai",model:"image",baseUrl} as const;
 await db.insert(aiTasks).values({id,userId:ctx.userId,accountId:ctx.accountId,taskType:"asset.generate",idempotencyKey:id,inputData:{kind:"image",prompt:input.prompt},requestedAt:new Date().toISOString()});
 const mapped=await createExecutionAuthorityService(db).bindAiTask(ctx,id,{requestFingerprint:`sha256:${"0".repeat(64)}`,modelInput:input,budget});
 const storage=createLocalFsObjectStorage({rootPath:dir,publicBaseUrl:"/blob"},{nextKey:()=>"unused"});
 const host=createModelWorkerDispatcher(db,{entryPath:resolve("../ai-worker/dist/execution-worker.cjs"),workerId:"asset-host",budget,pollMs:100,modelConcurrency:1,assetStorage:async()=>storage,resolveAssetCredential:async()=>({provider:"openai",model:"image",kind:"image",baseUrl,token:"fixture"}),resolveModelCredential:async()=>{throw new Error("不能走文本模型");},projectCandidate:()=>{throw new Error("不可旁路");}});
 try{host.start();await vi.waitFor(async()=>expect((await createPersistentTaskService(db).get(ctx,mapped.executionTaskId)).status).toBe("succeeded"),{timeout:10000});expect(requests).toBe(2);expect(await db.select().from(aiTaskResults)).toHaveLength(1);expect(await db.select().from(assets)).toHaveLength(1);}
 finally{await host.stop();server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));await opened.client.close();await rm(dir,{recursive:true,force:true});}
},15000);

it("公开创建素材经业务准备、真实Worker重试后公开采纳",async()=>{
 const opened=await createDb(),db=opened.db,dir=await mkdtemp(join(tmpdir(),"t915-asset-entry-"));let requests=0,n=0;
 const server=createServer((req,res)=>{req.resume();requests++;res.writeHead(requests===1?429:200,{"content-type":"application/json"});res.end(JSON.stringify(requests===1?{error:{message:"busy"}}:{data:[{b64_json:Buffer.from([7,8,9]).toString("base64")}]}));});
 await new Promise<void>(r=>server.listen(0,"127.0.0.1",r));const baseUrl=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
 const ctx={userId:"entry-owner",accountId:"entry-account",requestId:"test",source:"user" as const},now=()=>new Date().toISOString(),budget={maxCalls:6,maxTokens:100000,deadlineMs:20000};
 const unused=async():Promise<never>=>{throw new Error("不能进入旧路径");};
 const ai=createAiService({db,now,nextId:p=>`${p}-${++n}`,generatedAssets:createGeneratedAssetAdoptionService(db,{link:unused},now),artifacts:{createVersion:unused},knowledge:{createKnowledge:unused},candidate:{createFromAIResult:unused,enrichCard:unused},learnings:{createLearning:unused},publishing:{createPublicationFromDraft:unused},materialLinks:{link:unused},positioning:{upsertProfile:unused,createStatementVersion:unused},calibration:{createDraftPrediction:unused}});
 const business=createAssetBusinessExecutionService(db,{now,budget,assertProject:unused,resolveSpec:async()=>({provider:"openai",model:"image",kind:"image",baseUrl,token:"entry-secret"})});
 const storage=createLocalFsObjectStorage({rootPath:dir,publicBaseUrl:"/blob"},{nextKey:()=>"unused"});
 const host=createModelWorkerDispatcher(db,{entryPath:resolve("../ai-worker/dist/execution-worker.cjs"),workerId:"asset-entry-host",budget,pollMs:100,modelConcurrency:1,assetStorage:async()=>storage,resolveAssetCredential:(c,owner)=>business.resolveCredential(c,owner),resolveModelCredential:unused,projectCandidate:()=>{throw new Error("不能走通用候选");}});
 try{
  // 旧入口允许省略 kind，保持默认生图；这里不手工植入执行 payload。
  const task=await ai.createTask(ctx,{taskType:"asset.generate",inputData:{prompt:"公开任务原画面"}});
  const prepared=await business.prepare(ctx,task.id);expect(prepared.legacy).toBeUndefined();host.start();
  await vi.waitFor(async()=>expect((await ai.getTask(ctx,task.id)).status).toBe("awaiting_confirmation"),{timeout:10000});
  expect(requests).toBe(2);expect(await ai.listResults(ctx,task.id)).toHaveLength(1);
  expect((await ai.confirmTask(ctx,task.id)).status).toBe("succeeded");expect((await ai.confirmTask(ctx,task.id)).status).toBe("succeeded");
  expect(await db.select().from(assets)).toMatchObject([{status:"active"}]);expect(await db.select().from(assets)).toHaveLength(1);
  expect(JSON.stringify(await db.select().from(executionTasks))).not.toContain("entry-secret");
 }finally{await host.stop();server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));await opened.client.close();await rm(dir,{recursive:true,force:true});}
},15000);
