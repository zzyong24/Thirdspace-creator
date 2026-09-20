import {afterAll,afterEach,beforeAll,beforeEach,expect,it} from "vitest";
import {mkdtemp,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {createDb,executionCalls,executionTasks,eq,type Db} from "@creatoros/backend";
import {createLocalFsObjectStorage,createWorkbenchBlobService} from "../assets";
import {createPersistentTaskService} from "./persistent-task.service";
import {createWorkbenchScreenshotMediaService} from "./workbench-screenshot-media.service";

const png=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4AWP4z8DwHwAFAAH/e+m+7wAAAABJRU5ErkJggg==","base64");
let db:Db,close:()=>Promise<void>;
let directory:string;
beforeAll(async()=>{const opened=await createDb();db=opened.db;close=()=>opened.client.close();});
afterAll(async()=>close());
beforeEach(async()=>{directory=await mkdtemp(join(tmpdir(),"t1008-media-"));});
afterEach(async()=>{await rm(directory,{recursive:true,force:true});});
const blobs=()=>createWorkbenchBlobService(async()=>createLocalFsObjectStorage({rootPath:directory,publicBaseUrl:"/blob"},{nextKey:()=>{throw Error("unexpected key");}}));

it("仅当前账号任务租约可登记并解析已结算截图，重建服务后仍可回读",async()=>{
 const service=createWorkbenchScreenshotMediaService(db,{blobs:blobs()});
 const tasks=createPersistentTaskService(db);
 const make=async(userId:string,accountId:string,key:string)=>{
  const task=await tasks.enqueue({userId,accountId,requestId:key,source:"user"},{kind:"ai_task",ownerType:"ai_task",ownerId:key,idempotencyKey:key,payload:{}});
  const claim=(await tasks.claimTask({taskId:task.id,workerId:`worker-${key}`}))!;
  return {task,ref:{executionTaskId:task.id,attempt:claim.lease.attempt,fenceToken:claim.lease.fenceToken}};
 };
 const first=await make("media-user-a","media-account-a","media-a");
 const second=await make("media-user-b","media-account-b","media-b");
 const dataRef=await service.submit(first.ref,"screenshot-call",png);
 expect(dataRef).toMatch(/^wm1-[a-f0-9]{64}$/);
 await expect(service.resolve(first.ref,{callId:"screenshot-call",dataRef})).rejects.toThrow();
 await db.insert(executionCalls).values({id:"screenshot-call",executionTaskId:first.task.id,sequence:1,operationKey:"screenshot-call",kind:"tool",inputDigest:"digest",status:"settled",reservedTokens:0,resultText:JSON.stringify({schemaVersion:1,kind:"tool",toolCallId:"model-tool",toolName:"browser_screenshot",output:{status:"ok",summary:"截图",evidence:[],data:{workbench:{operationId:"screenshot-call",status:"succeeded",artifactRefs:[],progressCursor:null,content:[{type:"image",mediaType:"image/png",dataRef}]}},error:null,continuation:null,sideEffect:"none"}}),createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()});
 expect(await createWorkbenchScreenshotMediaService(db,{blobs:blobs()}).resolve(first.ref,{callId:"screenshot-call",dataRef})).toEqual({mimeType:"image/png",data:png.toString("base64")});
 await expect(service.resolve(first.ref,{callId:"another-call",dataRef})).rejects.toThrow();
 await expect(service.resolve(first.ref,{callId:"screenshot-call",dataRef:"wm1-"+"b".repeat(64)})).rejects.toThrow();
 const [stored]=await db.select({resultText:executionCalls.resultText}).from(executionCalls).where(eq(executionCalls.id,"screenshot-call"));
 const altered=JSON.parse(stored!.resultText!);altered.toolName="browser_open";
 await db.update(executionCalls).set({resultText:JSON.stringify(altered)}).where(eq(executionCalls.id,"screenshot-call"));
 await expect(service.resolve(first.ref,{callId:"screenshot-call",dataRef})).rejects.toThrow();
 await db.update(executionCalls).set({resultText:stored!.resultText}).where(eq(executionCalls.id,"screenshot-call"));
 await expect(service.resolve(second.ref,{callId:"screenshot-call",dataRef})).rejects.toThrow();
 await expect(service.submit(second.ref,"screenshot-call",png)).resolves.toBe(dataRef);
 await db.update(executionTasks).set({status:"cancelled"}).where(eq(executionTasks.id,first.task.id));
 await expect(service.resolve(first.ref,{callId:"screenshot-call",dataRef})).rejects.toThrow();
});

it("拒绝损坏、伪 MIME 与过大的图片字节",async()=>{
 const service=createWorkbenchScreenshotMediaService(db,{blobs:blobs()});
 const tasks=createPersistentTaskService(db),task=await tasks.enqueue({userId:"media-bad",accountId:"media-bad",requestId:"media-bad",source:"user"},{kind:"ai_task",ownerType:"ai_task",ownerId:"media-bad",idempotencyKey:"media-bad",payload:{}});
 const claim=(await tasks.claimTask({taskId:task.id,workerId:"media-bad-worker"}))!;
 const ref={executionTaskId:task.id,attempt:claim.lease.attempt,fenceToken:claim.lease.fenceToken};
 await expect(service.submit(ref,"bad",Buffer.from("not png"))).rejects.toThrow();
 await expect(service.submit(ref,"large",Buffer.alloc(2*1024*1024+1))).rejects.toThrow();
 await expect(service.resolve(ref,{callId:"bad",dataRef:"image/jpeg"})).rejects.toThrow();
});
