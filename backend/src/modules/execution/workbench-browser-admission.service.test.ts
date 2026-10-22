import {afterAll,beforeAll,expect,it,vi} from "vitest";
import {createDb,executionTasks,eq,type Db} from "@creatoros/backend";
import {createPersistentTaskService} from "./persistent-task.service";
import {createExecutionBrowserProfileLeaseService} from "./execution-browser-profile-lease.service";
import {createWorkbenchBrowserAdmissionService} from "./workbench-browser-admission.service";
import {createHostBrowserProfileLifecycle} from "./host-browser-profile-lifecycle";

const stamp="2026-09-20T00:00:00.000Z",now=()=>stamp;
let db:Db,close:()=>Promise<void>;
beforeAll(async()=>{const opened=await createDb();db=opened.db;close=()=>opened.client.close();});
afterAll(async()=>close?.());

async function owner(id:string,userId="browser-user",accountId="browser-account"){
 const tasks=createPersistentTaskService(db,{now});
 const task=await tasks.enqueue({userId,accountId,requestId:id,source:"user"},{kind:"ai_task",ownerType:"ai_task",ownerId:id,idempotencyKey:id,payload:{}});
 const claimed=(await tasks.claimTask({taskId:task.id,workerId:"browser-worker"}))!;
 return {task,ref:{executionTaskId:task.id,attempt:claimed.lease.attempt,fenceToken:claimed.lease.fenceToken}};
}

it("可信解析器按当前账号绑定物理 profile；模型不能自报账号或目录摘要",async()=>{
 const one=await owner("wb-open-one","wb-user","wb-account-a");
 const seen:string[]=[];
 const admission=createWorkbenchBrowserAdmissionService(db,{now,resolveProfile:async(context,request,ref)=>{
  expect(ref).toEqual(one.ref);
  seen.push(`${context.userId}/${context.accountId}/${request.mode}/${request.domain}`);
  return {accountId:context.accountId!,domain:"douyin.com",profileKey:"a".repeat(64)};
 },verifyProfileStopped:async()=>true});
 const receipt=await admission.acquire(one.ref,{laneId:"lane-1",mode:"primary",domain:"v.douyin.com"});
 expect(receipt).toMatchObject({taskId:one.task.id,accountId:"wb-account-a",laneId:"lane-1",profileKey:"a".repeat(64),domain:"douyin.com"});
 expect(seen).toEqual(["wb-user/wb-account-a/primary/v.douyin.com"]);
 await expect(admission.acquire(one.ref,{laneId:"lane-2",mode:"primary",domain:"v.douyin.com",accountId:"forged",profileKey:"b".repeat(64)} as never)).rejects.toThrow();
 expect(seen).toHaveLength(1);
 const same=await admission.acquire(one.ref,{laneId:"lane-2",mode:"primary",domain:"v.douyin.com"});
 expect(same.leaseId).toBe(receipt.leaseId);
});

it("旧采集宿主持有同一物理 profile 时新任务不能接管；只凭真实停止证明释放",async()=>{
 const profileKey="b".repeat(64),legacy=createExecutionBrowserProfileLeaseService(db,{now});
 const host={userId:"legacy-browser-user",domain:"douyin.com",profileKey,hostInstanceId:"legacy-host",hostOperationId:"collect"};
 const held=await legacy.acquireForHost(host);
 const one=await owner("wb-old-busy","legacy-browser-user","account-a");
 let stopped=false;
 const admission=createWorkbenchBrowserAdmissionService(db,{now,resolveProfile:async(context)=>({accountId:context.accountId!,domain:"douyin.com",profileKey}),verifyProfileStopped:async()=>stopped});
 await expect(admission.acquire(one.ref,{laneId:"lane-1",mode:"primary",domain:"douyin.com"})).rejects.toMatchObject({code:"BROWSER_PROFILE_BUSY"});
 expect(await legacy.releaseAfterHostStopped(host,held.leaseId)).toBe(true);
 const opened=await admission.acquire(one.ref,{laneId:"lane-1",mode:"primary",domain:"douyin.com"});
 expect(opened.leaseId).not.toBe(held.leaseId);
 const other=await owner("wb-old-next","legacy-browser-user","account-b");
 await expect(admission.acquire(other.ref,{laneId:"other",mode:"primary",domain:"douyin.com"})).rejects.toMatchObject({code:"BROWSER_PROFILE_BUSY"});
 await expect(admission.releaseAfterProfileStopped(one.ref,opened.leaseId)).rejects.toThrow();
 stopped=true;
 expect(await admission.releaseAfterProfileStopped(one.ref,opened.leaseId)).toBe(true);
 expect((await admission.acquire(other.ref,{laneId:"other",mode:"primary",domain:"douyin.com"})).leaseId).not.toBe(opened.leaseId);
});

it("解析器不能重绑账号；过期或停止的原执行租约不能新增浏览器动作",async()=>{
 const one=await owner("wb-stale","stale-user","stale-account");
 const forged=createWorkbenchBrowserAdmissionService(db,{now,resolveProfile:async()=>({accountId:"other-account",domain:"example.com",profileKey:"c".repeat(64)}),verifyProfileStopped:async()=>true});
 await expect(forged.acquire(one.ref,{laneId:"lane",mode:"isolated",domain:"example.com"})).rejects.toThrow();
 const valid=createWorkbenchBrowserAdmissionService(db,{now,resolveProfile:async(context)=>({accountId:context.accountId!,domain:"example.com",profileKey:"c".repeat(64)}),verifyProfileStopped:async()=>true});
 await db.update(executionTasks).set({status:"cancel_requested"}).where(eq(executionTasks.id,one.task.id));
 await expect(valid.acquire(one.ref,{laneId:"lane",mode:"isolated",domain:"example.com"})).rejects.toThrow();
 await expect(valid.acquire({...one.ref,fenceToken:"old-fence"},{laneId:"lane",mode:"isolated",domain:"example.com"})).rejects.toThrow();
});

it("原采集器的宿主生命周期与新浏览器准入按同一物理档案交接",async()=>{
 const profileKey="d".repeat(64),authDir="/test/t1008-legacy-handoff";
 const legacy=createHostBrowserProfileLifecycle(db,{
  hostInstanceId:"legacy-handoff",waitTimeoutMs:120000,pollIntervalMs:5,
  resolveProfile:async()=>({userId:"handoff-user",authDir,profileKey}),
 });
 const first=await legacy.acquire(authDir);
 const one=await owner("wb-legacy-lifecycle","handoff-user","handoff-account");
 const admission=createWorkbenchBrowserAdmissionService(db,{now,
  resolveProfile:async(context)=>({accountId:context.accountId!,domain:"douyin.com",profileKey}),
  verifyProfileStopped:async()=>true});
 await expect(admission.acquire(one.ref,{laneId:"lane",mode:"primary",domain:"douyin.com"})).rejects.toMatchObject({code:"BROWSER_PROFILE_BUSY"});
 await first.onStopped();
 const second=await admission.acquire(one.ref,{laneId:"lane",mode:"primary",domain:"douyin.com"});
 const realNow=Date.now.bind(Date);let offset=0;
 const clock=vi.spyOn(Date,"now").mockImplementation(()=>realNow()+offset);
 const waiting=legacy.acquire(authDir),move=setTimeout(()=>{offset=120001;},20);
 try{await expect(waiting).rejects.toMatchObject({code:"BROWSER_PROFILE_BUSY"});}finally{clearTimeout(move);clock.mockRestore();}
 expect(await admission.releaseAfterProfileStopped(one.ref,second.leaseId)).toBe(true);
 const third=await legacy.acquire(authDir);
 await third.onStopped();
});
