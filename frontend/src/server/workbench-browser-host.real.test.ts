import {expect,it,vi} from "vitest";
import {spawn} from "node:child_process";
import {randomUUID} from "node:crypto";
import {mkdtemp,readFile,rm,writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join,resolve} from "node:path";
import {createDb,type Db} from "@creatoros/backend";
import {createPersistentTaskService,createExecutionBrowserProfileLeaseService} from "@creatoros/backend/modules/execution";
import {createWorkbenchBrowserHost} from "./workbench-browser-host";

vi.mock("server-only",()=>({}));

const realTest=process.platform==="darwin"&&process.env.CREATOROS_TEST_CFT_ROOT?it:it.skip;
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
