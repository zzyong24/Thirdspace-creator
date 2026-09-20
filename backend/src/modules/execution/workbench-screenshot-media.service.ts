import {and,eq,executionCalls,type Db} from "@creatoros/backend";
import {WORKBENCH_SCREENSHOT_MAX_BYTES,workbenchResultSchema,workbenchScreenshotResolvedSchema} from "@creatoros/contract/agent-workbench";
import {chatToolProviderName,workerToolResultReceiptSchema,type ExecutionRef} from "@creatoros/contract/execution-worker";
import type {WorkbenchBlobService} from "../assets";
import {createExecutionLeaseService} from "./execution-lease.service";

const SIGNATURE=Buffer.from([137,80,78,71,13,10,26,10]);
const REF=/^wm1-([a-f0-9]{64})$/;

/** 截图引用仅含内容哈希；账号、任务和操作 ID 始终从当前执行租约及原工具回执取得。 */
export function createWorkbenchScreenshotMediaService(db:Db,deps:{blobs:Pick<WorkbenchBlobService,"submit"|"read">;now?:()=>string}){
 const leases=createExecutionLeaseService(db,{now:deps.now});
 const assertPng=(bytes:Uint8Array)=>{
  if(bytes.byteLength<45||bytes.byteLength>WORKBENCH_SCREENSHOT_MAX_BYTES||!Buffer.from(bytes.subarray(0,8)).equals(SIGNATURE)||
     Buffer.from(bytes.subarray(12,16)).toString("ascii")!=="IHDR"||
     Buffer.from(bytes.subarray(bytes.byteLength-8,bytes.byteLength-4)).toString("ascii")!=="IEND")
   throw new Error("SCREENSHOT_MEDIA_INVALID");
 };
 return {
  async submit(ref:ExecutionRef,operationId:string,bytes:Uint8Array):Promise<string>{
   if(!operationId||operationId.length>160)throw new Error("SCREENSHOT_OPERATION_INVALID");
   assertPng(bytes);
   const context=await leases.withLease(ref,"admission",async({task,context})=>{
    if(task.kind!=="ai_task"||!task.accountId)throw new Error("SCREENSHOT_TASK_INVALID");
    return context;
   });
   const saved=await deps.blobs.submit(context,{taskId:ref.executionTaskId,operationId,mime:"image/png",bytes});
   await leases.withLease(ref,"admission",async({task})=>{
    if(task.userId!==context.userId||task.accountId!==context.accountId)throw new Error("SCREENSHOT_OWNER_CHANGED");
   });
   if(saved.size!==bytes.byteLength)throw new Error("SCREENSHOT_STORAGE_INVALID");
   return `wm1-${saved.hash}`;
  },
  async resolve(ref:ExecutionRef,input:{callId:string;dataRef:string}):Promise<{mimeType:"image/png";data:string}>{
   const hash=REF.exec(input.dataRef)?.[1];
   if(!hash||!input.callId||input.callId.length>160)throw new Error("SCREENSHOT_REFERENCE_INVALID");
   const context=await leases.withLease(ref,"admission",async({tx,task,context})=>{
    if(task.kind!=="ai_task"||!task.accountId)throw new Error("SCREENSHOT_TASK_INVALID");
    const [call]=await tx.select({status:executionCalls.status,resultText:executionCalls.resultText}).from(executionCalls).where(and(
     eq(executionCalls.id,input.callId),eq(executionCalls.executionTaskId,task.id),eq(executionCalls.kind,"tool")));
    if(call?.status!=="settled"||!call.resultText)throw new Error("SCREENSHOT_RECEIPT_MISSING");
    const receipt=workerToolResultReceiptSchema.parse(JSON.parse(call.resultText));
    const output=receipt.output;
    if(!output||typeof output!=="object"||Array.isArray(output))throw new Error("SCREENSHOT_RECEIPT_MISMATCH");
    const payload=(output as Record<string,unknown>).data;
    const raw=payload&&typeof payload==="object"&&!Array.isArray(payload)
     ?(payload as Record<string,unknown>).workbench:undefined;
    const result=workbenchResultSchema.parse(raw);
    if(receipt.toolName!==chatToolProviderName("browser.screenshot")||result.status!=="succeeded"||result.operationId!==input.callId||
       !result.content.some(item=>item.type==="image"&&item.mediaType==="image/png"&&item.dataRef===input.dataRef))
      throw new Error("SCREENSHOT_RECEIPT_MISMATCH");
    return context;
   });
   const bytes=await deps.blobs.read(context,{taskId:ref.executionTaskId,operationId:input.callId,hash,mime:"image/png"});
   assertPng(bytes);
   await leases.withLease(ref,"admission",async({task})=>{
    if(task.userId!==context.userId||task.accountId!==context.accountId)throw new Error("SCREENSHOT_OWNER_CHANGED");
   });
   return workbenchScreenshotResolvedSchema.parse({mimeType:"image/png",data:Buffer.from(bytes).toString("base64")});
  },
 };
}
