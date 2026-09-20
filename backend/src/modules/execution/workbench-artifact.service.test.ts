import {afterAll,beforeAll,expect,it} from "vitest";
import {randomUUID} from "node:crypto";
import {createDb,type Db} from "@creatoros/backend";
import {createPersistentTaskService} from "./persistent-task.service";
import {createWorkbenchArtifactService,createWorkbenchArtifactReadService} from "./workbench-artifact.service";

let db:Db,close:()=>Promise<void>;
beforeAll(async()=>{const opened=await createDb();db=opened.db;close=()=>opened.client.close();});
afterAll(async()=>close?.());

async function setup(){
 const nonce=randomUUID(),userId=`artifact-user-${nonce}`,accountId=`artifact-account-${nonce}`;
 const tasks=createPersistentTaskService(db);
 const task=await tasks.enqueue({userId,accountId,requestId:nonce,source:"user"},
  {kind:"ai_task",ownerType:"ai_task",ownerId:nonce,idempotencyKey:nonce,payload:{}});
 const claim=(await tasks.claimTask({taskId:task.id,workerId:`artifact-worker-${nonce}`}))!;
 const ref={executionTaskId:task.id,attempt:claim.lease.attempt,fenceToken:claim.lease.fenceToken};
 const ctx={userId,accountId,requestId:nonce,source:"user" as const};
 const files=new Map<string,{bytes:Uint8Array;version:number}>();
 const objects=new Map<string,Uint8Array>();let writes=0,failStoredReads=0;
 const service=createWorkbenchArtifactService(db,{
  async readTaskFile(scope,path){
   expect(scope).toMatchObject({userId,accountId,taskId:task.id,ref});
   const entry=files.get(path);if(!entry)throw new Error("FILE_NOT_FOUND");
   return {bytes:new Uint8Array(entry.bytes),version:entry.version};
  },
  blobs:{
   async submit(_ctx,input){
    writes++;
    const {createHash}=await import("node:crypto");
    const hash=createHash("sha256").update(input.bytes).digest("hex");
    objects.set(`${input.taskId}:${input.operationId}:${hash}`,new Uint8Array(input.bytes));
    return {hash,size:input.bytes.byteLength};
   },
   async read(_ctx,input){
    const bytes=objects.get(`${input.taskId}:${input.operationId}:${input.hash}`);
    if(bytes&&failStoredReads>0){failStoredReads--;throw new Error("TRANSIENT_BLOB_READ_FAILURE");}
    if(!bytes)throw new Error("BLOB_NOT_FOUND");return new Uint8Array(bytes);
   },
  },
 });
 return {task,ref,ctx,files,objects,service,getWrites:()=>writes,failNextStoredRead:()=>{failStoredReads++;}};
}

it("把真实任务文件登记为不可变版本，修改原文件后仍能读回旧版并核对计划引用",async()=>{
 const scope=await setup();
 scope.files.set("报告/分析.html",{bytes:Buffer.from("<h1>真实数据：0</h1>"),version:1});
 const first=await scope.service.register(scope.ref,"register-html-1",{
  path:"报告/分析.html",mime:"text/html"});
 expect(first).toMatchObject({version:1,mime:"text/html",taskId:scope.task.id,
  relativePath:"报告/分析.html",provenance:[]});
 expect(first.hash).toMatch(/^[a-f0-9]{64}$/);
 expect(await scope.service.verifyArtifacts({userId:scope.ctx.userId,accountId:scope.ctx.accountId,
  taskId:scope.task.id},[`${first.artifactId}@1`])).toBe(true);
 scope.files.set("报告/分析.html",{bytes:Buffer.from("<h1>已修改：1</h1>"),version:2});
 const second=await scope.service.register(scope.ref,"register-html-2",{
  path:"报告/分析.html",mime:"text/html",artifactId:first.artifactId,expectedVersion:1});
 expect(second).toMatchObject({artifactId:first.artifactId,version:2});
 expect(second.hash).not.toBe(first.hash);
 const old=await scope.service.read(scope.ctx,scope.task.id,first.artifactId,1,0,128_000);
 const current=await scope.service.read(scope.ctx,scope.task.id,first.artifactId,2,0,128_000);
 expect(Buffer.from(old.bytes).toString()).toBe("<h1>真实数据：0</h1>");
 expect(Buffer.from(current.bytes).toString()).toBe("<h1>已修改：1</h1>");
 expect(old.metadata.hash).toBe(first.hash);
 expect(current.metadata.hash).toBe(second.hash);
});

it("同一操作键重试只返回已登记版本；旧版本冲突和跨账号读取被拒",async()=>{
 const scope=await setup();
 scope.files.set("report.md",{bytes:Buffer.from("第一版"),version:1});
 const first=await scope.service.register(scope.ref,"same-operation",{path:"report.md",mime:"text/markdown"});
 scope.files.set("report.md",{bytes:Buffer.from("工作文件已变化"),version:2});
 expect(await scope.service.register(scope.ref,"same-operation",{path:"report.md",mime:"text/markdown"})).toEqual(first);
 expect(scope.getWrites()).toBe(1);
 await expect(scope.service.register(scope.ref,"next-operation",{
  path:"report.md",mime:"text/markdown",artifactId:first.artifactId,expectedVersion:0}))
  .rejects.toThrow();
 await expect(scope.service.read({...scope.ctx,accountId:"other-account"},scope.task.id,first.artifactId,1,0,10))
  .rejects.toThrow();
 expect(await scope.service.verifyArtifacts({userId:scope.ctx.userId,accountId:"other-account",
  taskId:scope.task.id},[`${first.artifactId}@1`])).toBe(false);
});

it("对象字节丢失时不能把历史元数据当作已验收产物",async()=>{
 const scope=await setup();
 scope.files.set("data.csv",{bytes:Buffer.from("count\n0\n"),version:1});
 const item=await scope.service.register(scope.ref,"register-csv",{path:"data.csv",mime:"text/csv"});
 scope.objects.clear();
 expect(await scope.service.verifyArtifacts({userId:scope.ctx.userId,accountId:scope.ctx.accountId,
  taskId:scope.task.id},[`${item.artifactId}@1`])).toBe(false);
 await expect(scope.service.read(scope.ctx,scope.task.id,item.artifactId,1,0,100)).rejects.toThrow();
});

it("拒绝模型自造的产物 ID 与来源引用",async()=>{
 const scope=await setup();
 scope.files.set("report.html",{bytes:Buffer.from("<p>事实</p>"),version:1});
 await expect(scope.service.register(scope.ref,"made-up-artifact",{
  path:"report.html",mime:"text/html",artifactId:"forged-artifact",expectedVersion:0})).rejects.toThrow();
 await expect(scope.service.register(scope.ref,"made-up-source",{
  path:"report.html",mime:"text/html",provenance:["forged-call"]})).rejects.toThrow();
 expect(scope.getWrites()).toBe(0);
});

it("只读交付端口可回读已登记版本，无需装配任务文件宿主",async()=>{
 const scope=await setup();
 scope.files.set("report.html",{bytes:Buffer.from("<h1>已保存</h1>"),version:1});
 const saved=await scope.service.register(scope.ref,"readonly-report",{path:"report.html",mime:"text/html"});
 const readOnly=createWorkbenchArtifactReadService(db,{
  blobs:{
   async submit(){throw new Error("READ_ONLY");},
   async read(_ctx,input){const bytes=scope.objects.get(`${input.taskId}:${input.operationId}:${input.hash}`);
    if(!bytes)throw new Error("MISSING_BLOB");return bytes;},
  },
 });
 const page=await readOnly.read(scope.ctx,scope.task.id,saved.artifactId,1,0,100);
 expect(Buffer.from(page.bytes).toString()).toBe("<h1>已保存</h1>");
});

it("登记中断后按原操作摘要恢复，工作文件变化不冒充旧回执",async()=>{
 const scope=await setup();
 const original=Buffer.from("<h1>原报告：0</h1>");
 scope.files.set("report.html",{bytes:original,version:1});
 scope.failNextStoredRead();
 await expect(scope.service.register(scope.ref,"interrupted-register",{path:"report.html",mime:"text/html"}))
  .rejects.toThrow("TRANSIENT_BLOB_READ_FAILURE");
 expect(scope.getWrites()).toBe(1);
 scope.files.set("report.html",{bytes:Buffer.from("<h1>新报告：1</h1>"),version:2});
 const recovered=await scope.service.register(scope.ref,"interrupted-register",{path:"report.html",mime:"text/html"});
 expect(recovered.version).toBe(1);
 expect(scope.getWrites()).toBe(1);
 const page=await scope.service.read(scope.ctx,scope.task.id,recovered.artifactId,1,0,100);
 expect(Buffer.from(page.bytes)).toEqual(original);
});
