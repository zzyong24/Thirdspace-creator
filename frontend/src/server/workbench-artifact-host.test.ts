import {afterAll,beforeAll,expect,it,vi} from "vitest";
import {createHash,randomUUID} from "node:crypto";
import {createDb,type Db} from "@creatoros/backend";
import {createPersistentTaskService,type WorkbenchArtifactBlobPort} from "@creatoros/backend/modules/execution";
import {workbenchArtifactSchema} from "@creatoros/contract/agent-workbench";
import {workbenchToolOutcome} from "@creatoros/contract/execution-worker";
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
 expect(workbenchArtifactSchema.safeParse(metadata).success).toBe(true);
 expect(text.text).toBe(JSON.stringify(workbenchArtifactSchema.parse(metadata)));
 expect(registered.content).toHaveLength(2);
 const diagnosticText=registered.content[1];if(diagnosticText.type!=="text")throw new Error("missing diagnostics");
 const rendering=JSON.parse(diagnosticText.text);
 expect(Object.keys(rendering).sort()).toEqual(["diagnostics","rendererPolicy"]);
 const outcome=workbenchToolOutcome(registered,host.catalog.find(item=>item.name==="artifact.register")!);
 expect(outcome.summary).toBe(text.text);
 expect(outcome.data).toMatchObject({workbench:{content:registered.content}});
 expect(rendering).toMatchObject({rendererPolicy:"static-offline-v1",diagnostics:{status:"analyzed",sourceHash:metadata.hash,
  scriptCount:0,externalResourceCount:0,degraded:false}});
 const read=await dispatch("artifact.read",{artifactId:metadata.artifactId,version:1,offset:0,limit:128_000});
 expect(read.status).toBe("succeeded");
 if(read.status!=="succeeded")throw new Error(JSON.stringify(read));
 const body=read.content.find(part=>part.type==="text");if(!body)throw new Error("missing artifact bytes");
 expect(JSON.parse(body.text)).toMatchObject({mime:"text/html",text:bytes.toString(),hash:metadata.hash});
 expect(filePort).toHaveBeenCalledWith({executionTaskId:task.id,attempt:claim.lease.attempt,
  fenceToken:claim.lease.fenceToken},expect.any(String),expect.objectContaining({kind:"read",path:"报告/分析.html"}),{signal:expect.any(AbortSignal)});
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

it('并发任务同路径、重放与下一版本诊断均绑定原 hash；诊断回读失败仍保留登记成功',async()=>{
 const tasks=createPersistentTaskService(db),nonce=randomUUID();
 const sources=new Map<string,Buffer>(),objects=new Map<string,Uint8Array>();
 const key=(taskId:string,operationId:string,hash:string)=>JSON.stringify([taskId,operationId,hash]);
 const storedReads=new Map<string,number>();let unavailableOperation='';
 const blobs:WorkbenchArtifactBlobPort={
  async submit(_ctx,input){const hash=createHash('sha256').update(input.bytes).digest('hex');
   objects.set(key(input.taskId,input.operationId,hash),new Uint8Array(input.bytes));return {hash,size:input.bytes.length};},
  async read(_ctx,input){
   const value=objects.get(key(input.taskId,input.operationId,input.hash));if(!value)throw new Error('MISSING');
   const count=(storedReads.get(input.operationId)??0)+1;storedReads.set(input.operationId,count);
   // 存储首次验真成功；登记完成后的附加诊断读失败，不改变存储字节。
   if(input.operationId===unavailableOperation&&count===2)throw new Error('DIAGNOSTIC_READ_UNAVAILABLE');
   return new Uint8Array(value);
  },
 };
 const filePort=vi.fn(async(ref:{executionTaskId:string},_id:string,action:NativeFileAction)=>{
  const bytes=sources.get(ref.executionTaskId)!;
  if(action.kind==='stat')return {isDirectory:false,size:bytes.length,version:1};
  if(action.kind==='read')return {contentBase64:bytes.subarray(action.offset,action.offset+action.limit).toString('base64'),total:bytes.length,version:1};
  throw new Error('unexpected action');
 });
 const host=createWorkbenchArtifactHost(db,{platform:'darwin',desktop:true,socketPath:'private.sock',blobs,filePort})!;
 const contexts:Array<{userId:string;accountId:string;taskId:string;attempt:number;fenceToken:string;leaseId:string}>=[];
 for(let i=0;i<2;i++){
  const userId=`diagnostics-user-${nonce}-${i}`,accountId=`diagnostics-account-${nonce}-${i}`,workerId=`worker-${nonce}-${i}`;
  const task=await tasks.enqueue({userId,accountId,requestId:nonce,source:'user'},{kind:'ai_task',ownerType:'ai_task',ownerId:`${nonce}-${i}`,idempotencyKey:`${nonce}-${i}`,payload:{}});
  const claim=(await tasks.claimTask({taskId:task.id,workerId}))!;
  contexts.push({userId,accountId,taskId:task.id,attempt:claim.lease.attempt,fenceToken:claim.lease.fenceToken,leaseId:workerId});
 }
 const old=Buffer.from('<p>原版数据 42</p><script src="https://cdn.test/chart.js"></script><script>document.body.remove()</script>');
 sources.set(contexts[0].taskId,old);sources.set(contexts[1].taskId,Buffer.from('<svg></svg><table><tr><td>0</td></tr></table>'));
 const register=async(index:number,operationId:string,extra:Record<string,unknown>={})=>{
  const result=await host.dispatch({context:{...contexts[index],operationId},invocation:{name:'artifact.register',schemaVersion:1,input:{path:'same/report.html',mime:'text/html',...extra}}},{signal:new AbortController().signal,onProgress:()=>{}});
  expect(result.status).toBe('succeeded');if(result.status!=='succeeded')throw new Error(JSON.stringify(result));
  expect(result.content).toHaveLength(2);
  const [text,diagnosticText]=result.content;
  if(text?.type!=='text'||diagnosticText?.type!=='text')throw new Error('missing receipt');
  const metadata=workbenchArtifactSchema.parse(JSON.parse(text.text)),rendering=JSON.parse(diagnosticText.text);
  expect(rendering.diagnostics.sourceHash).toBe(metadata.hash);
  return {...metadata,...rendering};
 };
 const operationId=randomUUID();
 const [first,other]=await Promise.all([register(0,operationId),register(1,randomUUID())]);
 expect(first.diagnostics).toMatchObject({sourceHash:createHash('sha256').update(old).digest('hex'),scriptCount:2,externalResourceCount:1,degraded:true});
 expect(first.diagnostics.repairAdvice.join('')).toMatch(/保留原版[\s\S]*下一版本[\s\S]*验证[\s\S]*不能仅回复登记成功/);
 expect(other.diagnostics).toMatchObject({sourceHash:other.hash,scriptCount:0,staticSvgCount:1,staticTableCount:1,degraded:false});
 sources.set(contexts[0].taskId,Buffer.from('<p>新版数据 42</p><svg></svg>'));
 const replay=await register(0,operationId);
 expect(replay).toEqual(first);
 const next=await register(0,randomUUID(),{artifactId:first.artifactId,expectedVersion:1,baseArtifactRef:{artifactId:first.artifactId,version:1}});
 expect(next).toMatchObject({version:2,diagnostics:{sourceHash:next.hash,scriptCount:0,degraded:false}});
 expect(next.hash).not.toBe(first.hash);
 unavailableOperation=randomUUID();
 const unavailable=await register(1,unavailableOperation);
 expect(unavailable.diagnostics).toMatchObject({status:'unavailable',sourceHash:unavailable.hash});
 const read=await host.dispatch({context:{...contexts[1],operationId:randomUUID()},invocation:{name:'artifact.read',schemaVersion:1,input:{artifactId:unavailable.artifactId,version:1}}},{signal:new AbortController().signal,onProgress:()=>{}});
 expect(read.status).toBe('succeeded');
});


it("T1250 同宿主两dispatch取消隔离：原signal贯穿文件页，取消任务不登记Blob",async()=>{
 const nonce=randomUUID(),tasks=createPersistentTaskService(db),contexts: Array<{userId:string;accountId:string;taskId:string;attempt:number;fenceToken:string;leaseId:string}>=[];
 for(let index=0;index<2;index++){
  const userId=`cancel-user-${nonce}-${index}`,accountId=`cancel-account-${nonce}-${index}`,workerId=`cancel-worker-${nonce}-${index}`;
  const task=await tasks.enqueue({userId,accountId,requestId:nonce,source:"user"},{kind:"ai_task",ownerType:"ai_task",ownerId:`${nonce}-${index}`,idempotencyKey:`${nonce}-${index}`,payload:{}});
  const claim=(await tasks.claimTask({taskId:task.id,workerId}))!;
  contexts.push({userId,accountId,taskId:task.id,attempt:claim.lease.attempt,fenceToken:claim.lease.fenceToken,leaseId:workerId});
 }
 const controllers=[new AbortController(),new AbortController()],bytes=Buffer.from("<h1>原文件真实字节</h1>");
 let release!:()=>void,entered!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;}),bothEntered=new Promise<void>(resolve=>{entered=resolve;});let stats=0;
 const observations:Array<{taskId:string;kind:string;signal:AbortSignal|undefined}>=[],objects=new Map<string,Uint8Array>();
 const blobs:WorkbenchArtifactBlobPort={async submit(_ctx,input){const hash=createHash("sha256").update(input.bytes).digest("hex");objects.set(input.taskId,input.bytes);return {hash,size:input.bytes.length};},async read(_ctx,input){return objects.get(input.taskId)!;}};
 const filePort=async(ref:{executionTaskId:string},_operationId:string,action:NativeFileAction,control?:{signal?:AbortSignal})=>{
  observations.push({taskId:ref.executionTaskId,kind:action.kind,signal:control?.signal});
  if(action.kind==="stat"){if(++stats<=2){if(stats===2)entered();await gate;}return {isDirectory:false,size:bytes.length,version:1};}
  if(action.kind==="read")return {contentBase64:bytes.subarray(action.offset,action.offset+action.limit).toString("base64"),total:bytes.length,version:1};
  throw Error("unexpected action");
 };
 const host=createWorkbenchArtifactHost(db,{platform:"darwin",desktop:true,socketPath:"private.sock",blobs,filePort})!;
 const pending=contexts.map((context,index)=>host.dispatch({context:{...context,operationId:randomUUID()},invocation:{name:"artifact.register",schemaVersion:1,input:{path:"report.html",mime:"text/html"}}},{signal:controllers[index].signal,onProgress:()=>{}}));
 // 先安装两条结果观察，避免故意取消的拒绝成为未处理Promise。
 const settled=Promise.allSettled(pending);
 await bothEntered;controllers[0].abort(Error("owned dispatch cancelled"));release();
 const results=await settled;
 expect(results[0].status).toBe("rejected");expect(results[1]).toMatchObject({status:"fulfilled",value:{status:"succeeded"}});
 expect(observations.filter(row=>row.taskId===contexts[0].taskId)).toEqual([{taskId:contexts[0].taskId,kind:"stat",signal:controllers[0].signal}]);
 expect(observations.filter(row=>row.taskId===contexts[1].taskId).map(row=>[row.kind,row.signal])).toEqual([["stat",controllers[1].signal],["read",controllers[1].signal],["stat",controllers[1].signal]]);
 expect(objects.has(contexts[0].taskId)).toBe(false);expect(Buffer.from(objects.get(contexts[1].taskId)!)).toEqual(bytes);
},1800000);
