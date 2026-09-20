import {afterAll,afterEach,beforeAll,expect,it,vi} from "vitest";
import {spawn} from "node:child_process";
import {randomUUID} from "node:crypto";
import {createServer,type Server} from "node:net";
import {mkdtemp,readFile,rm,writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join,resolve} from "node:path";
import {createDb,executionTasks,eq,type Db} from "@creatoros/backend";
import {createPersistentTaskService,createExecutionBrowserProfileLeaseService} from "@creatoros/backend/modules/execution";
import {resolveManagedBrowserProfile} from "./workbench-browser-client";
import {createWorkbenchBrowserHost} from "./workbench-browser-host";

vi.mock("server-only",()=>({}));
let db:Db,close:()=>Promise<void>,server:Server|undefined,directory:string|undefined;
beforeAll(async()=>{const opened=await createDb();db=opened.db;close=()=>opened.client.close();});
afterAll(async()=>close?.());
afterEach(async()=>{if(server)await new Promise<void>(resolve=>server!.close(()=>resolve()));if(directory)await rm(directory,{recursive:true,force:true});server=undefined;directory=undefined;});

async function socket(received:Array<Record<string,unknown>>,failOpen=false,cleanupStopped=()=>true,
 stopProofStopped=()=>true,cleanupReply?:Promise<void>){
 directory=await mkdtemp(join(tmpdir(),"wb-browser-host-"));const path=join(directory,"browser.sock");
 server=createServer(connection=>{
  let body="";connection.on("data",async chunk=>{
   body+=chunk.toString();const end=body.indexOf("\n");if(end<0)return;
   const request=JSON.parse(body.slice(0,end)) as Record<string,unknown>;received.push(request);
   const action=request.action as {kind:string};
   if(failOpen&&action.kind==="open"){
    connection.end(`${JSON.stringify({ok:false,operationId:request.operationId,code:"BROWSER_UNAVAILABLE"})}\n`);
    return;
   }
   const value=action.kind==="profile_location"
    ? {profileKey:"a".repeat(64),managedProfileRoot:"/app-data/workbench/profile",
      identityMode:(action as {identityMode?:string}).identityMode,legacyIdentityImported:false,primaryLoginState:"unverified"}
    : action.kind==="open"?{lane:{lane_id:"native-lane",browser_epoch:1}}
    : action.kind==="close"?{close:{},stopProof:{profileStopped:true}}
    : action.kind==="stop_proof"?{profileStopped:stopProofStopped(),profileKey:"a".repeat(64),
      profileLeaseId:(request.admission as {profileLeaseId:string}).profileLeaseId}
    : action.kind==="cleanup"?{profileStopped:cleanupStopped(),profileKey:"a".repeat(64),
      profileLeaseId:(request.admission as {profileLeaseId:string}).profileLeaseId}
    : {laneId:"native-lane",browserEpoch:1,result:{ok:true}};
   if(action.kind==="cleanup")await cleanupReply;
   connection.end(`${JSON.stringify({ok:true,operationId:request.operationId,value})}\n`);
  });
 });
 await new Promise<void>((resolve,reject)=>server!.listen(path,resolve).once("error",reject));return path;
}

it("only a desktop Mac with private socket advertises browser tools",()=>{
 expect(createWorkbenchBrowserHost(db,{platform:"win32",desktop:true,socketPath:"pipe"})).toBeUndefined();
 expect(createWorkbenchBrowserHost(db,{platform:"darwin",desktop:false,socketPath:"pipe"})).toBeUndefined();
 expect(createWorkbenchBrowserHost(db,{platform:"darwin",desktop:true,socketPath:""})).toBeUndefined();
 const catalog=createWorkbenchBrowserHost(db,{platform:"darwin",desktop:true,socketPath:"private.sock"})!.catalog;
 expect(catalog.some(tool=>tool.name==="browser.open")).toBe(true);
 // Pi 尚无可信媒体引用解析端口；只在截图真正能供模型查看后冻结该能力。
 expect(catalog.some(tool=>tool.name==="browser.screenshot")).toBe(false);
});

it("native open failure releases the claimed profile only after stop proof",async()=>{
 const tasks=createPersistentTaskService(db);
 const task=await tasks.enqueue({userId:"browser-user",accountId:"browser-account",requestId:"failed-open",source:"user"},
  {kind:"ai_task",ownerType:"ai_task",ownerId:"failed-open",idempotencyKey:"failed-open",payload:{}});
 const claim=(await tasks.claimTask({taskId:task.id,workerId:"browser-worker"}))!;
 const received:Array<Record<string,unknown>>=[];
 const path=await socket(received,true);
 const host=createWorkbenchBrowserHost(db,{platform:"darwin",desktop:true,socketPath:path})!;
 const outcome=await host.dispatch({context:{userId:"browser-user",accountId:"browser-account",taskId:task.id,
  attempt:claim.lease.attempt,fenceToken:claim.lease.fenceToken,leaseId:"browser-worker",operationId:"failed-open"},
  invocation:{name:"browser.open",schemaVersion:1,input:{laneId:"research",mode:"primary",domain:"example.com"}}},
  {signal:new AbortController().signal,onProgress:()=>{}});
 expect(outcome.status).toBe("failed");
 expect(received.map(request=>(request.action as {kind:string}).kind)).toEqual(["profile_location","open","stop_proof"]);
 const profiles=createExecutionBrowserProfileLeaseService(db);
 expect(await profiles.listOwned({executionTaskId:task.id,attempt:claim.lease.attempt,fenceToken:claim.lease.fenceToken})).toEqual([]);
});

it("a new host only reconciles a stopped old owner before reusing the same physical profile",async()=>{
 const tasks=createPersistentTaskService(db);
 const old=await tasks.enqueue({userId:"recovery-user",accountId:"recovery-account",requestId:"old-browser",source:"user"},
  {kind:"ai_task",ownerType:"ai_task",ownerId:"old-browser",idempotencyKey:"old-browser",payload:{}});
 const oldClaim=(await tasks.claimTask({taskId:old.id,workerId:"old-worker"}))!;
 const received:Array<Record<string,unknown>>=[];let stopped=false;
 const path=await socket(received,false,()=>stopped);
 const oldHost=createWorkbenchBrowserHost(db,{platform:"darwin",desktop:true,socketPath:path})!;
 const oldCall={context:{userId:"recovery-user",accountId:"recovery-account",taskId:old.id,
  attempt:oldClaim.lease.attempt,fenceToken:oldClaim.lease.fenceToken,leaseId:"old-worker",operationId:"old-open"},
  invocation:{name:"browser.open",schemaVersion:1,input:{laneId:"old",mode:"primary",domain:"example.com"}}};
 expect((await oldHost.dispatch(oldCall,{signal:new AbortController().signal,onProgress:()=>{}})).status).toBe("succeeded");
 const oldRef={executionTaskId:old.id,attempt:oldClaim.lease.attempt,fenceToken:oldClaim.lease.fenceToken};
 const profiles=createExecutionBrowserProfileLeaseService(db);
 const [oldLease]=await profiles.listOwned(oldRef);
 const next=await tasks.enqueue({userId:"recovery-user",accountId:"recovery-account",requestId:"new-browser",source:"user"},
  {kind:"ai_task",ownerType:"ai_task",ownerId:"new-browser",idempotencyKey:"new-browser",payload:{}});
 const nextClaim=(await tasks.claimTask({taskId:next.id,workerId:"next-worker"}))!;
 const newHost=createWorkbenchBrowserHost(db,{platform:"darwin",desktop:true,socketPath:path})!;
 const nextCall={context:{userId:"recovery-user",accountId:"recovery-account",taskId:next.id,
  attempt:nextClaim.lease.attempt,fenceToken:nextClaim.lease.fenceToken,leaseId:"next-worker",operationId:"blocked-open"},
  invocation:{name:"browser.open",schemaVersion:1,input:{laneId:"new",mode:"primary",domain:"example.com"}}};
 expect((await newHost.dispatch(nextCall,{signal:new AbortController().signal,onProgress:()=>{}})).status).toBe("failed");
 expect(received.some(request=>(request.action as {kind:string}).kind==="cleanup")).toBe(false);
 expect(await profiles.listOwned(oldRef)).toHaveLength(1);
 await db.update(executionTasks).set({status:"paused"}).where(eq(executionTasks.id,old.id));
 expect((await newHost.dispatch({...nextCall,context:{...nextCall.context,operationId:"unproven-open"}},
  {signal:new AbortController().signal,onProgress:()=>{}})).status).toBe("failed");
 expect(await profiles.listOwned(oldRef)).toHaveLength(1);
 stopped=true;
 const resumed=await newHost.dispatch({...nextCall,context:{...nextCall.context,operationId:"recovered-open"}},
  {signal:new AbortController().signal,onProgress:()=>{}});
 expect(resumed.status).toBe("succeeded");
 expect(received.find(request=>(request.action as {kind:string}).kind==="cleanup")?.admission)
  .toMatchObject({taskId:old.id,profileLeaseId:oldLease!.leaseId,fenceToken:oldRef.fenceToken});
 expect(await profiles.listOwned(oldRef)).toEqual([]);
 expect((await profiles.listOwned({executionTaskId:next.id,attempt:nextClaim.lease.attempt,
  fenceToken:nextClaim.lease.fenceToken}))[0]?.leaseId).not.toBe(oldLease!.leaseId);
 expect((await newHost.dispatch({...nextCall,context:{...nextCall.context,operationId:"recovered-close"},
  invocation:{name:"browser.close",schemaVersion:1,input:{laneId:"native-lane",browserEpoch:1}}},
  {signal:new AbortController().signal,onProgress:()=>{}})).status).toBe("succeeded");
});

it("reconciles a cancelled task without waiting for another task to claim its profile",async()=>{
 const nonce=randomUUID(),tasks=createPersistentTaskService(db),received:Array<Record<string,unknown>>=[];
 const task=await tasks.enqueue({userId:`cancel-${nonce}`,accountId:`account-${nonce}`,requestId:nonce,source:"user"},
  {kind:"ai_task",ownerType:"ai_task",ownerId:nonce,idempotencyKey:nonce,payload:{}});
 const claim=(await tasks.claimTask({taskId:task.id,workerId:`worker-${nonce}`}))!;
 let stopped=false;
 const path=await socket(received,false,()=>stopped);
 const host=createWorkbenchBrowserHost(db,{platform:"darwin",desktop:true,socketPath:path})!;
 const ref={executionTaskId:task.id,attempt:claim.lease.attempt,fenceToken:claim.lease.fenceToken};
 const context={userId:`cancel-${nonce}`,accountId:`account-${nonce}`,taskId:task.id,
  attempt:ref.attempt,fenceToken:ref.fenceToken,leaseId:`worker-${nonce}`};
 const open=await host.dispatch({context:{...context,operationId:randomUUID()},invocation:{name:"browser.open",
  schemaVersion:1,input:{laneId:"research",mode:"primary",domain:"example.com"}}},
  {signal:AbortSignal.timeout(10_000),onProgress:()=>{}});
 expect(open.status).toBe("succeeded");
 const profiles=createExecutionBrowserProfileLeaseService(db);
 const [lease]=await profiles.listOwned(ref);
 expect(lease).toBeDefined();
 await host.reconcileStoppedProfiles();
 expect(received.some(request=>(request.action as {kind:string}).kind==="cleanup")).toBe(false);
 await db.update(executionTasks).set({status:"waiting_user"}).where(eq(executionTasks.id,task.id));
 await host.reconcileStoppedProfiles();
 expect(received.some(request=>(request.action as {kind:string}).kind==="cleanup")).toBe(false);
 await tasks.command({userId:context.userId,accountId:context.accountId,requestId:`cancel-${nonce}`,source:"user"},
  {taskIds:[task.id],command:"cancel",idempotencyKey:`cancel-${nonce}`});
 await host.reconcileStoppedProfiles();
 expect(received.at(-1)?.action).toMatchObject({kind:"cleanup"});
 expect(await profiles.listOwned(ref)).toHaveLength(1);
 stopped=true;
 await vi.waitFor(async()=>expect(await profiles.listOwned(ref)).toEqual([]),{timeout:7_500,interval:100});
 expect(await profiles.listOwned(ref)).toEqual([]);
 expect(received.at(-1)?.admission).toMatchObject({taskId:task.id,attempt:ref.attempt,
  fenceToken:ref.fenceToken,profileLeaseId:lease!.leaseId});
 await host.dispose();
});

it("waits for in-flight profile reconciliation before disposing the database owner",async()=>{
 const nonce=randomUUID(),tasks=createPersistentTaskService(db),received:Array<Record<string,unknown>>=[];
 const task=await tasks.enqueue({userId:`drain-${nonce}`,accountId:`account-${nonce}`,requestId:nonce,source:"user"},
  {kind:"ai_task",ownerType:"ai_task",ownerId:nonce,idempotencyKey:nonce,payload:{}});
 const claim=(await tasks.claimTask({taskId:task.id,workerId:`worker-${nonce}`}))!;
 let reply!:()=>void;
 const gate=new Promise<void>(resolveGate=>{reply=resolveGate;});
 const path=await socket(received,false,()=>true,()=>true,gate);
 const host=createWorkbenchBrowserHost(db,{platform:"darwin",desktop:true,socketPath:path})!;
 const context={userId:`drain-${nonce}`,accountId:`account-${nonce}`,taskId:task.id,
  attempt:claim.lease.attempt,fenceToken:claim.lease.fenceToken,leaseId:`worker-${nonce}`};
 expect((await host.dispatch({context:{...context,operationId:randomUUID()},invocation:{name:"browser.open",schemaVersion:1,
  input:{laneId:"research",mode:"primary",domain:"example.com"}}},
  {signal:AbortSignal.timeout(10_000),onProgress:()=>{}})).status).toBe("succeeded");
 await tasks.command({userId:context.userId,accountId:context.accountId,requestId:`cancel-${nonce}`,source:"user"},
  {taskIds:[task.id],command:"cancel",idempotencyKey:`cancel-${nonce}`});
 const sweep=host.reconcileStoppedProfiles();
 await vi.waitFor(()=>expect(received.some(request=>(request.action as {kind:string}).kind==="cleanup")).toBe(true));
 let disposed=false;
 const draining=host.dispose().then(()=>{disposed=true;});
 await Promise.resolve();
 expect(disposed).toBe(false);
 reply();
 await Promise.all([sweep,draining]);
 expect(disposed).toBe(true);
 const profiles=createExecutionBrowserProfileLeaseService(db);
 expect(await profiles.listOwned({executionTaskId:task.id,attempt:claim.lease.attempt,
  fenceToken:claim.lease.fenceToken})).toEqual([]);
});

it("open obtains the Rust physical profile and binds it to the current DB task before native dispatch",async()=>{
 const tasks=createPersistentTaskService(db);
 const task=await tasks.enqueue({userId:"browser-user",accountId:"browser-account",requestId:"host-open",source:"user"},
  {kind:"ai_task",ownerType:"ai_task",ownerId:"host-open",idempotencyKey:"host-open",payload:{}});
 const claim=(await tasks.claimTask({taskId:task.id,workerId:"browser-worker"}))!;
 const received:Array<Record<string,unknown>>=[];const path=await socket(received);
 const host=createWorkbenchBrowserHost(db,{platform:"darwin",desktop:true,socketPath:path})!;
 const call={context:{userId:"browser-user",accountId:"browser-account",taskId:task.id,attempt:claim.lease.attempt,
  fenceToken:claim.lease.fenceToken,leaseId:"browser-worker",operationId:"browser-open"},
  invocation:{name:"browser.open",schemaVersion:1,input:{laneId:"research",mode:"primary",domain:"example.com"}}};
 const result=await host.dispatch(call,{signal:new AbortController().signal,onProgress:()=>{}});
 expect(result.status).toBe("succeeded");
 expect(received).toHaveLength(2);
 expect(received[0]!.action).toMatchObject({kind:"profile_location",userId:"browser-user",accountId:"browser-account",taskId:task.id,identityMode:"primary"});
 expect(received[1]!.admission).toMatchObject({userId:"browser-user",accountId:"browser-account",taskId:task.id,
  fenceToken:claim.lease.fenceToken,profileKey:"a".repeat(64),laneName:"research"});
 await expect(host.dispatch({...call,context:{...call.context,operationId:"forged"},invocation:{...call.invocation,
  input:{...call.invocation.input,profileKey:"b".repeat(64)}}},{signal:new AbortController().signal,onProgress:()=>{}}))
  .resolves.toMatchObject({status:"failed"});
 expect(received).toHaveLength(2);
 await expect(host.dispatch({...call,context:{...call.context,userId:"forged-user",operationId:"forged-owner"}},
  {signal:new AbortController().signal,onProgress:()=>{}})).resolves.toMatchObject({status:"failed"});
 expect(received).toHaveLength(2);
 await expect(host.dispatch({...call,context:{...call.context,operationId:"cross-domain"},invocation:{
  name:"browser.navigate",schemaVersion:1,input:{laneId:"native-lane",browserEpoch:1,url:"https://other.example/page"}}},
  {signal:new AbortController().signal,onProgress:()=>{}})).resolves.toMatchObject({status:"failed"});
 expect(received).toHaveLength(2);
 for(const [operationId,url] of [["primary-http","http://example.com/page"],
  ["explicit-port","https://example.com:443/page"]]){
  await expect(host.dispatch({...call,context:{...call.context,operationId},invocation:{
   name:"browser.navigate",schemaVersion:1,input:{laneId:"native-lane",browserEpoch:1,url}}},
   {signal:new AbortController().signal,onProgress:()=>{}})).resolves.toMatchObject({status:"failed",error:{code:"domain_not_allowed"}});
  expect(received).toHaveLength(2);
 }
 const navigated=await host.dispatch({...call,context:{...call.context,operationId:"navigate-1"},invocation:{
  name:"browser.navigate",schemaVersion:1,input:{laneId:"native-lane",browserEpoch:1,url:"https://news.example.com/page"}}},
  {signal:new AbortController().signal,onProgress:()=>{}});
 expect(navigated.status).toBe("succeeded");
 expect(received[3]!.action).toMatchObject({kind:"execute",laneId:"native-lane",expectedBrowserEpoch:1,action:"navigate",
  input:{url:"https://news.example.com/page"}});
 const closed=await host.dispatch({...call,context:{...call.context,operationId:"close-1"},invocation:{
  name:"browser.close",schemaVersion:1,input:{laneId:"native-lane",browserEpoch:1}}},
  {signal:new AbortController().signal,onProgress:()=>{}});
 expect(closed.status).toBe("succeeded");
 expect(received.at(-1)!.action).toMatchObject({kind:"stop_proof"});
 const profiles=createExecutionBrowserProfileLeaseService(db);
 expect(await profiles.listOwned({executionTaskId:task.id,attempt:claim.lease.attempt,fenceToken:claim.lease.fenceToken})).toEqual([]);
 const anonymous=await host.dispatch({...call,context:{...call.context,operationId:"anonymous-open"},invocation:{
  name:"browser.open",schemaVersion:1,input:{laneId:"anon",mode:"anonymous",domain:"example.com"}}},
  {signal:new AbortController().signal,onProgress:()=>{}});
 expect(anonymous.status).toBe("succeeded");
 const http=await host.dispatch({...call,context:{...call.context,operationId:"anonymous-http"},invocation:{
  name:"browser.navigate",schemaVersion:1,input:{laneId:"native-lane",browserEpoch:1,url:"http://example.com/page"}}},
  {signal:new AbortController().signal,onProgress:()=>{}});
 expect(http.status).toBe("succeeded");
 expect(received.at(-1)?.action).toMatchObject({kind:"execute",action:"navigate",
  input:{url:"http://example.com/page"}});
 expect((await host.dispatch({...call,context:{...call.context,operationId:"anonymous-close"},invocation:{
  name:"browser.close",schemaVersion:1,input:{laneId:"native-lane",browserEpoch:1}}},
  {signal:new AbortController().signal,onProgress:()=>{}})).status).toBe("succeeded");
});
it("close waits for a transient native stop proof before releasing its physical profile",async()=>{
 const nonce=randomUUID(),tasks=createPersistentTaskService(db),received:Array<Record<string,unknown>>=[];
 const task=await tasks.enqueue({userId:`proof-${nonce}`,accountId:`account-${nonce}`,requestId:nonce,source:"user"},
  {kind:"ai_task",ownerType:"ai_task",ownerId:nonce,idempotencyKey:nonce,payload:{}});
 const claim=(await tasks.claimTask({taskId:task.id,workerId:`worker-${nonce}`}))!;
 let proofs=0;
 const path=await socket(received,false,()=>true,()=>++proofs>=2);
 const host=createWorkbenchBrowserHost(db,{platform:"darwin",desktop:true,socketPath:path})!;
 const context={userId:`proof-${nonce}`,accountId:`account-${nonce}`,taskId:task.id,
  attempt:claim.lease.attempt,fenceToken:claim.lease.fenceToken,leaseId:`worker-${nonce}`};
 const call=(name:string,input:Record<string,unknown>)=>host.dispatch({context:{...context,operationId:randomUUID()},
  invocation:{name,schemaVersion:1,input}},{signal:AbortSignal.timeout(10_000),onProgress:()=>{}});
 expect((await call("browser.open",{laneId:"research",mode:"primary",domain:"example.com"})).status).toBe("succeeded");
 expect((await call("browser.close",{laneId:"native-lane",browserEpoch:1})).status).toBe("succeeded");
 expect(proofs).toBe(2);
 const profiles=createExecutionBrowserProfileLeaseService(db);
 expect(await profiles.listOwned({executionTaskId:task.id,attempt:claim.lease.attempt,
  fenceToken:claim.lease.fenceToken})).toEqual([]);
});
it("close reports unknown and keeps the lease when native stop cannot be proven",async()=>{
 const nonce=randomUUID(),tasks=createPersistentTaskService(db),received:Array<Record<string,unknown>>=[];
 const task=await tasks.enqueue({userId:`unproven-${nonce}`,accountId:`account-${nonce}`,requestId:nonce,source:"user"},
  {kind:"ai_task",ownerType:"ai_task",ownerId:nonce,idempotencyKey:nonce,payload:{}});
 const claim=(await tasks.claimTask({taskId:task.id,workerId:`worker-${nonce}`}))!;
 const path=await socket(received,false,()=>true,()=>false);
 const host=createWorkbenchBrowserHost(db,{platform:"darwin",desktop:true,socketPath:path})!;
 const context={userId:`unproven-${nonce}`,accountId:`account-${nonce}`,taskId:task.id,
  attempt:claim.lease.attempt,fenceToken:claim.lease.fenceToken,leaseId:`worker-${nonce}`};
 const call=(name:string,input:Record<string,unknown>)=>host.dispatch({context:{...context,operationId:randomUUID()},
  invocation:{name,schemaVersion:1,input}},{signal:AbortSignal.timeout(10_000),onProgress:()=>{}});
 expect((await call("browser.open",{laneId:"research",mode:"primary",domain:"example.com"})).status).toBe("succeeded");
 expect((await call("browser.close",{laneId:"native-lane",browserEpoch:1})).status).toBe("unknown");
 const profiles=createExecutionBrowserProfileLeaseService(db);
 expect(await profiles.listOwned({executionTaskId:task.id,attempt:claim.lease.attempt,
  fenceToken:claim.lease.fenceToken})).toHaveLength(1);
});
const realTest=process.platform==="darwin"&&process.env.CREATOROS_TEST_CFT_ROOT?it:it.skip;
async function startRealRustBridge(directory:string,profileRoot:string,label:string){
 const ready=join(directory,`${label}-ready`),done=join(directory,`${label}-done`);
 const projectRoot=resolve(import.meta.dirname,"../../..");
 const rust=spawn("cargo",["test","--manifest-path","frontend/src-tauri/Cargo.toml","--locked","--offline","--lib",
  "external_node_host_fixture","--","--ignored","--nocapture"],{
  cwd:projectRoot,env:{...process.env,TAURI_CONFIG:JSON.stringify({bundle:{resources:[],externalBin:[]}}),
   CREATOROS_BROWSER_E2E_NODE_PID:String(process.pid),CREATOROS_BROWSER_E2E_READY_FILE:ready,
   CREATOROS_BROWSER_E2E_DONE_FILE:done,CREATOROS_BROWSER_E2E_PROFILE_ROOT:profileRoot},
  stdio:["ignore","pipe","pipe"],
 });
 let output="",exited:number|null|undefined;
 rust.stdout.on("data",chunk=>{output+=String(chunk);});rust.stderr.on("data",chunk=>{output+=String(chunk);});
 const exit=new Promise<number|null>((resolveExit,rejectExit)=>{
  rust.once("exit",code=>{exited=code;resolveExit(code);});rust.once("error",rejectExit);
 });
 let socketPath:string|undefined;
 const deadline=Date.now()+90_000;
 while(Date.now()<deadline&&exited===undefined){
  try {socketPath=(await readFile(ready,"utf8")).trim();break;}catch{/* Rust fixture is compiling. */}
  await new Promise(resolve=>setTimeout(resolve,100));
 }
 if(!socketPath){rust.kill();throw new Error(`Rust browser fixture did not become ready: ${output}`);}
 return {socketPath,async finish(){
  await writeFile(done,"done");
  const code=await Promise.race([exit,new Promise<null>(resolveTimeout=>setTimeout(()=>resolveTimeout(null),15_000))]);
  if(code===null&&exited===undefined)rust.kill();
  expect(code,output).toBe(0);
 }};
}
realTest("Node/DB leases use the PID-bound Rust socket and real Chromium",async()=>{
 const directory=await mkdtemp(join(tmpdir(),"wb-browser-real-"));
 const ready=join(directory,"ready"),done=join(directory,"done"),profileRoot=join(directory,"profiles");
 const projectRoot=resolve(import.meta.dirname,"../../..");
 const rust=spawn("cargo",["test","--manifest-path","frontend/src-tauri/Cargo.toml","--locked","--offline","--lib",
  "external_node_host_fixture","--","--ignored","--nocapture"],{
  cwd:projectRoot,env:{...process.env,TAURI_CONFIG:JSON.stringify({bundle:{resources:[],externalBin:[]}}),
   CREATOROS_BROWSER_E2E_NODE_PID:String(process.pid),CREATOROS_BROWSER_E2E_READY_FILE:ready,
   CREATOROS_BROWSER_E2E_DONE_FILE:done,CREATOROS_BROWSER_E2E_PROFILE_ROOT:profileRoot},
  stdio:["ignore","pipe","pipe"],
 });
 let output="";rust.stdout.on("data",chunk=>{output+=String(chunk);});rust.stderr.on("data",chunk=>{output+=String(chunk);});
 let exited:number|null|undefined;
 const exit=new Promise<number|null>((resolveExit,rejectExit)=>{
  rust.once("exit",code=>{exited=code;resolveExit(code);});rust.once("error",rejectExit);
 });
 let closeDb:(()=>Promise<void>)|undefined;
 try {
  let socketPath:string|undefined;
  const deadline=Date.now()+90_000;
  while(Date.now()<deadline&&exited===undefined){
   try {socketPath=(await readFile(ready,"utf8")).trim();break;}catch{/* Rust fixture is compiling. */}
   await new Promise(resolve=>setTimeout(resolve,100));
  }
  if(!socketPath)throw new Error(`Rust browser fixture did not become ready: ${output}`);
  console.info("[browser-real] Rust socket ready");
  const opened=await createDb();const db:Db=opened.db;closeDb=()=>opened.client.close();
  console.info("[browser-real] DB connected");
  const tasks=createPersistentTaskService(db);
  const nonce=randomUUID();
  const task=await tasks.enqueue({userId:`browser-real-${nonce}`,accountId:`browser-account-${nonce}`,
   requestId:`browser-real-${nonce}`,source:"user"},{kind:"ai_task",ownerType:"ai_task",ownerId:nonce,
   idempotencyKey:nonce,payload:{}});
  const claim=(await tasks.claimTask({taskId:task.id,workerId:`browser-worker-${nonce}`}))!;
  console.info("[browser-real] task claimed");
  const host=createWorkbenchBrowserHost(db,{platform:"darwin",desktop:true,socketPath})!;
  expect(host.catalog.some(capability=>capability.name==="browser.open")).toBe(true);
  const context={userId:`browser-real-${nonce}`,accountId:`browser-account-${nonce}`,taskId:task.id,
   attempt:claim.lease.attempt,fenceToken:claim.lease.fenceToken,leaseId:`browser-worker-${nonce}`};
  const call=async(name:string,input:Record<string,unknown>)=>{
   const outcome=await host.dispatch({context:{...context,operationId:randomUUID()},
    invocation:{name,schemaVersion:1,input}},{signal:AbortSignal.timeout(45_000),onProgress:()=>{}});
   expect(outcome.status,JSON.stringify(outcome)).toBe("succeeded");
   if(outcome.status!=="succeeded")throw new Error(JSON.stringify(outcome));
   const text=outcome.content.find(part=>part.type==="text");
   if(!text)throw new Error("Browser result has no text payload");
   return JSON.parse(text.text) as Record<string,any>;
  };
  const open=await call("browser.open",{laneId:"research",mode:"anonymous",domain:"example.com"});
  console.info("[browser-real] lane opened");
  const laneId=open.lane.lane_id as string,browserEpoch=open.lane.browser_epoch as number;
  expect(laneId).toBeTruthy();expect(browserEpoch).toBeGreaterThan(0);
  await call("browser.navigate",{laneId,browserEpoch,url:"https://example.com"});
  console.info("[browser-real] page navigated");
  const extracted=await call("browser.extract",{laneId,browserEpoch});
  console.info("[browser-real] page extracted");
  expect(extracted.result.output.message).toContain("Example Domain");
  const closed=await call("browser.close",{laneId,browserEpoch});
  console.info("[browser-real] lane closed");
  expect(closed.stopProof.profileStopped).toBe(true);
  const leases=createExecutionBrowserProfileLeaseService(db);
  expect(await leases.listOwned({executionTaskId:task.id,attempt:claim.lease.attempt,
   fenceToken:claim.lease.fenceToken})).toEqual([]);
 }finally{
  console.info("[browser-real] fixture cleanup");
  if(closeDb)await closeDb();
  await writeFile(done,"done");
  const code=await Promise.race([exit,new Promise<null>(resolveTimeout=>setTimeout(()=>resolveTimeout(null),15_000))]);
  if(code===null&&exited===undefined)rust.kill();
  await rm(directory,{recursive:true,force:true});
 }
 expect(exited,output).toBe(0);
},180_000);

realTest("a restarted Rust host proves a stopped old DB lease before a new task opens the same profile",async()=>{
 const root=await mkdtemp(join(tmpdir(),"wb-browser-restart-"));
 const profileRoot=join(root,"profiles"),nonce=randomUUID();
 const userId=`browser-restart-${nonce}`,accountId=`browser-account-${nonce}`;
 const tasks=createPersistentTaskService(db),profiles=createExecutionBrowserProfileLeaseService(db);
 let bridge:Awaited<ReturnType<typeof startRealRustBridge>>|undefined;
 try {
  bridge=await startRealRustBridge(root,profileRoot,"first");
  const old=await tasks.enqueue({userId,accountId,requestId:`old-${nonce}`,source:"user"},
   {kind:"ai_task",ownerType:"ai_task",ownerId:`old-${nonce}`,idempotencyKey:`old-${nonce}`,payload:{}});
  const oldClaim=(await tasks.claimTask({taskId:old.id,workerId:`old-worker-${nonce}`}))!;
  const oldRef={executionTaskId:old.id,attempt:oldClaim.lease.attempt,fenceToken:oldClaim.lease.fenceToken};
  const location=await resolveManagedBrowserProfile(bridge.socketPath,{userId,accountId,taskId:old.id},
   "primary",AbortSignal.timeout(10_000));
  const retained=join(location.managedProfileRoot,"existing-state");
  await writeFile(retained,"kept across restart");
  const oldLease=await profiles.acquireProfile(oldRef,"example.com",location.profileKey);
  await db.update(executionTasks).set({status:"paused"}).where(eq(executionTasks.id,old.id));
  await bridge.finish();bridge=undefined;
  expect(await readFile(retained,"utf8")).toBe("kept across restart");

  bridge=await startRealRustBridge(root,profileRoot,"second");
  const next=await tasks.enqueue({userId,accountId,requestId:`next-${nonce}`,source:"user"},
   {kind:"ai_task",ownerType:"ai_task",ownerId:`next-${nonce}`,idempotencyKey:`next-${nonce}`,payload:{}});
  const nextClaim=(await tasks.claimTask({taskId:next.id,workerId:`next-worker-${nonce}`}))!;
  const host=createWorkbenchBrowserHost(db,{platform:"darwin",desktop:true,socketPath:bridge.socketPath})!;
  const context={userId,accountId,taskId:next.id,attempt:nextClaim.lease.attempt,
   fenceToken:nextClaim.lease.fenceToken,leaseId:`next-worker-${nonce}`};
  const dispatch=async(name:string,input:Record<string,unknown>)=>{
   const outcome=await host.dispatch({context:{...context,operationId:randomUUID()},
    invocation:{name,schemaVersion:1,input}},{signal:AbortSignal.timeout(45_000),onProgress:()=>{}});
   if(outcome.status!=="succeeded")throw new Error(JSON.stringify(outcome));
   const content=outcome.content.find(part=>part.type==="text");
   if(!content)throw new Error("Browser result has no text payload");
   return JSON.parse(content.text) as Record<string,any>;
  };
  const opened=await dispatch("browser.open",{laneId:"recovered",mode:"primary",domain:"example.com"});
  expect(await profiles.listOwned(oldRef)).toEqual([]);
  expect((await profiles.listOwned({executionTaskId:next.id,attempt:nextClaim.lease.attempt,
   fenceToken:nextClaim.lease.fenceToken}))[0]?.leaseId).not.toBe(oldLease.leaseId);
  expect(await readFile(retained,"utf8")).toBe("kept across restart");
  const closed=await dispatch("browser.close",{laneId:opened.lane.lane_id,
   browserEpoch:opened.lane.browser_epoch});
  expect(closed.stopProof.profileStopped).toBe(true);
  const newRef={executionTaskId:next.id,attempt:nextClaim.lease.attempt,
   fenceToken:nextClaim.lease.fenceToken};
  expect(await profiles.listOwned(newRef)).toEqual([]);
 }finally{
  if(bridge)await bridge.finish();
  await rm(root,{recursive:true,force:true});
 }
},180_000);

realTest("two accounts keep separate primary profiles and one cancellation leaves the other running",async()=>{
 const root=await mkdtemp(join(tmpdir(),"wb-browser-accounts-"));
 const profileRoot=join(root,"profiles"),nonce=randomUUID(),userId=`browser-accounts-${nonce}`;
 const tasks=createPersistentTaskService(db),profiles=createExecutionBrowserProfileLeaseService(db);
 let bridge:Awaited<ReturnType<typeof startRealRustBridge>>|undefined;
 try {
  bridge=await startRealRustBridge(root,profileRoot,"accounts");
  const host=createWorkbenchBrowserHost(db,{platform:"darwin",desktop:true,socketPath:bridge.socketPath})!;
  const scopes=await Promise.all(["first","second"].map(async label=>{
   const accountId=`${label}-${nonce}`;
   const task=await tasks.enqueue({userId,accountId,requestId:`${label}-${nonce}`,source:"user"},
    {kind:"ai_task",ownerType:"ai_task",ownerId:`${label}-${nonce}`,idempotencyKey:`${label}-${nonce}`,payload:{}});
   const workerId=`${label}-worker-${nonce}`;
   const claim=(await tasks.claimTask({taskId:task.id,workerId}))!;
   const context={userId,accountId,taskId:task.id,attempt:claim.lease.attempt,
    fenceToken:claim.lease.fenceToken,leaseId:workerId};
   const location=await resolveManagedBrowserProfile(bridge!.socketPath,
    {userId,accountId,taskId:task.id},"primary",AbortSignal.timeout(10_000));
   const ref={executionTaskId:task.id,attempt:claim.lease.attempt,fenceToken:claim.lease.fenceToken};
   return {label,context,location,ref};
  }));
  expect(scopes[0]!.location.profileKey).not.toBe(scopes[1]!.location.profileKey);
  expect(scopes[0]!.location.managedProfileRoot).not.toBe(scopes[1]!.location.managedProfileRoot);
  const dispatch=async(scope:typeof scopes[number],name:string,input:Record<string,unknown>)=>{
   const outcome=await host.dispatch({context:{...scope.context,operationId:randomUUID()},
    invocation:{name,schemaVersion:1,input}},{signal:AbortSignal.timeout(45_000),onProgress:()=>{}});
   if(outcome.status!=="succeeded")throw new Error(JSON.stringify(outcome));
   const content=outcome.content.find(part=>part.type==="text");
   if(!content)throw new Error("Browser result has no text payload");
   return JSON.parse(content.text) as Record<string,any>;
  };
  const opened=await Promise.all(scopes.map(scope=>dispatch(scope,"browser.open",
   {laneId:scope.label,mode:"primary",domain:"example.com"})));
  const first=scopes[0]!,second=scopes[1]!;
  const firstLane=opened[0]!.lane.lane_id as string;
  const secondLane=opened[1]!.lane.lane_id as string,secondEpoch=opened[1]!.lane.browser_epoch as number;
  expect(firstLane).not.toBe(secondLane);
  const [firstLease]=await profiles.listOwned(first.ref),[secondLease]=await profiles.listOwned(second.ref);
  expect(firstLease?.profileKey).toBe(first.location.profileKey);
  expect(secondLease?.profileKey).toBe(second.location.profileKey);
  const firstMarker=join(first.location.managedProfileRoot,"first-account-only");
  await writeFile(firstMarker,"private account state");
  await expect(readFile(join(second.location.managedProfileRoot,"first-account-only"),"utf8"))
   .rejects.toMatchObject({code:"ENOENT"});
  const foreign=await host.dispatch({context:{...first.context,operationId:randomUUID()},
   invocation:{name:"browser.status",schemaVersion:1,input:{laneId:secondLane}}},
   {signal:AbortSignal.timeout(10_000),onProgress:()=>{}});
  expect(foreign).toMatchObject({status:"failed",error:{code:"lane_not_found"}});
  await tasks.command({userId,accountId:first.context.accountId,requestId:`cancel-${nonce}`,source:"user"},
   {taskIds:[first.context.taskId],command:"cancel",idempotencyKey:`cancel-${nonce}`});
  await vi.waitFor(async()=>{
   await host.reconcileStoppedProfiles();
   expect(await profiles.listOwned(first.ref)).toEqual([]);
  },{timeout:20_000,interval:250});
  expect(await profiles.listOwned(first.ref)).toEqual([]);
  expect(await profiles.listOwned(second.ref)).toHaveLength(1);
  await dispatch(second,"browser.navigate",{laneId:secondLane,browserEpoch:secondEpoch,
   url:"https://example.com"});
  const extracted=await dispatch(second,"browser.extract",{laneId:secondLane,browserEpoch:secondEpoch});
  expect(extracted.result.output.message).toContain("Example Domain");
  expect(await readFile(firstMarker,"utf8")).toBe("private account state");
  await dispatch(second,"browser.close",{laneId:secondLane,browserEpoch:secondEpoch});
  expect(await profiles.listOwned(second.ref)).toEqual([]);
 }finally{
  if(bridge)await bridge.finish();
  await rm(root,{recursive:true,force:true});
 }
},180_000);
