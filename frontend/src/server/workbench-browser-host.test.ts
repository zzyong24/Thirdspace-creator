import {afterAll,afterEach,beforeAll,expect,it,vi} from "vitest";
import {createServer,type Server} from "node:net";
import {mkdtemp,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {createDb,type Db} from "@creatoros/backend";
import {createPersistentTaskService,createExecutionBrowserProfileLeaseService} from "@creatoros/backend/modules/execution";
import {createWorkbenchBrowserHost} from "./workbench-browser-host";

vi.mock("server-only",()=>({}));
let db:Db,close:()=>Promise<void>,server:Server|undefined,directory:string|undefined;
beforeAll(async()=>{const opened=await createDb();db=opened.db;close=()=>opened.client.close();});
afterAll(async()=>close?.());
afterEach(async()=>{if(server)await new Promise<void>(resolve=>server!.close(()=>resolve()));if(directory)await rm(directory,{recursive:true,force:true});server=undefined;directory=undefined;});

async function socket(received:Array<Record<string,unknown>>){
 directory=await mkdtemp(join(tmpdir(),"wb-browser-host-"));const path=join(directory,"browser.sock");
 server=createServer(connection=>{
  let body="";connection.on("data",chunk=>{
   body+=chunk.toString();const end=body.indexOf("\n");if(end<0)return;
   const request=JSON.parse(body.slice(0,end)) as Record<string,unknown>;received.push(request);
   const action=request.action as {kind:string};
   const value=action.kind==="profile_location"
    ? {profileKey:"a".repeat(64),managedProfileRoot:"/app-data/workbench/profile",identityMode:"primary",legacyIdentityImported:false,primaryLoginState:"unverified"}
    : action.kind==="open"?{lane:{lane_id:"native-lane",browser_epoch:1}}
    : action.kind==="close"?{close:{},stopProof:{profileStopped:true}}
    : action.kind==="stop_proof"?{profileStopped:true,profileKey:"a".repeat(64),
      profileLeaseId:(request.admission as {profileLeaseId:string}).profileLeaseId}
    : {laneId:"native-lane",browserEpoch:1,result:{ok:true}};
   connection.end(`${JSON.stringify({ok:true,operationId:request.operationId,value})}\n`);
  });
 });
 await new Promise<void>((resolve,reject)=>server!.listen(path,resolve).once("error",reject));return path;
}

it("only a desktop Mac with private socket advertises browser tools",()=>{
 expect(createWorkbenchBrowserHost(db,{platform:"win32",desktop:true,socketPath:"pipe"})).toBeUndefined();
 expect(createWorkbenchBrowserHost(db,{platform:"darwin",desktop:false,socketPath:"pipe"})).toBeUndefined();
 expect(createWorkbenchBrowserHost(db,{platform:"darwin",desktop:true,socketPath:""})).toBeUndefined();
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
});
