import {z} from "zod";
import type {Db} from "@creatoros/backend";
import type {RequestContext} from "@creatoros/contract";
import type {ExecutionRef} from "@creatoros/contract/execution-worker";
import {createExecutionLeaseService} from "./execution-lease.service";
import {createExecutionBrowserProfileLeaseService} from "./execution-browser-profile-lease.service";
import {ConflictError} from "./execution.errors";

const openSchema=z.object({
 laneId:z.string().min(1).max(160),
 mode:z.enum(["anonymous","primary","authenticated_replica","isolated"]),
 domain:z.string().min(1).max(253),
}).strict();
type OpenRequest=z.infer<typeof openSchema>;
const profileSchema=z.object({
 accountId:z.string().min(1),domain:z.string().min(1).max(253),
 profileKey:z.string().regex(/^[a-f0-9]{64}$/),
}).strict();

/**
 * 浏览器档案准入只接受模型选择的 Lane/模式/域；账号和物理目录由可信 resolver
 * 按当前执行租约解析。与旧 Playwright 共用 execution_browser_profile_leases。
 * 此端口不启动浏览器；Rust 取得租约后仍须核实 Lane 身份与 epoch。
 */
export function createWorkbenchBrowserAdmissionService(db:Db,deps:{
 now?:()=>string;
 resolveProfile(context:RequestContext,request:OpenRequest,ref:ExecutionRef,signal?:AbortSignal):Promise<{accountId:string;domain:string;profileKey:string}>;
 /** 宿主按实际 Chromium/profile 进程身份提供停止证明；不能由模型或 Worker 自报。 */
 verifyProfileStopped(scope:{ref:ExecutionRef;leaseId:string;profileKey:string;domain:string;userId:string}):Promise<boolean>;
}){
 const leases=createExecutionLeaseService(db,{now:deps.now});
 const profiles=createExecutionBrowserProfileLeaseService(db,{now:deps.now});
 return {
  async acquire(ref:ExecutionRef,raw:unknown,signal?:AbortSignal){
   const request=openSchema.parse(raw);
   signal?.throwIfAborted();
   const context=await leases.withLease(ref,"admission",async({context})=>context);
   if(!context.accountId)throw new ConflictError("浏览器任务缺少账号归属");
   const profile=profileSchema.parse(await deps.resolveProfile(context,request,ref,signal));
   signal?.throwIfAborted();
   if(profile.accountId!==context.accountId)throw new ConflictError("浏览器档案与当前账号不符");
   // acquireProfile 在同一行锁下再次验证 attempt/fence/停止状态；解析期间失效则不占档案。
   const receipt=await profiles.acquireProfile(ref,profile.domain,profile.profileKey);
   // 领取后即使取消也返回凭证，留给宿主核实进程状态再释放；不能把占用藏成一次抛错。
   return {taskId:ref.executionTaskId,accountId:context.accountId,laneId:request.laneId,
    mode:request.mode,profileKey:profile.profileKey,leaseId:receipt.leaseId,domain:receipt.domain};
  },
  /** 仅宿主在物理进程停稳后调用；旧租约不能释放后来的新 owner。 */
  async releaseAfterProfileStopped(ref:ExecutionRef,leaseId:string){
   const held=(await profiles.listOwned(ref)).find(row=>row.leaseId===leaseId);
   if(!held || held.releasedAt!==null)throw new ConflictError("浏览器档案释放凭证与当前持有者不符");
   if(!await deps.verifyProfileStopped({ref,leaseId,profileKey:held.profileKey,domain:held.domain,userId:held.userId}))
    throw new ConflictError("缺少浏览器档案实际停止证明");
   return profiles.releaseAfterWorkerStopped(ref,leaseId);
  },
 };
}
