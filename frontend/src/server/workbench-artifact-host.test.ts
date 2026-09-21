import {afterAll,beforeAll,expect,it,vi} from "vitest";
import {createHash,randomUUID} from "node:crypto";
import {createDb,type Db} from "@creatoros/backend";
import {createPersistentTaskService,type WorkbenchArtifactBlobPort} from "@creatoros/backend/modules/execution";
import type {NativeFileAction} from "./workbench-native-client";
import {createWorkbenchArtifactHost} from "./workbench-artifact-host";

vi.mock("server-only",()=>({}));
let db:Db,close:()=>Promise<void>;
beforeAll(async()=>{const opened=await createDb();db=opened.db;close=()=>opened.client.close();});
afterAll(async()=>close?.());

it.each(["darwin","win32"] as const)("%s 私有宿主把真实任务文件登记为可回读的 HTML 版本，不向模型泄露存储键",async platform=>{
 const nonce=randomUUID(),userId=`artifact-user-${nonce}`,accountId=`artifact-account-${nonce}`;
 const tasks=createPersistentTaskService(db);
 const task=await tasks.enqueue({userId,accountId,requestId:nonce,source:"user"},
  {kind:"ai_task",ownerType:"ai_task",ownerId:nonce,idempotencyKey:nonce,payload:{}});
 const workerId=`artifact-worker-${nonce}`;
 const claim=(await tasks.claimTask({taskId:task.id,workerId}))!;
 const bytes=Buffer.from("<!doctype html><h1>真实值：0</h1>");
 const key=(operationId:string,hash:string)=>`${task.id}:${operationId}:${hash}`;
 const objects=new Map<string,Uint8Array>();
 const blobs:WorkbenchArtifactBlobPort={
  async submit(_ctx,input){const hash=createHash("sha256").update(input.bytes).digest("hex");
   objects.set(key(input.operationId,hash),new Uint8Array(input.bytes));return {hash,size:input.bytes.byteLength};},
  async read(_ctx,input){const value=objects.get(key(input.operationId,input.hash));
   if(!value)throw new Error("MISSING_BLOB");return new Uint8Array(value);},
 };
 const filePort=vi.fn(async (_ref:unknown,_operationId:string,action:NativeFileAction)=>{
  if(action.kind==="stat")return {isDirectory:false,size:bytes.byteLength,version:1};
  if(action.kind==="read")return {contentBase64:bytes.subarray(action.offset,action.offset+action.limit).toString("base64"),
   total:bytes.byteLength,version:1};
  throw new Error("unexpected native action");
 });
 const host=createWorkbenchArtifactHost(db,{platform,desktop:true,socketPath:platform==="win32"?"\\\\.\\pipe\\creatoros-test":"private.sock",blobs,filePort})!;
 expect(host.platform).toBe(platform==="win32"?"windows":"macos");
 expect(host.catalog.map(tool=>tool.name)).toEqual(["artifact.register","artifact.read","artifact.versions","artifact.copy"]);
 const context={userId,accountId,taskId:task.id,attempt:claim.lease.attempt,
  fenceToken:claim.lease.fenceToken,leaseId:workerId};
 const dispatch=(name:string,input:Record<string,unknown>)=>host.dispatch({context:{...context,operationId:randomUUID()},
  invocation:{name,schemaVersion:1,input}},{signal:new AbortController().signal,onProgress:()=>{}});
 const registered=await dispatch("artifact.register",{path:"报告/分析.html",mime:"text/html"});
 expect(registered.status).toBe("succeeded");
 if(registered.status!=="succeeded")throw new Error(JSON.stringify(registered));
 expect(registered.artifactRefs).toHaveLength(1);
 const text=registered.content.find(part=>part.type==="text");if(!text)throw new Error("missing artifact metadata");
 const metadata=JSON.parse(text.text) as {artifactId:string;version:number;hash:string;relativePath:string};
 expect(metadata).toMatchObject({version:1,relativePath:"报告/分析.html",hash:createHash("sha256").update(bytes).digest("hex")});
 expect(text.text).not.toContain("storageKey");
 const read=await dispatch("artifact.read",{artifactId:metadata.artifactId,version:1,offset:0,limit:128_000});
 expect(read.status).toBe("succeeded");
 if(read.status!=="succeeded")throw new Error(JSON.stringify(read));
 const body=read.content.find(part=>part.type==="text");if(!body)throw new Error("missing artifact bytes");
 expect(JSON.parse(body.text)).toMatchObject({mime:"text/html",text:bytes.toString(),hash:metadata.hash});
 expect(filePort).toHaveBeenCalledWith({executionTaskId:task.id,attempt:claim.lease.attempt,
  fenceToken:claim.lease.fenceToken},expect.any(String),expect.objectContaining({kind:"read",path:"报告/分析.html"}));
 const foreign=await host.dispatch({context:{...context,accountId:"other-account",operationId:randomUUID()},
  invocation:{name:"artifact.register",schemaVersion:1,input:{path:"报告/分析.html",mime:"text/html"}}},
  {signal:new AbortController().signal,onProgress:()=>{}});
 expect(foreign.status).toBe("failed");
 let stats=0;
 filePort.mockImplementation(async (_ref:unknown,_operationId:string,action:NativeFileAction)=>{
  if(action.kind==="stat")return {isDirectory:false,size:bytes.byteLength,version:++stats};
  if(action.kind==="read")return {contentBase64:bytes.toString("base64"),total:bytes.byteLength,version:1};
  throw new Error("unexpected native action");
 });
 const changed=await dispatch("artifact.register",{path:"报告/分析.html",mime:"text/html"});
 expect(changed.status).not.toBe("succeeded");
 expect(objects.size).toBe(1);
});
